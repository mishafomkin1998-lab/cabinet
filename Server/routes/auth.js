/**
 * Authentication Routes
 * Маршруты аутентификации
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ==========================================
// СЛУЖЕБНЫЕ ЭНДПОИНТЫ УДАЛЕНЫ (безопасность)
// ==========================================
// Для создания директора используйте скрипт:
//   node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('ПАРОЛЬ',10).then(h=>console.log('INSERT INTO users (username, password_hash, role) VALUES (\'ИМЯ\', \''+h+'\', \'director\');'))"
// Затем выполните SQL в psql
//
// Для сброса пароля:
//   UPDATE users SET password_hash = '$2a$10$...' WHERE username = 'ИМЯ';

// Вход
router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        console.log('❌ [LOGIN] Пустые данные');
        return res.json({ success: false, error: 'Введите логин и пароль' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            console.log(`❌ [LOGIN] Пользователь "${username}" не найден в базе.`);
            return res.json({ success: false, error: 'Пользователь не найден' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            // Генерируем JWT токен
            const token = generateToken(user);

            console.log(`✅ [LOGIN] Успешный вход: ${username} (${user.role})`);
            res.json({
                success: true,
                token: token,  // JWT токен для авторизации
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    avatar_url: user.avatar_url || null,
                    salary: user.salary,
                    isRestricted: user.is_restricted || false,
                    aiEnabled: user.ai_enabled || false
                }
            });
        } else {
            console.log(`❌ [LOGIN] Неверный пароль для "${username}"`);
            res.json({ success: false, error: 'Неверный пароль' });
        }
    } catch (e) {
        console.error('💥 [LOGIN] Ошибка сервера/БД:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Обновление профиля пользователя (требует авторизации)
router.put('/api/user/profile', requireAuth, async (req, res) => {
    const { userId, username, password, avatarUrl } = req.body;

    // Пользователь может обновить только свой профиль (или директор - любой)
    if (req.user.role !== 'director' && req.user.id !== userId) {
        return res.status(403).json({ success: false, error: 'Нет прав на изменение этого профиля' });
    }

    if (!userId) {
        return res.json({ success: false, error: 'userId обязателен' });
    }

    try {
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (username) {
            // Проверяем, не занят ли username
            const exists = await pool.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, userId]
            );
            if (exists.rows.length > 0) {
                return res.json({ success: false, error: 'Это имя уже занято' });
            }
            updates.push(`username = $${paramIndex++}`);
            values.push(username);
        }

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            updates.push(`password_hash = $${paramIndex++}`);
            values.push(hash);
        }

        if (avatarUrl !== undefined) {
            updates.push(`avatar_url = $${paramIndex++}`);
            values.push(avatarUrl || null);
        }

        if (updates.length === 0) {
            return res.json({ success: true, message: 'Нет изменений' });
        }

        values.push(userId);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        await pool.query(query, values);

        console.log(`✅ [PROFILE] Профиль пользователя ${userId} обновлён`);
        res.json({ success: true });
    } catch (e) {
        console.error('💥 [PROFILE] Ошибка обновления профиля:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
