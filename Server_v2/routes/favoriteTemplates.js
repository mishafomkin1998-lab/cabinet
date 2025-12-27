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
 * Фильтрация по доступным анкетам (как в других разделах статистики)
 */
router.get('/', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    let query = `
        SELECT ft.*, ap.login as profile_login
        FROM favorite_templates ft
        LEFT JOIN allowed_profiles ap ON ft.profile_id = ap.profile_id
    `;
    let params = [];

    // Фильтруем по доступным анкетам на основе роли
    if (role === 'admin' && userId) {
        // Админ видит шаблоны своих анкет + анкет своих переводчиков
        query += ` WHERE ft.profile_id IN (
            SELECT profile_id FROM allowed_profiles
            WHERE assigned_admin_id = $1
               OR assigned_translator_id IN (SELECT id FROM users WHERE owner_id = $1)
        )`;
        params.push(userId);
    } else if (role === 'translator' && userId) {
        // Переводчик видит шаблоны только своих анкет
        query += ` WHERE ft.profile_id IN (
            SELECT profile_id FROM allowed_profiles WHERE assigned_translator_id = $1
        )`;
        params.push(userId);
    }
    // Директор видит все - фильтр не нужен

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
