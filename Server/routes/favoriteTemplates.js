/**
 * Favorite Templates Routes
 * Маршруты избранных шаблонов рассылки
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/favorite-templates
 * Возвращает избранные шаблоны сообщений пользователя
 */
router.get('/', asyncHandler(async (req, res) => {
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
 * DELETE /api/favorite-templates/:id
 * Удаляет избранный шаблон
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    await pool.query('DELETE FROM favorite_templates WHERE id = $1', [id]);

    res.json({ success: true });
}));

module.exports = router;
