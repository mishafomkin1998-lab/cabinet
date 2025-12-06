/**
 * Dashboard Routes
 * Маршруты дашборда
 *
 * Эндпоинты:
 * - GET / - Основная сводка статистики для главной страницы
 * - GET /favorite-templates - Избранные шаблоны сообщений (заглушка)
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/dashboard
 * Возвращает полную сводку статистики для главной страницы дашборда
 *
 * @query {string} userId - ID текущего пользователя
 * @query {string} role - Роль пользователя (translator/admin/director)
 * @returns {Object} dashboard - Объект со статистикой:
 *   - today: статистика за сегодня
 *   - yesterday: статистика за вчера
 *   - week: статистика за 7 дней
 *   - month: статистика за 30 дней
 *   - metrics: общие метрики (кол-во анкет, онлайн, время ответа)
 *   - ai: статистика использования AI генерации
 */
router.get('/', asyncHandler(async (req, res) => {
    const { userId, role } = req.query;

    // Формируем фильтры для разных таблиц в зависимости от роли
        // profileFilter - для таблицы allowed_profiles
        // activityFilter - для таблицы activity_log
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
        // Для director фильтры остаются пустыми - видит всё

        /**
         * Запрос 1: Количество анкет
         * Простой COUNT по таблице allowed_profiles с учётом фильтра по роли
         */
        const profilesQuery = `
            SELECT COUNT(*) as total_profiles
            FROM allowed_profiles p
            ${profileFilter}
        `;
        const profilesResult = await pool.query(profilesQuery, params);
        const totalProfiles = parseInt(profilesResult.rows[0]?.total_profiles) || 0;

        /**
         * Запрос 2: Онлайн анкеты
         * Считаем уникальные анкеты, у которых был heartbeat за последние 2 минуты.
         * Это показывает, сколько анкет сейчас активно работают в боте.
         */
        const onlineQuery = `
            SELECT COUNT(DISTINCT h.account_display_id) as online_count
            FROM heartbeats h
            JOIN allowed_profiles p ON h.account_display_id = p.profile_id
            WHERE h.timestamp > NOW() - INTERVAL '2 minutes'
            ${profileFilter ? profileFilter.replace('WHERE', 'AND') : ''}
        `;
        const onlineResult = await pool.query(onlineQuery, params);
        const profilesOnline = parseInt(onlineResult.rows[0]?.online_count) || 0;

        /**
         * Запрос 3: Статистика AI генераций
         * - ai_today: сколько сообщений с AI сегодня
         * - ai_week/ai_month: за неделю/месяц
         * - total_today/total_week: всего сообщений (для расчёта процента)
         */
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

        /**
         * Запрос 4: Основная статистика сообщений
         * Большой агрегированный запрос, который считает:
         * - letters/chats за сегодня, вчера, неделю, месяц
         * - уникальных мужчин за разные периоды
         * - среднее и медианное время ответа
         *
         * FILTER (WHERE ...) - PostgreSQL синтаксис для условной агрегации
         * PERCENTILE_CONT - вычисление медианы (50-й перцентиль)
         */
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

        /**
         * Запрос 5: Количество ошибок
         * Считаем ошибки за сегодня и неделю для отображения в дашборде
         */
        const errorsQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE DATE(timestamp) = CURRENT_DATE), 0) as errors_today,
                COALESCE(COUNT(*) FILTER (WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'), 0) as errors_week
            FROM error_logs
        `;
        const errorsResult = await pool.query(errorsQuery);
        const errors = errorsResult.rows[0] || {};

        // Преобразуем строковые значения в числа
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

        // Формируем ответ с группировкой по периодам
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
                    avgResponseTime: Math.round(avgResponseSec / 60), // конвертируем секунды в минуты
                    medianResponseTime: Math.round(medianResponseSec / 60)
                },
                ai: {
                    today: parseInt(aiStats.ai_today) || 0,
                    week: parseInt(aiStats.ai_week) || 0,
                    month: parseInt(aiStats.ai_month) || 0,
                    // Процент AI от всех сообщений
                    percentToday: aiStats.total_today > 0
                        ? Math.round((aiStats.ai_today / aiStats.total_today) * 100)
                        : 0,
                    percentWeek: aiStats.total_week > 0
                        ? Math.round((aiStats.ai_week / aiStats.total_week) * 100)
                        : 0
                }
            }
        });
}));

/**
 * GET /api/favorite-templates
 * Возвращает избранные шаблоны сообщений пользователя
 * TODO: Реализовать хранение и получение шаблонов из БД
 */
router.get('/favorite-templates', asyncHandler(async (req, res) => {
    // Заглушка - пока возвращаем пустой массив
    res.json({ success: true, templates: [] });
}));

module.exports = router;
