/**
 * Bots Routes
 * Маршруты для ботов (heartbeat, статусы)
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler, buildRoleFilter } = require('../utils/helpers');

const router = express.Router();

// Функция проверки статуса оплаты анкеты
async function checkProfilePaymentStatus(profileId) {
    const result = await pool.query(`
        SELECT
            ap.profile_id,
            ap.paid_until,
            ap.is_trial,
            ap.trial_started_at,
            ap.assigned_admin_id,
            u.is_restricted as admin_is_restricted
        FROM allowed_profiles ap
        LEFT JOIN users u ON ap.assigned_admin_id = u.id
        WHERE ap.profile_id = $1
    `, [profileId]);

    if (result.rows.length === 0) {
        // Анкета не найдена - будет создана автоматически, trial доступен
        return { isPaid: false, canTrial: true, reason: 'not_found' };
    }

    const row = result.rows[0];

    // Если админ - "мой админ", оплата не требуется
    if (row.admin_is_restricted) {
        return { isPaid: true, isFree: true, reason: 'my_admin' };
    }

    const paidUntil = row.paid_until ? new Date(row.paid_until) : null;
    const now = new Date();
    const isPaid = paidUntil && paidUntil > now;

    if (isPaid) {
        const daysLeft = Math.ceil((paidUntil - now) / (1000 * 60 * 60 * 24));
        return { isPaid: true, daysLeft, reason: 'paid' };
    }

    // Не оплачена - проверяем trial
    const trialUsed = !!row.trial_started_at;
    if (!trialUsed) {
        return { isPaid: false, canTrial: true, reason: 'trial_available' };
    }

    // Trial использован и истёк
    return { isPaid: false, canTrial: false, reason: 'payment_required' };
}

// Heartbeat (legacy)
router.post('/heartbeat', asyncHandler(async (req, res) => {
    const { botId, accountDisplayId, status, timestamp, ip, systemInfo } = req.body;
    const profileStatus = status || 'online';
    const version = systemInfo?.version || null;
    const platform = systemInfo?.platform || null;

    // 0. Проверка верификации ID анкеты (защита от подмены)
    const botCheck = await pool.query(
        `SELECT verified_profile_id FROM bots WHERE bot_id = $1`, [botId]
    );

    if (botCheck.rows.length > 0 && botCheck.rows[0].verified_profile_id) {
        // Бот уже зарегистрирован - проверяем соответствие ID
        const verifiedId = botCheck.rows[0].verified_profile_id;
        if (verifiedId !== accountDisplayId) {
            console.log(`🚫 ПОДМЕНА ID! Бот ${botId}: ожидается ${verifiedId}, получен ${accountDisplayId}`);
            return res.status(403).json({
                status: 'error',
                error: 'profile_id_mismatch',
                message: `ID анкеты не совпадает. Ожидается: ${verifiedId}, получен: ${accountDisplayId}`
            });
        }
    }

    // 0.5. Проверка оплаты анкеты
    const paymentStatus = await checkProfilePaymentStatus(accountDisplayId);
    if (!paymentStatus.isPaid) {
        if (paymentStatus.canTrial) {
            // Trial доступен - возвращаем специальный статус
            console.log(`💳 Анкета ${accountDisplayId} не оплачена, trial доступен`);
            return res.json({
                status: 'trial_available',
                message: 'Анкета не оплачена. Доступен тестовый период 2 дня.',
                profileId: accountDisplayId,
                canTrial: true
            });
        } else {
            // Trial использован, оплата требуется
            console.log(`🚫 Анкета ${accountDisplayId} не оплачена, trial истёк`);
            return res.status(402).json({
                status: 'payment_required',
                error: 'payment_required',
                message: 'Тестовый период истёк. Для продолжения работы требуется оплата.',
                profileId: accountDisplayId,
                canTrial: false
            });
        }
    }

    // 1. Записываем heartbeat
    await pool.query(`
        INSERT INTO heartbeats (
            bot_id, account_display_id, status,
            ip, version, platform, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [botId, accountDisplayId, profileStatus, ip || null, version, platform, timestamp || new Date()]);

    // 2. Автосоздание анкеты в allowed_profiles если нет
    const existsAllowed = await pool.query(
        `SELECT 1 FROM allowed_profiles WHERE profile_id = $1`, [accountDisplayId]
    );
    if (existsAllowed.rows.length === 0) {
        await pool.query(
            `INSERT INTO allowed_profiles (profile_id, note, added_at) VALUES ($1, 'Автодобавлено ботом', NOW())`,
            [accountDisplayId]
        );
    }

    // 3. Обновляем/создаём запись в profiles для dashboard
    const existsProfile = await pool.query(
        `SELECT 1 FROM profiles WHERE profile_id = $1`, [accountDisplayId]
    );
    if (existsProfile.rows.length === 0) {
        await pool.query(
            `INSERT INTO profiles (profile_id, status, last_online, added_at) VALUES ($1, $2, NOW(), NOW())`,
            [accountDisplayId, profileStatus]
        );
    } else {
        await pool.query(
            `UPDATE profiles SET status = $1, last_online = NOW() WHERE profile_id = $2`,
            [profileStatus, accountDisplayId]
        );
    }

    // 4. Обновляем/создаём запись бота в bots для dashboard + верификация ID
    const existsBot = await pool.query(
        `SELECT verified_profile_id FROM bots WHERE bot_id = $1`, [botId]
    );
    if (existsBot.rows.length === 0) {
        // Новый бот - сохраняем verified_profile_id
        await pool.query(
            `INSERT INTO bots (bot_id, platform, ip, version, status, last_heartbeat, verified_profile_id, profile_verified_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW())`,
            [botId, platform, ip || null, version, profileStatus, accountDisplayId]
        );
        console.log(`🔐 Бот ${botId} верифицирован с анкетой ${accountDisplayId}`);
    } else {
        // Существующий бот - обновляем данные
        if (!existsBot.rows[0].verified_profile_id) {
            // Если verified_profile_id ещё не установлен - устанавливаем
            await pool.query(
                `UPDATE bots SET platform = COALESCE($1, platform), ip = COALESCE($2, ip), version = COALESCE($3, version),
                 status = $4, last_heartbeat = NOW(), verified_profile_id = $5, profile_verified_at = NOW()
                 WHERE bot_id = $6`,
                [platform, ip || null, version, profileStatus, accountDisplayId, botId]
            );
            console.log(`🔐 Бот ${botId} верифицирован с анкетой ${accountDisplayId}`);
        } else {
            await pool.query(
                `UPDATE bots SET platform = COALESCE($1, platform), ip = COALESCE($2, ip), version = COALESCE($3, version),
                 status = $4, last_heartbeat = NOW() WHERE bot_id = $5`,
                [platform, ip || null, version, profileStatus, botId]
            );
        }
    }

    // 5. Связываем бота с анкетой
    await pool.query(
        `INSERT INTO bot_profiles (bot_id, profile_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [botId, accountDisplayId]
    );

    console.log(`❤️ Heartbeat от ${accountDisplayId} (бот ${botId}): ${profileStatus}`);

    res.json({ status: 'ok' });
}));

// Heartbeat по новой схеме (POST /api/bot/heartbeat)
router.post('/bot/heartbeat', asyncHandler(async (req, res) => {
    const { botId, profileId, platform, ip, version, status } = req.body;

    // 0. Проверка верификации ID анкеты (защита от подмены)
    if (profileId) {
        const botCheck = await pool.query(
            `SELECT verified_profile_id FROM bots WHERE bot_id = $1`, [botId]
        );

        if (botCheck.rows.length > 0 && botCheck.rows[0].verified_profile_id) {
            const verifiedId = botCheck.rows[0].verified_profile_id;
            if (verifiedId !== profileId) {
                console.log(`🚫 ПОДМЕНА ID! Бот ${botId}: ожидается ${verifiedId}, получен ${profileId}`);
                return res.status(403).json({
                    status: 'error',
                    error: 'profile_id_mismatch',
                    message: `ID анкеты не совпадает. Ожидается: ${verifiedId}, получен: ${profileId}`
                });
            }
        }

        // Проверка оплаты анкеты
        const paymentStatus = await checkProfilePaymentStatus(profileId);
        if (!paymentStatus.isPaid) {
            if (paymentStatus.canTrial) {
                console.log(`💳 Анкета ${profileId} не оплачена, trial доступен`);
                return res.json({
                    status: 'trial_available',
                    message: 'Анкета не оплачена. Доступен тестовый период 2 дня.',
                    profileId: profileId,
                    canTrial: true
                });
            } else {
                console.log(`🚫 Анкета ${profileId} не оплачена, trial истёк`);
                return res.status(402).json({
                    status: 'payment_required',
                    error: 'payment_required',
                    message: 'Тестовый период истёк. Для продолжения работы требуется оплата.',
                    profileId: profileId,
                    canTrial: false
                });
            }
        }
    }

    // 1. Обновляем/создаем запись бота + верификация ID
    const existsBot = await pool.query(`SELECT verified_profile_id FROM bots WHERE bot_id = $1`, [botId]);
    if (existsBot.rows.length === 0) {
        await pool.query(
            `INSERT INTO bots (bot_id, platform, ip, version, status, last_heartbeat, verified_profile_id, profile_verified_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW())`,
            [botId, platform || null, ip || null, version || null, status || 'online', profileId || null]
        );
        if (profileId) {
            console.log(`🔐 Бот ${botId} верифицирован с анкетой ${profileId}`);
        }
    } else {
        if (!existsBot.rows[0].verified_profile_id && profileId) {
            await pool.query(
                `UPDATE bots SET platform = COALESCE($1, platform), ip = COALESCE($2, ip), version = COALESCE($3, version),
                 status = $4, last_heartbeat = NOW(), verified_profile_id = $5, profile_verified_at = NOW()
                 WHERE bot_id = $6`,
                [platform, ip, version, status || 'online', profileId, botId]
            );
            console.log(`🔐 Бот ${botId} верифицирован с анкетой ${profileId}`);
        } else {
            await pool.query(
                `UPDATE bots SET platform = COALESCE($1, platform), ip = COALESCE($2, ip), version = COALESCE($3, version),
                 status = $4, last_heartbeat = NOW() WHERE bot_id = $5`,
                [platform, ip, version, status || 'online', botId]
            );
        }
    }

    // 2. Связываем бота с профилем
    if (profileId) {
        await pool.query(
            `INSERT INTO bot_profiles (bot_id, profile_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [botId, profileId]
        );

        // 3. Обновляем статус профиля
        await pool.query(`
            UPDATE allowed_profiles
            SET status = $1, last_online = NOW()
            WHERE profile_id = $2
        `, [status || 'online', profileId]);
    }

    // 4. Записываем в heartbeats для истории
    await pool.query(`
        INSERT INTO heartbeats (bot_id, account_display_id, status, ip, version, platform, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [botId, profileId || '', status || 'online', ip || null, version || null, platform || null]);

    console.log(`❤️ Heartbeat от бота ${botId} (${profileId || 'no profile'}): ${status || 'online'}`);

    res.json({ status: 'ok' });
}));

// Статус ботов и анкет
router.get('/status', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    const { filter: profileFilter, params } = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'WHERE' });

    // 1. Получаем статус анкет (для обновления таблицы анкет)
    const profilesQuery = `
        SELECT DISTINCT ON (p.profile_id)
            p.profile_id,
            p.note,
            h.bot_id,
            h.status as heartbeat_status,
            h.ip,
            h.version,
            h.platform,
            h.timestamp as last_heartbeat,
            CASE
                WHEN h.timestamp > NOW() - INTERVAL '2 minutes' THEN 'online'
                WHEN h.timestamp > NOW() - INTERVAL '10 minutes' THEN 'idle'
                ELSE 'offline'
            END as connection_status
        FROM allowed_profiles p
        LEFT JOIN heartbeats h ON p.profile_id = h.account_display_id
        ${profileFilter}
        ORDER BY p.profile_id, h.timestamp DESC NULLS LAST
    `;
    const profilesResult = await pool.query(profilesQuery, params);

    const profileStatusCounts = {
        online: 0,
        idle: 0,
        offline: 0,
        never_connected: 0
    };

    const profiles = profilesResult.rows.map(row => {
        let status;
        if (!row.last_heartbeat) {
            status = 'never_connected';
        } else {
            status = row.connection_status;
        }
        profileStatusCounts[status]++;

        return {
            profileId: row.profile_id,
            botId: row.bot_id,
            note: row.note,
            platform: row.platform,
            ip: row.ip,
            version: row.version,
            status: status,
            lastHeartbeat: row.last_heartbeat
        };
    });

    // 2. Получаем уникальные боты (программы) - один бот = одна строка
    const botsQuery = `
        SELECT DISTINCT ON (h.bot_id)
            h.bot_id,
            h.ip,
            h.version,
            h.platform,
            h.timestamp as last_heartbeat,
            (SELECT COUNT(DISTINCT account_display_id)
             FROM heartbeats
             WHERE bot_id = h.bot_id
             AND timestamp > NOW() - INTERVAL '1 hour') as profiles_count,
            CASE
                WHEN h.timestamp > NOW() - INTERVAL '2 minutes' THEN 'online'
                ELSE 'offline'
            END as bot_status
        FROM heartbeats h
        WHERE h.bot_id IS NOT NULL
          AND h.bot_id != ''
          AND h.timestamp > NOW() - INTERVAL '1 hour'
        ORDER BY h.bot_id, h.timestamp DESC
    `;
    const botsResult = await pool.query(botsQuery);

    // DEBUG: Логируем результат запроса ботов
    console.log(`🤖 Bots query returned ${botsResult.rows.length} rows:`,
        botsResult.rows.map(r => ({ botId: r.bot_id, ts: r.last_heartbeat })));

    const botStatusCounts = { online: 0, offline: 0 };
    const uniqueBots = botsResult.rows.map(row => {
        botStatusCounts[row.bot_status]++;
        return {
            botId: row.bot_id,
            ip: row.ip || '-',
            version: row.version || '-',
            platform: row.platform || 'Unknown',
            lastHeartbeat: row.last_heartbeat,
            profilesCount: parseInt(row.profiles_count) || 0,
            status: row.bot_status
        };
    });

    res.json({
        success: true,
        // Статистика по БОТАМ (программам)
        botsSummary: {
            online: botStatusCounts.online,
            offline: botStatusCounts.offline,
            total: uniqueBots.length
        },
        // Список уникальных ботов
        bots: uniqueBots,
        // Статистика по АНКЕТАМ (для совместимости)
        summary: profileStatusCounts,
        // Список анкет (для обновления статусов в таблице)
        profiles: profiles
    });
}));

// Статистика по конкретному боту
router.get('/:botId/stats', asyncHandler(async (req, res) => {
    const { botId } = req.params;
    const { userId, role, days = 7 } = req.query;

    const accessQuery = `
            SELECT h.account_display_id
            FROM heartbeats h
            JOIN allowed_profiles p ON h.account_display_id = p.profile_id
            WHERE h.bot_id = $1
            ${role === 'translator' ? 'AND p.assigned_translator_id = $2' : ''}
            ${role === 'admin' ? 'AND p.assigned_admin_id = $2' : ''}
            LIMIT 1
        `;
        const accessParams = role === 'director' ? [botId] : [botId, userId];
        const accessResult = await pool.query(accessQuery, accessParams);

        if (accessResult.rows.length === 0 && role !== 'director') {
            return res.status(403).json({ success: false, error: 'Нет доступа к этому боту' });
        }

        const profileId = accessResult.rows[0]?.account_display_id;

        const statsQuery = `
            SELECT
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.status = 'success') as letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.status = 'success') as chats,
                COUNT(*) FILTER (WHERE m.status = 'failed') as errors,
                COUNT(DISTINCT m.sender_id) as unique_men,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                MIN(m.timestamp) as first_message,
                MAX(m.timestamp) as last_message
            FROM messages m
            WHERE m.bot_id = $1
            AND m.timestamp >= CURRENT_DATE - INTERVAL '1 day' * $2
        `;

        const statsResult = await pool.query(statsQuery, [botId, days]);
        const stats = statsResult.rows[0];

        const heartbeatQuery = `
            SELECT * FROM heartbeats
            WHERE bot_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
        `;
        const heartbeatResult = await pool.query(heartbeatQuery, [botId]);
        const lastHeartbeat = heartbeatResult.rows[0];

        res.json({
            success: true,
            bot: {
                botId: botId,
                profileId: profileId,
                status: lastHeartbeat && new Date(lastHeartbeat.timestamp) > new Date(Date.now() - 2 * 60 * 1000)
                    ? 'online' : 'offline',
                lastHeartbeat: lastHeartbeat?.timestamp,
                ip: lastHeartbeat?.ip,
                version: lastHeartbeat?.version,
                platform: lastHeartbeat?.platform,
                stats: {
                    letters: parseInt(stats.letters) || 0,
                    chats: parseInt(stats.chats) || 0,
                    errors: parseInt(stats.errors) || 0,
                    uniqueMen: parseInt(stats.unique_men) || 0,
                    avgResponseTime: Math.round(stats.avg_response_seconds / 60) || 0,
                    firstMessage: stats.first_message,
                    lastMessage: stats.last_message
                }
            }
        });
}));

// Получение промта
router.get('/prompt', asyncHandler(async (req, res) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            key VARCHAR(100) UNIQUE NOT NULL,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS settings_key_unique ON settings(key)`);
    } catch (e) { /* уже существует */ }

    const result = await pool.query(
        `SELECT value FROM settings WHERE key = 'generation_prompt'`
    );

    const prompt = result.rows[0]?.value ||
        'Write a creative and engaging message for a dating site. Keep it short, natural and intriguing.';

    res.json({ success: true, prompt });
}));

// Сохранение промта
router.post('/prompt', asyncHandler(async (req, res) => {
    const { prompt } = req.body;

    const exists = await pool.query(`SELECT 1 FROM settings WHERE key = 'generation_prompt'`);
    if (exists.rows.length === 0) {
        await pool.query(
            `INSERT INTO settings (key, value, updated_at) VALUES ('generation_prompt', $1, NOW())`,
            [prompt]
        );
    } else {
        await pool.query(
            `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'generation_prompt'`,
            [prompt]
        );
    }

    res.json({ success: true });
}));

// Синхронизация промта
router.post('/sync-prompt', asyncHandler(async (req, res) => {
    const { prompt } = req.body;

    const exists = await pool.query(`SELECT 1 FROM settings WHERE key = 'generation_prompt'`);
    if (exists.rows.length === 0) {
        await pool.query(
            `INSERT INTO settings (key, value, updated_at) VALUES ('generation_prompt', $1, NOW())`,
            [prompt]
        );
    } else {
        await pool.query(
            `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'generation_prompt'`,
            [prompt]
        );
    }

    res.json({ success: true, message: 'Prompt synced' });
}));

// Активация тестового периода из бота
router.post('/activate-trial', asyncHandler(async (req, res) => {
    const { profileId, botId } = req.body;

    if (!profileId) {
        return res.status(400).json({
            success: false,
            error: 'profile_id_required',
            message: 'Укажите ID анкеты'
        });
    }

    // Проверяем существование анкеты
    const profile = await pool.query(
        `SELECT profile_id, trial_started_at, paid_until, assigned_admin_id FROM allowed_profiles WHERE profile_id = $1`,
        [profileId]
    );

    if (profile.rows.length === 0) {
        // Создаём анкету и сразу активируем trial
        await pool.query(`
            INSERT INTO allowed_profiles (profile_id, note, added_at, is_trial, trial_started_at, paid_until)
            VALUES ($1, 'Автодобавлено ботом', NOW(), TRUE, NOW(), NOW() + INTERVAL '2 days')
        `, [profileId]);

        console.log(`🎁 Trial активирован для новой анкеты ${profileId}`);

        return res.json({
            success: true,
            status: 'trial_activated',
            message: 'Тестовый период активирован на 2 дня',
            profileId: profileId,
            trialDays: 2,
            expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
        });
    }

    const row = profile.rows[0];

    // Проверяем, не был ли уже trial
    if (row.trial_started_at) {
        return res.status(400).json({
            success: false,
            error: 'trial_already_used',
            message: 'Тестовый период уже был использован для этой анкеты'
        });
    }

    // Проверяем, может уже оплачена
    if (row.paid_until && new Date(row.paid_until) > new Date()) {
        return res.json({
            success: true,
            status: 'already_paid',
            message: 'Анкета уже оплачена',
            profileId: profileId
        });
    }

    // Активируем trial
    await pool.query(`
        UPDATE allowed_profiles
        SET is_trial = TRUE,
            trial_started_at = NOW(),
            paid_until = NOW() + INTERVAL '2 days'
        WHERE profile_id = $1
    `, [profileId]);

    console.log(`🎁 Trial активирован для анкеты ${profileId} (бот: ${botId || 'unknown'})`);

    res.json({
        success: true,
        status: 'trial_activated',
        message: 'Тестовый период активирован на 2 дня',
        profileId: profileId,
        trialDays: 2,
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    });
}));

// Обновление всех ботов
router.post('/refresh-all', asyncHandler(async (req, res) => {
    res.json({ success: true, message: 'Refresh signal sent' });
}));

// Включение/выключение бота
router.post('/:botId/toggle', asyncHandler(async (req, res) => {
    const { botId } = req.params;
    const { active } = req.body;

    const newStatus = active ? 'online' : 'offline';
    await pool.query(
        `UPDATE bots SET status = $1 WHERE bot_id = $2`,
        [newStatus, botId]
    );
    res.json({ success: true, status: newStatus });
}));

// Изменение имени бота
router.post('/:botId/name', asyncHandler(async (req, res) => {
    const { botId } = req.params;
    const { name } = req.body;

    await pool.query(
        `UPDATE bots SET name = $1 WHERE bot_id = $2`,
        [name, botId]
    );
    res.json({ success: true });
}));

// Сброс верификации бота (только директор)
// Позволяет переподключить бота к другой анкете
router.post('/:botId/reset-verification', asyncHandler(async (req, res) => {
    const { botId } = req.params;
    const { userId } = req.body;

    // Проверяем права (только директор)
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || user.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Только директор может сбросить верификацию' });
    }

    // Получаем текущий verified_profile_id для логирования
    const bot = await pool.query(
        `SELECT verified_profile_id FROM bots WHERE bot_id = $1`, [botId]
    );

    if (bot.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Бот не найден' });
    }

    const oldProfileId = bot.rows[0].verified_profile_id;

    // Сбрасываем верификацию
    await pool.query(
        `UPDATE bots SET verified_profile_id = NULL, profile_verified_at = NULL WHERE bot_id = $1`,
        [botId]
    );

    console.log(`🔓 Верификация бота ${botId} сброшена (был привязан к ${oldProfileId || 'ничему'})`);

    res.json({
        success: true,
        message: `Верификация бота сброшена. При следующем подключении бот будет привязан к новой анкете.`,
        previousProfileId: oldProfileId
    });
}));

// Получить информацию о верификации бота
router.get('/:botId/verification', asyncHandler(async (req, res) => {
    const { botId } = req.params;

    const bot = await pool.query(
        `SELECT verified_profile_id, profile_verified_at FROM bots WHERE bot_id = $1`,
        [botId]
    );

    if (bot.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Бот не найден' });
    }

    res.json({
        success: true,
        verified: !!bot.rows[0].verified_profile_id,
        profileId: bot.rows[0].verified_profile_id,
        verifiedAt: bot.rows[0].profile_verified_at
    });
}));

// ==========================================
// НАСТРОЙКИ РАССЫЛКИ И УПРАВЛЕНИЯ
// ==========================================

// Получить настройки управления
router.get('/control/settings', asyncHandler(async (req, res) => {
    const { userId } = req.query;

    // Пытаемся получить настройки из таблицы, если нет - возвращаем дефолт
    try {
        const result = await pool.query(
            `SELECT settings FROM user_settings WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length > 0 && result.rows[0].settings) {
            res.json({ success: true, settings: result.rows[0].settings });
        } else {
            // Дефолтные настройки
            res.json({
                success: true,
                settings: {
                    mailingEnabled: true,
                    stopSpam: false,
                    panicMode: false
                }
            });
        }
    } catch (e) {
        // Таблица не существует - возвращаем дефолт
        res.json({
            success: true,
            settings: {
                mailingEnabled: true,
                stopSpam: false,
                panicMode: false
            }
        });
    }
}));

// Сохранить настройки управления
router.post('/control/settings', asyncHandler(async (req, res) => {
    const { userId, settings } = req.body;

    try {
        // Upsert настроек
        await pool.query(`
            INSERT INTO user_settings (user_id, settings, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET settings = $2, updated_at = NOW()
        `, [userId, JSON.stringify(settings)]);

        res.json({ success: true });
    } catch (e) {
        // Если таблица не существует, создаём её
        if (e.code === '42P01') { // relation does not exist
            await pool.query(`
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id),
                    settings JSONB DEFAULT '{}',
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);
            // Повторяем вставку
            await pool.query(`
                INSERT INTO user_settings (user_id, settings, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET settings = $2, updated_at = NOW()
            `, [userId, JSON.stringify(settings)]);
            res.json({ success: true });
        } else {
            throw e;
        }
    }
}));

// PANIC MODE - экстренная остановка всех ботов
router.post('/control/panic', asyncHandler(async (req, res) => {
    const { userId, activate } = req.body;

    // Проверяем права (только директор или админ)
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || !['director', 'admin'].includes(user.rows[0].role)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    if (activate) {
        // Останавливаем все боты - ставим статус panic
        await pool.query(`UPDATE bots SET status = 'panic' WHERE status IN ('online', 'active', 'idle')`);

        // Сохраняем panic mode в настройках
        await pool.query(`
            INSERT INTO user_settings (user_id, settings, updated_at)
            VALUES ($1, '{"panicMode": true, "mailingEnabled": false}'::jsonb, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET
                settings = user_settings.settings || '{"panicMode": true, "mailingEnabled": false}'::jsonb,
                updated_at = NOW()
        `, [userId]);

        console.log(`🚨 PANIC MODE активирован пользователем ${userId}`);
        res.json({ success: true, message: 'Panic mode активирован. Все боты остановлены.' });
    } else {
        // Деактивируем panic mode
        await pool.query(`UPDATE bots SET status = 'offline' WHERE status = 'panic'`);

        await pool.query(`
            INSERT INTO user_settings (user_id, settings, updated_at)
            VALUES ($1, '{"panicMode": false}'::jsonb, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET
                settings = user_settings.settings || '{"panicMode": false}'::jsonb,
                updated_at = NOW()
        `, [userId]);

        console.log(`✅ PANIC MODE деактивирован пользователем ${userId}`);
        res.json({ success: true, message: 'Panic mode деактивирован.' });
    }
}));

// Проверка статуса panic mode (для бота)
router.get('/control/panic-status', asyncHandler(async (req, res) => {
    // Проверяем, есть ли активный panic mode у любого пользователя
    try {
        const result = await pool.query(`
            SELECT settings->>'panicMode' as panic
            FROM user_settings
            WHERE (settings->>'panicMode')::boolean = true
            LIMIT 1
        `);

        res.json({
            success: true,
            panicMode: result.rows.length > 0
        });
    } catch (e) {
        res.json({ success: true, panicMode: false });
    }
}));

module.exports = router;
