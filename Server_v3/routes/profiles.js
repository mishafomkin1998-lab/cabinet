/**
 * Profiles Routes
 * Маршруты управления анкетами
 */

const express = require('express');
const pool = require('../config/database');

const router = express.Router();

/**
 * Логирование действий с анкетами
 * @param {string} profileId - ID анкеты
 * @param {string} actionType - Тип действия
 * @param {number} performedById - ID пользователя, выполнившего действие
 * @param {string} performedByName - Имя пользователя
 * @param {string} details - Детали действия
 * @param {string} oldValue - Старое значение
 * @param {string} newValue - Новое значение
 * @param {number} adminId - ID админа анкеты (для фильтрации истории)
 * @param {number} translatorId - ID переводчика анкеты (для фильтрации истории)
 */
async function logProfileAction(profileId, actionType, performedById, performedByName, details = null, oldValue = null, newValue = null, adminId = null, translatorId = null) {
    try {
        await pool.query(
            `INSERT INTO profile_actions (profile_id, action_type, performed_by_id, performed_by_name, details, old_value, new_value, admin_id, translator_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [profileId, actionType, performedById, performedByName, details, oldValue, newValue, adminId, translatorId]
        );
    } catch (e) {
        console.error('Ошибка логирования действия:', e.message);
    }
}

// Получение анкет (ОПТИМИЗИРОВАНО: CTE вместо LATERAL JOIN)
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

        // ОПТИМИЗАЦИЯ: Один запрос с CTE вместо LATERAL + дублирующего запроса
        // Было: O(N) подзапросов для N анкет
        // Стало: O(1) - три прохода по таблицам с GROUP BY
        const query = `
            WITH activity_stats AS (
                SELECT
                    profile_id,
                    COUNT(*) FILTER (WHERE action_type = 'letter' AND DATE(created_at) = CURRENT_DATE) as letters_today,
                    COUNT(*) FILTER (WHERE action_type = 'chat' AND DATE(created_at) = CURRENT_DATE) as chats_today,
                    COUNT(*) FILTER (WHERE action_type = 'letter') as letters_total,
                    COUNT(*) FILTER (WHERE action_type = 'chat') as chats_total
                FROM activity_log
                GROUP BY profile_id
            ),
            incoming_stats AS (
                SELECT
                    profile_id,
                    COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) AND (type = 'letter' OR type IS NULL)) as incoming_month,
                    COUNT(*) FILTER (WHERE type = 'letter' OR type IS NULL) as incoming_total
                FROM incoming_messages
                GROUP BY profile_id
            ),
            message_stats AS (
                SELECT
                    account_id as profile_id,
                    COUNT(*) FILTER (WHERE type = 'outgoing' AND DATE(timestamp) = CURRENT_DATE) as msg_letters_today,
                    COUNT(*) FILTER (WHERE type = 'chat_msg' AND DATE(timestamp) = CURRENT_DATE) as msg_chats_today,
                    COUNT(*) FILTER (WHERE type = 'outgoing') as msg_letters_total,
                    COUNT(*) FILTER (WHERE type = 'chat_msg') as msg_chats_total
                FROM messages
                GROUP BY account_id
            )
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
                u_trans.is_own_translator as translator_is_own,
                COALESCE(a.letters_today, m.msg_letters_today, 0) as letters_today,
                COALESCE(a.chats_today, m.msg_chats_today, 0) as chats_today,
                COALESCE(a.letters_total, m.msg_letters_total, 0) as letters_total,
                COALESCE(a.chats_total, m.msg_chats_total, 0) as chats_total,
                COALESCE(i.incoming_month, 0) as incoming_month,
                COALESCE(i.incoming_total, 0) as incoming_total
            FROM allowed_profiles p
            LEFT JOIN users u_admin ON p.assigned_admin_id = u_admin.id
            LEFT JOIN users u_trans ON p.assigned_translator_id = u_trans.id
            LEFT JOIN activity_stats a ON p.profile_id = a.profile_id
            LEFT JOIN incoming_stats i ON p.profile_id = i.profile_id
            LEFT JOIN message_stats m ON p.profile_id = m.profile_id
            ${filter}
            ORDER BY p.id DESC
        `;

        const result = await pool.query(query, params);

        const list = result.rows.map(row => ({
            profile_id: row.profile_id,
            login: row.login,
            password: row.password,
            status: row.status || 'offline',
            last_online: row.last_online,
            letters_today: parseInt(row.letters_today) || 0,
            letters_total: parseInt(row.letters_total) || 0,
            chats_today: parseInt(row.chats_today) || 0,
            incoming_month: parseInt(row.incoming_month) || 0,
            incoming_total: parseInt(row.incoming_total) || 0,
            admin_id: row.admin_id,
            admin_name: row.admin_name,
            admin_is_restricted: row.admin_is_restricted || false,
            translator_id: row.translator_id,
            trans_name: row.trans_name,
            translator_is_own: row.translator_is_own !== false,
            added_at: row.added_at,
            note: row.note,
            paused: row.paused || false
        }));

        res.json({ success: true, list });
    } catch (e) {
        console.error('Profiles error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Массовое добавление анкет
router.post('/bulk', async (req, res) => {
    let { profiles, note, adminId, translatorId, userId, userName } = req.body;
    try {
        // Если назначен переводчик, но не админ - получаем owner_id переводчика (его админа)
        if (translatorId && !adminId) {
            const translatorResult = await pool.query(
                `SELECT owner_id FROM users WHERE id = $1 AND role = 'translator'`,
                [translatorId]
            );
            if (translatorResult.rows.length > 0 && translatorResult.rows[0].owner_id) {
                adminId = translatorResult.rows[0].owner_id;
            }
        }

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
                    await logProfileAction(profileId, 'add', userId, userName, logNote, null, null, adminId || null, translatorId || null);
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

// Массовое назначение анкет админу (по profile_id)
router.post('/assign-admin', async (req, res) => {
    const { profileIds, adminId, adminName, userId, userName } = req.body;
    try {
        // Получаем translator_id для каждой анкеты перед обновлением
        const profilesInfo = await pool.query(
            `SELECT profile_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = ANY($1)`,
            [profileIds]
        );
        const translatorMap = {};
        profilesInfo.rows.forEach(r => { translatorMap[r.profile_id] = r.assigned_translator_id; });

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
                adminId ? `Назначен админ: ${adminName || adminId}` : 'Снято назначение админа',
                null, null,
                adminId || null,
                translatorMap[profileId] || null
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
        // Получаем admin_id для каждой анкеты перед обновлением
        const profilesInfo = await pool.query(
            `SELECT profile_id, assigned_admin_id FROM allowed_profiles WHERE profile_id = ANY($1)`,
            [profileIds]
        );
        const adminMap = {};
        profilesInfo.rows.forEach(r => { adminMap[r.profile_id] = r.assigned_admin_id; });

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
                translatorId ? `Назначен переводчик: ${translatorName || translatorId}` : 'Снято назначение переводчика',
                null, null,
                adminMap[profileId] || null,
                translatorId || null
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
            // Сохраняем paid_until и назначения перед удалением
            const profile = await pool.query(
                `SELECT paid_until, assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1`,
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
            const adminId = profile.rows[0]?.assigned_admin_id || null;
            const translatorId = profile.rows[0]?.assigned_translator_id || null;
            await logProfileAction(profileId, 'delete', userId, userName, 'Массовое удаление', null, null, adminId, translatorId);

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
        // Сохраняем paid_until и назначения перед удалением для возможности восстановления
        const profile = await pool.query(
            `SELECT paid_until, is_trial, trial_started_at, assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1`,
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
        const adminId = profile.rows[0]?.assigned_admin_id || null;
        const translatorId = profile.rows[0]?.assigned_translator_id || null;
        await logProfileAction(profileId, 'delete', userId, userName, 'Анкета удалена', null, null, adminId, translatorId);

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
 * Исключение: "мой переводчик" - AI всегда включен
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
                t.is_own_translator as translator_is_own,
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

        // "Мой переводчик" - проверяем только галочку AI на переводчике (без проверки владельца-директора)
        if (row.translator_is_own) {
            if (row.translator_ai_enabled !== true) {
                return res.json({
                    success: true,
                    aiEnabled: false,
                    reason: 'disabled_for_translator',
                    translatorId: row.assigned_translator_id,
                    translatorName: row.translator_name
                });
            }
            return res.json({
                success: true,
                aiEnabled: true,
                translatorId: row.assigned_translator_id,
                translatorName: row.translator_name,
                reason: 'my_translator'
            });
        }

        // Обычный переводчик - проверяем AI у админа (если есть)
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
 * Для админов/переводчиков показывает только историю анкет, которые были им назначены
 * (фильтрация по admin_id/translator_id в самой записи profile_actions)
 */
router.get('/history', async (req, res) => {
    const { userId, role, adminId, profileId, dateFrom, dateTo, limit = 100 } = req.query;
    try {
        let filter = 'WHERE 1=1';
        let params = [limit];
        let paramIndex = 2;

        // Фильтр по роли - используем admin_id/translator_id из записи profile_actions
        // Это позволяет видеть историю даже после снятия назначения
        if (role === 'admin') {
            // Для админа показываем записи где admin_id совпадает
            filter += ` AND pa.admin_id = $${paramIndex++}`;
            params.push(userId);
        } else if (role === 'translator') {
            // Для переводчика показываем записи где translator_id совпадает
            filter += ` AND pa.translator_id = $${paramIndex++}`;
            params.push(userId);
        }

        // Фильтр по админу (для директора)
        if (adminId && role === 'director') {
            filter += ` AND pa.admin_id = $${paramIndex++}`;
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

/**
 * DELETE /api/profile-history/clear
 * Очистка всей истории действий с анкетами
 */
router.delete('/history/clear', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM profile_actions');
        console.log(`🗑️ История очищена: удалено ${result.rowCount} записей`);

        res.json({
            success: true,
            message: `Удалено ${result.rowCount} записей истории`,
            deletedCount: result.rowCount
        });
    } catch (e) {
        console.error('Clear history error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
