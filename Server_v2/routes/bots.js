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
            ap.assigned_translator_id,
            u.is_restricted as admin_is_restricted,
            u_trans.is_own_translator as translator_is_own
        FROM allowed_profiles ap
        LEFT JOIN users u ON ap.assigned_admin_id = u.id
        LEFT JOIN users u_trans ON ap.assigned_translator_id = u_trans.id
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

    // Если переводчик - "мой переводчик", оплата не требуется
    if (row.translator_is_own) {
        return { isPaid: true, isFree: true, reason: 'my_translator' };
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
    const {
        botId, accountDisplayId, status, timestamp,
        // Новые расширенные поля
        version, platform, uptime, memoryUsage,
        profilesTotal, profilesRunning, profilesStopped, profilesList,
        sessionStats, globalMode,
        // Для обратной совместимости со старым форматом
        systemInfo
    } = req.body;

    const profileStatus = status || 'online';
    // Поддержка старого и нового формата
    const botVersion = version || systemInfo?.version || null;
    const botPlatform = platform || systemInfo?.platform || null;

    // Получаем реальный IP клиента (не из body, а из запроса)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                  || req.socket?.remoteAddress
                  || req.ip
                  || 'unknown';

    // DEBUG: Логируем входящий heartbeat для диагностики
    console.log(`📥 Heartbeat получен: botId=${botId}, profileId=${accountDisplayId}, status=${profileStatus}, IP=${clientIp}`);
    console.log(`   botId начинается с "machine_": ${botId?.startsWith('machine_') ? 'ДА ✅' : 'НЕТ ❌'}`);
    if (profilesTotal !== undefined) {
        console.log(`   📊 Расширенные данные: анкет=${profilesTotal}, работают=${profilesRunning}, uptime=${uptime}s`);
    }

    // Верификация отключена - теперь один MACHINE_ID может обслуживать много анкет
    // Проверка анкеты делается через allowed_profiles

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
    `, [botId, accountDisplayId, profileStatus, clientIp, botVersion, botPlatform, timestamp || new Date()]);

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

    // 3. Обновляем статус в allowed_profiles (единственная таблица анкет)
    // КОНСОЛИДИРОВАНО: таблица profiles удалена, используем только allowed_profiles
    await pool.query(
        `UPDATE allowed_profiles SET status = $1, last_online = NOW() WHERE profile_id = $2`,
        [profileStatus, accountDisplayId]
    );

    // 4. Обновляем/создаём запись бота в bots для dashboard + верификация ID
    // Собираем расширенные данные в JSON
    const extendedData = {
        uptime: uptime || null,
        memoryUsage: memoryUsage || null,
        profilesTotal: profilesTotal || 0,
        profilesRunning: profilesRunning || 0,
        profilesStopped: profilesStopped || 0,
        profilesList: profilesList || [],
        sessionStats: sessionStats || null,
        globalMode: globalMode || 'mail',
        lastUpdate: new Date().toISOString()
    };

    const existsBot = await pool.query(
        `SELECT verified_profile_id FROM bots WHERE bot_id = $1`, [botId]
    );
    if (existsBot.rows.length === 0) {
        // Новый бот - сохраняем verified_profile_id и расширенные данные
        await pool.query(
            `INSERT INTO bots (bot_id, platform, ip, version, status, last_heartbeat, verified_profile_id, profile_verified_at, extended_data)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), $7)`,
            [botId, botPlatform, clientIp, botVersion, profileStatus, accountDisplayId, JSON.stringify(extendedData)]
        );
        console.log(`🔐 Бот ${botId} верифицирован с анкетой ${accountDisplayId}`);
    } else {
        // Существующий бот - обновляем данные
        if (!existsBot.rows[0].verified_profile_id) {
            // Если verified_profile_id ещё не установлен - устанавливаем
            await pool.query(
                `UPDATE bots SET platform = COALESCE($1, platform), ip = COALESCE($2, ip), version = COALESCE($3, version),
                 status = $4, last_heartbeat = NOW(), verified_profile_id = $5, profile_verified_at = NOW(), extended_data = $6
                 WHERE bot_id = $7`,
                [botPlatform, clientIp, botVersion, profileStatus, accountDisplayId, JSON.stringify(extendedData), botId]
            );
            console.log(`🔐 Бот ${botId} верифицирован с анкетой ${accountDisplayId}`);
        } else {
            await pool.query(
                `UPDATE bots SET platform = COALESCE($1, platform), ip = COALESCE($2, ip), version = COALESCE($3, version),
                 status = $4, last_heartbeat = NOW(), extended_data = $5 WHERE bot_id = $6`,
                [botPlatform, clientIp, botVersion, profileStatus, JSON.stringify(extendedData), botId]
            );
        }
    }

    // 5. Связываем бота с анкетой
    await pool.query(
        `INSERT INTO bot_profiles (bot_id, profile_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [botId, accountDisplayId]
    );

    console.log(`❤️ Heartbeat от ${accountDisplayId} (бот ${botId}): ${profileStatus}`);

    // Получаем статус paused и proxy для ответа боту
    const profileSettings = await pool.query(
        `SELECT paused, proxy FROM allowed_profiles WHERE profile_id = $1`,
        [accountDisplayId]
    );
    const isPaused = profileSettings.rows[0]?.paused || false;
    const proxy = profileSettings.rows[0]?.proxy || null;

    // Получаем статус бота (машины) - если offline, то бот выключен
    const botStatusResult = await pool.query(
        `SELECT status FROM bots WHERE bot_id = $1`,
        [botId]
    );
    const botStatus = botStatusResult.rows[0]?.status || 'online';
    const botEnabled = botStatus !== 'offline' && botStatus !== 'disabled';

    res.json({
        status: 'ok',
        commands: {
            mailingEnabled: !isPaused,  // true = рассылка включена, false = на паузе
            proxy: proxy,  // прокси для этой анкеты (null = без прокси)
            botEnabled: botEnabled  // true = бот включен, false = бот выключен админом
        }
    });
}));

// Heartbeat по новой схеме (POST /api/bot/heartbeat)
// КОНСОЛИДИРОВАНО: Этот endpoint теперь перенаправляет на основной /heartbeat
// чтобы избежать дублирования логики. Конвертирует profileId -> accountDisplayId
router.post('/bot/heartbeat', asyncHandler(async (req, res, next) => {
    // Конвертируем новый формат в legacy формат
    req.body.accountDisplayId = req.body.profileId || req.body.accountDisplayId;
    req.body.systemInfo = {
        version: req.body.version,
        platform: req.body.platform
    };
    // Передаём управление основному endpoint (будет обработан следующим middleware)
    // Но так как это отдельный route, просто эмулируем ту же логику минимально

    const { botId, profileId, platform, ip, version, status } = req.body;

    if (!profileId) {
        return res.json({ status: 'ok', message: 'No profile specified' });
    }

    // Проверка оплаты
    const paymentStatus = await checkProfilePaymentStatus(profileId);
    if (!paymentStatus.isPaid) {
        if (paymentStatus.canTrial) {
            return res.json({ status: 'trial_available', profileId, canTrial: true });
        }
        return res.status(402).json({ status: 'payment_required', profileId, canTrial: false });
    }

    // Минимальная запись heartbeat
    await pool.query(`
        INSERT INTO heartbeats (bot_id, account_display_id, status, ip, version, platform, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [botId, profileId, status || 'online', ip, version, platform]);

    // Обновляем статус профиля
    await pool.query(`
        UPDATE allowed_profiles SET status = $1, last_online = NOW() WHERE profile_id = $2
    `, [status || 'online', profileId]);

    console.log(`❤️ Heartbeat (v2) от ${profileId}: ${status || 'online'}`);
    res.json({ status: 'ok' });
}));

// Статус ботов и анкет (ОПТИМИЗИРОВАНО)
router.get('/status', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    const { filter: profileFilter, params } = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'WHERE' });

    // ОПТИМИЗАЦИЯ: Ограничиваем heartbeats последним часом вместо ВСЕЙ таблицы
    // Было: DISTINCT ON по миллионам записей = 27+ секунд
    // Стало: DISTINCT ON по записям за час = <1 секунды
    const profilesQuery = `
        WITH latest_heartbeats AS (
            SELECT DISTINCT ON (account_display_id)
                account_display_id as profile_id,
                bot_id,
                status as heartbeat_status,
                ip,
                version,
                platform,
                timestamp as last_heartbeat
            FROM heartbeats
            WHERE timestamp > NOW() - INTERVAL '1 hour'
            ORDER BY account_display_id, timestamp DESC
        ),
        profile_stats AS (
            SELECT
                profile_id,
                COUNT(*) FILTER (WHERE action_type = 'message_sent') as mail_today,
                COUNT(*) FILTER (WHERE action_type = 'message_sent' AND created_at >= NOW() - INTERVAL '1 hour') as mail_hour,
                COUNT(*) FILTER (WHERE action_type = 'chat_sent') as chat_today,
                COUNT(*) FILTER (WHERE action_type = 'chat_sent' AND created_at >= NOW() - INTERVAL '1 hour') as chat_hour,
                COUNT(*) FILTER (WHERE action_type = 'error') as errors_today
            FROM activity_log
            WHERE created_at >= CURRENT_DATE
            GROUP BY profile_id
        )
        SELECT
            p.profile_id,
            p.note,
            p.paused,
            p.proxy,
            p.assigned_admin_id as admin_id,
            p.assigned_translator_id as translator_id,
            h.bot_id,
            h.heartbeat_status,
            h.ip,
            h.version,
            h.platform,
            h.last_heartbeat,
            CASE
                WHEN h.last_heartbeat > NOW() - INTERVAL '2 minutes' THEN 'online'
                WHEN h.last_heartbeat > NOW() - INTERVAL '10 minutes' THEN 'idle'
                ELSE 'offline'
            END as connection_status,
            COALESCE(s.mail_today, 0) as mail_today,
            COALESCE(s.mail_hour, 0) as mail_hour,
            COALESCE(s.chat_today, 0) as chat_today,
            COALESCE(s.chat_hour, 0) as chat_hour,
            COALESCE(s.errors_today, 0) as errors_today
        FROM allowed_profiles p
        LEFT JOIN latest_heartbeats h ON p.profile_id = h.profile_id
        LEFT JOIN profile_stats s ON p.profile_id = s.profile_id
        ${profileFilter}
        ORDER BY p.profile_id
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
            lastHeartbeat: row.last_heartbeat,
            mailingEnabled: !row.paused,  // true = рассылка включена
            proxy: row.proxy || null,  // прокси для анкеты
            adminId: row.admin_id || null,        // ID админа
            translatorId: row.translator_id || null,  // ID переводчика
            // Статистика по письмам
            mailToday: parseInt(row.mail_today) || 0,
            mailHour: parseInt(row.mail_hour) || 0,
            // Статистика по чатам
            chatToday: parseInt(row.chat_today) || 0,
            chatHour: parseInt(row.chat_hour) || 0,
            // Ошибки
            errorsToday: parseInt(row.errors_today) || 0
        };
    });

    // 2. Получаем уникальные боты (программы) с расширенными данными
    // ВАЖНО: Показываем только настоящие программы-боты (machineId начинается с "machine_")
    // Используем таблицу bots для получения extended_data
    const botsQuery = `
        SELECT
            b.bot_id,
            b.name,
            b.ip,
            b.version,
            b.platform,
            b.last_heartbeat,
            b.status,
            b.extended_data,
            CASE
                WHEN b.last_heartbeat > NOW() - INTERVAL '2 minutes' THEN 'online'
                ELSE 'offline'
            END as bot_status
        FROM bots b
        WHERE b.bot_id IS NOT NULL
          AND b.bot_id != ''
          AND b.bot_id LIKE 'machine_%'
          AND b.last_heartbeat > NOW() - INTERVAL '1 hour'
        ORDER BY b.last_heartbeat DESC
    `;
    const botsResult = await pool.query(botsQuery);

    // DEBUG: Логируем результат запроса ботов
    console.log(`🤖 Bots query (machine_* only) returned ${botsResult.rows.length} rows`);

    const botStatusCounts = { online: 0, offline: 0 };
    const uniqueBots = botsResult.rows.map(row => {
        botStatusCounts[row.bot_status]++;

        // Парсим extended_data если есть
        let extData = {};
        if (row.extended_data) {
            try {
                extData = typeof row.extended_data === 'string'
                    ? JSON.parse(row.extended_data)
                    : row.extended_data;
            } catch (e) { extData = {}; }
        }

        return {
            botId: row.bot_id,
            name: row.name || null,  // Имя бота (сохранённое пользователем)
            ip: row.ip || '-',
            version: row.version || '-',
            platform: row.platform || 'Unknown',
            lastHeartbeat: row.last_heartbeat,
            status: row.bot_status,
            // Расширенные данные
            profilesCount: extData.profilesTotal || 0,
            profilesRunning: extData.profilesRunning || 0,
            profilesStopped: extData.profilesStopped || 0,
            uptime: extData.uptime || 0,
            memoryUsage: extData.memoryUsage || null,
            globalMode: extData.globalMode || 'mail',
            sessionStats: extData.sessionStats || null
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
// Переключение рассылки для конкретной анкеты
router.post('/profile/:profileId/toggle-mailing', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const { userId, enabled } = req.body;

    // Проверяем права (только директор)
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || user.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    // Обновляем статус paused (paused = !enabled)
    await pool.query(
        `UPDATE allowed_profiles SET paused = $1 WHERE profile_id = $2`,
        [!enabled, profileId]
    );

    console.log(`🔄 Профиль ${profileId}: рассылка ${enabled ? 'включена' : 'отключена'}`);

    res.json({
        success: true,
        profileId,
        mailingEnabled: enabled
    });
}));

// Массовое переключение рассылки для всех анкет
router.post('/profiles/toggle-mailing-all', asyncHandler(async (req, res) => {
    const { userId, enabled } = req.body;

    // Проверяем права (только директор)
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || user.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    // Обновляем статус paused для всех анкет
    const result = await pool.query(
        `UPDATE allowed_profiles SET paused = $1`,
        [!enabled]
    );

    console.log(`🔄 Все анкеты (${result.rowCount}): рассылка ${enabled ? 'включена' : 'отключена'}`);

    res.json({
        success: true,
        count: result.rowCount,
        mailingEnabled: enabled
    });
}));

// ============= PROXY MANAGEMENT (Управление прокси) =============

// Обновить прокси для одной анкеты
router.post('/profile/:profileId/proxy', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const { userId, proxy } = req.body;

    // Проверяем права (директор или админ анкеты)
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0) {
        return res.status(403).json({ success: false, error: 'Пользователь не найден' });
    }

    const role = user.rows[0].role;
    if (role !== 'director') {
        // Для не-директоров проверяем, что анкета им назначена
        const profileCheck = await pool.query(
            `SELECT id FROM allowed_profiles WHERE profile_id = $1 AND (assigned_admin_id = $2 OR assigned_translator_id = $2)`,
            [profileId, userId]
        );
        if (profileCheck.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Нет доступа к этой анкете' });
        }
    }

    // Обновляем прокси
    await pool.query(
        `UPDATE allowed_profiles SET proxy = $1 WHERE profile_id = $2`,
        [proxy || null, profileId]
    );

    console.log(`🌐 Профиль ${profileId}: прокси обновлён на ${proxy || 'отключен'}`);

    res.json({
        success: true,
        profileId,
        proxy: proxy || null
    });
}));

// Получить прокси для анкеты (для бота)
router.get('/profile/:profileId/proxy', asyncHandler(async (req, res) => {
    const { profileId } = req.params;

    const result = await pool.query(
        `SELECT proxy FROM allowed_profiles WHERE profile_id = $1`,
        [profileId]
    );

    if (result.rows.length === 0) {
        return res.json({ success: true, proxy: null });
    }

    res.json({
        success: true,
        proxy: result.rows[0].proxy || null
    });
}));

// Массовое обновление прокси для всех анкет
router.post('/profiles/proxy-bulk', asyncHandler(async (req, res) => {
    const { userId, proxies } = req.body;  // proxies = [{profileId, proxy}, ...]

    // Только директор
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || user.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    if (!proxies || !Array.isArray(proxies)) {
        return res.status(400).json({ success: false, error: 'proxies должен быть массивом' });
    }

    let updated = 0;
    for (const item of proxies) {
        if (item.profileId) {
            await pool.query(
                `UPDATE allowed_profiles SET proxy = $1 WHERE profile_id = $2`,
                [item.proxy || null, item.profileId]
            );
            updated++;
        }
    }

    console.log(`🌐 Массовое обновление прокси: ${updated} анкет`);
    res.json({ success: true, updated });
}));

// ============= BOT LOGS (Операционные логи бота) =============

// Приём логов от бота (пакетная отправка)
router.post('/logs', asyncHandler(async (req, res) => {
    const { botId, logs } = req.body;

    if (!botId || !logs || !Array.isArray(logs)) {
        return res.status(400).json({ success: false, error: 'botId и logs обязательны' });
    }

    // Вставляем логи пакетно
    for (const log of logs.slice(0, 50)) { // Максимум 50 логов за раз
        await pool.query(`
            INSERT INTO bot_logs (bot_id, profile_id, log_type, message, details, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            botId,
            log.profileId || null,
            log.type || 'info',
            log.message || '',
            log.details ? JSON.stringify(log.details) : null,
            log.timestamp ? new Date(log.timestamp) : new Date()
        ]);
    }

    res.json({ success: true, count: Math.min(logs.length, 50) });
}));

// Получение логов для дашборда
router.get('/logs', asyncHandler(async (req, res) => {
    const { userId, role, profileId, logType, limit = 50, offset = 0 } = req.query;

    // Проверяем права
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Требуется авторизация' });
    }

    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;

    // Если указан конкретный профиль
    if (profileId) {
        whereClause += ` AND bl.profile_id = $${paramIndex}`;
        params.push(profileId);
        paramIndex++;
    }

    // Если указан тип лога
    if (logType) {
        whereClause += ` AND bl.log_type = $${paramIndex}`;
        params.push(logType);
        paramIndex++;
    }

    // Ограничиваем доступ для не-директоров
    if (role !== 'director') {
        // Получаем профили, доступные этому пользователю
        const profilesResult = await pool.query(`
            SELECT profile_id FROM allowed_profiles WHERE admin_id = $1 OR translator_id = $1
        `, [userId]);

        if (profilesResult.rows.length > 0) {
            const profileIds = profilesResult.rows.map(r => r.profile_id);
            whereClause += ` AND (bl.profile_id = ANY($${paramIndex}) OR bl.profile_id IS NULL)`;
            params.push(profileIds);
            paramIndex++;
        }
    }

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const result = await pool.query(`
        SELECT
            bl.id,
            bl.bot_id,
            bl.profile_id,
            bl.log_type,
            bl.message,
            bl.details,
            bl.created_at
        FROM bot_logs bl
        WHERE ${whereClause}
        ORDER BY bl.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);

    // Получаем общее количество
    const countResult = await pool.query(`
        SELECT COUNT(*) as total FROM bot_logs bl WHERE ${whereClause}
    `, params.slice(0, -2)); // Убираем limit и offset

    res.json({
        success: true,
        logs: result.rows,
        total: parseInt(countResult.rows[0].total),
        hasMore: parseInt(countResult.rows[0].total) > (parseInt(offset) + result.rows.length)
    });
}));

// Очистка старых логов (вызывается по расписанию или вручную)
router.delete('/logs/cleanup', asyncHandler(async (req, res) => {
    const { userId, role } = req.body;

    // Только директор может очищать логи
    if (role !== 'director') {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    // Удаляем логи старше 7 дней
    const result = await pool.query(`
        DELETE FROM bot_logs
        WHERE created_at < NOW() - INTERVAL '7 days'
    `);

    console.log(`🧹 Очищено ${result.rowCount} старых логов`);
    res.json({ success: true, deleted: result.rowCount });
}));

// ============= BATCH SYNC (Оптимизированная синхронизация) =============

/**
 * POST /api/bot/sync
 * Batch синхронизация - один запрос вместо N heartbeat'ов
 * Уменьшает нагрузку в ~100 раз при 100 анкетах
 */
router.post('/sync', asyncHandler(async (req, res) => {
    const {
        botId,           // MACHINE_ID программы
        version,
        platform,
        uptime,
        memoryUsage,
        globalMode,
        profiles,        // Массив анкет [{id, status, mailRunning, chatRunning}, ...]
        stats            // Статистика сессии {mailSent, chatSent, errors}
    } = req.body;

    if (!botId || !profiles || !Array.isArray(profiles)) {
        return res.status(400).json({
            success: false,
            error: 'botId и profiles обязательны'
        });
    }

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                  || req.socket?.remoteAddress
                  || req.ip
                  || 'unknown';

    const timestamp = new Date();
    const profileIds = profiles.map(p => String(p.id));

    console.log(`🔄 Batch sync от ${botId}: ${profiles.length} анкет, IP=${clientIp}`);

    // 1. Проверяем оплату для всех анкет ОДНИМ запросом
    let paymentResult = { rows: [] };
    if (profileIds.length > 0) {
        paymentResult = await pool.query(`
            SELECT
                ap.profile_id,
                ap.paid_until,
                ap.is_trial,
                ap.trial_started_at,
                ap.paused,
                ap.proxy,
                u.is_restricted as admin_is_restricted,
                u_trans.is_own_translator as translator_is_own
            FROM allowed_profiles ap
            LEFT JOIN users u ON ap.assigned_admin_id = u.id
            LEFT JOIN users u_trans ON ap.assigned_translator_id = u_trans.id
            WHERE ap.profile_id = ANY($1)
        `, [profileIds]);
    }

    const paymentMap = {};
    const commandsMap = {};
    const now = new Date();

    for (const row of paymentResult.rows) {
        const profileId = row.profile_id;

        // Определяем статус оплаты
        let isPaid = false;
        let canTrial = false;
        let reason = 'not_found';

        if (row.admin_is_restricted || row.translator_is_own) {
            isPaid = true;
            reason = 'free';
        } else if (row.paid_until && new Date(row.paid_until) > now) {
            isPaid = true;
            reason = 'paid';
        } else if (!row.trial_started_at) {
            canTrial = true;
            reason = 'trial_available';
        } else {
            reason = 'payment_required';
        }

        paymentMap[profileId] = { isPaid, canTrial, reason };
        commandsMap[profileId] = {
            mailingEnabled: !row.paused,
            proxy: row.proxy || null
        };
    }

    // 2. Для анкет которых нет в БД - создаём автоматически
    const existingIds = new Set(paymentResult.rows.map(r => r.profile_id));
    const newProfiles = profileIds.filter(id => !existingIds.has(id));

    for (const id of newProfiles) {
        try {
            await pool.query(
                `INSERT INTO allowed_profiles (profile_id, note, added_at) VALUES ($1, 'Автодобавлено ботом', NOW()) ON CONFLICT DO NOTHING`,
                [id]
            );
        } catch (e) { /* ignore */ }

        // Для новых анкет - trial доступен
        paymentMap[id] = { isPaid: false, canTrial: true, reason: 'trial_available' };
        commandsMap[id] = { mailingEnabled: true, proxy: null };
    }

    // 3. Batch UPDATE статусов анкет
    const paidProfiles = profiles.filter(p => paymentMap[String(p.id)]?.isPaid);

    for (const p of paidProfiles) {
        await pool.query(
            `UPDATE allowed_profiles SET status = $1, last_online = NOW() WHERE profile_id = $2`,
            [p.status || 'online', String(p.id)]
        );
    }

    // 4. Один heartbeat запись для бота (не для каждой анкеты)
    // Записываем только факт sync от программы
    if (paidProfiles.length > 0) {
        await pool.query(`
            INSERT INTO heartbeats (bot_id, account_display_id, status, ip, version, platform, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [botId, paidProfiles[0]?.id || 'batch', 'online', clientIp, version, platform]);
    }

    // 5. Обновляем данные бота (программы)
    const extendedData = {
        uptime: uptime || 0,
        memoryUsage: memoryUsage || null,
        profilesTotal: profiles.length,
        profilesRunning: profiles.filter(p => p.mailRunning || p.chatRunning).length,
        profilesStopped: profiles.filter(p => !p.mailRunning && !p.chatRunning).length,
        globalMode: globalMode || 'mail',
        sessionStats: stats || null,
        lastUpdate: timestamp.toISOString()
    };

    await pool.query(`
        INSERT INTO bots (bot_id, platform, ip, version, status, last_heartbeat, extended_data)
        VALUES ($1, $2, $3, $4, 'online', NOW(), $5)
        ON CONFLICT (bot_id) DO UPDATE SET
            platform = COALESCE($2, bots.platform),
            ip = COALESCE($3, bots.ip),
            version = COALESCE($4, bots.version),
            status = 'online',
            last_heartbeat = NOW(),
            extended_data = $5
    `, [botId, platform, clientIp, version, JSON.stringify(extendedData)]);

    // 6. Формируем ответ с командами для каждой анкеты
    const response = {
        success: true,
        timestamp: timestamp.toISOString(),
        profiles: {}
    };

    for (const p of profiles) {
        const id = String(p.id);
        const payment = paymentMap[id] || { isPaid: false, canTrial: true, reason: 'not_found' };
        const commands = commandsMap[id] || { mailingEnabled: true, proxy: null };

        response.profiles[id] = {
            status: payment.isPaid ? 'ok' : (payment.canTrial ? 'trial_available' : 'payment_required'),
            isPaid: payment.isPaid,
            canTrial: payment.canTrial,
            reason: payment.reason,
            commands: commands
        };
    }

    console.log(`✅ Batch sync завершён: ${paidProfiles.length}/${profiles.length} анкет активны`);

    res.json(response);
}));

module.exports = router;
