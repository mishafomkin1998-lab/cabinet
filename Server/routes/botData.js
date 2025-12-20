/**
 * Bot Data Routes
 * API для хранения данных бота на сервере (шаблоны, blacklist, статистика)
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/bot-data/:profileId
 * Получить все данные бота для анкеты
 */
router.get('/:profileId', asyncHandler(async (req, res) => {
    const { profileId } = req.params;

    // Пробуем получить данные
    let result = await pool.query(
        `SELECT * FROM profile_bot_data WHERE profile_id = $1`,
        [profileId]
    );

    // Если записи нет - создаём пустую
    if (result.rows.length === 0) {
        await pool.query(
            `INSERT INTO profile_bot_data (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING`,
            [profileId]
        );
        result = await pool.query(
            `SELECT * FROM profile_bot_data WHERE profile_id = $1`,
            [profileId]
        );
    }

    const data = result.rows[0];

    res.json({
        success: true,
        data: {
            profileId: data.profile_id,
            templatesMail: data.templates_mail || [],
            templatesChat: data.templates_chat || [],
            blacklistMail: data.blacklist_mail || [],
            blacklistChat: data.blacklist_chat || [],
            statsMailSent: data.stats_mail_sent || 0,
            statsMailErrors: data.stats_mail_errors || 0,
            statsChatSent: data.stats_chat_sent || 0,
            statsChatErrors: data.stats_chat_errors || 0,
            updatedAt: data.updated_at
        }
    });
}));

/**
 * PUT /api/bot-data/:profileId
 * Обновить данные бота (частичное обновление)
 */
router.put('/:profileId', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const {
        templatesMail,
        templatesChat,
        blacklistMail,
        blacklistChat,
        statsMailSent,
        statsMailErrors,
        statsChatSent,
        statsChatErrors
    } = req.body;

    // Создаём запись если не существует
    await pool.query(
        `INSERT INTO profile_bot_data (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING`,
        [profileId]
    );

    // Формируем динамический UPDATE
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (templatesMail !== undefined) {
        updates.push(`templates_mail = $${paramIndex++}`);
        values.push(JSON.stringify(templatesMail));
    }
    if (templatesChat !== undefined) {
        updates.push(`templates_chat = $${paramIndex++}`);
        values.push(JSON.stringify(templatesChat));
    }
    if (blacklistMail !== undefined) {
        updates.push(`blacklist_mail = $${paramIndex++}`);
        values.push(JSON.stringify(blacklistMail));
    }
    if (blacklistChat !== undefined) {
        updates.push(`blacklist_chat = $${paramIndex++}`);
        values.push(JSON.stringify(blacklistChat));
    }
    if (statsMailSent !== undefined) {
        updates.push(`stats_mail_sent = $${paramIndex++}`);
        values.push(statsMailSent);
    }
    if (statsMailErrors !== undefined) {
        updates.push(`stats_mail_errors = $${paramIndex++}`);
        values.push(statsMailErrors);
    }
    if (statsChatSent !== undefined) {
        updates.push(`stats_chat_sent = $${paramIndex++}`);
        values.push(statsChatSent);
    }
    if (statsChatErrors !== undefined) {
        updates.push(`stats_chat_errors = $${paramIndex++}`);
        values.push(statsChatErrors);
    }

    if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(profileId);

        const query = `UPDATE profile_bot_data SET ${updates.join(', ')} WHERE profile_id = $${paramIndex}`;
        await pool.query(query, values);
    }

    res.json({ success: true });
}));

/**
 * POST /api/bot-data/:profileId/reset-stats
 * Обнулить статистику (mail или chat)
 */
router.post('/:profileId/reset-stats', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const { type } = req.body; // 'mail', 'chat', или 'all'

    let updates = [];

    if (type === 'mail' || type === 'all') {
        updates.push('stats_mail_sent = 0', 'stats_mail_errors = 0');
    }
    if (type === 'chat' || type === 'all') {
        updates.push('stats_chat_sent = 0', 'stats_chat_errors = 0');
    }

    if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        await pool.query(
            `UPDATE profile_bot_data SET ${updates.join(', ')} WHERE profile_id = $1`,
            [profileId]
        );
    }

    res.json({ success: true });
}));

/**
 * POST /api/bot-data/:profileId/increment-stats
 * Увеличить счётчик статистики (sent или errors)
 */
router.post('/:profileId/increment-stats', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const { type, field, amount = 1 } = req.body;
    // type: 'mail' или 'chat'
    // field: 'sent' или 'errors'

    // Создаём запись если не существует
    await pool.query(
        `INSERT INTO profile_bot_data (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING`,
        [profileId]
    );

    const column = `stats_${type}_${field}`;
    const validColumns = ['stats_mail_sent', 'stats_mail_errors', 'stats_chat_sent', 'stats_chat_errors'];

    if (!validColumns.includes(column)) {
        return res.status(400).json({ error: 'Invalid type or field' });
    }

    await pool.query(
        `UPDATE profile_bot_data SET ${column} = ${column} + $1, updated_at = NOW() WHERE profile_id = $2`,
        [amount, profileId]
    );

    res.json({ success: true });
}));

/**
 * POST /api/bot-data/:profileId/add-to-blacklist
 * Добавить ID в черный список
 */
router.post('/:profileId/add-to-blacklist', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const { type, odUserId } = req.body; // type: 'mail' или 'chat', odUserId: ID мужчины

    // Создаём запись если не существует
    await pool.query(
        `INSERT INTO profile_bot_data (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING`,
        [profileId]
    );

    const column = type === 'chat' ? 'blacklist_chat' : 'blacklist_mail';

    // Добавляем в массив если ещё нет
    await pool.query(
        `UPDATE profile_bot_data
         SET ${column} = (
             SELECT jsonb_agg(DISTINCT elem)
             FROM (
                 SELECT jsonb_array_elements(${column}) AS elem
                 UNION
                 SELECT $1::jsonb
             ) sub
         ),
         updated_at = NOW()
         WHERE profile_id = $2`,
        [JSON.stringify(odUserId), profileId]
    );

    res.json({ success: true });
}));

/**
 * POST /api/bot-data/:profileId/remove-from-blacklist
 * Удалить ID из черного списка
 */
router.post('/:profileId/remove-from-blacklist', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const { type, odUserId } = req.body;

    const column = type === 'chat' ? 'blacklist_chat' : 'blacklist_mail';

    await pool.query(
        `UPDATE profile_bot_data
         SET ${column} = (
             SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
             FROM jsonb_array_elements(${column}) AS elem
             WHERE elem != $1::jsonb
         ),
         updated_at = NOW()
         WHERE profile_id = $2`,
        [JSON.stringify(odUserId), profileId]
    );

    res.json({ success: true });
}));

module.exports = router;
