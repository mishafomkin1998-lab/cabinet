// ==========================================
// ROUTES/PROFILES.JS - Управление анкетами
// Эндпоинты: /api/profiles, /api/profiles/bulk, /api/profiles/assign
// ==========================================

const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// GET /api/profiles - Получить список анкет с статистикой
router.get('/api/profiles', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'admin') {
            filter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        } else if (role === 'translator') {
            filter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        }

        // Основной запрос с агрегированной статистикой
        const query = `
            SELECT
                p.id,
                p.profile_id,
                p.login,
                p.password,
                p.note,
                p.paused,
                p.status,
                p.last_online,
                p.added_at,
                p.assigned_admin_id as admin_id,
                p.assigned_translator_id as translator_id,
                u_admin.username as admin_name,
                u_trans.username as trans_name,
                -- Статистика за сегодня
                COALESCE(stats.letters_today, 0) as letters_today,
                COALESCE(stats.chats_today, 0) as chats_today,
                -- Общая статистика
                COALESCE(stats.letters_total, 0) as letters_total,
                COALESCE(stats.chats_total, 0) as chats_total
            FROM allowed_profiles p
            LEFT JOIN users u_admin ON p.assigned_admin_id = u_admin.id
            LEFT JOIN users u_trans ON p.assigned_translator_id = u_trans.id
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE) as letters_today,
                    COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE) as chats_today,
                    COUNT(*) FILTER (WHERE a.action_type = 'letter') as letters_total,
                    COUNT(*) FILTER (WHERE a.action_type = 'chat') as chats_total
                FROM activity_log a
                WHERE a.profile_id = p.profile_id
            ) stats ON true
            ${filter}
            ORDER BY p.id DESC
        `;

        const result = await pool.query(query, params);

        // Также считаем из messages для совместимости если activity_log пустой
        const msgStatsQuery = `
            SELECT
                p.profile_id,
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND DATE(m.timestamp) = CURRENT_DATE) as letters_today,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE) as chats_today,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters_total,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats_total
            FROM allowed_profiles p
            LEFT JOIN messages m ON p.profile_id = m.account_id
            ${filter}
            GROUP BY p.profile_id
        `;
        const msgResult = await pool.query(msgStatsQuery, params);
        const msgStatsMap = {};
        msgResult.rows.forEach(r => {
            msgStatsMap[r.profile_id] = r;
        });

        // Объединяем результаты
        const list = result.rows.map(row => {
            const msgStats = msgStatsMap[row.profile_id] || {};
            return {
                profile_id: row.profile_id,
                login: row.login,
                password: row.password,
                status: row.status || 'offline',
                last_online: row.last_online,
                letters_today: parseInt(row.letters_today) || parseInt(msgStats.letters_today) || 0,
                letters_total: parseInt(row.letters_total) || parseInt(msgStats.letters_total) || 0,
                chats_today: parseInt(row.chats_today) || parseInt(msgStats.chats_today) || 0,
                admin_id: row.admin_id,
                admin_name: row.admin_name,
                translator_id: row.translator_id,
                trans_name: row.trans_name,
                added_at: row.added_at,
                note: row.note,
                paused: row.paused || false
            };
        });

        res.json({ success: true, list });
    } catch (e) {
        console.error('Profiles error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/profiles/bulk - Массовое добавление анкет
router.post('/api/profiles/bulk', async (req, res) => {
    const { profiles, note, adminId } = req.body;
    try {
        for (const id of profiles) {
            if (id.trim().length > 2) {
                await pool.query(
                    `INSERT INTO allowed_profiles (profile_id, note, assigned_admin_id)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (profile_id) DO UPDATE SET assigned_admin_id = $3`,
                    [id.trim(), note, adminId || null]
                );
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/profiles/assign - Назначить анкеты пользователю
router.post('/api/profiles/assign', async (req, res) => {
    const { profileIds, targetUserId, roleTarget } = req.body;
    try {
        let field = roleTarget === 'admin' ? 'assigned_admin_id' : 'assigned_translator_id';
        const placeholders = profileIds.map((_, i) => `$${i + 2}`).join(',');
        const query = `UPDATE allowed_profiles SET ${field} = $1 WHERE id IN (${placeholders})`;
        await pool.query(query, [targetUserId, ...profileIds]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
