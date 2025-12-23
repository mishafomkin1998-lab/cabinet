/**
 * Activity Routes
 * Маршруты активности и сообщений
 *
 * Эндпоинты:
 * - POST /message_sent - Сохранение отправленного сообщения (основной)
 * - POST /log - Альтернативное логирование активности
 * - GET /recent - Последняя активность для ленты в дашборде
 * - POST /profile/status - Обновление статуса профиля
 * - POST /error - Логирование ошибок от бота
 * - GET /history - История переписок с фильтрацией
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler, buildRoleFilter, buildStatsFilter } = require('../utils/helpers');

const router = express.Router();

/**
 * Конвертация времени ответа из разных форматов в секунды (INTEGER)
 * Поддерживает: "00:06:24" (HH:MM:SS), число секунд, null
 */
function parseResponseTimeToSeconds(responseTime) {
    if (!responseTime) return null;

    // Если уже число - возвращаем как есть
    if (typeof responseTime === 'number') {
        return Math.floor(responseTime);
    }

    // Если строка в формате HH:MM:SS
    if (typeof responseTime === 'string' && responseTime.includes(':')) {
        const parts = responseTime.split(':');
        if (parts.length === 3) {
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            const seconds = parseInt(parts[2]) || 0;
            return hours * 3600 + minutes * 60 + seconds;
        }
    }

    // Попытка распарсить как число
    const parsed = parseInt(responseTime);
    return isNaN(parsed) ? null : parsed;
}

/**
 * POST /api/message_sent
 * Основной эндпоинт для сохранения отправленных сообщений.
 * Вызывается ботом после каждой отправки письма или чата.
 *
 * Логика работы:
 * 1. Проверяет/создаёт анкету в allowed_profiles (автодобавление)
 * 2. Сохраняет контент сообщения в message_content
 * 3. Если ошибка - записывает в error_logs
 * 4. Сохраняет основную запись в messages
 * 5. Дублирует в activity_log для быстрого отображения в дашборде
 *
 * @body {string} botId - ID бота
 * @body {string} accountDisplayId - ID анкеты отправителя
 * @body {string} recipientId - ID получателя (мужчины)
 * @body {string} type - Тип сообщения (outgoing/chat_msg)
 * @body {boolean} usedAi - Флаг использования AI генерации
 * @returns {Object} {status: 'ok', contentId: number}
 */
router.post('/message_sent', asyncHandler(async (req, res) => {
    const { botId, accountDisplayId, recipientId, type, responseTime, isFirst, isLast, convId, length,
            status, textContent, templateText, mediaUrl, fileName, translatorId, errorReason, usedAi, aiSessionId, isReply } = req.body;

    // Верификация отключена - теперь один MACHINE_ID может обслуживать много анкет
    // Проверка анкеты делается через allowed_profiles

    // Логируем для отладки
    console.log(`📥 message_sent: accountDisplayId=${accountDisplayId}, isReply=${isReply}, responseTime=${responseTime}, usedAi=${usedAi}`);
    if (usedAi === true) {
        console.log(`🤖🤖🤖 СЕРВЕР ПОЛУЧИЛ AI СООБЩЕНИЕ! от ${accountDisplayId}`);
    }

    let contentId = null;
    let errorLogId = null;

    // Шаг 1: Проверяем существование анкеты, если нет - создаём автоматически
        // Это позволяет боту работать даже если анкета не была добавлена вручную
        let profileData = await pool.query(
            'SELECT * FROM allowed_profiles WHERE profile_id = $1',
            [accountDisplayId]
        );

        if (profileData.rows.length === 0) {
            await pool.query(
                `INSERT INTO allowed_profiles (profile_id, note, added_at) VALUES ($1, $2, NOW())`,
                [accountDisplayId, 'Автодобавлено ботом']
            );
            console.log(`📝 Анкета ${accountDisplayId} автоматически добавлена в allowed_profiles`);
            profileData = await pool.query('SELECT * FROM allowed_profiles WHERE profile_id = $1', [accountDisplayId]);
        }

        // Получаем привязки анкеты к админу и переводчику
        const profile = profileData.rows[0];
        const adminId = profile?.assigned_admin_id || null;
        const assignedTranslatorId = profile?.assigned_translator_id || translatorId || null;

        // Шаг 2: Сохраняем контент сообщения отдельно (нормализация БД)
        const contentRes = await pool.query(
            `INSERT INTO message_content (text_content, media_url, file_name)
             VALUES ($1, $2, $3) RETURNING id`,
            [textContent || null, mediaUrl || null, fileName || null]
        );
        contentId = contentRes.rows[0].id;

        // Шаг 3: Если отправка не удалась - записываем ошибку
        if (status === 'failed' && errorReason) {
             const logRes = await pool.query(
                `INSERT INTO error_logs (endpoint, error_type, message, user_id, raw_data)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                ['/api/message_sent', 'SendingFailed', errorReason, assignedTranslatorId, JSON.stringify(req.body)]
            );
            errorLogId = logRes.rows[0].id;
        }

        // Шаг 4: Основная запись сообщения в таблицу messages
        const msgType = type || 'outgoing';
        const responseTimeSec = parseResponseTimeToSeconds(responseTime); // Конвертируем в секунды
        await pool.query(
            `INSERT INTO messages (bot_id, account_id, profile_id, type, sender_id, timestamp, response_time, is_first_message, is_last_message, conversation_id, message_length, status, message_content_id, error_log_id, admin_id, translator_id)
             VALUES ($1, $2, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [botId, accountDisplayId, msgType, recipientId, responseTimeSec, isFirst || false, isLast || false, convId || null, length || 0, status || 'success', contentId, errorLogId, adminId, assignedTranslatorId]
        );

        // Шаг 5: Дублируем в activity_log для быстрых запросов дашборда
        // activity_log оптимизирован для агрегации (меньше JOIN'ов)
        const actionType = (msgType === 'chat_msg' || msgType === 'chat') ? 'chat' : 'letter';

        await pool.query(
            `INSERT INTO activity_log (profile_id, bot_id, admin_id, translator_id, action_type, man_id, message_text, template_text, response_time_sec, used_ai, is_reply, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [accountDisplayId, botId, adminId, assignedTranslatorId, actionType, recipientId, textContent || null, templateText || null, responseTimeSec, usedAi || false, isReply || false]
        );

        // Шаг 6: Трекинг AI массовых рассылок
        if (usedAi === true && status === 'success' && textContent && textContent.trim().length > 0 && aiSessionId) {
            const crypto = require('crypto');
            const textHash = crypto.createHash('md5').update(textContent.trim()).digest('hex');

            // Проверяем существует ли уже запись с таким hash и session_id
            const existing = await pool.query(
                `SELECT id, recipient_count, recipient_ids FROM ai_mass_messages
                 WHERE text_hash = $1 AND generation_session_id = $2`,
                [textHash, aiSessionId]
            );

            if (existing.rows.length > 0) {
                // Обновляем существующую запись
                const record = existing.rows[0];
                const recipientIds = record.recipient_ids || [];

                // Добавляем нового получателя если его еще нет
                if (!recipientIds.includes(recipientId)) {
                    recipientIds.push(recipientId);

                    await pool.query(
                        `UPDATE ai_mass_messages
                         SET recipient_count = $1,
                             recipient_ids = $2,
                             last_sent_at = NOW()
                         WHERE id = $3`,
                        [recipientIds.length, JSON.stringify(recipientIds), record.id]
                    );

                    console.log(`📊 AI рассылка обновлена: ${recipientIds.length} получателей (session: ${aiSessionId})`);
                }
            } else {
                // Создаем новую запись
                await pool.query(
                    `INSERT INTO ai_mass_messages
                     (text_content, text_hash, recipient_count, recipient_ids, profile_id, admin_id, translator_id, generation_session_id, first_sent_at, last_sent_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                    [
                        textContent,
                        textHash,
                        1,
                        JSON.stringify([recipientId]),
                        accountDisplayId,
                        adminId,
                        assignedTranslatorId,
                        aiSessionId
                    ]
                );

                console.log(`📊 Новая AI рассылка создана (session: ${aiSessionId})`);
            }
        }

        console.log(`✅ Сообщение от бота ${botId} для анкеты ${accountDisplayId} сохранено + activity_log (contentId: ${contentId})`);

    res.json({ status: 'ok', contentId: contentId });
}));

// Логирование активности
router.post('/log', asyncHandler(async (req, res) => {
    const { botId, profileId, actionType, manId, messageText, responseTimeSec, usedAi } = req.body;

    // Конвертируем время ответа в секунды (на случай если придет в формате HH:MM:SS)
    const responseTimeSeconds = parseResponseTimeToSeconds(responseTimeSec);

    const profileResult = await pool.query(
            `SELECT assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1`,
            [profileId]
        );

        if (profileResult.rows.length === 0) {
            console.log(`⚠️ Профиль ${profileId} не найден - создаем запись без привязки`);
        }

        const profile = profileResult.rows[0] || {};

        // Записываем в activity_log
        await pool.query(`
            INSERT INTO activity_log (profile_id, bot_id, admin_id, translator_id, action_type, man_id, message_text, response_time_sec, used_ai)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            profileId,
            botId || null,
            profile.assigned_admin_id || null,
            profile.assigned_translator_id || null,
            actionType,
            manId || null,
            messageText || null,
            responseTimeSeconds,
            usedAi || false
        ]);

        // Также записываем в messages для совместимости
        const msgType = actionType === 'letter' ? 'outgoing' : (actionType === 'chat' ? 'chat_msg' : actionType);
        await pool.query(`
            INSERT INTO messages (bot_id, account_id, profile_id, type, sender_id, response_time, status, admin_id, translator_id)
            VALUES ($1, $2, $2, $3, $4, $5, 'success', $6, $7)
        `, [botId || null, profileId, msgType, manId || null, responseTimeSeconds, profile.assigned_admin_id || null, profile.assigned_translator_id || null]);

        console.log(`📝 Активность: ${actionType} от ${profileId} (бот: ${botId || 'N/A'})`);

    res.json({ status: 'ok' });
}));

// Последняя активность
router.get('/recent', asyncHandler(async (req, res) => {
    const { userId, role, limit = 50 } = req.query;
    const limitInt = parseInt(limit) || 50;

    const activityRoleFilter = buildRoleFilter(role, userId, { table: 'activity', prefix: 'AND', paramIndex: 2 });
        const profileRoleFilter = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'AND', paramIndex: 2 });
        const activityFilter = activityRoleFilter.filter;
        const msgFilter = profileRoleFilter.filter;
        const params = [limitInt, ...activityRoleFilter.params];

        // Сначала пробуем activity_log
        // Добавляем JOIN с incoming_messages для получения текста входящего письма и имени мужчины
        const activityQuery = `
            SELECT
                a.id,
                a.created_at as timestamp,
                a.profile_id,
                a.man_id,
                a.action_type,
                a.message_text,
                a.response_time_sec,
                a.used_ai,
                a.income,
                a.is_reply,
                u_admin.username as admin_name,
                u_trans.username as translator_name,
                im.message_text as incoming_text,
                im.man_name
            FROM activity_log a
            LEFT JOIN users u_admin ON a.admin_id = u_admin.id
            LEFT JOIN users u_trans ON a.translator_id = u_trans.id
            LEFT JOIN LATERAL (
                SELECT im2.message_text, im2.man_name
                FROM incoming_messages im2
                WHERE im2.profile_id = a.profile_id
                    AND im2.man_id = a.man_id
                    AND im2.created_at < a.created_at
                ORDER BY im2.created_at DESC
                LIMIT 1
            ) im ON true
            WHERE 1=1 ${activityFilter}
            ORDER BY a.created_at DESC
            LIMIT $1
        `;

        const activityResult = await pool.query(activityQuery, params);

        // Если activity_log пуст, используем messages
        if (activityResult.rows.length === 0) {
            const msgQuery = `
                SELECT
                    m.id,
                    m.timestamp,
                    m.account_id as profile_id,
                    m.sender_id as man_id,
                    m.type as action_type,
                    m.status,
                    m.response_time as response_time_sec,
                    mc.text_content as message_text
                FROM messages m
                JOIN allowed_profiles p ON m.account_id = p.profile_id
                LEFT JOIN message_content mc ON m.message_content_id = mc.id
                WHERE 1=1 ${msgFilter}
                ORDER BY m.timestamp DESC
                LIMIT $1
            `;

            const msgResult = await pool.query(msgQuery, params);

            const activity = msgResult.rows.map(row => ({
                id: row.id,
                profile_id: row.profile_id,
                action_type: row.action_type === 'outgoing' ? 'letter' : (row.action_type === 'chat_msg' ? 'chat' : row.action_type),
                man_id: row.man_id,
                message_text: row.message_text ? row.message_text.substring(0, 200) : null,
                response_time_sec: row.response_time_sec,
                used_ai: false,
                created_at: row.timestamp
            }));

            return res.json({ success: true, activity });
        }

        // Форматируем активность из activity_log
        const activity = activityResult.rows.map(row => ({
            id: row.id,
            profile_id: row.profile_id,
            action_type: row.action_type,
            man_id: row.man_id,
            man_name: row.man_name || null,
            message_text: row.message_text ? row.message_text.substring(0, 200) : null,
            incoming_text: row.incoming_text ? row.incoming_text.substring(0, 200) : null,
            response_time_sec: row.response_time_sec,
            used_ai: row.used_ai,
            is_reply: row.is_reply || false,
            created_at: row.timestamp,
            admin_name: row.admin_name,
            translator_name: row.translator_name
        }));

    res.json({ success: true, activity });
}));

// Статус профиля
router.post('/profile/status', asyncHandler(async (req, res) => {
    const { botId, profileId, status, lastOnline } = req.body;

    await pool.query(`
            UPDATE allowed_profiles
            SET status = $1, last_online = $2
            WHERE profile_id = $3
        `, [status || 'online', lastOnline || new Date(), profileId]);

        if (botId) {
            await pool.query(
                `INSERT INTO bot_profiles (bot_id, profile_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [botId, profileId]
            );
        }

        console.log(`👤 Статус профиля ${profileId}: ${status || 'online'}`);

    res.json({ status: 'ok' });
}));

// Логирование ошибок от бота
router.post('/error', asyncHandler(async (req, res) => {
    const { botId, accountDisplayId, endpoint, errorType, message, rawData, userId } = req.body;

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

        console.log(`⚠️ Ошибка от бота ${botId} (${accountDisplayId}): ${errorType} - ${message}`);

    res.json({ status: 'ok' });
}));

// История переписок
router.get('/history', asyncHandler(async (req, res) => {
    const { userId, role, search, profileId, senderId, startDate, endDate, type, status, limit = 50, offset = 0 } = req.query;

    const roleFilter = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'AND', paramIndex: 3 });
        let filter = "WHERE 1=1 " + roleFilter.filter + " ";
        let params = [limit, offset, ...roleFilter.params];
        let paramIndex = roleFilter.nextParamIndex;

        if (profileId) {
            filter += `AND p.profile_id = $${paramIndex++} `;
            params.push(profileId);
        }

        if (senderId) {
            filter += `AND m.sender_id = $${paramIndex++} `;
            params.push(senderId);
        }

        if (startDate) {
            filter += `AND m.timestamp >= $${paramIndex++}::date `;
            params.push(startDate);
        }
        if (endDate) {
            filter += `AND m.timestamp < ($${paramIndex++}::date + INTERVAL '1 day') `;
            params.push(endDate);
        }

        if (type) {
            filter += `AND m.type = $${paramIndex++} `;
            params.push(type);
        }
        if (status) {
            filter += `AND m.status = $${paramIndex++} `;
            params.push(status);
        }

        if (search) {
            filter += `AND mc.text_content ILIKE $${paramIndex++} `;
            params.push(`%${search}%`);
        }

        const query = `
            SELECT
                m.id, m.timestamp, m.account_id, m.sender_id, m.type, m.status, m.response_time, m.message_length,
                mc.text_content, mc.media_url, mc.file_name
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            LEFT JOIN message_content mc ON m.message_content_id = mc.id
            ${filter}
            ORDER BY m.timestamp DESC
            LIMIT $1 OFFSET $2
        `;

        const countParams = params.slice(2);
        const countQuery = `
            SELECT COUNT(m.id)
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            LEFT JOIN message_content mc ON m.message_content_id = mc.id
            ${filter}
        `;

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

    const result = await pool.query(query, params);
    res.json({ success: true, list: result.rows, total: totalCount });
}));

/**
 * POST /api/incoming_message
 * Логирование входящих сообщений от мужчин.
 * Вызывается ботом при получении нового письма/чата от мужчины.
 *
 * @body {string} botId - ID бота
 * @body {string} profileId - ID анкеты (получатель)
 * @body {string} manId - ID мужчины (отправитель)
 * @body {string} manName - Имя мужчины
 * @body {string} messageId - ID сообщения на платформе
 * @body {string} type - Тип (letter/chat)
 * @body {string} timestamp - Время получения
 */
router.post('/incoming_message', asyncHandler(async (req, res) => {
    const { botId, profileId, manId, manName, messageId, type, timestamp, messageText } = req.body;

    if (!profileId || !manId) {
        return res.status(400).json({ success: false, error: 'profileId и manId обязательны' });
    }

    // Проверяем, не записано ли уже это сообщение (по messageId)
    if (messageId) {
        const existing = await pool.query(
            'SELECT id FROM incoming_messages WHERE platform_message_id = $1',
            [messageId]
        );
        if (existing.rows.length > 0) {
            return res.json({ success: true, status: 'duplicate' });
        }
    }

    // Проверяем, первое ли это сообщение от этого мужчины к этой анкете
    const firstCheck = await pool.query(
        'SELECT id FROM incoming_messages WHERE profile_id = $1 AND man_id = $2 LIMIT 1',
        [profileId, manId]
    );
    const isFirstFromMan = firstCheck.rows.length === 0;

    // Получаем привязки анкеты
    const profileData = await pool.query(
        'SELECT assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1',
        [profileId]
    );
    const profile = profileData.rows[0] || {};

    // Записываем входящее сообщение
    await pool.query(
        `INSERT INTO incoming_messages
         (profile_id, bot_id, man_id, man_name, platform_message_id, type, is_first_from_man, admin_id, translator_id, created_at, message_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            profileId,
            botId || null,
            manId,
            manName || null,
            messageId || null,
            type || 'letter',
            isFirstFromMan,
            profile.assigned_admin_id || null,
            profile.assigned_translator_id || null,
            timestamp ? new Date(timestamp) : new Date(),
            messageText || null
        ]
    );

    console.log(`📨 Входящее сообщение: ${manName || manId} → ${profileId} (первое: ${isFirstFromMan})`);

    res.json({ success: true, isFirstFromMan });
}));

/**
 * POST /api/activity_ping
 * Трекинг активности оператора (клики, печать).
 * Бот отправляет ping каждые 30-60 сек пока оператор активен.
 */
router.post('/activity_ping', asyncHandler(async (req, res) => {
    const { botId, profileId, timestamp } = req.body;

    if (!profileId) {
        return res.status(400).json({ success: false, error: 'profileId обязателен' });
    }

    // Получаем привязки анкеты
    const profileData = await pool.query(
        'SELECT assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1',
        [profileId]
    );
    const profile = profileData.rows[0] || {};

    // Создаём таблицу если не существует
    await pool.query(`
        CREATE TABLE IF NOT EXISTS activity_pings (
            id SERIAL PRIMARY KEY,
            profile_id VARCHAR(50) NOT NULL,
            bot_id VARCHAR(100),
            admin_id INTEGER,
            translator_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Записываем ping
    await pool.query(
        `INSERT INTO activity_pings (profile_id, bot_id, admin_id, translator_id, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
            profileId,
            botId || null,
            profile.assigned_admin_id || null,
            profile.assigned_translator_id || null,
            timestamp ? new Date(timestamp) : new Date()
        ]
    );

    res.json({ success: true });
}));

/**
 * POST /api/favorite_template
 * Сохранить избранный шаблон рассылки
 */
router.post('/favorite_template', asyncHandler(async (req, res) => {
    const { profileId, botId, templateName, templateText, type = 'mail' } = req.body;

    if (!profileId || !templateText) {
        return res.status(400).json({ error: 'profileId и templateText обязательны' });
    }

    // Получаем admin_id и translator_id из профиля
    const profileResult = await pool.query(
        `SELECT assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1`,
        [profileId]
    );

    const adminId = profileResult.rows[0]?.assigned_admin_id || null;
    const translatorId = profileResult.rows[0]?.assigned_translator_id || null;

    // Проверяем, нет ли уже такого шаблона
    const existCheck = await pool.query(
        `SELECT id FROM favorite_templates WHERE profile_id = $1 AND template_text = $2`,
        [profileId, templateText]
    );

    if (existCheck.rows.length > 0) {
        return res.json({ success: true, message: 'Шаблон уже в избранном', id: existCheck.rows[0].id });
    }

    const result = await pool.query(
        `INSERT INTO favorite_templates (profile_id, bot_id, template_name, template_text, type, admin_id, translator_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [profileId, botId || null, templateName || 'Без названия', templateText, type, adminId, translatorId]
    );

    console.log(`❤️ Избранный шаблон сохранён: ${profileId} - ${templateName}`);
    res.json({ success: true, id: result.rows[0].id });
}));

/**
 * DELETE /api/favorite_template
 * Удалить шаблон из избранного
 */
router.delete('/favorite_template', asyncHandler(async (req, res) => {
    const { profileId, templateText } = req.body;

    if (!profileId || !templateText) {
        return res.status(400).json({ error: 'profileId и templateText обязательны' });
    }

    await pool.query(
        `DELETE FROM favorite_templates WHERE profile_id = $1 AND template_text = $2`,
        [profileId, templateText]
    );

    res.json({ success: true });
}));

/**
 * GET /api/favorite_templates
 * Получить избранные шаблоны с фильтрацией по роли
 */
router.get('/favorite_templates', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    let query = `
        SELECT ft.*, ap.login as profile_login
        FROM favorite_templates ft
        LEFT JOIN allowed_profiles ap ON ft.profile_id = ap.profile_id
    `;
    let params = [];

    if (role === 'admin' && userId) {
        query += ` WHERE ft.admin_id = $1`;
        params.push(userId);
    } else if (role === 'translator' && userId) {
        query += ` WHERE ft.translator_id = $1`;
        params.push(userId);
    }

    query += ` ORDER BY ft.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
        success: true,
        templates: result.rows.map(t => ({
            id: t.id,
            profileId: t.profile_id,
            profileLogin: t.profile_login,
            templateName: t.template_name,
            templateText: t.template_text,
            type: t.type,
            createdAt: t.created_at
        }))
    });
}));

/**
 * GET /api/activity/sent-letters-grouped
 * Возвращает отправленные письма с группировкой по анкете + текст письма
 * Показывает количество отправленных и время последней отправки
 *
 * @query {string} userId - ID пользователя
 * @query {string} role - Роль (translator/admin/director)
 * @query {string} dateFrom - Начало периода (YYYY-MM-DD)
 * @query {string} dateTo - Конец периода (YYYY-MM-DD)
 * @query {string} filterAdminId - ID админа для фильтрации
 * @query {string} filterTranslatorId - ID переводчика для фильтрации
 * @query {number} limit - Количество записей (по умолчанию 50)
 * @returns {Array} letters - Массив сгруппированных писем
 */
router.get('/sent-letters-grouped', asyncHandler(async (req, res) => {
    const { userId, role, dateFrom, dateTo, filterAdminId, filterTranslatorId, limit = 50 } = req.query;
    const limitInt = parseInt(limit) || 50;

    // Определяем период фильтрации
    const now = new Date();
    const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const periodFrom = dateFrom || defaultDateFrom;
    const periodTo = dateTo || defaultDateTo;

    // Строим фильтр с учётом выбранного админа/переводчика
    const statsFilter = buildStatsFilter({
        role, userId, filterAdminId, filterTranslatorId,
        table: 'activity', alias: 'a', prefix: 'AND', paramIndex: 3
    });

    // Параметры: $1 = dateFrom, $2 = dateTo, $3 = filter param (если есть), $N = limit
    let params = [periodFrom, periodTo];
    let limitParamIndex = 3;

    if (statsFilter.params.length > 0) {
        params.push(...statsFilter.params);
        limitParamIndex = statsFilter.nextParamIndex;
    }
    params.push(limitInt);

    /**
     * Группируем по profile_id + template_text (или message_text если шаблон не сохранён)
     * COALESCE выбирает первое непустое значение: template_text или message_text
     * Это позволяет группировать письма по оригинальному шаблону (до подстановки макросов)
     * Считаем количество отправленных каждого письма
     * Получаем время первой и последней отправки
     * Сортируем по времени последней отправки (новые сверху)
     */
    const query = `
        SELECT
            a.profile_id,
            COALESCE(a.template_text, a.message_text) as grouped_text,
            COUNT(*) as sent_count,
            MIN(a.created_at) as first_sent_at,
            MAX(a.created_at) as last_sent_at
        FROM activity_log a
        WHERE a.action_type = 'letter'
            AND a.created_at >= $1::date
            AND a.created_at < ($2::date + interval '1 day')
            ${statsFilter.filter}
            AND (a.message_text IS NOT NULL AND a.message_text != '')
        GROUP BY a.profile_id, COALESCE(a.template_text, a.message_text)
        ORDER BY MAX(a.created_at) DESC
        LIMIT $${limitParamIndex}
    `;

    const result = await pool.query(query, params);

    const letters = result.rows.map(row => ({
        profileId: row.profile_id,
        messageText: row.grouped_text,  // Показываем шаблон (или текст если шаблона нет)
        sentCount: parseInt(row.sent_count),
        firstSentAt: row.first_sent_at,
        lastSentAt: row.last_sent_at
    }));

    res.json({ success: true, letters });
}));

/**
 * GET /api/clients
 * Получить уникальных клиентов (мужчин) из входящих сообщений
 * Клиенты группируются по man_id и type - один мужчина может быть клиентом и в письмах, и в чатах отдельно
 *
 * @query {string} type - Тип: 'letter', 'chat' или 'all' (по умолчанию 'all')
 * @query {string} dateFrom - Начало периода (YYYY-MM-DD)
 * @query {string} dateTo - Конец периода (YYYY-MM-DD)
 * @query {string} profileId - Фильтр по ID анкеты
 * @query {string} search - Поиск по имени или ID мужчины
 * @query {number} page - Страница (по умолчанию 1)
 * @query {number} limit - Количество на странице (по умолчанию 50)
 * @query {string} sortBy - Поле сортировки: 'date', 'name', 'messages' (по умолчанию 'date')
 * @query {string} sortDir - Направление: 'asc' или 'desc' (по умолчанию 'desc')
 */
router.get('/clients', asyncHandler(async (req, res) => {
    const {
        type = 'all',
        dateFrom,
        dateTo,
        profileId,
        search,
        page = 1,
        limit = 50,
        sortBy = 'date',
        sortDir = 'desc'
    } = req.query;

    const pageInt = Math.max(1, parseInt(page) || 1);
    const limitInt = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageInt - 1) * limitInt;

    // Строим условия фильтрации
    let conditions = [];
    let params = [];
    let paramIndex = 1;

    // Фильтр по типу
    if (type && type !== 'all') {
        conditions.push(`im.type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
    }

    // Фильтр по дате
    if (dateFrom) {
        conditions.push(`im.created_at >= $${paramIndex}::date`);
        params.push(dateFrom);
        paramIndex++;
    }
    if (dateTo) {
        conditions.push(`im.created_at < ($${paramIndex}::date + interval '1 day')`);
        params.push(dateTo);
        paramIndex++;
    }

    // Фильтр по анкете
    if (profileId) {
        conditions.push(`im.profile_id = $${paramIndex}`);
        params.push(profileId);
        paramIndex++;
    }

    // Поиск по имени или ID
    if (search) {
        conditions.push(`(im.man_name ILIKE $${paramIndex} OR im.man_id ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Сортировка
    const sortFields = {
        'date': 'last_message_at',
        'name': 'man_name',
        'messages': 'messages_count'
    };
    const sortField = sortFields[sortBy] || 'last_message_at';
    const sortDirection = sortDir === 'asc' ? 'ASC' : 'DESC';

    // Подзапрос для уникальных клиентов с агрегацией
    const query = `
        WITH client_data AS (
            SELECT
                im.man_id,
                im.type,
                MAX(im.man_name) as man_name,
                ARRAY_AGG(DISTINCT im.profile_id) as profile_ids,
                COUNT(*) as messages_count,
                MIN(im.created_at) as first_message_at,
                MAX(im.created_at) as last_message_at,
                (SELECT message_text FROM incoming_messages WHERE man_id = im.man_id AND type = im.type ORDER BY created_at DESC LIMIT 1) as last_message_text
            FROM incoming_messages im
            ${whereClause}
            GROUP BY im.man_id, im.type
        )
        SELECT
            cd.*,
            (SELECT COUNT(*) FROM client_data) as total_count
        FROM client_data cd
        ORDER BY cd.${sortField} ${sortDirection} NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limitInt, offset);

    const result = await pool.query(query, params);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const totalPages = Math.ceil(totalCount / limitInt);

    const clients = result.rows.map(row => ({
        manId: row.man_id,
        manName: row.man_name || `ID ${row.man_id}`,
        type: row.type,
        profileIds: row.profile_ids || [],
        messagesCount: parseInt(row.messages_count),
        firstMessageAt: row.first_message_at,
        lastMessageAt: row.last_message_at,
        lastMessageText: row.last_message_text
    }));

    res.json({
        success: true,
        clients,
        pagination: {
            page: pageInt,
            limit: limitInt,
            totalCount,
            totalPages
        }
    });
}));

/**
 * GET /api/clients/stats
 * Статистика по клиентам
 */
router.get('/clients/stats', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    let dateCondition = '';
    let params = [];

    if (dateFrom && dateTo) {
        dateCondition = 'WHERE created_at >= $1::date AND created_at < ($2::date + interval \'1 day\')';
        params = [dateFrom, dateTo];
    } else if (dateFrom) {
        dateCondition = 'WHERE created_at >= $1::date';
        params = [dateFrom];
    } else if (dateTo) {
        dateCondition = 'WHERE created_at < ($1::date + interval \'1 day\')';
        params = [dateTo];
    }

    // Общая статистика
    const statsQuery = `
        SELECT
            type,
            COUNT(DISTINCT man_id) as unique_clients,
            COUNT(*) as total_messages,
            COUNT(DISTINCT profile_id) as profiles_count
        FROM incoming_messages
        ${dateCondition}
        GROUP BY type
    `;

    const statsResult = await pool.query(statsQuery, params);

    // Статистика по письмам
    const letterStats = statsResult.rows.find(r => r.type === 'letter') || {
        unique_clients: 0,
        total_messages: 0,
        profiles_count: 0
    };

    // Статистика по чатам
    const chatStats = statsResult.rows.find(r => r.type === 'chat') || {
        unique_clients: 0,
        total_messages: 0,
        profiles_count: 0
    };

    res.json({
        success: true,
        stats: {
            letters: {
                uniqueClients: parseInt(letterStats.unique_clients) || 0,
                totalMessages: parseInt(letterStats.total_messages) || 0,
                profilesCount: parseInt(letterStats.profiles_count) || 0
            },
            chats: {
                uniqueClients: parseInt(chatStats.unique_clients) || 0,
                totalMessages: parseInt(chatStats.total_messages) || 0,
                profilesCount: parseInt(chatStats.profiles_count) || 0
            },
            total: {
                uniqueClients: (parseInt(letterStats.unique_clients) || 0) + (parseInt(chatStats.unique_clients) || 0),
                totalMessages: (parseInt(letterStats.total_messages) || 0) + (parseInt(chatStats.total_messages) || 0)
            }
        }
    });
}));

/**
 * GET /api/clients/export
 * Экспорт клиентов в CSV
 */
router.get('/clients/export', asyncHandler(async (req, res) => {
    const { type = 'all', dateFrom, dateTo, profileId } = req.query;

    // Строим условия фильтрации
    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (type && type !== 'all') {
        conditions.push(`im.type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
    }

    if (dateFrom) {
        conditions.push(`im.created_at >= $${paramIndex}::date`);
        params.push(dateFrom);
        paramIndex++;
    }
    if (dateTo) {
        conditions.push(`im.created_at < ($${paramIndex}::date + interval '1 day')`);
        params.push(dateTo);
        paramIndex++;
    }

    if (profileId) {
        conditions.push(`im.profile_id = $${paramIndex}`);
        params.push(profileId);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
        SELECT
            im.man_id,
            MAX(im.man_name) as man_name,
            im.type,
            STRING_AGG(DISTINCT im.profile_id, ', ') as profile_ids,
            COUNT(*) as messages_count,
            MIN(im.created_at) as first_message_at,
            MAX(im.created_at) as last_message_at
        FROM incoming_messages im
        ${whereClause}
        GROUP BY im.man_id, im.type
        ORDER BY MAX(im.created_at) DESC
    `;

    const result = await pool.query(query, params);

    // Формируем CSV
    const headers = ['ID мужчины', 'Имя', 'Тип', 'Анкеты', 'Кол-во сообщений', 'Первое сообщение', 'Последнее сообщение'];
    const rows = result.rows.map(row => [
        row.man_id,
        (row.man_name || '').replace(/"/g, '""'),
        row.type === 'letter' ? 'Письмо' : 'Чат',
        row.profile_ids,
        row.messages_count,
        row.first_message_at ? new Date(row.first_message_at).toLocaleString('ru-RU') : '',
        row.last_message_at ? new Date(row.last_message_at).toLocaleString('ru-RU') : ''
    ]);

    // BOM для корректного отображения кириллицы в Excel
    const BOM = '\uFEFF';
    const csv = BOM + [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clients_${type}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
}));

/**
 * GET /api/clients/:manId/messages
 * Получить все сообщения от конкретного клиента
 */
router.get('/clients/:manId/messages', asyncHandler(async (req, res) => {
    const { manId } = req.params;
    const { type, profileId, page = 1, limit = 50 } = req.query;

    const pageInt = Math.max(1, parseInt(page) || 1);
    const limitInt = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageInt - 1) * limitInt;

    let conditions = ['man_id = $1'];
    let params = [manId];
    let paramIndex = 2;

    if (type) {
        conditions.push(`type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
    }

    if (profileId) {
        conditions.push(`profile_id = $${paramIndex}`);
        params.push(profileId);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Получаем сообщения
    const query = `
        SELECT
            id, profile_id, man_id, man_name, type, message_text, created_at
        FROM incoming_messages
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitInt, offset);

    const result = await pool.query(query, params);

    // Получаем общее количество
    const countQuery = `SELECT COUNT(*) as total FROM incoming_messages WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const totalCount = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limitInt);

    res.json({
        success: true,
        messages: result.rows.map(row => ({
            id: row.id,
            profileId: row.profile_id,
            manId: row.man_id,
            manName: row.man_name,
            type: row.type,
            messageText: row.message_text,
            createdAt: row.created_at
        })),
        pagination: {
            page: pageInt,
            limit: limitInt,
            totalCount,
            totalPages
        }
    });
}));

module.exports = router;
