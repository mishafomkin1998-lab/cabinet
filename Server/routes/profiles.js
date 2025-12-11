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
        // role === 'director' - без фильтра, показываем все анкеты

        const query = `
            SELECT
                p.id,
                p.profile_id,
                p.login,
                p.password,
                p.note,
                p.paused,
                CASE
                    WHEN p.last_online IS NULL THEN 'offline'
                    WHEN p.last_online > NOW() - INTERVAL '5 minutes' THEN 'online'
                    ELSE 'offline'
                END as status,
                p.last_online,
                p.added_at,
                p.assigned_admin_id as admin_id,
                p.assigned_translator_id as translator_id,
                u_admin.username as admin_name,
                u_admin.is_restricted as admin_is_restricted,
                u_trans.username as trans_name,
                COALESCE(stats.letters_today, 0) as letters_today,
                COALESCE(stats.chats_today, 0) as chats_today,
                COALESCE(stats.letters_total, 0) as letters_total,
                COALESCE(stats.chats_total, 0) as chats_total,
                COALESCE(incoming.incoming_month, 0) as incoming_month,
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
                    COUNT(*) FILTER (WHERE DATE(i.created_at) >= DATE_TRUNC('month', CURRENT_DATE) AND (i.type = 'letter' OR i.type IS NULL)) as incoming_month,
                    COUNT(*) FILTER (WHERE i.type = 'letter' OR i.type IS NULL) as incoming_total
                FROM incoming_messages i
                WHERE i.profile_id = p.profile_id
            ) incoming ON true
            ${filter}
            ORDER BY p.id DESC
        `;

        const result = await pool.query(query, params);

        // DEBUG: Логируем первую строку для проверки
        if (result.rows.length > 0) {
            console.log('📊 DEBUG Profiles API - first row:');
            console.log('   profile_id:', result.rows[0].profile_id);
            console.log('   last_online:', result.rows[0].last_online);
            console.log('   incoming_month:', result.rows[0].incoming_month);
            console.log('   incoming_total:', result.rows[0].incoming_total);
            console.log('   status:', result.rows[0].status);
        }

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
                incoming_month: parseInt(row.incoming_month) || 0,
                incoming_total: parseInt(row.incoming_total) || 0,
                admin_id: row.admin_id,
                admin_name: row.admin_name,
                admin_is_restricted: row.admin_is_restricted || false,
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
    const { profiles, note, adminId, translatorId, userId, userName } = req.body;
    try {
        for (const id of profiles) {
            if (id.trim().length > 2) {
                const profileId = id.trim();
                const exists = await pool.query(`SELECT 1 FROM allowed_profiles WHERE profile_id = $1`, [profileId]);
                if (exists.rows.length === 0) {
                    // Проверяем есть ли сохранённая оплата для этой анкеты
                    const backupResult = await pool.query(
                        `SELECT paid_until_backup FROM profile_payment_history
                         WHERE profile_id = $1 AND action_type = 'deletion_backup' AND paid_until_backup > NOW()
                         ORDER BY created_at DESC LIMIT 1`,
                        [profileId]
                    );

                    let paidUntil = null;
                    if (backupResult.rows.length > 0) {
                        paidUntil = backupResult.rows[0].paid_until_backup;
                    }

                    await pool.query(
                        `INSERT INTO allowed_profiles (profile_id, note, assigned_admin_id, assigned_translator_id, paid_until) VALUES ($1, $2, $3, $4, $5)`,
                        [profileId, note, adminId || null, translatorId || null, paidUntil]
                    );
                    // Логируем добавление
                    const logNote = paidUntil
                        ? `Добавлена анкета (оплата восстановлена до ${new Date(paidUntil).toLocaleDateString('ru-RU')})`
                        : (note || 'Добавлена новая анкета');
                    await logProfileAction(profileId, 'add', userId, userName, logNote);
                } else {
                    // Обновляем существующую анкету
                    if (translatorId) {
                        await pool.query(
                            `UPDATE allowed_profiles SET assigned_admin_id = $1, assigned_translator_id = $2 WHERE profile_id = $3`,
                            [adminId || null, translatorId, profileId]
                        );
                    } else if (adminId) {
                        await pool.query(
                            `UPDATE allowed_profiles SET assigned_admin_id = $1 WHERE profile_id = $2`,
                            [adminId, profileId]
                        );
                    }
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

// Массовое назначение анкет админу (по profile_id)
router.post('/assign-admin', async (req, res) => {
    const { profileIds, adminId, adminName, userId, userName } = req.body;
    try {
        const placeholders = profileIds.map((_, i) => `$${i + 2}`).join(',');
        const query = `UPDATE allowed_profiles SET assigned_admin_id = $1 WHERE profile_id IN (${placeholders})`;
        await pool.query(query, [adminId, ...profileIds]);

        // Логируем назначение для каждой анкеты
        for (const profileId of profileIds) {
            await logProfileAction(
                profileId,
                adminId ? 'assign_admin' : 'unassign_admin',
                userId,
                userName || `User #${userId}`,
                adminId ? `Назначен админ: ${adminName || adminId}` : 'Снято назначение админа'
            );
        }

        res.json({ success: true });
    } catch (e) {
        console.error('assign-admin error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Массовое назначение анкет переводчику (по profile_id)
router.post('/assign-translator', async (req, res) => {
    const { profileIds, translatorId, translatorName, userId, userName } = req.body;
    try {
        const placeholders = profileIds.map((_, i) => `$${i + 2}`).join(',');
        const query = `UPDATE allowed_profiles SET assigned_translator_id = $1 WHERE profile_id IN (${placeholders})`;
        await pool.query(query, [translatorId, ...profileIds]);

        // Логируем назначение для каждой анкеты
        for (const profileId of profileIds) {
            await logProfileAction(
                profileId,
                translatorId ? 'assign_translator' : 'unassign_translator',
                userId,
                userName || `User #${userId}`,
                translatorId ? `Назначен переводчик: ${translatorName || translatorId}` : 'Снято назначение переводчика'
            );
        }

        res.json({ success: true });
    } catch (e) {
        console.error('assign-translator error:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/profiles/:profileId/status
 * Проверяет статус анкеты (paused)
 */
router.get('/:profileId/status', async (req, res) => {
    const { profileId } = req.params;
    try {
        const result = await pool.query(
            `SELECT paused, assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1`,
            [profileId]
        );
        if (result.rows.length === 0) {
            // Анкета не в системе - запрещаем работу
            return res.json({ success: true, paused: false, exists: false, allowed: false, reason: 'not_in_system' });
        }
        const row = result.rows[0];
        res.json({
            success: true,
            paused: row.paused || false,
            exists: true,
            allowed: true,
            hasAdmin: !!row.assigned_admin_id,
            hasTranslator: !!row.assigned_translator_id
        });
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
 * POST /api/profiles/bulk-delete
 * Массовое удаление анкет
 */
router.post('/bulk-delete', async (req, res) => {
    const { profileIds, userId, userName } = req.body;
    try {
        let deleted = 0;
        for (const profileId of profileIds) {
            // Сохраняем paid_until перед удалением
            const profile = await pool.query(
                `SELECT paid_until FROM allowed_profiles WHERE profile_id = $1`,
                [profileId]
            );

            if (profile.rows.length > 0 && profile.rows[0].paid_until) {
                await pool.query(
                    `INSERT INTO profile_payment_history (profile_id, days, action_type, by_user_id, note, paid_until_backup)
                     VALUES ($1, 0, 'deletion_backup', $2, 'Бэкап при массовом удалении', $3)
                     ON CONFLICT DO NOTHING`,
                    [profileId, userId, profile.rows[0].paid_until]
                );
            }

            // Логируем удаление
            await logProfileAction(profileId, 'delete', userId, userName, 'Массовое удаление');

            // Удаляем анкету
            await pool.query(`DELETE FROM allowed_profiles WHERE profile_id = $1`, [profileId]);
            await pool.query(`DELETE FROM bot_profiles WHERE profile_id = $1`, [profileId]);
            deleted++;
        }
        res.json({ success: true, deleted });
    } catch (e) {
        console.error('Bulk delete profiles error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * DELETE /api/profiles/:profileId
 * Удаляет анкету из базы данных (сохраняя paid_until в истории для восстановления)
 */
router.delete('/:profileId', async (req, res) => {
    const { profileId } = req.params;
    const { userId, userName } = req.query;
    try {
        // Сохраняем paid_until перед удалением для возможности восстановления
        const profile = await pool.query(
            `SELECT paid_until, is_trial, trial_started_at FROM allowed_profiles WHERE profile_id = $1`,
            [profileId]
        );

        if (profile.rows.length > 0 && profile.rows[0].paid_until) {
            // Сохраняем в историю оплаты для восстановления при повторном добавлении
            await pool.query(
                `INSERT INTO profile_payment_history (profile_id, days, action_type, by_user_id, note, paid_until_backup)
                 VALUES ($1, 0, 'deletion_backup', $2, 'Бэкап при удалении', $3)
                 ON CONFLICT DO NOTHING`,
                [profileId, userId, profile.rows[0].paid_until]
            );
        }

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
 * Проверяет, включен ли AI для анкеты
 * AI доступен только если включен И у переводчика И у его админа
 */
router.get('/:profileId/ai-status', async (req, res) => {
    const { profileId } = req.params;
    try {
        // Получаем анкету, переводчика и его админа
        const result = await pool.query(`
            SELECT
                ap.profile_id,
                ap.assigned_translator_id,
                ap.assigned_admin_id,
                t.ai_enabled as translator_ai_enabled,
                t.username as translator_name,
                t.owner_id as translator_owner_id,
                a.ai_enabled as admin_ai_enabled,
                a.username as admin_name
            FROM allowed_profiles ap
            LEFT JOIN users t ON ap.assigned_translator_id = t.id
            LEFT JOIN users a ON t.owner_id = a.id
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

        // Проверяем AI у админа (если есть)
        if (row.translator_owner_id && row.admin_ai_enabled !== true) {
            return res.json({
                success: true,
                aiEnabled: false,
                reason: 'disabled_by_admin',
                translatorId: row.assigned_translator_id,
                translatorName: row.translator_name,
                adminName: row.admin_name
            });
        }

        // Проверяем AI у переводчика
        if (row.translator_ai_enabled !== true) {
            return res.json({
                success: true,
                aiEnabled: false,
                reason: 'disabled_for_translator',
                translatorId: row.assigned_translator_id,
                translatorName: row.translator_name
            });
        }

        // AI включен и у админа и у переводчика
        res.json({
            success: true,
            aiEnabled: true,
            translatorId: row.assigned_translator_id,
            translatorName: row.translator_name,
            reason: 'enabled'
        });
    } catch (e) {
        console.error('AI status check error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/profile-history
 * История действий с анкетами
 * Для админов/переводчиков показывает только историю назначенных им анкет
 */
router.get('/history', async (req, res) => {
    const { userId, role, adminId, profileId, dateFrom, dateTo, limit = 100 } = req.query;
    try {
        let filter = 'WHERE 1=1';
        let params = [limit];
        let paramIndex = 2;
        let joinClause = '';

        // Фильтр по роли - показывать только историю назначенных анкет
        if (role === 'admin') {
            // Для админа показываем только анкеты, назначенные ему
            joinClause = `INNER JOIN allowed_profiles ap ON pa.profile_id = ap.profile_id`;
            filter += ` AND ap.assigned_admin_id = $${paramIndex++}`;
            params.push(userId);
        } else if (role === 'translator') {
            // Для переводчика показываем только анкеты, назначенные ему
            joinClause = `INNER JOIN allowed_profiles ap ON pa.profile_id = ap.profile_id`;
            filter += ` AND ap.assigned_translator_id = $${paramIndex++}`;
            params.push(userId);
        }

        // Фильтр по админу (для директора)
        if (adminId && role === 'director') {
            joinClause = joinClause || `LEFT JOIN allowed_profiles ap ON pa.profile_id = ap.profile_id`;
            filter += ` AND ap.assigned_admin_id = $${paramIndex++}`;
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
            SELECT DISTINCT
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
            ${joinClause}
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
