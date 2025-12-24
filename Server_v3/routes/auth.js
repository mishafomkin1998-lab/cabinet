/**
 * Authentication Routes
 * Маршруты аутентификации
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

// ============================================
// СЕКРЕТНЫЙ ТОКЕН для админских операций
// В production использовать process.env.ADMIN_SECRET
// ============================================
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'novabot-secret-2024';

// ============================================
// Rate Limiting для защиты от брутфорса
// ============================================
const loginAttempts = new Map(); // IP -> { count, lastAttempt }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 минут

function checkRateLimit(ip) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip);

    if (!attempts) {
        return { allowed: true };
    }

    // Сбрасываем если прошло достаточно времени
    if (now - attempts.lastAttempt > LOCKOUT_TIME) {
        loginAttempts.delete(ip);
        return { allowed: true };
    }

    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
        const waitTime = Math.ceil((LOCKOUT_TIME - (now - attempts.lastAttempt)) / 1000 / 60);
        return { allowed: false, waitMinutes: waitTime };
    }

    return { allowed: true };
}

function recordLoginAttempt(ip, success) {
    if (success) {
        loginAttempts.delete(ip);
        return;
    }

    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
}

// ============================================
// Создание директора (ЗАЩИЩЕНО ТОКЕНОМ)
// ============================================
router.get('/setup-director', async (req, res) => {
    const { user, pass, secret } = req.query;

    // Проверка секретного токена
    if (secret !== ADMIN_SECRET) {
        console.log(`⚠️ [SECURITY] Попытка доступа к /setup-director без токена с IP: ${req.ip}`);
        return res.status(403).send('Доступ запрещён');
    }

    if (!user || !pass) {
        return res.send('Ошибка: укажите ?user=Имя&pass=Пароль&secret=ТОКЕН в ссылке');
    }

    try {
        const hash = await bcrypt.hash(pass, 10);
        const exists = await pool.query(`SELECT 1 FROM users WHERE username = $1`, [user]);
        if (exists.rows.length === 0) {
            await pool.query(
                `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'director')`, [user, hash]
            );
        } else {
            await pool.query(`UPDATE users SET password_hash = $1 WHERE username = $2`, [hash, user]);
        }
        console.log(`✅ [ADMIN] Директор ${user} создан/обновлён`);
        res.send(`<h1>Готово!</h1><p>Директор <b>${user}</b> создан/обновлен.</p>`);
    } catch (e) {
        res.send('Ошибка создания: ' + e.message);
    }
});

// ============================================
// Сброс пароля (ЗАЩИЩЕНО ТОКЕНОМ)
// ============================================
router.get('/fix-password', async (req, res) => {
    const { user, secret, newpass } = req.query;

    // Проверка секретного токена
    if (secret !== ADMIN_SECRET) {
        console.log(`⚠️ [SECURITY] Попытка доступа к /fix-password без токена с IP: ${req.ip}`);
        return res.status(403).send('Доступ запрещён');
    }

    if (!user) {
        return res.send('Укажите ?user=ИМЯ&secret=ТОКЕН&newpass=ПАРОЛЬ в ссылке');
    }

    const newPassword = newpass || '12345';

    try {
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, user]);
        console.log(`✅ [ADMIN] Пароль для ${user} сброшен`);
        res.send(`<h1>Успех!</h1><p>Пароль для <b>${user}</b> изменен.</p>`);
    } catch (e) {
        res.send('Ошибка: ' + e.message);
    }
});

// ============================================
// Вход (с Rate Limiting)
// ============================================
router.post('/api/login', async (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;

    // Проверяем rate limit
    const rateCheck = checkRateLimit(clientIP);
    if (!rateCheck.allowed) {
        console.log(`🚫 [LOGIN] Rate limit для IP: ${clientIP}`);
        return res.status(429).json({
            success: false,
            error: `Слишком много попыток. Подождите ${rateCheck.waitMinutes} минут.`
        });
    }

    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, error: 'Введите логин и пароль' });
    }

    // Базовая валидация
    if (username.length < 2 || username.length > 50) {
        return res.json({ success: false, error: 'Неверный формат логина' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            recordLoginAttempt(clientIP, false);
            console.log(`❌ [LOGIN] Пользователь не найден: ${username}`);
            return res.json({ success: false, error: 'Пользователь не найден' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            recordLoginAttempt(clientIP, true);
            console.log(`✅ [LOGIN] Успешный вход: ${username} (${user.role})`);
            res.json({ success: true, user: {
                id: user.id,
                username: user.username,
                role: user.role,
                avatar_url: user.avatar_url || null,
                salary: user.salary,
                isRestricted: user.is_restricted || false,
                aiEnabled: user.ai_enabled || false
            } });
        } else {
            recordLoginAttempt(clientIP, false);
            console.log(`❌ [LOGIN] Неверный пароль для: ${username}`);
            res.json({ success: false, error: 'Неверный пароль' });
        }
    } catch (e) {
        console.error('💥 [LOGIN] Ошибка сервера:', e.message);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================
// Обновление профиля пользователя
// ============================================
router.put('/api/user/profile', async (req, res) => {
    const { userId, username, password, avatarUrl } = req.body;

    if (!userId) {
        return res.json({ success: false, error: 'userId обязателен' });
    }

    // Валидация userId
    if (isNaN(parseInt(userId))) {
        return res.json({ success: false, error: 'Неверный формат userId' });
    }

    try {
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (username) {
            // Валидация username
            if (username.length < 2 || username.length > 50) {
                return res.json({ success: false, error: 'Имя должно быть от 2 до 50 символов' });
            }
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
            // Валидация пароля
            if (password.length < 4) {
                return res.json({ success: false, error: 'Пароль должен быть минимум 4 символа' });
            }
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
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

module.exports = router;
