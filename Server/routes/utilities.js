// ==========================================
// ROUTES/UTILITIES.JS - Утилитарные эндпоинты
// Эндпоинты: /reset-database, /recalculate-stats
// ==========================================

const express = require('express');
const pool = require('../config/database');
const { PRICE_LETTER, PRICE_CHAT } = require('../utils/prices');

const router = express.Router();

// GET /reset-database - Сброс базы данных (ОПАСНО!)
router.get('/reset-database', async (req, res) => {
    try {
        console.log('ЗАПУЩЕН СБРОС БАЗЫ ДАННЫХ...');
        await pool.query('DROP TABLE IF EXISTS daily_stats CASCADE');
        await pool.query('DROP TABLE IF EXISTS error_logs CASCADE');
        await pool.query('DROP TABLE IF EXISTS message_content CASCADE');
        await pool.query('DROP TABLE IF EXISTS messages CASCADE');
        await pool.query('DROP TABLE IF EXISTS allowed_profiles CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');

        console.log('Таблицы удалены. Перезапустите сервер.');
        res.send('<h1>База данных очищена!</h1><p>Теперь <b>перезапустите server.js</b> чтобы создать новые таблицы.</p>');
    } catch(e) {
        res.send('Ошибка: ' + e.message);
    }
});

// GET /recalculate-stats - Пересчет ежедневной статистики
router.get('/recalculate-stats', async (req, res) => {
    try {
        console.log('Пересчет ежедневной статистики...');

        // Пересчитываем статистику за последние 30 дней для всех пользователей
        await pool.query(`
            INSERT INTO daily_stats (user_id, date, letters_count, chats_count, unique_men, total_income, avg_response_time)
            SELECT
                p.assigned_translator_id as user_id,
                DATE(m.timestamp) as date,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters_count,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats_count,
                COUNT(DISTINCT m.sender_id) as unique_men,
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} +
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as total_income,
                AVG(m.response_time) as avg_response_time
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            WHERE m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
                AND p.assigned_translator_id IS NOT NULL
            GROUP BY p.assigned_translator_id, DATE(m.timestamp)
            ON CONFLICT (user_id, date) DO UPDATE SET
                letters_count = EXCLUDED.letters_count,
                chats_count = EXCLUDED.chats_count,
                unique_men = EXCLUDED.unique_men,
                total_income = EXCLUDED.total_income,
                avg_response_time = EXCLUDED.avg_response_time
        `);

        res.json({ success: true, message: 'Статистика пересчитана' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
