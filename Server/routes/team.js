/**
 * Team Routes
 * Маршруты управления командой
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Получение команды
// Только директор и админы могут видеть команду
router.get('/', async (req, res) => {
    // Используем роль из JWT токена, с фоллбэком на query параметры для совместимости
    const role = req.user?.role || req.query.role;
    const userId = req.user?.id || req.query.userId;

    // Проверка прав доступа
    if (!role || !['director', 'admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

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
                u.balance,
                u.is_restricted,
                u.ai_enabled,
                u.is_own_translator,
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
                balance: parseFloat(row.balance) || 0,
                is_restricted: row.is_restricted || false,
                ai_enabled: row.ai_enabled || false,
                is_own_translator: row.is_own_translator !== false, // По умолчанию true
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
// Только директор и админы могут создавать пользователей
router.post('/', async (req, res) => {
    // Проверка прав - только директор и админ могут создавать пользователей
    const userRole = req.user?.role || req.body.role;
    if (!userRole || !['director', 'admin'].includes(userRole)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав для создания пользователей' });
    }

    const { username, login, password, role, ownerId, salary, isRestricted, aiEnabled, isOwnTranslator } = req.body;

    // Директор может создавать админов и переводчиков
    // Админ может создавать только переводчиков
    if (userRole === 'admin' && role !== 'translator') {
        return res.status(403).json({ success: false, error: 'Админ может создавать только переводчиков' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        // Если login не передан, используем username
        const userLogin = login || username;
        const result = await pool.query(
            `INSERT INTO users (username, login, password_hash, role, owner_id, salary, is_restricted, ai_enabled, is_own_translator)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [username, userLogin, hash, role, ownerId, isRestricted ? null : salary, isRestricted || false, aiEnabled || false, isOwnTranslator !== false]
        );
        res.json({ success: true, userId: result.rows[0].id });
    } catch (e) {
        console.error('Create user error:', e.message);
        res.json({ success: false, error: 'Логин занят' });
    }
});

// Удаление пользователя
// Только директор может удалять пользователей
router.delete('/:id', async (req, res) => {
    // Проверка прав - только директор может удалять пользователей
    const userRole = req.user?.role || req.query.role;
    if (userRole !== 'director') {
        return res.status(403).json({ success: false, error: 'Только директор может удалять пользователей' });
    }

    const userId = req.params.id;
    try {
        // Обнуляем связи с анкетами
        await pool.query(`UPDATE allowed_profiles SET assigned_translator_id = NULL WHERE assigned_translator_id = $1`, [userId]);
        await pool.query(`UPDATE allowed_profiles SET assigned_admin_id = NULL WHERE assigned_admin_id = $1`, [userId]);
        // Обнуляем связи с историей биллинга
        await pool.query(`UPDATE billing_history SET admin_id = NULL WHERE admin_id = $1`, [userId]);
        // Удаляем пользователя
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Редактирование пользователя
// Директор может редактировать всех, админ - только своих переводчиков
router.put('/:id', async (req, res) => {
    const userRole = req.user?.role || req.body.role;
    const currentUserId = req.user?.id || req.body.userId;

    // Проверка базовых прав
    if (!userRole || !['director', 'admin'].includes(userRole)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    const userId = req.params.id;

    // Админ может редактировать только своих переводчиков
    if (userRole === 'admin') {
        const targetUser = await pool.query('SELECT owner_id, role FROM users WHERE id = $1', [userId]);
        if (targetUser.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }
        // Проверяем что это переводчик, принадлежащий этому админу
        if (targetUser.rows[0].role !== 'translator' || targetUser.rows[0].owner_id !== currentUserId) {
            return res.status(403).json({ success: false, error: 'Вы можете редактировать только своих переводчиков' });
        }
    }

    const { username, password, salary, aiEnabled, is_restricted, isOwnTranslator } = req.body;
    try {
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (username) {
            updates.push(`username = $${paramIndex++}`);
            params.push(username);
        }

        if (password) {
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(password, 10);
            updates.push(`password_hash = $${paramIndex++}`);
            params.push(hash);
        }

        if (salary !== undefined) {
            updates.push(`salary = $${paramIndex++}`);
            params.push(salary);
        }

        if (aiEnabled !== undefined) {
            updates.push(`ai_enabled = $${paramIndex++}`);
            params.push(aiEnabled);
        }

        if (is_restricted !== undefined) {
            updates.push(`is_restricted = $${paramIndex++}`);
            params.push(is_restricted);
        }

        if (isOwnTranslator !== undefined) {
            updates.push(`is_own_translator = $${paramIndex++}`);
            params.push(isOwnTranslator);
        }

        if (updates.length === 0) {
            return res.json({ success: true, message: 'Нечего обновлять' });
        }

        params.push(userId);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        await pool.query(query, params);

        res.json({ success: true });
    } catch (e) {
        console.error('Update user error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Получение списка ID анкет, назначенных админу
// Директор видит всех, админ - только себя
router.get('/:id/profiles', async (req, res) => {
    const userRole = req.user?.role || req.query.role;
    const currentUserId = req.user?.id || parseInt(req.query.userId);
    const adminId = req.params.id;

    // Проверка прав
    if (!userRole || !['director', 'admin'].includes(userRole)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    // Админ может смотреть только свои анкеты
    if (userRole === 'admin' && parseInt(adminId) !== currentUserId) {
        return res.status(403).json({ success: false, error: 'Вы можете видеть только свои анкеты' });
    }

    try {
        const result = await pool.query(
            `SELECT profile_id FROM allowed_profiles WHERE assigned_admin_id = $1 ORDER BY profile_id`,
            [adminId]
        );
        const profileIds = result.rows.map(row => row.profile_id);
        res.json({ success: true, profileIds });
    } catch (e) {
        console.error('Get admin profiles error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Обновление списка анкет админа (полная замена)
// Только директор может менять анкеты админов
router.put('/:id/profiles', async (req, res) => {
    const userRole = req.user?.role || req.body.role;

    // Только директор может назначать анкеты админам
    if (userRole !== 'director') {
        return res.status(403).json({ success: false, error: 'Только директор может назначать анкеты админам' });
    }

    const adminId = req.params.id;
    const { profileIds } = req.body;

    try {
        // Начинаем транзакцию
        await pool.query('BEGIN');

        // Убираем все текущие назначения этого админа
        await pool.query(
            `UPDATE allowed_profiles SET assigned_admin_id = NULL WHERE assigned_admin_id = $1`,
            [adminId]
        );

        // Назначаем новые анкеты (если есть)
        if (profileIds && profileIds.length > 0) {
            for (const profileId of profileIds) {
                // Проверяем, существует ли анкета
                const exists = await pool.query(
                    `SELECT profile_id FROM allowed_profiles WHERE profile_id = $1`,
                    [profileId]
                );

                if (exists.rows.length > 0) {
                    // Обновляем существующую
                    await pool.query(
                        `UPDATE allowed_profiles SET assigned_admin_id = $1 WHERE profile_id = $2`,
                        [adminId, profileId]
                    );
                } else {
                    // Создаем новую запись
                    await pool.query(
                        `INSERT INTO allowed_profiles (profile_id, assigned_admin_id, note)
                         VALUES ($1, $2, 'Добавлено при назначении админу')`,
                        [profileId, adminId]
                    );
                }
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true, count: profileIds ? profileIds.length : 0 });
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Update admin profiles error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Получение списка анкет переводчика
// Директор видит всех, админ - только своих переводчиков
router.get('/translator/:id/profiles', async (req, res) => {
    const userRole = req.user?.role || req.query.role;
    const currentUserId = req.user?.id || parseInt(req.query.userId);
    const translatorId = req.params.id;

    // Проверка прав
    if (!userRole || !['director', 'admin'].includes(userRole)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    // Админ может видеть только своих переводчиков
    if (userRole === 'admin') {
        const translator = await pool.query('SELECT owner_id FROM users WHERE id = $1', [translatorId]);
        if (translator.rows.length === 0 || translator.rows[0].owner_id !== currentUserId) {
            return res.status(403).json({ success: false, error: 'Вы можете видеть только своих переводчиков' });
        }
    }

    try {
        const result = await pool.query(
            `SELECT profile_id FROM allowed_profiles WHERE assigned_translator_id = $1`,
            [translatorId]
        );
        res.json({
            success: true,
            profileIds: result.rows.map(r => r.profile_id)
        });
    } catch (e) {
        console.error('Get translator profiles error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Обновление списка анкет переводчика
// Директор может всех, админ - только своих переводчиков
router.put('/translator/:id/profiles', async (req, res) => {
    const userRole = req.user?.role || req.body.role;
    const currentUserId = req.user?.id || parseInt(req.body.userId);
    const translatorId = req.params.id;

    // Проверка прав
    if (!userRole || !['director', 'admin'].includes(userRole)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    // Админ может назначать анкеты только своим переводчикам
    if (userRole === 'admin') {
        const translator = await pool.query('SELECT owner_id FROM users WHERE id = $1', [translatorId]);
        if (translator.rows.length === 0 || translator.rows[0].owner_id !== currentUserId) {
            return res.status(403).json({ success: false, error: 'Вы можете назначать анкеты только своим переводчикам' });
        }
    }

    const { profileIds, translatorName, userId, userName } = req.body;

    try {
        await pool.query('BEGIN');

        // Получаем текущие анкеты переводчика для логирования
        const currentProfiles = await pool.query(
            `SELECT profile_id FROM allowed_profiles WHERE assigned_translator_id = $1`,
            [translatorId]
        );
        const currentProfileIds = currentProfiles.rows.map(r => r.profile_id);

        // Убираем все текущие назначения этого переводчика
        await pool.query(
            `UPDATE allowed_profiles SET assigned_translator_id = NULL WHERE assigned_translator_id = $1`,
            [translatorId]
        );

        // Логируем снятие назначения для анкет, которые были убраны
        const removedProfiles = currentProfileIds.filter(id => !profileIds?.includes(id));
        for (const profileId of removedProfiles) {
            await pool.query(
                `INSERT INTO profile_actions (profile_id, action_type, performed_by_id, performed_by_name, details)
                 VALUES ($1, $2, $3, $4, $5)`,
                [profileId, 'unassign_translator', userId, userName || `User #${userId}`, `Снято назначение переводчика: ${translatorName || translatorId}`]
            );
        }

        // Назначаем новые анкеты (если есть)
        if (profileIds && profileIds.length > 0) {
            for (const profileId of profileIds) {
                // Проверяем, существует ли анкета
                const exists = await pool.query(
                    `SELECT profile_id FROM allowed_profiles WHERE profile_id = $1`,
                    [profileId]
                );

                if (exists.rows.length > 0) {
                    // Обновляем существующую
                    await pool.query(
                        `UPDATE allowed_profiles SET assigned_translator_id = $1 WHERE profile_id = $2`,
                        [translatorId, profileId]
                    );
                } else {
                    // Создаем новую запись
                    await pool.query(
                        `INSERT INTO allowed_profiles (profile_id, assigned_translator_id, note)
                         VALUES ($1, $2, 'Добавлено при назначении переводчику')`,
                        [profileId, translatorId]
                    );
                }

                // Логируем назначение, если анкета не была ранее назначена этому переводчику
                if (!currentProfileIds.includes(profileId)) {
                    await pool.query(
                        `INSERT INTO profile_actions (profile_id, action_type, performed_by_id, performed_by_name, details)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [profileId, 'assign_translator', userId, userName || `User #${userId}`, `Назначен переводчик: ${translatorName || translatorId}`]
                    );
                }
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true, count: profileIds ? profileIds.length : 0 });
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Update translator profiles error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
