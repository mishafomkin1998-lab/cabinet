/**
 * Statistics Routes
 * Маршруты статистики
 */

const express = require('express');
const pool = require('../config/database');
const { logError } = require('../utils/helpers');
const { PRICE_LETTER, PRICE_CHAT } = require('../migrations');

const router = express.Router();

// Детальная статистика
router.get('/detailed', async (req, res) => {
    const { userId, role } = req.query;

    try {
        let filter = "";
        let params = [];

        if (role === 'translator') {
            filter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        } else if (role === 'admin') {
            filter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        }

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

        const earnings = (parseFloat(stats.letters_count) * PRICE_LETTER) + (parseFloat(stats.chats_count) * PRICE_CHAT);
        const totalSent = parseFloat(stats.first_messages);
        const totalConv = parseFloat(stats.total_conversations);
        const replyRate = totalSent > 0 ? ((totalConv / totalSent) * 100).toFixed(1) : 0;
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
                money: earnings.toFixed(2),
                avgResponseTime: Math.round(stats.avg_response_seconds / 60) || 0,
                totalConversations: parseInt(stats.total_conversations) || 0,
                replyRate: replyRate,
                avgConvLength: avgConvLength,
                firstMessages: parseInt(stats.first_messages) || 0,
                lastMessages: parseInt(stats.last_messages) || 0
            }
        });

    } catch (e) {
        await logError('/api/stats/detailed', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// Статистика по дням
router.get('/daily', async (req, res) => {
    const { userId, role } = req.query;
    const days = parseInt(req.query.days) || 30;

    try {
        let profileFilter = "";
        let params = [days];

        if (role === 'translator') {
            profileFilter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            profileFilter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

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
    } catch (e) {
        console.error('Daily stats error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Топ анкет
router.get('/top-profiles', async (req, res) => {
    const { userId, role, limit = 10 } = req.query;
    try {
        let filter = "";
        let params = [limit];

        if (role === 'translator') {
            filter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            filter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

        const query = `
            SELECT
                p.profile_id,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats,
                COUNT(DISTINCT m.sender_id) as unique_men,
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} +
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as income,
                MAX(m.timestamp) as last_activity
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            WHERE m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ${filter}
            GROUP BY p.profile_id, p.id
            ORDER BY income DESC
            LIMIT $1
        `;

        const result = await pool.query(query, params);
        res.json({ success: true, profiles: result.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Статистика по переводчикам
router.get('/translators', async (req, res) => {
    const { userId, role } = req.query;
    try {
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
                (COUNT(DISTINCT CASE WHEN m.type = 'outgoing' THEN m.id END) * ${PRICE_LETTER} +
                 COUNT(DISTINCT CASE WHEN m.type = 'chat_msg' THEN m.id END) * ${PRICE_CHAT}) as total_income,
                MAX(m.timestamp) as last_activity
            FROM users u
            LEFT JOIN allowed_profiles p ON u.id = p.assigned_translator_id
            LEFT JOIN messages m ON p.profile_id = m.account_id
                AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ${filter}
            GROUP BY u.id, u.username
            ORDER BY total_income DESC NULLS LAST
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
            totalIncome: parseFloat(t.total_income || 0).toFixed(2),
            lastActivity: t.last_activity,
            efficiency: t.profiles_count > 0 ? ((parseFloat(t.total_income || 0) / t.profiles_count) * 100).toFixed(1) : 0
        }));

        res.json({ success: true, translators });
    } catch (e) { await logError('/api/stats/translators', 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// Статистика по админам
router.get('/admins', async (req, res) => {
    const { userId, role } = req.query;

    if (role !== 'director') {
        return res.json({ success: true, admins: [] });
    }

    try {
        const query = `
            SELECT
                u.id,
                u.username,
                COUNT(DISTINCT t.id) as translators_count,
                COUNT(DISTINCT p.id) as total_profiles,
                SUM(stats.letters) as total_letters,
                SUM(stats.chats) as total_chats,
                SUM(stats.income) as team_income,
                COALESCE(AVG(stats.avg_response), 0) as avg_team_response
            FROM users u
            LEFT JOIN users t ON u.id = t.owner_id AND t.role = 'translator'
            LEFT JOIN allowed_profiles p ON u.id = p.assigned_admin_id
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters,
                    COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats,
                    (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} +
                     COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as income,
                    COALESCE(AVG(m.response_time), 0) as avg_response
                FROM messages m
                WHERE m.account_id = p.profile_id
                    AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ) stats ON true
            WHERE u.role = 'admin'
            GROUP BY u.id, u.username
            ORDER BY team_income DESC NULLS LAST
        `;

        const result = await pool.query(query);

        const admins = result.rows.map(a => ({
            id: a.id,
            username: a.username,
            translatorsCount: a.translators_count || 0,
            totalProfiles: a.total_profiles || 0,
            totalLetters: a.total_letters || 0,
            totalChats: a.total_chats || 0,
            teamIncome: parseFloat(a.team_income || 0).toFixed(2),
            avgTeamResponse: Math.round(a.avg_team_response / 60) || 0,
            efficiencyPerTranslator: a.translators_count > 0
                ? (parseFloat(a.team_income || 0) / a.translators_count).toFixed(2)
                : 0
        }));

        res.json({ success: true, admins });
    } catch (e) { await logError('/api/stats/admins', 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// Детали по анкете
router.get('/profile/:profileId', async (req, res) => {
    const { profileId } = req.params;
    const { userId, role } = req.query;

    try {
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
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} +
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as total_income,
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
            totalIncome: parseFloat(profile.total_income || 0).toFixed(2),
            avgResponseTime: Math.round(profile.avg_response_seconds / 60) || 0,
            lastActivity: profile.last_activity,
            firstActivity: profile.first_activity,
            firstMessagesSent: profile.first_messages_sent || 0,
            conversationsEnded: profile.conversations_ended || 0,
            replyRate: profile.first_messages_sent > 0
                ? ((profile.total_conversations / profile.first_messages_sent) * 100).toFixed(1)
                : 0,
            avgIncomePerMan: profile.total_men > 0
                ? (parseFloat(profile.total_income || 0) / profile.total_men).toFixed(2)
                : 0
        };

        res.json({ success: true, profile: stats });
    } catch (e) { await logError(`/api/stats/profile/${profileId}`, 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// Прогноз дохода
router.get('/forecast', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'translator') {
            filter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        } else if (role === 'admin') {
            filter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        }

        const query = `
            SELECT
                SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) as week_income,
                SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) as month_income,
                COALESCE(SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) / 7, 0) as avg_daily_income_7d,
                (SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) /
                 NULLIF(SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '14 days'
                                 AND m.timestamp < CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END), 0) - 1) * 100 as growth_percent
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            ${filter}
        `;

        const result = await pool.query(query, params);
        const data = result.rows[0];

        const forecast = {
            weekIncome: parseFloat(data.week_income || 0).toFixed(2),
            monthIncome: parseFloat(data.month_income || 0).toFixed(2),
            avgDailyIncome: parseFloat(data.avg_daily_income_7d || 0).toFixed(2),
            growthPercent: data.growth_percent ? parseFloat(data.growth_percent).toFixed(1) : 0,
            monthForecast: (parseFloat(data.avg_daily_income_7d || 0) * 30).toFixed(2),
            weekForecast: (parseFloat(data.avg_daily_income_7d || 0) * 7).toFixed(2)
        };

        res.json({ success: true, forecast });
    } catch (e) { await logError('/api/stats/forecast', 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// Активность по часам
router.get('/hourly-activity', async (req, res) => {
    const { userId, role } = req.query;
    const days = parseInt(req.query.days) || 7;

    try {
        let activityFilter = "";
        let msgFilter = "";
        let params = [days];

        if (role === 'translator') {
            activityFilter = `AND a.translator_id = $2`;
            msgFilter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            activityFilter = `AND a.admin_id = $2`;
            msgFilter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

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
    } catch (e) {
        console.error('Hourly activity error:', e.message);
        await logError('/api/stats/hourly-activity', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// Статистика по админам (GET /api/stats/by-admin)
router.get('/by-admin', async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    try {
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
                COALESCE(SUM(a.income), 0) as income,
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
            ORDER BY income DESC NULLS LAST
        `;

        const result = await pool.query(query, params);

        const admins = result.rows.map(row => ({
            admin_id: row.admin_id,
            admin_name: row.admin_name,
            letters: parseInt(row.letters) || 0,
            chats: parseInt(row.chats) || 0,
            income: parseFloat(row.income || 0).toFixed(2),
            avg_response_time: Math.round((parseFloat(row.avg_response_time) || 0) / 60),
            conversion: parseFloat(row.conversion) || 0
        }));

        res.json({ success: true, admins });
    } catch (e) {
        console.error('Stats by admin error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Статистика по переводчикам (GET /api/stats/by-translator)
router.get('/by-translator', async (req, res) => {
    const { adminId, dateFrom, dateTo } = req.query;

    try {
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
                COALESCE(SUM(a.income), 0) as income,
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
            ORDER BY income DESC NULLS LAST
        `;

        const result = await pool.query(query, params);

        const translators = result.rows.map(row => ({
            translator_id: row.translator_id,
            translator_name: row.translator_name,
            letters: parseInt(row.letters) || 0,
            chats: parseInt(row.chats) || 0,
            income: parseFloat(row.income || 0).toFixed(2),
            avg_response_time: Math.round((parseFloat(row.avg_response_time) || 0) / 60),
            conversion: parseFloat(row.conversion) || 0,
            ai_usage_percent: parseFloat(row.ai_usage_percent) || 0
        }));

        res.json({ success: true, translators });
    } catch (e) {
        console.error('Stats by translator error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
