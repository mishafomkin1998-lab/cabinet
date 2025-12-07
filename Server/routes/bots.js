/**
 * Bots Routes
 * Маршруты для ботов (heartbeat, статусы)
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler, buildRoleFilter } = require('../utils/helpers');

const router = express.Router();

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

// Статус анкет (онлайн/офлайн)
router.get('/status', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    const { filter: profileFilter, params } = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'WHERE' });

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

        const statusCounts = {
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
            statusCounts[status]++;

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

        const total = profiles.length;

        res.json({
            success: true,
            summary: {
                ...statusCounts,
                total: total
            },
            bots: profiles,
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

module.exports = router;
