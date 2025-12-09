// ==========================================
// ROUTES/TEAM.JS - Управление командой
// Эндпоинты: /api/team, /api/users, /api/users/:id
// ==========================================

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { PRICE_LETTER, PRICE_CHAT } = require('../utils/prices');

const router = express.Router();

// GET /api/team - Получить список команды с статистикой
router.get('/api/team', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'director') {
            // Директор видит всех админов и их переводчиков
            filter = `WHERE u.role IN ('admin', 'translator')`;
        } else if (role === 'admin') {
            // Админ видит только своих переводчиков
            filter = `WHERE u.owner_id = $1`;
            params.push(userId);
        } else {
            return res.json({ success: true, list: [] });
        }

        // Запрос с полной статистикой
        const query = `
            SELECT
                u.id,
                u.username,
                u.login,
                u.role,
                u.owner_id,
                u.salary,
                u.created_at,
                -- Количество анкет
                COALESCE(profiles.accounts_count, 0) as accounts_count,
                -- Статистика за сегодня
                COALESCE(stats.letters_today, 0) as letters_today,
                COALESCE(stats.chats_today, 0) as chats_today,
                COALESCE(stats.income_today, 0) as income_today,
                -- Конверсия (уникальные мужчины / письма * 100)
                CASE
                    WHEN COALESCE(stats.letters_today, 0) > 0
                    THEN ROUND((COALESCE(stats.unique_men_today, 0)::numeric / stats.letters_today) * 100, 1)
                    ELSE 0
                END as conversion,
                -- Является ли это мой админ (для переводчиков)
                CASE WHEN u.owner_id = $${params.length > 0 ? params.length : 1} THEN true ELSE false END as is_my_admin,
                -- Список анкет (для переводчиков)
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
                    COALESCE(SUM(a.income) FILTER (WHERE DATE(a.created_at) = CURRENT_DATE), 0) as income_today,
                    COUNT(DISTINCT CASE WHEN DATE(a.created_at) = CURRENT_DATE THEN a.man_id END) as unique_men_today
                FROM activity_log a
                WHERE
                    (u.role = 'admin' AND a.admin_id = u.id)
                    OR (u.role = 'translator' AND a.translator_id = u.id)
            ) stats ON true
            ${filter}
            ORDER BY u.role, u.username
        `;

        // Добавляем userId для is_my_admin если params пустой
        if (params.length === 0) {
            params.push(userId);
        }

        const result = await pool.query(query, params);

        // Также получаем данные из messages для совместимости
        const msgQuery = `
            SELECT
                CASE
                    WHEN p.assigned_admin_id IS NOT NULL THEN p.assigned_admin_id
                    ELSE p.assigned_translator_id
                END as user_id,
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND DATE(m.timestamp) = CURRENT_DATE) as letters_today,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE) as chats_today,
                COUNT(DISTINCT CASE WHEN DATE(m.timestamp) = CURRENT_DATE THEN m.sender_id END) as unique_men_today
            FROM allowed_profiles p
            LEFT JOIN messages m ON p.profile_id = m.account_id
            GROUP BY CASE WHEN p.assigned_admin_id IS NOT NULL THEN p.assigned_admin_id ELSE p.assigned_translator_id END
        `;
        const msgResult = await pool.query(msgQuery);
        const msgStatsMap = {};
        msgResult.rows.forEach(r => {
            if (r.user_id) msgStatsMap[r.user_id] = r;
        });

        const list = result.rows.map(row => {
            const msgStats = msgStatsMap[row.id] || {};
            const lettersToday = parseInt(row.letters_today) || parseInt(msgStats.letters_today) || 0;
            const chatsToday = parseInt(row.chats_today) || parseInt(msgStats.chats_today) || 0;
            const incomeToday = parseFloat(row.income_today) || (lettersToday * PRICE_LETTER + chatsToday * PRICE_CHAT);
            const uniqueMen = parseInt(msgStats.unique_men_today) || 0;
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

// POST /api/users - Создать пользователя
router.post('/api/users', async (req, res) => {
    const { username, password, role, ownerId } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (username, password_hash, role, owner_id) VALUES ($1, $2, $3, $4)`,
            [username, hash, role, ownerId]
        );
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: 'Логин занят' }); }
});

// DELETE /api/users/:id - Удалить пользователя
router.delete('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        await pool.query(`UPDATE allowed_profiles SET assigned_translator_id = NULL WHERE assigned_translator_id = $1`, [userId]);
        await pool.query(`UPDATE allowed_profiles SET assigned_admin_id = NULL WHERE assigned_admin_id = $1`, [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
