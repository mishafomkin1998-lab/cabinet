/**
 * Statistics Routes
 * Маршруты статистики
 *
 * Эндпоинты:
 * - GET /detailed - детальная статистика за 30 дней
 * - GET /daily - статистика по дням
 * - GET /top-profiles - топ анкет по активности
 * - GET /translators - статистика переводчиков
 * - GET /admins - статистика админов (только для director)
 * - GET /profile/:profileId - детали по конкретной анкете
 * - GET /forecast - прогноз активности
 * - GET /hourly-activity - активность по часам
 * - GET /by-admin - статистика в разрезе админов
 * - GET /by-translator - статистика в разрезе переводчиков
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler, buildRoleFilter } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/stats/detailed
 * Возвращает агрегированную статистику за последние 30 дней
 *
 * @query {string} userId - ID пользователя
 * @query {string} role - Роль (translator/admin/director)
 * @returns {Object} stats - Объект со статистикой:
 *   - letters: количество отправленных писем
 *   - chats: количество чат-сообщений
 *   - uniqueMenMonth: уникальные мужчины за текущий месяц
 *   - avgResponseTime: среднее время ответа в минутах
 *   - replyRate: процент ответов на первые сообщения
 */
router.get('/detailed', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    // Формируем фильтр в зависимости от роли пользователя
        const { filter, params } = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'WHERE' });

        /**
         * Агрегированный запрос статистики сообщений:
         * - letters_count: успешные исходящие письма (type='outgoing')
         * - chats_count: успешные чат-сообщения (type='chat_msg')
         * - unique_men_month: уникальные получатели в текущем месяце
         * - unique_men_total: всего уникальных получателей за 30 дней
         * - avg_response_seconds: среднее время ответа в секундах
         * - first_messages: количество первых сообщений в диалогах
         * - last_messages: количество завершающих сообщений
         */
        const query = `
            SELECT
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.status = 'success') as letters_count,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.status = 'success') as chats_count,
                COUNT(*) FILTER (WHERE m.status = 'failed') as failed_messages_count,
                COUNT(*) FILTER (WHERE m.status = 'success') as success_messages_count,
                COUNT(DISTINCT CASE
                    WHEN date_trunc('month', m.timestamp) = date_trunc('month', CURRENT_DATE)
                    THEN m.sender_id
                END) as unique_men_month,
                COUNT(DISTINCT m.sender_id) as unique_men_total,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                COUNT(DISTINCT m.conversation_id) as total_conversations,
                SUM(CASE WHEN m.is_first_message THEN 1 ELSE 0 END) as first_messages,
                SUM(CASE WHEN m.is_last_message THEN 1 ELSE 0 END) as last_messages
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            ${filter}
            AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
        `;

        const result = await pool.query(query, params);
        const stats = result.rows[0];

        // Расчёт производных метрик
        const totalSent = parseFloat(stats.first_messages);
        const totalConv = parseFloat(stats.total_conversations);
        // replyRate = % диалогов от первых сообщений (конверсия)
        const replyRate = totalSent > 0 ? ((totalConv / totalSent) * 100).toFixed(1) : 0;
        // avgConvLength = среднее количество сообщений в диалоге
        const avgConvLength = totalConv > 0 ? ((parseFloat(stats.letters_count) + parseFloat(stats.chats_count)) / totalConv).toFixed(1) : 0;

        res.json({
            success: true,
            stats: {
                letters: parseInt(stats.letters_count) || 0,
                chats: parseInt(stats.chats_count) || 0,
                failedMessages: parseInt(stats.failed_messages_count) || 0,
                successMessages: parseInt(stats.success_messages_count) || 0,
                uniqueMenMonth: parseInt(stats.unique_men_month) || 0,
                uniqueMenTotal: parseInt(stats.unique_men_total) || 0,
                avgResponseTime: Math.round(stats.avg_response_seconds / 60) || 0, // конвертируем в минуты
                totalConversations: parseInt(stats.total_conversations) || 0,
                replyRate: replyRate,
                avgConvLength: avgConvLength,
                firstMessages: parseInt(stats.first_messages) || 0,
                lastMessages: parseInt(stats.last_messages) || 0
            }
        });
}));


/**
 * GET /api/stats/daily
 * Возвращает статистику по дням для построения графиков
 *
 * @query {number} days - Количество дней (по умолчанию 30)
 * @returns {Array} data - Массив объектов {date, letters, chats, unique_men, avg_response}
 */
router.get('/daily', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;
    const days = parseInt(req.query.days) || 30;

    const roleFilter = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'AND', paramIndex: 2 });
        const profileFilter = roleFilter.filter;
        const params = [days, ...roleFilter.params];

        /**
         * Запрос использует CTE (WITH) для генерации последовательности дат,
         * чтобы показать все дни, даже если в какой-то день не было активности.
         * generate_series создаёт ряд дат от (сегодня - N дней) до сегодня.
         * LEFT JOIN гарантирует, что дни без сообщений тоже попадут в результат.
         */
        const query = `
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '1 day' * ($1 - 1),
                    CURRENT_DATE,
                    '1 day'::interval
                )::date as date
            )
            SELECT
                ds.date,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing'), 0) as letters,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg'), 0) as chats,
                COUNT(DISTINCT m.sender_id) as unique_men,
                COALESCE(AVG(m.response_time), 0) as avg_response
            FROM date_series ds
            LEFT JOIN allowed_profiles p ON 1=1 ${profileFilter}
            LEFT JOIN messages m ON m.account_id = p.profile_id AND DATE(m.timestamp) = ds.date
            GROUP BY ds.date
            ORDER BY ds.date DESC
        `;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows || [] });
}));

/**
 * GET /api/stats/top-profiles
 * Возвращает топ анкет по количеству сообщений за 30 дней
 *
 * @query {number} limit - Количество анкет (по умолчанию 10)
 * @returns {Array} profiles - Массив анкет с их статистикой
 */
router.get('/top-profiles', asyncHandler(async (req, res) => {
    const { userId, role, limit = 10 } = req.query;

    const roleFilter = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'AND', paramIndex: 2 });
        const filter = roleFilter.filter;
        const params = [limit, ...roleFilter.params];

        /**
         * Группировка по profile_id для подсчёта сообщений каждой анкеты.
         * Сортировка по total_messages DESC - самые активные наверху.
         */
        const query = `
            SELECT
                p.profile_id,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats,
                COUNT(DISTINCT m.sender_id) as unique_men,
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') +
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg')) as total_messages,
                MAX(m.timestamp) as last_activity
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            WHERE m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ${filter}
            GROUP BY p.profile_id, p.id
            ORDER BY total_messages DESC
            LIMIT $1
        `;

    const result = await pool.query(query, params);
    res.json({ success: true, profiles: result.rows });
}));

// Статистика по переводчикам
router.get('/translators', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    let filter = "";
        let params = [];

        if (role === 'admin') {
            filter = `WHERE u.owner_id = $1 AND u.role = 'translator'`;
            params.push(userId);
        } else if (role === 'director') {
            filter = `WHERE u.role = 'translator'`;
        } else {
            return res.json({ success: true, translators: [] });
        }

        const query = `
            SELECT
                u.id,
                u.username,
                COUNT(DISTINCT p.id) as profiles_count,
                COUNT(DISTINCT CASE WHEN m.type = 'outgoing' THEN m.id END) as letters,
                COUNT(DISTINCT CASE WHEN m.type = 'chat_msg' THEN m.id END) as chats,
                COUNT(DISTINCT m.sender_id) as unique_men,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                (COUNT(DISTINCT CASE WHEN m.type = 'outgoing' THEN m.id END) +
                 COUNT(DISTINCT CASE WHEN m.type = 'chat_msg' THEN m.id END)) as total_messages,
                MAX(m.timestamp) as last_activity
            FROM users u
            LEFT JOIN allowed_profiles p ON u.id = p.assigned_translator_id
            LEFT JOIN messages m ON p.profile_id = m.account_id
                AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ${filter}
            GROUP BY u.id, u.username
            ORDER BY total_messages DESC NULLS LAST
        `;

        const result = await pool.query(query, params);

        const translators = result.rows.map(t => ({
            id: t.id,
            username: t.username,
            profilesCount: t.profiles_count,
            letters: t.letters || 0,
            chats: t.chats || 0,
            uniqueMen: t.unique_men || 0,
            avgResponseTime: Math.round(t.avg_response_seconds / 60) || 0,
            totalMessages: parseInt(t.total_messages || 0),
            lastActivity: t.last_activity,
            efficiency: t.profiles_count > 0 ? ((parseInt(t.total_messages || 0) / t.profiles_count)).toFixed(1) : 0
        }));

    res.json({ success: true, translators });
}));

// Статистика по админам
router.get('/admins', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    if (role !== 'director') {
        return res.json({ success: true, admins: [] });
    }

    const query = `
            SELECT
                u.id,
                u.username,
                COUNT(DISTINCT t.id) as translators_count,
                COUNT(DISTINCT p.id) as total_profiles,
                SUM(stats.letters) as total_letters,
                SUM(stats.chats) as total_chats,
                SUM(stats.total_messages) as team_messages,
                COALESCE(AVG(stats.avg_response), 0) as avg_team_response
            FROM users u
            LEFT JOIN users t ON u.id = t.owner_id AND t.role = 'translator'
            LEFT JOIN allowed_profiles p ON u.id = p.assigned_admin_id
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters,
                    COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats,
                    COUNT(*) as total_messages,
                    COALESCE(AVG(m.response_time), 0) as avg_response
                FROM messages m
                WHERE m.account_id = p.profile_id
                    AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ) stats ON true
            WHERE u.role = 'admin'
            GROUP BY u.id, u.username
            ORDER BY team_messages DESC NULLS LAST
        `;

        const result = await pool.query(query);

        const admins = result.rows.map(a => ({
            id: a.id,
            username: a.username,
            translatorsCount: a.translators_count || 0,
            totalProfiles: a.total_profiles || 0,
            totalLetters: a.total_letters || 0,
            totalChats: a.total_chats || 0,
            teamMessages: parseInt(a.team_messages || 0),
            avgTeamResponse: Math.round(a.avg_team_response / 60) || 0,
            efficiencyPerTranslator: a.translators_count > 0
                ? (parseInt(a.team_messages || 0) / a.translators_count).toFixed(2)
                : 0
        }));

    res.json({ success: true, admins });
}));

// Детали по анкете
router.get('/profile/:profileId', asyncHandler(async (req, res) => {
    const { profileId } = req.params;
    const { userId, role } = req.query;

    let accessQuery = `SELECT * FROM allowed_profiles WHERE profile_id = $1`;
        const accessParams = [profileId];

        if (role === 'translator') {
            accessQuery += ` AND assigned_translator_id = $2`;
            accessParams.push(userId);
        } else if (role === 'admin') {
            accessQuery += ` AND assigned_admin_id = $2`;
            accessParams.push(userId);
        }

        const accessCheck = await pool.query(accessQuery, accessParams);
        if (accessCheck.rows.length === 0 && role !== 'director') {
            return res.status(403).json({ success: false, error: 'Нет доступа к этой анкете' });
        }

        const query = `
            SELECT
                p.profile_id,
                p.note,
                u_admin.username as admin_name,
                u_trans.username as translator_name,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as total_letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as total_chats,
                COUNT(DISTINCT m.sender_id) as total_men,
                COUNT(DISTINCT m.conversation_id) as total_conversations,
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') +
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg')) as total_messages,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                MAX(m.timestamp) as last_activity,
                MIN(m.timestamp) as first_activity,
                SUM(CASE WHEN m.is_first_message THEN 1 ELSE 0 END) as first_messages_sent,
                SUM(CASE WHEN m.is_last_message THEN 1 ELSE 0 END) as conversations_ended
            FROM allowed_profiles p
            LEFT JOIN users u_admin ON p.assigned_admin_id = u_admin.id
            LEFT JOIN users u_trans ON p.assigned_translator_id = u_trans.id
            LEFT JOIN messages m ON p.profile_id = m.account_id
                AND m.timestamp >= CURRENT_DATE - INTERVAL '90 days'
            WHERE p.profile_id = $1
            GROUP BY p.profile_id, p.note, u_admin.username, u_trans.username
        `;

        const result = await pool.query(query, [profileId]);

        if (result.rows.length === 0) {
            return res.json({ success: true, profile: null });
        }

        const profile = result.rows[0];
        const stats = {
            profileId: profile.profile_id,
            note: profile.note,
            adminName: profile.admin_name,
            translatorName: profile.translator_name,
            totalLetters: profile.total_letters || 0,
            totalChats: profile.total_chats || 0,
            totalMen: profile.total_men || 0,
            totalConversations: profile.total_conversations || 0,
            totalMessages: parseInt(profile.total_messages || 0),
            avgResponseTime: Math.round(profile.avg_response_seconds / 60) || 0,
            lastActivity: profile.last_activity,
            firstActivity: profile.first_activity,
            firstMessagesSent: profile.first_messages_sent || 0,
            conversationsEnded: profile.conversations_ended || 0,
            replyRate: profile.first_messages_sent > 0
                ? ((profile.total_conversations / profile.first_messages_sent) * 100).toFixed(1)
                : 0,
            avgMessagesPerMan: profile.total_men > 0
                ? (parseInt(profile.total_messages || 0) / profile.total_men).toFixed(2)
                : 0
        };

    res.json({ success: true, profile: stats });
}));

// Прогноз активности (без финансов)
router.get('/forecast', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    const { filter, params } = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'WHERE' });

        const query = `
            SELECT
                SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END) as week_messages,
                SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END) as month_messages,
                COALESCE(SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END) / 7.0, 0) as avg_daily_messages_7d,
                (SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END)::numeric /
                 NULLIF(SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '14 days'
                                 AND m.timestamp < CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END), 0) - 1) * 100 as growth_percent
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            ${filter}
        `;

        const result = await pool.query(query, params);
        const data = result.rows[0];

        const forecast = {
            weekMessages: parseInt(data.week_messages || 0),
            monthMessages: parseInt(data.month_messages || 0),
            avgDailyMessages: parseFloat(data.avg_daily_messages_7d || 0).toFixed(1),
            growthPercent: data.growth_percent ? parseFloat(data.growth_percent).toFixed(1) : 0,
            monthForecast: Math.round(parseFloat(data.avg_daily_messages_7d || 0) * 30),
            weekForecast: Math.round(parseFloat(data.avg_daily_messages_7d || 0) * 7)
        };

    res.json({ success: true, forecast });
}));

// Активность по часам
router.get('/hourly-activity', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;
    const days = parseInt(req.query.days) || 7;

    const activityRoleFilter = buildRoleFilter(role, userId, { table: 'activity', prefix: 'AND', paramIndex: 2 });
        const profileRoleFilter = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'AND', paramIndex: 2 });
        const activityFilter = activityRoleFilter.filter;
        const msgFilter = profileRoleFilter.filter;
        const params = [days, ...activityRoleFilter.params];

        const activityQuery = `
            SELECT
                EXTRACT(HOUR FROM a.created_at) as hour,
                COUNT(*) as message_count
            FROM activity_log a
            WHERE a.created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
            ${activityFilter}
            GROUP BY EXTRACT(HOUR FROM a.created_at)
            ORDER BY hour
        `;

        let result = await pool.query(activityQuery, params);

        if (result.rows.length === 0) {
            const msgQuery = `
                SELECT
                    EXTRACT(HOUR FROM m.timestamp) as hour,
                    COUNT(*) as message_count
                FROM messages m
                JOIN allowed_profiles p ON m.account_id = p.profile_id
                WHERE m.timestamp >= CURRENT_DATE - INTERVAL '1 day' * $1
                ${msgFilter}
                GROUP BY EXTRACT(HOUR FROM m.timestamp)
                ORDER BY hour
            `;
            result = await pool.query(msgQuery, params);
        }

        const maxCount = Math.max(...result.rows.map(r => parseInt(r.message_count) || 0), 1);

        const hourlyData = Array.from({ length: 24 }, (_, hour) => {
            const hourData = result.rows.find(r => parseInt(r.hour) === hour);
            const count = hourData ? parseInt(hourData.message_count) : 0;
            return parseFloat((count / maxCount).toFixed(2));
        });

    res.json({ success: true, hourlyData });
}));

// Статистика по админам (GET /api/stats/by-admin)
router.get('/by-admin', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    let dateFilter = "";
        let params = [];
        let paramIndex = 1;

        if (dateFrom) {
            dateFilter += ` AND a.created_at >= $${paramIndex}::date`;
            params.push(dateFrom);
            paramIndex++;
        }
        if (dateTo) {
            dateFilter += ` AND a.created_at <= $${paramIndex}::date + INTERVAL '1 day'`;
            params.push(dateTo);
            paramIndex++;
        }

        const query = `
            SELECT
                u.id as admin_id,
                u.username as admin_name,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) as letters,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat'), 0) as chats,
                COALESCE(COUNT(*), 0) as total_messages,
                COALESCE(AVG(a.response_time_sec), 0) as avg_response_time,
                CASE
                    WHEN COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) > 0
                    THEN ROUND((COUNT(DISTINCT a.man_id)::numeric / COUNT(*) FILTER (WHERE a.action_type = 'letter')) * 100, 1)
                    ELSE 0
                END as conversion
            FROM users u
            LEFT JOIN activity_log a ON a.admin_id = u.id ${dateFilter}
            WHERE u.role = 'admin'
            GROUP BY u.id, u.username
            ORDER BY total_messages DESC NULLS LAST
        `;

        const result = await pool.query(query, params);

        const admins = result.rows.map(row => ({
            admin_id: row.admin_id,
            admin_name: row.admin_name,
            letters: parseInt(row.letters) || 0,
            chats: parseInt(row.chats) || 0,
            total_messages: parseInt(row.total_messages) || 0,
            avg_response_time: Math.round((parseFloat(row.avg_response_time) || 0) / 60),
            conversion: parseFloat(row.conversion) || 0
        }));

    res.json({ success: true, admins });
}));

// Статистика по переводчикам (GET /api/stats/by-translator)
router.get('/by-translator', asyncHandler(async (req, res) => {
    const { adminId, dateFrom, dateTo } = req.query;

    let filter = "";
        let params = [];
        let paramIndex = 1;

        if (adminId) {
            filter += ` AND u.owner_id = $${paramIndex}`;
            params.push(adminId);
            paramIndex++;
        }

        let dateFilter = "";
        if (dateFrom) {
            dateFilter += ` AND a.created_at >= $${paramIndex}::date`;
            params.push(dateFrom);
            paramIndex++;
        }
        if (dateTo) {
            dateFilter += ` AND a.created_at <= $${paramIndex}::date + INTERVAL '1 day'`;
            params.push(dateTo);
            paramIndex++;
        }

        const query = `
            SELECT
                u.id as translator_id,
                u.username as translator_name,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) as letters,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat'), 0) as chats,
                COALESCE(COUNT(*), 0) as total_messages,
                COALESCE(AVG(a.response_time_sec), 0) as avg_response_time,
                CASE
                    WHEN COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) > 0
                    THEN ROUND((COUNT(DISTINCT a.man_id)::numeric / COUNT(*) FILTER (WHERE a.action_type = 'letter')) * 100, 1)
                    ELSE 0
                END as conversion,
                CASE
                    WHEN COUNT(*) > 0
                    THEN ROUND((COUNT(*) FILTER (WHERE a.used_ai = true)::numeric / COUNT(*)) * 100, 1)
                    ELSE 0
                END as ai_usage_percent
            FROM users u
            LEFT JOIN activity_log a ON a.translator_id = u.id ${dateFilter}
            WHERE u.role = 'translator' ${filter}
            GROUP BY u.id, u.username
            ORDER BY total_messages DESC NULLS LAST
        `;

        const result = await pool.query(query, params);

        const translators = result.rows.map(row => ({
            translator_id: row.translator_id,
            translator_name: row.translator_name,
            letters: parseInt(row.letters) || 0,
            chats: parseInt(row.chats) || 0,
            total_messages: parseInt(row.total_messages) || 0,
            avg_response_time: Math.round((parseFloat(row.avg_response_time) || 0) / 60),
            conversion: parseFloat(row.conversion) || 0,
            ai_usage_percent: parseFloat(row.ai_usage_percent) || 0
        }));

    res.json({ success: true, translators });
}));

/**
 * POST /api/stats/activity-ping
 * Записывает пинг активности пользователя (клики, печать)
 * Вызывается каждые 30 секунд если пользователь активен
 *
 * @body {number} userId - ID пользователя
 */
router.post('/activity-ping', asyncHandler(async (req, res) => {
    const { userId } = req.body;

    console.log(`📍 Activity ping received for user ${userId}`);

    if (!userId) {
        console.warn('⚠️ Activity ping: userId missing');
        return res.status(400).json({ success: false, error: 'userId required' });
    }

    // Проверяем что не дублируем пинг (минимум 20 секунд между пингами)
    const lastPing = await pool.query(`
        SELECT created_at FROM user_activity
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
    `, [userId]);

    if (lastPing.rows.length > 0) {
        const lastTime = new Date(lastPing.rows[0].created_at).getTime();
        const now = Date.now();
        if (now - lastTime < 20000) {
            // Слишком частый пинг, игнорируем
            console.log(`   ⏭️ Skipped (too frequent, ${Math.round((now - lastTime) / 1000)}s ago)`);
            return res.json({ success: true, skipped: true });
        }
    }

    await pool.query(`
        INSERT INTO user_activity (user_id, activity_type)
        VALUES ($1, 'active')
    `, [userId]);

    console.log(`   ✅ Activity ping saved for user ${userId}`);
    res.json({ success: true });
}));

/**
 * GET /api/stats/work-time
 * Расчёт времени работы переводчиков
 * Использует пинги активности (user_activity) - более точный метод
 * Fallback на activity_log если пингов нет
 * Сессия = непрерывная работа с перерывами не более 1 минуты
 *
 * @query {string} dateFrom - Начало периода
 * @query {string} dateTo - Конец периода
 * @query {string} translatorId - ID переводчика (опционально)
 */
router.get('/work-time', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, translatorId } = req.query;

    let filter = '';
    let params = [];
    let paramIndex = 1;

    if (dateFrom) {
        filter += ` AND ua.created_at >= $${paramIndex}::date`;
        params.push(dateFrom);
        paramIndex++;
    }
    if (dateTo) {
        filter += ` AND ua.created_at <= $${paramIndex}::date + INTERVAL '1 day'`;
        params.push(dateTo);
        paramIndex++;
    }
    if (translatorId) {
        filter += ` AND ua.user_id = $${paramIndex}`;
        params.push(translatorId);
        paramIndex++;
    }

    // Сначала пробуем получить данные из user_activity (новый метод)
    const activityQuery = `
        SELECT
            ua.user_id as translator_id,
            u.username as translator_name,
            ua.created_at
        FROM user_activity ua
        JOIN users u ON ua.user_id = u.id
        WHERE u.role = 'translator' ${filter}
        ORDER BY ua.user_id, ua.created_at
    `;

    let result = await pool.query(activityQuery, params);

    // Если нет данных в user_activity, используем старый метод (activity_log)
    if (result.rows.length === 0) {
        let oldFilter = filter.replace(/ua\./g, 'a.').replace(/ua\.user_id/g, 'a.translator_id');
        const oldQuery = `
            SELECT
                a.translator_id,
                u.username as translator_name,
                a.created_at
            FROM activity_log a
            JOIN users u ON a.translator_id = u.id
            WHERE a.translator_id IS NOT NULL ${oldFilter}
            ORDER BY a.translator_id, a.created_at
        `;
        result = await pool.query(oldQuery, params);
    }

    // Группируем по переводчику и считаем сессии
    const workTimeByTranslator = {};
    // 60 секунд таймаут для пингов (они приходят каждые 30 сек)
    const SESSION_TIMEOUT = 60 * 1000;

    for (const row of result.rows) {
        const tId = row.translator_id;
        const timestamp = new Date(row.created_at).getTime();

        if (!workTimeByTranslator[tId]) {
            workTimeByTranslator[tId] = {
                translator_id: tId,
                translator_name: row.translator_name,
                sessions: [],
                currentSession: { start: timestamp, end: timestamp }
            };
        }

        const translator = workTimeByTranslator[tId];
        const lastEnd = translator.currentSession.end;

        if (timestamp - lastEnd <= SESSION_TIMEOUT) {
            // Продолжаем текущую сессию
            translator.currentSession.end = timestamp;
        } else {
            // Начинаем новую сессию
            if (translator.currentSession.end > translator.currentSession.start) {
                translator.sessions.push(translator.currentSession);
            }
            translator.currentSession = { start: timestamp, end: timestamp };
        }
    }

    // Завершаем последние сессии
    for (const tId in workTimeByTranslator) {
        const translator = workTimeByTranslator[tId];
        if (translator.currentSession.end > translator.currentSession.start) {
            translator.sessions.push(translator.currentSession);
        }
    }

    // Считаем общее время работы
    const workTime = Object.values(workTimeByTranslator).map(t => {
        const totalMs = t.sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
        const totalMinutes = Math.round(totalMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return {
            translator_id: t.translator_id,
            translator_name: t.translator_name,
            total_minutes: totalMinutes,
            total_formatted: `${hours}ч ${minutes}м`,
            sessions_count: t.sessions.length
        };
    });

    res.json({ success: true, workTime });
}));

/**
 * GET /api/stats/last-responses
 * Возвращает последние ответы анкет на входящие письма от мужчин
 *
 * Логика:
 * 1. Берем входящие сообщения (incoming_messages)
 * 2. Для каждого ищем последующие исходящие (messages)
 * 3. Вычисляем время реакции от последнего входящего
 *
 * @query {string} userId - ID пользователя
 * @query {string} role - Роль (translator/admin/director)
 * @query {number} limit - Количество записей (по умолчанию 5)
 * @query {number} offset - Смещение для пагинации (по умолчанию 0)
 * @returns {Array} responses - Массив ответов
 */
router.get('/last-responses', asyncHandler(async (req, res) => {
    const { userId, role, limit = 5, offset = 0 } = req.query;
    const limitInt = parseInt(limit) || 5;
    const offsetInt = parseInt(offset) || 0;

    // Фильтр по ролям
    let roleFilter = '';
    let params = [limitInt, offsetInt];
    let paramIndex = 3;

    if (role === 'translator' && userId) {
        roleFilter = 'AND m.translator_id = $' + paramIndex;
        params.push(userId);
        paramIndex++;
    } else if (role === 'admin' && userId) {
        roleFilter = 'AND m.admin_id = $' + paramIndex;
        params.push(userId);
        paramIndex++;
    }
    // director видит все

    /**
     * Логика запроса:
     * 1. Берем все исходящие сообщения (messages где type='outgoing' или 'chat_msg')
     * 2. Для каждого находим последнее входящее от того же мужчины к той же анкете
     * 3. Вычисляем разницу времени (response_time_minutes)
     * 4. Фильтруем только те, где есть входящее (т.е. это ответы)
     * 5. Сортируем по времени ответа (самые новые сверху)
     */
    const query = `
        WITH outgoing_with_incoming AS (
            SELECT
                m.id,
                m.account_id,
                m.sender_id as man_id,
                m.timestamp as response_timestamp,
                m.type,
                mc.text_content as response_text,
                (
                    SELECT im.created_at
                    FROM incoming_messages im
                    WHERE im.profile_id = m.account_id
                        AND im.man_id = m.sender_id
                        AND im.created_at < m.timestamp
                    ORDER BY im.created_at DESC
                    LIMIT 1
                ) as last_incoming_timestamp,
                (
                    SELECT im.man_name
                    FROM incoming_messages im
                    WHERE im.profile_id = m.account_id
                        AND im.man_id = m.sender_id
                    ORDER BY im.created_at DESC
                    LIMIT 1
                ) as man_name,
                m.admin_id,
                m.translator_id,
                u_admin.username as admin_name,
                u_trans.username as translator_name
            FROM messages m
            LEFT JOIN message_content mc ON m.message_content_id = mc.id
            LEFT JOIN users u_admin ON m.admin_id = u_admin.id
            LEFT JOIN users u_trans ON m.translator_id = u_trans.id
            WHERE (m.type = 'outgoing' OR m.type = 'chat_msg')
                AND m.status = 'success'
                ${roleFilter}
        )
        SELECT
            id,
            account_id as profile_id,
            man_id,
            man_name,
            response_text,
            response_timestamp,
            last_incoming_timestamp,
            EXTRACT(EPOCH FROM (response_timestamp - last_incoming_timestamp))::INTEGER as response_time_seconds,
            type,
            admin_name,
            translator_name
        FROM outgoing_with_incoming
        WHERE last_incoming_timestamp IS NOT NULL
        ORDER BY response_timestamp DESC
        LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, params);

    const responses = result.rows.map(row => ({
        id: row.id,
        profileId: row.profile_id,
        manId: row.man_id,
        manName: row.man_name,
        responseText: row.response_text,
        responseTimestamp: row.response_timestamp,
        incomingTimestamp: row.last_incoming_timestamp,
        responseTimeSeconds: row.response_time_seconds,
        responseTimeFormatted: formatTime(row.response_time_seconds),
        type: row.type,
        adminName: row.admin_name,
        translatorName: row.translator_name
    }));

    res.json({ success: true, responses });
}));

/**
 * GET /api/stats/ai-usage
 * Возвращает статистику использования AI для массовых рассылок
 *
 * Логика:
 * 1. Группирует сообщения с usedAi=true по text_hash
 * 2. Считает количество получателей для каждого уникального текста
 * 3. Фильтрует только те, где получателей >= 10
 * 4. Возвращает с пагинацией
 *
 * @query {string} userId - ID пользователя
 * @query {string} role - Роль (translator/admin/director)
 * @query {number} limit - Количество записей (по умолчанию 5)
 * @query {number} offset - Смещение для пагинации (по умолчанию 0)
 * @returns {Array} aiUsage - Массив AI рассылок
 */
router.get('/ai-usage', asyncHandler(async (req, res) => {
    const { userId, role, limit = 5, offset = 0 } = req.query;
    const limitInt = parseInt(limit) || 5;
    const offsetInt = parseInt(offset) || 0;

    // Фильтр по ролям
    let roleFilter = '';
    let params = [limitInt, offsetInt];
    let paramIndex = 3;

    if (role === 'translator' && userId) {
        roleFilter = 'AND amm.translator_id = $' + paramIndex;
        params.push(userId);
        paramIndex++;
    } else if (role === 'admin' && userId) {
        roleFilter = 'AND amm.admin_id = $' + paramIndex;
        params.push(userId);
        paramIndex++;
    }

    /**
     * Запрос к таблице ai_mass_messages
     * Фильтрация: recipient_count >= 10
     * Сортировка: по времени первой отправки (самые новые сверху)
     */
    const query = `
        SELECT
            amm.id,
            amm.text_content,
            amm.recipient_count,
            amm.recipient_ids,
            amm.profile_id,
            amm.first_sent_at,
            amm.last_sent_at,
            amm.generation_session_id,
            u_admin.username as admin_name,
            u_trans.username as translator_name
        FROM ai_mass_messages amm
        LEFT JOIN users u_admin ON amm.admin_id = u_admin.id
        LEFT JOIN users u_trans ON amm.translator_id = u_trans.id
        WHERE amm.recipient_count >= 10
            ${roleFilter}
        ORDER BY amm.first_sent_at DESC
        LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, params);

    const aiUsage = result.rows.map(row => ({
        id: row.id,
        textContent: row.text_content,
        recipientCount: row.recipient_count,
        recipientIds: row.recipient_ids,
        profileId: row.profile_id,
        firstSentAt: row.first_sent_at,
        lastSentAt: row.last_sent_at,
        generationSessionId: row.generation_session_id,
        adminName: row.admin_name,
        translatorName: row.translator_name
    }));

    res.json({ success: true, aiUsage });
}));

/**
 * Вспомогательная функция для форматирования времени в читаемый вид
 */
function formatTime(seconds) {
    if (!seconds) return '0с';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let result = '';
    if (hours > 0) result += `${hours}ч `;
    if (minutes > 0) result += `${minutes}м `;
    if (secs > 0 || result === '') result += `${secs}с`;

    return result.trim();
}

module.exports = router;
