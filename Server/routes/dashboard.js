// ==========================================
// ROUTES/DASHBOARD.JS - API для личного кабинета
// Эндпоинты: /api/dashboard, /api/bots/status, /api/bots/:botId/stats,
//            /api/activity/recent, /api/history, /api/error_logs
// ==========================================

const express = require('express');
const pool = require('../config/database');
const { logError } = require('../utils/logger');
const { PRICE_LETTER, PRICE_CHAT } = require('../utils/prices');

const router = express.Router();

// GET /api/dashboard - Сводка для дашборда (все ключевые метрики)
router.get('/api/dashboard', async (req, res) => {
    const { userId, role, dateFrom, dateTo } = req.query;

    try {
        let profileFilter = "";
        let activityFilter = "";
        let params = [];
        let paramIndex = 1;

        if (role === 'translator') {
            profileFilter = `WHERE p.assigned_translator_id = $${paramIndex}`;
            activityFilter = `AND a.translator_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        } else if (role === 'admin') {
            profileFilter = `WHERE p.assigned_admin_id = $${paramIndex}`;
            activityFilter = `AND a.admin_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        }

        // Количество анкет
        const profilesQuery = `
            SELECT COUNT(*) as total_profiles
            FROM allowed_profiles p
            ${profileFilter}
        `;
        const profilesResult = await pool.query(profilesQuery, params);
        const totalProfiles = parseInt(profilesResult.rows[0]?.total_profiles) || 0;

        // Статистика из activity_log (основная таблица) + messages (для совместимости)
        const statsQuery = `
            SELECT
                -- Сегодня
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE), 0) as letters_today,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE), 0) as chats_today,
                -- Вчера (для сравнения)
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE - 1), 0) as letters_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE - 1), 0) as chats_yesterday,
                -- За 7 дней
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as letters_week,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as chats_week,
                -- За 30 дней
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as letters_month,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as chats_month,
                -- Уникальные мужчины
                COUNT(DISTINCT CASE WHEN DATE(a.created_at) = CURRENT_DATE THEN a.man_id END) as unique_men_today,
                COUNT(DISTINCT CASE WHEN a.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN a.man_id END) as unique_men_week,
                COUNT(DISTINCT CASE WHEN a.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN a.man_id END) as unique_men_month,
                -- Среднее время ответа (в секундах -> минуты)
                COALESCE(AVG(a.response_time_sec) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as avg_response_seconds,
                -- Медиана времени ответа
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a.response_time_sec) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as median_response_seconds,
                -- Суммарный доход
                COALESCE(SUM(a.income) FILTER (WHERE DATE(a.created_at) = CURRENT_DATE), 0) as income_today,
                COALESCE(SUM(a.income) FILTER (WHERE DATE(a.created_at) = CURRENT_DATE - 1), 0) as income_yesterday,
                COALESCE(SUM(a.income) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as income_week,
                COALESCE(SUM(a.income) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as income_month
            FROM activity_log a
            WHERE 1=1 ${activityFilter}
        `;

        const statsResult = await pool.query(statsQuery, params);
        const stats = statsResult.rows[0] || {};

        // Ошибки из error_logs
        const errorsQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE DATE(timestamp) = CURRENT_DATE), 0) as errors_today,
                COALESCE(COUNT(*) FILTER (WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'), 0) as errors_week
            FROM error_logs
        `;
        const errorsResult = await pool.query(errorsQuery);
        const errors = errorsResult.rows[0] || {};

        // Также считаем из messages для совместимости (если activity_log пуст)
        const messagesQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND DATE(m.timestamp) = CURRENT_DATE AND m.status = 'success'), 0) as letters_today,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE AND m.status = 'success'), 0) as chats_today,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND DATE(m.timestamp) = CURRENT_DATE - 1 AND m.status = 'success'), 0) as letters_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE - 1 AND m.status = 'success'), 0) as chats_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.timestamp >= CURRENT_DATE - INTERVAL '7 days' AND m.status = 'success'), 0) as letters_week,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.timestamp >= CURRENT_DATE - INTERVAL '7 days' AND m.status = 'success'), 0) as chats_week,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days' AND m.status = 'success'), 0) as letters_month,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days' AND m.status = 'success'), 0) as chats_month,
                COUNT(DISTINCT CASE WHEN DATE(m.timestamp) = CURRENT_DATE THEN m.sender_id END) as unique_men_today,
                COUNT(DISTINCT CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days' THEN m.sender_id END) as unique_men_week,
                COUNT(DISTINCT CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '30 days' THEN m.sender_id END) as unique_men_month,
                COALESCE(AVG(m.response_time) FILTER (WHERE m.timestamp >= CURRENT_DATE - INTERVAL '7 days'), 0) as avg_response_seconds
            FROM allowed_profiles p
            LEFT JOIN messages m ON m.account_id = p.profile_id
            ${profileFilter}
        `;
        const messagesResult = await pool.query(messagesQuery, params);
        const msgStats = messagesResult.rows[0] || {};

        // Используем данные из activity_log если есть, иначе из messages
        const lettersToday = parseInt(stats.letters_today) || parseInt(msgStats.letters_today) || 0;
        const chatsToday = parseInt(stats.chats_today) || parseInt(msgStats.chats_today) || 0;
        const lettersYesterday = parseInt(stats.letters_yesterday) || parseInt(msgStats.letters_yesterday) || 0;
        const chatsYesterday = parseInt(stats.chats_yesterday) || parseInt(msgStats.chats_yesterday) || 0;
        const lettersWeek = parseInt(stats.letters_week) || parseInt(msgStats.letters_week) || 0;
        const chatsWeek = parseInt(stats.chats_week) || parseInt(msgStats.chats_week) || 0;
        const lettersMonth = parseInt(stats.letters_month) || parseInt(msgStats.letters_month) || 0;
        const chatsMonth = parseInt(stats.chats_month) || parseInt(msgStats.chats_month) || 0;

        // Доход из activity_log или расчет по messages
        const incomeToday = parseFloat(stats.income_today) || (lettersToday * PRICE_LETTER + chatsToday * PRICE_CHAT);
        const incomeYesterday = parseFloat(stats.income_yesterday) || (lettersYesterday * PRICE_LETTER + chatsYesterday * PRICE_CHAT);
        const incomeWeek = parseFloat(stats.income_week) || (lettersWeek * PRICE_LETTER + chatsWeek * PRICE_CHAT);
        const incomeMonth = parseFloat(stats.income_month) || (lettersMonth * PRICE_LETTER + chatsMonth * PRICE_CHAT);

        // Рост по сравнению со вчера
        const growthPercent = incomeYesterday > 0
            ? (((incomeToday - incomeYesterday) / incomeYesterday) * 100).toFixed(1)
            : (incomeToday > 0 ? 100 : 0);

        // Среднее и медиана времени ответа
        const avgResponseSec = parseFloat(stats.avg_response_seconds) || parseFloat(msgStats.avg_response_seconds) || 0;
        const medianResponseSec = parseFloat(stats.median_response_seconds) || 0;

        res.json({
            success: true,
            dashboard: {
                today: {
                    letters: lettersToday,
                    chats: chatsToday,
                    uniqueMen: parseInt(stats.unique_men_today) || parseInt(msgStats.unique_men_today) || 0,
                    income: incomeToday.toFixed(2),
                    errors: parseInt(errors.errors_today) || 0
                },
                yesterday: {
                    letters: lettersYesterday,
                    chats: chatsYesterday,
                    income: incomeYesterday.toFixed(2)
                },
                week: {
                    letters: lettersWeek,
                    chats: chatsWeek,
                    uniqueMen: parseInt(stats.unique_men_week) || parseInt(msgStats.unique_men_week) || 0,
                    income: incomeWeek.toFixed(2),
                    errors: parseInt(errors.errors_week) || 0
                },
                month: {
                    letters: lettersMonth,
                    chats: chatsMonth,
                    uniqueMen: parseInt(stats.unique_men_month) || parseInt(msgStats.unique_men_month) || 0,
                    income: incomeMonth.toFixed(2)
                },
                metrics: {
                    totalProfiles: totalProfiles,
                    avgResponseTime: Math.round(avgResponseSec / 60),
                    medianResponseTime: Math.round(medianResponseSec / 60),
                    growthPercent: parseFloat(growthPercent) || 0,
                    avgDailyIncome: (incomeWeek / 7).toFixed(2)
                }
            }
        });

    } catch (e) {
        console.error('Dashboard error:', e.message);
        await logError('/api/dashboard', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/bots/status - Статус ботов (онлайн/офлайн)
router.get('/api/bots/status', async (req, res) => {
    const { userId, role } = req.query;

    try {
        // Получаем список ботов из таблицы bots с количеством профилей
        const botsQuery = `
            SELECT
                b.bot_id,
                b.name,
                b.platform,
                b.ip,
                b.version,
                b.status,
                b.last_heartbeat,
                CASE
                    WHEN b.last_heartbeat > NOW() - INTERVAL '2 minutes' THEN 'online'
                    WHEN b.last_heartbeat > NOW() - INTERVAL '10 minutes' THEN 'idle'
                    ELSE 'offline'
                END as connection_status,
                COALESCE(bp.profiles_count, 0) as profiles_count,
                bp.profiles
            FROM bots b
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) as profiles_count,
                    ARRAY_AGG(bp2.profile_id) as profiles
                FROM bot_profiles bp2
                WHERE bp2.bot_id = b.bot_id
            ) bp ON true
            ORDER BY b.last_heartbeat DESC NULLS LAST
        `;
        const botsResult = await pool.query(botsQuery);

        // Также получаем по старой схеме для совместимости
        let profileFilter = "";
        let params = [];

        if (role === 'translator') {
            profileFilter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        } else if (role === 'admin') {
            profileFilter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        }

        const profilesQuery = `
            SELECT DISTINCT ON (p.profile_id)
                p.profile_id,
                p.note,
                h.bot_id,
                h.status,
                h.ip,
                h.version,
                h.platform,
                h.timestamp as last_heartbeat,
                CASE
                    WHEN h.timestamp > NOW() - INTERVAL '2 minutes' THEN 'online'
                    WHEN h.timestamp > NOW() - INTERVAL '10 minutes' THEN 'idle'
                    ELSE 'offline'
                END as connection_status
            FROM allowed_profiles p
            LEFT JOIN heartbeats h ON p.profile_id = h.account_display_id
            ${profileFilter}
            ORDER BY p.profile_id, h.timestamp DESC
        `;
        const profilesResult = await pool.query(profilesQuery, params);

        // Подсчёт статусов
        const statusCounts = {
            online: 0,
            idle: 0,
            offline: 0,
            never_connected: 0
        };

        // Формируем список ботов
        const bots = botsResult.rows.length > 0
            ? botsResult.rows.map(row => {
                const status = row.last_heartbeat ? row.connection_status : 'never_connected';
                statusCounts[status]++;

                return {
                    botId: row.bot_id,
                    name: row.name,
                    platform: row.platform,
                    ip: row.ip,
                    version: row.version,
                    status: status,
                    lastHeartbeat: row.last_heartbeat,
                    profilesCount: parseInt(row.profiles_count) || 0,
                    profiles: row.profiles || []
                };
            })
            : profilesResult.rows.map(row => {
                const status = row.last_heartbeat ? row.connection_status : 'never_connected';
                statusCounts[status]++;

                return {
                    botId: row.bot_id,
                    profileId: row.profile_id,
                    note: row.note,
                    platform: row.platform,
                    ip: row.ip,
                    version: row.version,
                    status: status,
                    lastHeartbeat: row.last_heartbeat
                };
            });

        res.json({
            success: true,
            summary: statusCounts,
            bots: bots
        });

    } catch (e) {
        console.error('Bots status error:', e.message);
        await logError('/api/bots/status', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/activity/recent - Последняя активность (лента событий)
router.get('/api/activity/recent', async (req, res) => {
    const { userId, role, limit = 50 } = req.query;
    const limitInt = parseInt(limit) || 50;

    try {
        let activityFilter = "";
        let msgFilter = "";
        let params = [limitInt];

        if (role === 'translator') {
            activityFilter = `AND a.translator_id = $2`;
            msgFilter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            activityFilter = `AND a.admin_id = $2`;
            msgFilter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

        // Сначала пробуем activity_log
        const activityQuery = `
            SELECT
                a.id,
                a.created_at as timestamp,
                a.profile_id,
                a.man_id,
                a.action_type,
                a.message_text,
                a.response_time_sec,
                a.used_ai,
                a.income,
                u_admin.username as admin_name,
                u_trans.username as translator_name
            FROM activity_log a
            LEFT JOIN users u_admin ON a.admin_id = u_admin.id
            LEFT JOIN users u_trans ON a.translator_id = u_trans.id
            WHERE 1=1 ${activityFilter}
            ORDER BY a.created_at DESC
            LIMIT $1
        `;

        const activityResult = await pool.query(activityQuery, params);

        // Если activity_log пуст, используем messages
        if (activityResult.rows.length === 0) {
            const msgQuery = `
                SELECT
                    m.id,
                    m.timestamp,
                    m.account_id as profile_id,
                    m.sender_id as man_id,
                    m.type as action_type,
                    m.status,
                    m.response_time as response_time_sec,
                    mc.text_content as message_text,
                    CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END as income
                FROM messages m
                JOIN allowed_profiles p ON m.account_id = p.profile_id
                LEFT JOIN message_content mc ON m.message_content_id = mc.id
                WHERE 1=1 ${msgFilter}
                ORDER BY m.timestamp DESC
                LIMIT $1
            `;

            const msgResult = await pool.query(msgQuery, params);

            const activity = msgResult.rows.map(row => ({
                id: row.id,
                profile_id: row.profile_id,
                action_type: row.action_type === 'outgoing' ? 'letter' : (row.action_type === 'chat_msg' ? 'chat' : row.action_type),
                man_id: row.man_id,
                message_text: row.message_text ? row.message_text.substring(0, 200) : null,
                response_time_sec: row.response_time_sec,
                used_ai: false,
                income: row.status === 'success' ? parseFloat(row.income) : 0,
                created_at: row.timestamp
            }));

            return res.json({ success: true, activity });
        }

        // Форматируем активность из activity_log
        const activity = activityResult.rows.map(row => ({
            id: row.id,
            profile_id: row.profile_id,
            action_type: row.action_type,
            man_id: row.man_id,
            message_text: row.message_text ? row.message_text.substring(0, 200) : null,
            response_time_sec: row.response_time_sec,
            used_ai: row.used_ai,
            income: parseFloat(row.income) || 0,
            created_at: row.timestamp,
            admin_name: row.admin_name,
            translator_name: row.translator_name
        }));

        res.json({ success: true, activity });

    } catch (e) {
        console.error('Activity recent error:', e.message);
        await logError('/api/activity/recent', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/bots/:botId/stats - Статистика по конкретному боту
router.get('/api/bots/:botId/stats', async (req, res) => {
    const { botId } = req.params;
    const { userId, role, days = 7 } = req.query;

    try {
        // Проверяем доступ через профиль бота
        const accessQuery = `
            SELECT h.account_display_id
            FROM heartbeats h
            JOIN allowed_profiles p ON h.account_display_id = p.profile_id
            WHERE h.bot_id = $1
            ${role === 'translator' ? 'AND p.assigned_translator_id = $2' : ''}
            ${role === 'admin' ? 'AND p.assigned_admin_id = $2' : ''}
            LIMIT 1
        `;
        const accessParams = role === 'director' ? [botId] : [botId, userId];
        const accessResult = await pool.query(accessQuery, accessParams);

        if (accessResult.rows.length === 0 && role !== 'director') {
            return res.status(403).json({ success: false, error: 'Нет доступа к этому боту' });
        }

        const profileId = accessResult.rows[0]?.account_display_id;

        // Статистика бота
        const statsQuery = `
            SELECT
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.status = 'success') as letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.status = 'success') as chats,
                COUNT(*) FILTER (WHERE m.status = 'failed') as errors,
                COUNT(DISTINCT m.sender_id) as unique_men,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                MIN(m.timestamp) as first_message,
                MAX(m.timestamp) as last_message
            FROM messages m
            WHERE m.bot_id = $1
            AND m.timestamp >= CURRENT_DATE - INTERVAL '1 day' * $2
        `;

        const statsResult = await pool.query(statsQuery, [botId, days]);
        const stats = statsResult.rows[0];

        // Последний heartbeat
        const heartbeatQuery = `
            SELECT * FROM heartbeats
            WHERE bot_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
        `;
        const heartbeatResult = await pool.query(heartbeatQuery, [botId]);
        const lastHeartbeat = heartbeatResult.rows[0];

        const income = (parseFloat(stats.letters || 0) * PRICE_LETTER) + (parseFloat(stats.chats || 0) * PRICE_CHAT);

        res.json({
            success: true,
            bot: {
                botId: botId,
                profileId: profileId,
                status: lastHeartbeat && new Date(lastHeartbeat.timestamp) > new Date(Date.now() - 2 * 60 * 1000)
                    ? 'online' : 'offline',
                lastHeartbeat: lastHeartbeat?.timestamp,
                ip: lastHeartbeat?.ip,
                version: lastHeartbeat?.version,
                platform: lastHeartbeat?.platform,
                stats: {
                    letters: parseInt(stats.letters) || 0,
                    chats: parseInt(stats.chats) || 0,
                    errors: parseInt(stats.errors) || 0,
                    uniqueMen: parseInt(stats.unique_men) || 0,
                    avgResponseTime: Math.round(stats.avg_response_seconds / 60) || 0,
                    income: income.toFixed(2),
                    firstMessage: stats.first_message,
                    lastMessage: stats.last_message
                }
            }
        });

    } catch (e) {
        await logError(`/api/bots/${botId}/stats`, 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/history - История переписок
router.get('/api/history', async (req, res) => {
    const { userId, role, search, profileId, senderId, startDate, endDate, type, status, limit = 50, offset = 0 } = req.query;
    try {
        let filter = "WHERE 1=1 ";
        let params = [limit, offset];
        let paramIndex = 3;

        // Фильтр по роли
        if (role === 'translator') {
            filter += `AND p.assigned_translator_id = $${paramIndex++} `;
            params.push(userId);
        } else if (role === 'admin') {
            filter += `AND p.assigned_admin_id = $${paramIndex++} `;
            params.push(userId);
        }

        // Поиск по ID Анкеты
        if (profileId) {
            filter += `AND p.profile_id = $${paramIndex++} `;
            params.push(profileId);
        }

        // Поиск по ID Мужчины
        if (senderId) {
            filter += `AND m.sender_id = $${paramIndex++} `;
            params.push(senderId);
        }

        // Фильтры по дате
        if (startDate) {
            filter += `AND m.timestamp >= $${paramIndex++}::date `;
            params.push(startDate);
        }
        if (endDate) {
            filter += `AND m.timestamp < ($${paramIndex++}::date + INTERVAL '1 day') `;
            params.push(endDate);
        }

        // Фильтры по типу/статусу
        if (type) {
            filter += `AND m.type = $${paramIndex++} `;
            params.push(type);
        }
        if (status) {
            filter += `AND m.status = $${paramIndex++} `;
            params.push(status);
        }

        // Поиск по тексту сообщения
        if (search) {
            filter += `AND mc.text_content ILIKE $${paramIndex++} `;
            params.push(`%${search}%`);
        }

        const query = `
            SELECT
                m.id, m.timestamp, m.account_id, m.sender_id, m.type, m.status, m.response_time, m.message_length,
                mc.text_content, mc.media_url, mc.file_name
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            LEFT JOIN message_content mc ON m.message_content_id = mc.id
            ${filter}
            ORDER BY m.timestamp DESC
            LIMIT $1 OFFSET $2
        `;

        // Общее количество сообщений (для пагинации)
        const countParams = params.slice(2);
        const countQuery = `
            SELECT COUNT(m.id)
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            LEFT JOIN message_content mc ON m.message_content_id = mc.id
            ${filter}
        `;

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        const result = await pool.query(query, params);
        res.json({ success: true, list: result.rows, total: totalCount });

    } catch (e) {
        await logError('/api/history', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/error_logs - Логи ошибок
router.get('/api/error_logs', async (req, res) => {
    const { userId, role, limit = 50, offset = 0 } = req.query;
    try {
        let filter = "WHERE 1=1 ";
        let params = [limit, offset];

        if (role === 'admin' || role === 'translator') {
            filter += `AND el.user_id = $3 `;
            params.push(userId);
        }

        const query = `
            SELECT el.*, u.username
            FROM error_logs el
            LEFT JOIN users u ON el.user_id = u.id
            ${filter}
            ORDER BY el.timestamp DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await pool.query(query, params);
        res.json({ success: true, logs: result.rows });
    } catch (e) {
        await logError('/api/error_logs', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
