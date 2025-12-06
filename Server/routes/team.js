/**
 * Team Routes
 * Маршруты управления командой
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

// Получение команды
router.get('/', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'director') {
            filter = `WHERE u.role IN ('admin', 'translator')`;
        } else if (role === 'admin') {
            filter = `WHERE u.owner_id = $1`;
            params.push(userId);
        } else {
            return res.json({ success: true, list: [] });
        }

        const query = `
            SELECT
                u.id,
                u.username,
                u.login,
                u.role,
                u.owner_id,
                u.salary,
                u.created_at,
                COALESCE(profiles.accounts_count, 0) as accounts_count,
                COALESCE(stats.letters_today, 0) as letters_today,
                COALESCE(stats.chats_today, 0) as chats_today,
                CASE
                    WHEN COALESCE(stats.letters_today, 0) > 0
                    THEN ROUND((COALESCE(stats.unique_men_today, 0)::numeric / stats.letters_today) * 100, 1)
                    ELSE 0
                END as conversion,
                CASE WHEN u.owner_id = $${params.length > 0 ? params.length : 1} THEN true ELSE false END as is_my_admin,
                COALESCE(profiles.accounts, ARRAY[]::varchar[]) as accounts
            FROM users u
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) as accounts_count,
                    ARRAY_AGG(p.profile_id) as accounts
                FROM allowed_profiles p
                WHERE
                    (u.role = 'admin' AND p.assigned_admin_id = u.id)
                    OR (u.role = 'translator' AND p.assigned_translator_id = u.id)
            ) profiles ON true
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE) as letters_today,
                    COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE) as chats_today,
                    COUNT(DISTINCT CASE WHEN DATE(a.created_at) = CURRENT_DATE THEN a.man_id END) as unique_men_today
                FROM activity_log a
                WHERE
                    (u.role = 'admin' AND a.admin_id = u.id)
                    OR (u.role = 'translator' AND a.translator_id = u.id)
            ) stats ON true
            ${filter}
            ORDER BY u.role, u.username
        `;

        if (params.length === 0) {
            params.push(userId);
        }

        const result = await pool.query(query, params);

        const list = result.rows.map(row => {
            const lettersToday = parseInt(row.letters_today) || 0;
            const uniqueMen = parseInt(row.unique_men_today) || 0;
            const conversion = lettersToday > 0 ? ((uniqueMen / lettersToday) * 100).toFixed(1) : 0;

            return {
                id: row.id,
                username: row.username,
                login: row.login,
                role: row.role,
                owner_id: row.owner_id,
                salary: row.salary,
                accounts_count: parseInt(row.accounts_count) || 0,
                letters_today: lettersToday,
                chats_today: parseInt(row.chats_today) || 0,
                conversion: parseFloat(row.conversion) || parseFloat(conversion),
                is_my_admin: row.is_my_admin,
                accounts: row.accounts || []
            };
        });

        res.json({ success: true, list });
    } catch (e) {
        console.error('Team error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Создание пользователя
router.post('/', async (req, res) => {
    const { username, password, role, ownerId, salary, isRestricted, aiEnabled } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, role, owner_id, salary, ai_enabled)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [username, hash, role, ownerId, isRestricted ? null : salary, aiEnabled || false]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (e) {
        console.error('Create user error:', e.message);
        res.json({ success: false, error: 'Логин занят' });
    }
});

// Удаление пользователя
router.delete('/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        await pool.query(`UPDATE allowed_profiles SET assigned_translator_id = NULL WHERE assigned_translator_id = $1`, [userId]);
        await pool.query(`UPDATE allowed_profiles SET assigned_admin_id = NULL WHERE assigned_admin_id = $1`, [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
