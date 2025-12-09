/**
 * Dashboard Routes
 * Маршруты дашборда
 *
 * Эндпоинты:
 * - GET / - Основная сводка статистики для главной страницы
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler, buildRoleFilter } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/dashboard
 * Возвращает полную сводку статистики для главной страницы дашборда
 *
 * @query {string} userId - ID текущего пользователя
 * @query {string} role - Роль пользователя (translator/admin/director)
 * @query {string} dateFrom - Начало периода (YYYY-MM-DD)
 * @query {string} dateTo - Конец периода (YYYY-MM-DD)
 * @returns {Object} dashboard - Объект со статистикой за выбранный период
 */
router.get('/', asyncHandler(async (req, res) => {
    const { userId, role, dateFrom, dateTo } = req.query;

    // Определяем период фильтрации
    // Если даты не переданы - используем текущий месяц
    const now = new Date();
    const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const periodFrom = dateFrom || defaultDateFrom;
    const periodTo = dateTo || defaultDateTo;

    // Формируем фильтры для разных таблиц в зависимости от роли
    const profileRoleFilter = buildRoleFilter(role, userId, { table: 'profiles', prefix: 'WHERE' });
    const activityRoleFilter = buildRoleFilter(role, userId, { table: 'activity', prefix: 'AND' });
    const profileFilter = profileRoleFilter.filter;
    const activityFilter = activityRoleFilter.filter;
    const params = profileRoleFilter.params; // Одинаковые params для обоих фильтров

    // Определяем индекс для параметров дат в зависимости от наличия userId
    const hasUserParam = params.length > 0;
    const dateParamStart = hasUserParam ? 2 : 1;
    const paramsWithDates = hasUserParam ? [params[0], periodFrom, periodTo] : [periodFrom, periodTo];

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
     * Запрос 3: Статистика AI генераций за выбранный период
     */
    let aiQuery, aiParams;
    if (hasUserParam) {
        aiQuery = `
            SELECT
                COUNT(*) FILTER (WHERE used_ai = true) as ai_count,
                COUNT(*) as total_count
            FROM activity_log a
            WHERE a.created_at >= $2::date
              AND a.created_at < ($3::date + interval '1 day')
              ${activityFilter}
        `;
        aiParams = paramsWithDates;
    } else {
        aiQuery = `
            SELECT
                COUNT(*) FILTER (WHERE used_ai = true) as ai_count,
                COUNT(*) as total_count
            FROM activity_log a
            WHERE a.created_at >= $1::date
              AND a.created_at < ($2::date + interval '1 day')
        `;
        aiParams = [periodFrom, periodTo];
    }
    const aiResult = await pool.query(aiQuery, aiParams);
    const aiStats = aiResult.rows[0] || {};

    /**
     * Запрос 4: Основная статистика сообщений за выбранный период
     */
    let statsQuery, statsParams;
    if (hasUserParam) {
        statsQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) as letters_count,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat'), 0) as chats_count,
                COUNT(DISTINCT a.man_id) as unique_men,
                COALESCE(AVG(a.response_time_sec), 0) as avg_response_seconds,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a.response_time_sec), 0) as median_response_seconds
            FROM activity_log a
            WHERE a.created_at >= $2::date
              AND a.created_at < ($3::date + interval '1 day')
              ${activityFilter}
        `;
        statsParams = paramsWithDates;
    } else {
        statsQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) as letters_count,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat'), 0) as chats_count,
                COUNT(DISTINCT a.man_id) as unique_men,
                COALESCE(AVG(a.response_time_sec), 0) as avg_response_seconds,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a.response_time_sec), 0) as median_response_seconds
            FROM activity_log a
            WHERE a.created_at >= $1::date
              AND a.created_at < ($2::date + interval '1 day')
        `;
        statsParams = [periodFrom, periodTo];
    }
    const statsResult = await pool.query(statsQuery, statsParams);
    const stats = statsResult.rows[0] || {};

    /**
     * Запрос 5: Количество ошибок за выбранный период
     */
    const errorsQuery = `
        SELECT COUNT(*) as errors_count
        FROM error_logs
        WHERE timestamp >= $1::date AND timestamp < ($2::date + interval '1 day')
    `;
    const errorsResult = await pool.query(errorsQuery, [periodFrom, periodTo]);
    const errors = errorsResult.rows[0] || {};

    /**
     * Запрос 6: Входящие сообщения от мужчин за выбранный период
     */
    let incomingWhereClause = '';
    let incomingParams = [periodFrom, periodTo];

    if (role === 'translator' && userId) {
        incomingWhereClause = `AND i.translator_id = $3`;
        incomingParams.push(userId);
    } else if (role === 'admin' && userId) {
        incomingWhereClause = `AND i.admin_id = $3`;
        incomingParams.push(userId);
    }

    const incomingQuery = `
        SELECT
            COALESCE(COUNT(*) FILTER (WHERE i.type = 'letter'), 0) as incoming_letters,
            COALESCE(COUNT(*) FILTER (WHERE i.type = 'chat'), 0) as incoming_chats,
            COALESCE(COUNT(*) FILTER (WHERE i.is_first_from_man = true), 0) as unique_men
        FROM incoming_messages i
        WHERE i.created_at >= $1::date
          AND i.created_at < ($2::date + interval '1 day')
          ${incomingWhereClause}
    `;

    // DEBUG: Логируем запрос входящих
    console.log('📊 DEBUG incoming_messages:');
    console.log('   Query params:', incomingParams);
    console.log('   Role:', role, 'UserId:', userId);
    console.log('   Period:', periodFrom, '-', periodTo);

    // Также проверим сколько всего записей в таблице
    const totalIncoming = await pool.query('SELECT COUNT(*) as total FROM incoming_messages');
    console.log('   Total records in incoming_messages:', totalIncoming.rows[0].total);

    // И проверим записи за последний месяц без фильтра по датам
    const recentIncoming = await pool.query(`
        SELECT type, COUNT(*) as cnt, MIN(created_at) as min_date, MAX(created_at) as max_date
        FROM incoming_messages
        GROUP BY type
    `);
    console.log('   Records by type:', JSON.stringify(recentIncoming.rows));

    const incomingResult = await pool.query(incomingQuery, incomingParams);
    const incoming = incomingResult.rows[0] || {};

    console.log('   Query result:', JSON.stringify(incoming));

    // Преобразуем значения
    const lettersCount = parseInt(stats.letters_count) || 0;
    const chatsCount = parseInt(stats.chats_count) || 0;
    const uniqueMenCount = parseInt(stats.unique_men) || 0;
    const avgResponseSec = parseFloat(stats.avg_response_seconds) || 0;
    const medianResponseSec = parseFloat(stats.median_response_seconds) || 0;
    const incomingLettersCount = parseInt(incoming.incoming_letters) || 0;
    const incomingChatsCount = parseInt(incoming.incoming_chats) || 0;
    const incomingUniqueMen = parseInt(incoming.unique_men) || 0;
    const errorsCount = parseInt(errors.errors_count) || 0;

    // Формируем ответ с данными за выбранный период
    res.json({
        success: true,
        dashboard: {
            // Период за который данные
            period: {
                from: periodFrom,
                to: periodTo
            },
            // Данные за выбранный период (новая структура)
            letters: lettersCount,
            chats: chatsCount,
            incomingLetters: incomingLettersCount,
            incomingChats: incomingChatsCount,
            uniqueMen: incomingUniqueMen,
            errors: errorsCount,
            // Метрики
            metrics: {
                totalProfiles: totalProfiles,
                profilesOnline: profilesOnline,
                avgResponseTime: Math.round(avgResponseSec / 60),
                medianResponseTime: Math.round(medianResponseSec / 60)
            },
            // AI статистика
            ai: {
                count: parseInt(aiStats.ai_count) || 0,
                total: parseInt(aiStats.total_count) || 0,
                percent: aiStats.total_count > 0
                    ? Math.round((aiStats.ai_count / aiStats.total_count) * 100)
                    : 0
            },
            // Для обратной совместимости оставляем старую структуру
            today: {
                letters: lettersCount,
                chats: chatsCount,
                incomingLetters: incomingLettersCount,
                incomingChats: incomingChatsCount,
                uniqueMen: incomingUniqueMen,
                errors: errorsCount
            },
            yesterday: {
                letters: 0,
                chats: 0,
                incomingLetters: 0,
                incomingChats: 0
            },
            week: {
                letters: lettersCount,
                chats: chatsCount,
                incomingLetters: incomingLettersCount,
                incomingChats: incomingChatsCount,
                uniqueMen: incomingUniqueMen,
                errors: errorsCount
            },
            month: {
                letters: lettersCount,
                chats: chatsCount,
                incomingLetters: incomingLettersCount,
                incomingChats: incomingChatsCount,
                uniqueMen: incomingUniqueMen
            }
        }
    });
}));

/**
 * GET /api/dashboard/debug-incoming
 * Тестовый эндпоинт для проверки данных incoming_messages
 */
router.get('/debug-incoming', asyncHandler(async (req, res) => {
    const total = await pool.query('SELECT COUNT(*) as cnt FROM incoming_messages');
    const byType = await pool.query('SELECT type, COUNT(*) as cnt FROM incoming_messages GROUP BY type');
    const recent = await pool.query('SELECT profile_id, man_id, type, created_at FROM incoming_messages ORDER BY created_at DESC LIMIT 10');
    const dateRange = await pool.query('SELECT MIN(created_at) as min_date, MAX(created_at) as max_date FROM incoming_messages');

    res.json({
        total: total.rows[0].cnt,
        byType: byType.rows,
        recent: recent.rows,
        dateRange: dateRange.rows[0]
    });
}));

module.exports = router;
