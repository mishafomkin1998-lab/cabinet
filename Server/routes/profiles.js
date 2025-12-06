/**
 * Profiles Routes
 * Маршруты управления анкетами
 */

const express = require('express');
const pool = require('../config/database');

const router = express.Router();

/**
 * Логирование действий с анкетами
 */
async function logProfileAction(profileId, actionType, performedById, performedByName, details = null, oldValue = null, newValue = null) {
    try {
        await pool.query(
            `INSERT INTO profile_actions (profile_id, action_type, performed_by_id, performed_by_name, details, old_value, new_value)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [profileId, actionType, performedById, performedByName, details, oldValue, newValue]
        );
    } catch (e) {
        console.error('Ошибка логирования действия:', e.message);
    }
}

// Получение анкет
router.get('/', async (req, res) => {
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
                COALESCE(stats.letters_today, 0) as letters_today,
                COALESCE(stats.chats_today, 0) as chats_today,
                COALESCE(stats.letters_total, 0) as letters_total,
                COALESCE(stats.chats_total, 0) as chats_total,
                COALESCE(incoming.incoming_today, 0) as incoming_today,
                COALESCE(incoming.incoming_total, 0) as incoming_total
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
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE DATE(i.created_at) = CURRENT_DATE) as incoming_today,
                    COUNT(*) as incoming_total
                FROM incoming_messages i
                WHERE i.profile_id = p.profile_id
            ) incoming ON true
            ${filter}
            ORDER BY p.id DESC
        `;

        const result = await pool.query(query, params);

        // Также считаем из messages для совместимости
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
                incoming_today: parseInt(row.incoming_today) || 0,
                incoming_total: parseInt(row.incoming_total) || 0,
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

// Массовое добавление анкет
router.post('/bulk', async (req, res) => {
    const { profiles, note, adminId, userId, userName } = req.body;
    try {
        for (const id of profiles) {
            if (id.trim().length > 2) {
                const profileId = id.trim();
                const exists = await pool.query(`SELECT 1 FROM allowed_profiles WHERE profile_id = $1`, [profileId]);
                if (exists.rows.length === 0) {
                    await pool.query(
                        `INSERT INTO allowed_profiles (profile_id, note, assigned_admin_id) VALUES ($1, $2, $3)`,
                        [profileId, note, adminId || null]
                    );
                    // Логируем добавление
                    await logProfileAction(profileId, 'add', userId, userName, note || 'Добавлена новая анкета');
                } else {
                    await pool.query(
                        `UPDATE allowed_profiles SET assigned_admin_id = $1 WHERE profile_id = $2`,
                        [adminId || null, profileId]
                    );
                }
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Назначение анкет
router.post('/assign', async (req, res) => {
    const { profileIds, targetUserId, roleTarget, targetUserName, userId, userName } = req.body;
    try {
        let field = roleTarget === 'admin' ? 'assigned_admin_id' : 'assigned_translator_id';
        const placeholders = profileIds.map((_, i) => `$${i + 2}`).join(',');
        const query = `UPDATE allowed_profiles SET ${field} = $1 WHERE id IN (${placeholders})`;
        await pool.query(query, [targetUserId, ...profileIds]);

        // Логируем назначение для каждой анкеты
        const profilesResult = await pool.query(
            `SELECT profile_id FROM allowed_profiles WHERE id IN (${placeholders})`,
            profileIds
        );
        for (const row of profilesResult.rows) {
            const actionType = roleTarget === 'admin' ? 'assign_admin' : 'assign_translator';
            await logProfileAction(
                row.profile_id,
                actionType,
                userId,
                userName,
                `Назначен ${roleTarget === 'admin' ? 'админ' : 'переводчик'}: ${targetUserName || targetUserId}`
            );
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/profiles/:profileId/status
 * Проверяет статус анкеты (paused)
 */
router.get('/:profileId/status', async (req, res) => {
    const { profileId } = req.params;
    try {
        const result = await pool.query(
            `SELECT paused FROM allowed_profiles WHERE profile_id = $1`,
            [profileId]
        );
        if (result.rows.length === 0) {
            return res.json({ success: true, paused: false, exists: false });
        }
        res.json({ success: true, paused: result.rows[0].paused || false, exists: true });
    } catch (e) {
        console.error('Profile status error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/profiles/toggle-access
 * Переключает статус paused для анкеты (остановить/запустить)
 */
router.post('/toggle-access', async (req, res) => {
    const { profileId, paused } = req.body;
    try {
        await pool.query(
            `UPDATE allowed_profiles SET paused = $1 WHERE profile_id = $2`,
            [paused, profileId]
        );
        res.json({ success: true, paused });
    } catch (e) {
        console.error('Toggle access error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * DELETE /api/profiles/:profileId
 * Удаляет анкету из базы данных
 */
router.delete('/:profileId', async (req, res) => {
    const { profileId } = req.params;
    const { userId, userName } = req.query;
    try {
        // Логируем удаление перед удалением
        await logProfileAction(profileId, 'delete', userId, userName, 'Анкета удалена');

        // Удаляем анкету из allowed_profiles
        await pool.query(`DELETE FROM allowed_profiles WHERE profile_id = $1`, [profileId]);
        // Также удаляем связи с ботами
        await pool.query(`DELETE FROM bot_profiles WHERE profile_id = $1`, [profileId]);
        res.json({ success: true });
    } catch (e) {
        console.error('Delete profile error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/profiles/:profileId/ai-status
 * Проверяет, включен ли AI для анкеты (по флагу ai_enabled у переводчика)
 */
router.get('/:profileId/ai-status', async (req, res) => {
    const { profileId } = req.params;
    try {
        // Получаем анкету и её переводчика
        const result = await pool.query(`
            SELECT
                ap.profile_id,
                ap.assigned_translator_id,
                u.ai_enabled,
                u.username as translator_name
            FROM allowed_profiles ap
            LEFT JOIN users u ON ap.assigned_translator_id = u.id
            WHERE ap.profile_id = $1
        `, [profileId]);

        if (result.rows.length === 0) {
            return res.json({ success: true, aiEnabled: false, reason: 'profile_not_found' });
        }

        const row = result.rows[0];

        // Если нет переводчика - AI недоступен
        if (!row.assigned_translator_id) {
            return res.json({ success: true, aiEnabled: false, reason: 'no_translator' });
        }

        // Возвращаем статус AI переводчика
        res.json({
            success: true,
            aiEnabled: row.ai_enabled === true,
            translatorId: row.assigned_translator_id,
            translatorName: row.translator_name,
            reason: row.ai_enabled ? 'enabled' : 'disabled_by_admin'
        });
    } catch (e) {
        console.error('AI status check error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/profile-history
 * История действий с анкетами
 */
router.get('/history', async (req, res) => {
    const { userId, role, adminId, profileId, dateFrom, dateTo, limit = 100 } = req.query;
    try {
        let filter = 'WHERE 1=1';
        let params = [limit];
        let paramIndex = 2;

        // Фильтр по роли
        if (role === 'admin') {
            filter += ` AND pa.performed_by_id = $${paramIndex++}`;
            params.push(userId);
        } else if (role === 'translator') {
            filter += ` AND pa.performed_by_id = $${paramIndex++}`;
            params.push(userId);
        }

        // Фильтр по админу (для директора)
        if (adminId) {
            filter += ` AND pa.performed_by_id = $${paramIndex++}`;
            params.push(adminId);
        }

        // Фильтр по ID анкеты
        if (profileId) {
            filter += ` AND pa.profile_id ILIKE $${paramIndex++}`;
            params.push(`%${profileId}%`);
        }

        // Фильтр по датам
        if (dateFrom) {
            filter += ` AND DATE(pa.created_at) >= $${paramIndex++}`;
            params.push(dateFrom);
        }
        if (dateTo) {
            filter += ` AND DATE(pa.created_at) <= $${paramIndex++}`;
            params.push(dateTo);
        }

        const query = `
            SELECT
                pa.id,
                pa.profile_id,
                pa.action_type,
                pa.performed_by_id,
                pa.performed_by_name,
                pa.details,
                pa.old_value,
                pa.new_value,
                pa.created_at
            FROM profile_actions pa
            ${filter}
            ORDER BY pa.created_at DESC
            LIMIT $1
        `;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            history: result.rows.map(row => ({
                id: row.id,
                profile_id: row.profile_id,
                action_type: row.action_type,
                performed_by: row.performed_by_name || `User #${row.performed_by_id}`,
                details: row.details,
                old_value: row.old_value,
                new_value: row.new_value,
                created_at: row.created_at
            }))
        });
    } catch (e) {
        console.error('Profile history error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
