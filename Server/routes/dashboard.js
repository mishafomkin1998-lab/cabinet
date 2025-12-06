/**
 * Dashboard Routes
 * Маршруты дашборда
 */

const express = require('express');
const pool = require('../config/database');
const { logError } = require('../utils/helpers');

const router = express.Router();

// Сводка для дашборда
router.get('/', async (req, res) => {
    const { userId, role } = req.query;

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

        // Количество анкет (всего)
        const profilesQuery = `
            SELECT COUNT(*) as total_profiles
            FROM allowed_profiles p
            ${profileFilter}
        `;
        const profilesResult = await pool.query(profilesQuery, params);
        const totalProfiles = parseInt(profilesResult.rows[0]?.total_profiles) || 0;

        // Онлайн анкеты (heartbeat за последние 2 минуты)
        const onlineQuery = `
            SELECT COUNT(DISTINCT h.account_display_id) as online_count
            FROM heartbeats h
            JOIN allowed_profiles p ON h.account_display_id = p.profile_id
            WHERE h.timestamp > NOW() - INTERVAL '2 minutes'
            ${profileFilter ? profileFilter.replace('WHERE', 'AND') : ''}
        `;
        const onlineResult = await pool.query(onlineQuery, params);
        const profilesOnline = parseInt(onlineResult.rows[0]?.online_count) || 0;

        // Генерации ИИ
        const aiQuery = `
            SELECT
                COUNT(*) FILTER (WHERE used_ai = true AND DATE(created_at) = CURRENT_DATE) as ai_today,
                COUNT(*) FILTER (WHERE used_ai = true AND created_at >= CURRENT_DATE - INTERVAL '7 days') as ai_week,
                COUNT(*) FILTER (WHERE used_ai = true AND created_at >= CURRENT_DATE - INTERVAL '30 days') as ai_month,
                COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as total_today,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as total_week
            FROM activity_log a
            WHERE 1=1 ${activityFilter}
        `;
        const aiResult = await pool.query(aiQuery, params);
        const aiStats = aiResult.rows[0] || {};

        // Статистика из activity_log
        const statsQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE), 0) as letters_today,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE), 0) as chats_today,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE - 1), 0) as letters_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE - 1), 0) as chats_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as letters_week,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as chats_week,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as letters_month,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as chats_month,
                COUNT(DISTINCT CASE WHEN DATE(a.created_at) = CURRENT_DATE THEN a.man_id END) as unique_men_today,
                COUNT(DISTINCT CASE WHEN a.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN a.man_id END) as unique_men_week,
                COUNT(DISTINCT CASE WHEN a.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN a.man_id END) as unique_men_month,
                COALESCE(AVG(a.response_time_sec) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as avg_response_seconds,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a.response_time_sec) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as median_response_seconds
            FROM activity_log a
            WHERE 1=1 ${activityFilter}
        `;

        const statsResult = await pool.query(statsQuery, params);
        const stats = statsResult.rows[0] || {};

        // Ошибки
        const errorsQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE DATE(timestamp) = CURRENT_DATE), 0) as errors_today,
                COALESCE(COUNT(*) FILTER (WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'), 0) as errors_week
            FROM error_logs
        `;
        const errorsResult = await pool.query(errorsQuery);
        const errors = errorsResult.rows[0] || {};

        // Используем данные из activity_log
        const lettersToday = parseInt(stats.letters_today) || 0;
        const chatsToday = parseInt(stats.chats_today) || 0;
        const lettersYesterday = parseInt(stats.letters_yesterday) || 0;
        const chatsYesterday = parseInt(stats.chats_yesterday) || 0;
        const lettersWeek = parseInt(stats.letters_week) || 0;
        const chatsWeek = parseInt(stats.chats_week) || 0;
        const lettersMonth = parseInt(stats.letters_month) || 0;
        const chatsMonth = parseInt(stats.chats_month) || 0;

        const avgResponseSec = parseFloat(stats.avg_response_seconds) || 0;
        const medianResponseSec = parseFloat(stats.median_response_seconds) || 0;

        res.json({
            success: true,
            dashboard: {
                today: {
                    letters: lettersToday,
                    chats: chatsToday,
                    uniqueMen: parseInt(stats.unique_men_today) || 0,
                    errors: parseInt(errors.errors_today) || 0
                },
                yesterday: {
                    letters: lettersYesterday,
                    chats: chatsYesterday
                },
                week: {
                    letters: lettersWeek,
                    chats: chatsWeek,
                    uniqueMen: parseInt(stats.unique_men_week) || 0,
                    errors: parseInt(errors.errors_week) || 0
                },
                month: {
                    letters: lettersMonth,
                    chats: chatsMonth,
                    uniqueMen: parseInt(stats.unique_men_month) || 0
                },
                metrics: {
                    totalProfiles: totalProfiles,
                    profilesOnline: profilesOnline,
                    avgResponseTime: Math.round(avgResponseSec / 60),
                    medianResponseTime: Math.round(medianResponseSec / 60)
                },
                ai: {
                    today: parseInt(aiStats.ai_today) || 0,
                    week: parseInt(aiStats.ai_week) || 0,
                    month: parseInt(aiStats.ai_month) || 0,
                    percentToday: aiStats.total_today > 0
                        ? Math.round((aiStats.ai_today / aiStats.total_today) * 100)
                        : 0,
                    percentWeek: aiStats.total_week > 0
                        ? Math.round((aiStats.ai_week / aiStats.total_week) * 100)
                        : 0
                }
            }
        });

    } catch (e) {
        console.error('Dashboard error:', e.message);
        await logError('/api/dashboard', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// Любимые шаблоны
router.get('/favorite-templates', async (req, res) => {
    try {
        res.json({ success: true, templates: [] });
    } catch (e) {
        console.error('Favorite templates error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
