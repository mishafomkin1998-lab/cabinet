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

        // Оптимизированный запрос: используем CTE вместо LEFT JOIN LATERAL
        // Это позволяет сканировать большие таблицы один раз вместо N раз
        const query = `
            WITH admin_profiles AS (
                SELECT
                    assigned_admin_id as user_id,
                    COUNT(*) as accounts_count,
                    ARRAY_AGG(profile_id) as accounts
                FROM allowed_profiles
                WHERE assigned_admin_id IS NOT NULL
                GROUP BY assigned_admin_id
            ),
            translator_profiles AS (
                SELECT
                    assigned_translator_id as user_id,
                    COUNT(*) as accounts_count,
                    ARRAY_AGG(profile_id) as accounts
                FROM allowed_profiles
                WHERE assigned_translator_id IS NOT NULL
                GROUP BY assigned_translator_id
            ),
            admin_stats AS (
                SELECT
                    admin_id as user_id,
                    COUNT(*) FILTER (WHERE action_type = 'letter') as letters_today,
                    COUNT(*) FILTER (WHERE action_type = 'chat') as chats_today,
                    COUNT(DISTINCT man_id) as unique_men_today
                FROM activity_log
                WHERE admin_id IS NOT NULL AND created_at >= CURRENT_DATE
                GROUP BY admin_id
            ),
            translator_stats AS (
                SELECT
                    translator_id as user_id,
                    COUNT(*) FILTER (WHERE action_type = 'letter') as letters_today,
                    COUNT(*) FILTER (WHERE action_type = 'chat') as chats_today,
                    COUNT(DISTINCT man_id) as unique_men_today
                FROM activity_log
                WHERE translator_id IS NOT NULL AND created_at >= CURRENT_DATE
                GROUP BY translator_id
            )
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
                CASE
                    WHEN u.role = 'admin' THEN COALESCE(ap.accounts_count, 0)
                    ELSE COALESCE(tp.accounts_count, 0)
                END as accounts_count,
                CASE
                    WHEN u.role = 'admin' THEN COALESCE(ast.letters_today, 0)
                    ELSE COALESCE(tst.letters_today, 0)
                END as letters_today,
                CASE
                    WHEN u.role = 'admin' THEN COALESCE(ast.chats_today, 0)
                    ELSE COALESCE(tst.chats_today, 0)
                END as chats_today,
                CASE
                    WHEN u.role = 'admin' THEN COALESCE(ast.unique_men_today, 0)
                    ELSE COALESCE(tst.unique_men_today, 0)
                END as unique_men_today,
                CASE
                    WHEN u.role = 'admin' AND COALESCE(ast.letters_today, 0) > 0
                    THEN ROUND((COALESCE(ast.unique_men_today, 0)::numeric / ast.letters_today) * 100, 1)
                    WHEN u.role = 'translator' AND COALESCE(tst.letters_today, 0) > 0
                    THEN ROUND((COALESCE(tst.unique_men_today, 0)::numeric / tst.letters_today) * 100, 1)
                    ELSE 0
                END as conversion,
                CASE WHEN u.owner_id = $${params.length > 0 ? params.length : 1} THEN true ELSE false END as is_my_admin,
                CASE
                    WHEN u.role = 'admin' THEN COALESCE(ap.accounts, ARRAY[]::varchar[])
                    ELSE COALESCE(tp.accounts, ARRAY[]::varchar[])
                END as accounts
            FROM users u
            LEFT JOIN admin_profiles ap ON u.role = 'admin' AND ap.user_id = u.id
            LEFT JOIN translator_profiles tp ON u.role = 'translator' AND tp.user_id = u.id
            LEFT JOIN admin_stats ast ON u.role = 'admin' AND ast.user_id = u.id
            LEFT JOIN translator_stats tst ON u.role = 'translator' AND tst.user_id = u.id
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
router.post('/', async (req, res) => {
    const { username, login, password, role, ownerId, salary, isRestricted, aiEnabled, isOwnTranslator } = req.body;
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
router.delete('/:id', async (req, res) => {
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
router.put('/:id', async (req, res) => {
    console.log(`📝 [PUT /api/users/:id] userId=${req.params.id}, body=`, req.body);
    const userId = req.params.id;
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
router.get('/:id/profiles', async (req, res) => {
    const adminId = req.params.id;
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
router.put('/:id/profiles', async (req, res) => {
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
router.get('/translator/:id/profiles', async (req, res) => {
    const translatorId = req.params.id;
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
router.put('/translator/:id/profiles', async (req, res) => {
    const translatorId = req.params.id;
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
