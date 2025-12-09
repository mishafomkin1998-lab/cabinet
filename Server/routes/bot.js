// ==========================================
// ROUTES/BOT.JS - API для бота
// Эндпоинты: /api/message_sent, /api/heartbeat, /api/error,
//            /api/bot/heartbeat, /api/activity/log, /api/profile/status
// ==========================================

const express = require('express');
const pool = require('../config/database');
const { logError } = require('../utils/logger');
const { PRICE_LETTER, PRICE_CHAT } = require('../utils/prices');

const router = express.Router();

// POST /api/message_sent - Получить сообщение от бота (legacy)
router.post('/api/message_sent', async (req, res) => {
    const { botId, accountDisplayId, recipientId, type, responseTime, isFirst, isLast, convId, length,
            status, textContent, mediaUrl, fileName, translatorId, errorReason } = req.body;

    let contentId = null;
    let errorLogId = null;

    try {
        // Проверяем анкету (поддерживаем оба поля: profile_id и account_display_id)
        const check = await pool.query(
            'SELECT * FROM allowed_profiles WHERE profile_id = $1',
            [accountDisplayId]
        );

        if (check.rows.length === 0) {
            console.log(`Анкета ${accountDisplayId} не найдена в allowed_profiles - игнорируем`);
            return res.json({ status: 'ignored' });
        }

        // 1. Сохранение контента сообщения
        const contentRes = await pool.query(
            `INSERT INTO message_content (text_content, media_url, file_name)
             VALUES ($1, $2, $3) RETURNING id`,
            [textContent || null, mediaUrl || null, fileName || null]
        );
        contentId = contentRes.rows[0].id;

        // 2. Если статус 'failed', записываем лог ошибки
        if (status === 'failed' && errorReason) {
             const logRes = await pool.query(
                `INSERT INTO error_logs (endpoint, error_type, message, user_id, raw_data)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                ['/api/message_sent', 'SendingFailed', errorReason, translatorId || null, JSON.stringify(req.body)]
            );
            errorLogId = logRes.rows[0].id;
        }

        // 3. Сохранение сообщения со статусом и ссылкой на контент
        const msgType = type || 'outgoing';
        await pool.query(
            `INSERT INTO messages (bot_id, account_id, type, sender_id, timestamp, response_time, is_first_message, is_last_message, conversation_id, message_length, status, message_content_id, error_log_id)
             VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12)`,
            [botId, accountDisplayId, msgType, recipientId, responseTime || null, isFirst || false, isLast || false, convId || null, length || 0, status || 'success', contentId, errorLogId]
        );

        console.log(`Сообщение от бота ${botId} для анкеты ${accountDisplayId} сохранено (contentId: ${contentId})`);

        res.json({ status: 'ok', contentId: contentId });

    } catch (e) {
        console.error('Ошибка сохранения сообщения:', e.message);
        await logError('/api/message_sent', 'DatabaseError', e.message, req.body, translatorId);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/heartbeat - Heartbeat от бота (legacy)
router.post('/api/heartbeat', async (req, res) => {
    const { botId, accountDisplayId, status, timestamp, ip, systemInfo } = req.body;

    try {
        await pool.query(`
            INSERT INTO heartbeats (
                bot_id, account_display_id, status,
                ip, version, platform, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            botId,
            accountDisplayId,
            status || 'online',
            ip || null,
            systemInfo?.version || null,
            systemInfo?.platform || null,
            timestamp || new Date()
        ]);

        // Опционально: обновляем last_seen в таблице allowed_profiles
        await pool.query(`
            UPDATE allowed_profiles
            SET note = COALESCE(note, '') || ' [Last seen: ' || $1 || ']'
            WHERE profile_id = $2
        `, [new Date(timestamp).toISOString(), accountDisplayId]);

        console.log(`Heartbeat от ${accountDisplayId}: ${status}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('Ошибка heartbeat:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/error - Логирование ошибок от бота
router.post('/api/error', async (req, res) => {
    const { botId, accountDisplayId, endpoint, errorType, message, rawData, userId } = req.body;

    try {
        await pool.query(`
            INSERT INTO error_logs (
                endpoint, error_type, message, raw_data, user_id
            ) VALUES ($1, $2, $3, $4, $5)
        `, [
            endpoint || 'bot_general',
            errorType || 'UnknownError',
            `[Bot: ${botId}] [Account: ${accountDisplayId}] ${message}`,
            rawData ? JSON.stringify(rawData) : JSON.stringify({ botId, accountDisplayId }),
            userId || null
        ]);

        console.log(`Ошибка от бота ${botId} (${accountDisplayId}): ${errorType} - ${message}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('Ошибка логирования:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/bot/heartbeat - Heartbeat по новой схеме
router.post('/api/bot/heartbeat', async (req, res) => {
    const { botId, profileId, platform, ip, version, status } = req.body;

    try {
        // 1. Обновляем/создаем запись бота
        await pool.query(`
            INSERT INTO bots (bot_id, platform, ip, version, status, last_heartbeat)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (bot_id) DO UPDATE SET
                platform = EXCLUDED.platform,
                ip = EXCLUDED.ip,
                version = EXCLUDED.version,
                status = EXCLUDED.status,
                last_heartbeat = NOW()
        `, [botId, platform || null, ip || null, version || null, status || 'online']);

        // 2. Связываем бота с профилем
        if (profileId) {
            await pool.query(`
                INSERT INTO bot_profiles (bot_id, profile_id)
                VALUES ($1, $2)
                ON CONFLICT (bot_id, profile_id) DO NOTHING
            `, [botId, profileId]);

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

        console.log(`Heartbeat от бота ${botId} (${profileId || 'no profile'}): ${status || 'online'}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('Ошибка heartbeat:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/activity/log - Логирование активности
router.post('/api/activity/log', async (req, res) => {
    const { botId, profileId, actionType, manId, messageText, responseTimeSec, usedAi, income } = req.body;

    try {
        // Получаем admin_id и translator_id для этого профиля
        const profileResult = await pool.query(
            `SELECT assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1`,
            [profileId]
        );

        if (profileResult.rows.length === 0) {
            console.log(`Профиль ${profileId} не найден - создаем запись без привязки`);
        }

        const profile = profileResult.rows[0] || {};

        // Расчёт дохода если не передан
        let calculatedIncome = income;
        if (calculatedIncome === undefined || calculatedIncome === null) {
            if (actionType === 'letter') {
                calculatedIncome = PRICE_LETTER;
            } else if (actionType === 'chat') {
                calculatedIncome = PRICE_CHAT;
            } else {
                calculatedIncome = 0;
            }
        }

        // Записываем в activity_log
        await pool.query(`
            INSERT INTO activity_log (profile_id, bot_id, admin_id, translator_id, action_type, man_id, message_text, response_time_sec, used_ai, income)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            profileId,
            botId || null,
            profile.assigned_admin_id || null,
            profile.assigned_translator_id || null,
            actionType,
            manId || null,
            messageText || null,
            responseTimeSec || null,
            usedAi || false,
            calculatedIncome
        ]);

        // Также записываем в messages для совместимости
        const msgType = actionType === 'letter' ? 'outgoing' : (actionType === 'chat' ? 'chat_msg' : actionType);
        await pool.query(`
            INSERT INTO messages (bot_id, account_id, type, sender_id, response_time, status)
            VALUES ($1, $2, $3, $4, $5, 'success')
        `, [botId || null, profileId, msgType, manId || null, responseTimeSec || null]);

        console.log(`Активность: ${actionType} от ${profileId} (бот: ${botId || 'N/A'}), доход: $${calculatedIncome}`);

        res.json({ status: 'ok', income: calculatedIncome });

    } catch (error) {
        console.error('Ошибка записи активности:', error.message);
        await logError('/api/activity/log', 'DatabaseError', error.message, req.body, null);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/profile/status - Обновить статус профиля
router.post('/api/profile/status', async (req, res) => {
    const { botId, profileId, status, lastOnline } = req.body;

    try {
        // Обновляем статус профиля
        await pool.query(`
            UPDATE allowed_profiles
            SET status = $1, last_online = $2
            WHERE profile_id = $3
        `, [status || 'online', lastOnline || new Date(), profileId]);

        // Связываем бота с профилем если указан
        if (botId) {
            await pool.query(`
                INSERT INTO bot_profiles (bot_id, profile_id)
                VALUES ($1, $2)
                ON CONFLICT (bot_id, profile_id) DO NOTHING
            `, [botId, profileId]);
        }

        console.log(`Статус профиля ${profileId}: ${status || 'online'}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('Ошибка обновления статуса:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
