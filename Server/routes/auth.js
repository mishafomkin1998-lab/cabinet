/**
 * Authentication Routes
 * Маршруты аутентификации
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

// Создание директора
router.get('/setup-director', async (req, res) => {
    const { user, pass } = req.query;
    if (!user || !pass) return res.send('Ошибка: укажите ?user=Имя&pass=Пароль в ссылке');

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
        res.send(`<h1>Готово!</h1><p>Директор <b>${user}</b> создан/обновлен.</p>`);
    } catch (e) { res.send('Ошибка создания: ' + e.message); }
});

// Сброс пароля
router.get('/fix-password', async (req, res) => {
    const user = req.query.user;
    const newPass = '12345';

    if (!user) return res.send('Укажите ?user=ИМЯ в ссылке');

    try {
        const hash = await bcrypt.hash(newPass, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, user]);
        res.send(`<h1>Успех!</h1><p>Пароль для <b>${user}</b> изменен на <b>12345</b></p>`);
    } catch (e) {
        res.send('Ошибка: ' + e.message);
    }
});

// Вход
router.post('/api/login', async (req, res) => {
    console.log('👉 [LOGIN DEBUG] Получен запрос:', req.body);

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
            console.log(`✅ [LOGIN] Успешный вход: ${username} (${user.role})`);
            res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
        } else {
            console.log(`❌ [LOGIN] Неверный пароль для "${username}"`);
            res.json({ success: false, error: 'Неверный пароль' });
        }
    } catch (e) {
        console.error('💥 [LOGIN] Ошибка сервера/БД:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
