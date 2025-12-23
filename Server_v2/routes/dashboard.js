/**
 * Dashboard Routes
 * Маршруты дашборда
 *
 * Эндпоинты:
 * - GET / - Основная сводка статистики для главной страницы
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler, buildRoleFilter, buildStatsFilter } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/dashboard
 * Возвращает полную сводку статистики для главной страницы дашборда
 *
 * @query {string} userId - ID текущего пользователя
 * @query {string} role - Роль пользователя (translator/admin/director)
 * @query {string} dateFrom - Начало периода (YYYY-MM-DD)
 * @query {string} dateTo - Конец периода (YYYY-MM-DD)
 * @query {string} filterAdminId - ID админа для фильтрации (опционально)
 * @query {string} filterTranslatorId - ID переводчика для фильтрации (опционально)
 * @returns {Object} dashboard - Объект со статистикой за выбранный период
 */
router.get('/', asyncHandler(async (req, res) => {
    const { userId, role, dateFrom, dateTo, filterAdminId, filterTranslatorId } = req.query;

    // Определяем период фильтрации
    // Если даты не переданы - используем текущий месяц
    const now = new Date();
    const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const periodFrom = dateFrom || defaultDateFrom;
    const periodTo = dateTo || defaultDateTo;

    // Формируем фильтры с учётом выбранного админа/переводчика
    const profileStatsFilter = buildStatsFilter({
        role, userId, filterAdminId, filterTranslatorId,
        table: 'profiles', prefix: 'WHERE', paramIndex: 1
    });
    const activityStatsFilter = buildStatsFilter({
        role, userId, filterAdminId, filterTranslatorId,
        table: 'activity', prefix: 'AND', paramIndex: 1
    });
    const profileFilter = profileStatsFilter.filter;
    const activityFilter = activityStatsFilter.filter;
    const params = profileStatsFilter.params;

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
     * Используем buildStatsFilter для фильтрации по админу/переводчику
     */
    let incomingParams = [periodFrom, periodTo];
    let incomingFilter = '';
    let incomingParamIndex = 3;

    // Строим фильтр с учётом выбранного админа/переводчика
    if (filterTranslatorId) {
        incomingFilter = `AND i.translator_id = $${incomingParamIndex}`;
        incomingParams.push(filterTranslatorId);
        incomingParamIndex++;
    } else if (filterAdminId) {
        // Фильтр по админу: админ напрямую ИЛИ переводчики этого админа
        incomingFilter = `AND (i.admin_id = $${incomingParamIndex} OR i.translator_id IN (SELECT id FROM users WHERE owner_id = $${incomingParamIndex}))`;
        incomingParams.push(filterAdminId);
        incomingParamIndex++;
    } else if (role === 'translator' && userId) {
        incomingFilter = `AND i.translator_id = $${incomingParamIndex}`;
        incomingParams.push(userId);
        incomingParamIndex++;
    } else if (role === 'admin' && userId) {
        incomingFilter = `AND i.admin_id = $${incomingParamIndex}`;
        incomingParams.push(userId);
        incomingParamIndex++;
    }
    // director видит все

    const incomingQuery = `
        SELECT
            -- Входящие письма (для обратной совместимости)
            COALESCE(COUNT(*) FILTER (WHERE i.type = 'letter'), 0) as incoming_letters,

            -- Всего входящих чатов (Y)
            COALESCE(COUNT(*) FILTER (WHERE i.type = 'chat'), 0) as incoming_chats_total,

            -- Отвеченные входящие чаты (X) - все сообщения от мужчин, которым мы ответили
            COALESCE(COUNT(*) FILTER (
                WHERE i.type = 'chat'
                AND EXISTS (
                    SELECT 1 FROM messages m
                    WHERE m.account_id = i.profile_id
                    AND m.sender_id = i.man_id
                    AND m.type = 'chat_msg'
                    AND m.status = 'success'
                )
            ), 0) as incoming_chats_answered,

            -- Уникальные мужчины из писем (X)
            COUNT(DISTINCT CASE WHEN i.type = 'letter' THEN i.man_id END) as unique_men_letters,

            -- Уникальные мужчины из чатов (Y)
            COUNT(DISTINCT CASE WHEN i.type = 'chat' THEN i.man_id END) as unique_men_chats,

            -- Старый формат для обратной совместимости
            COALESCE(COUNT(*) FILTER (WHERE i.is_first_from_man = true), 0) as unique_men
        FROM incoming_messages i
        WHERE i.created_at >= $1::date
          AND i.created_at < ($2::date + interval '1 day')
          ${incomingFilter}
    `;

    const incomingResult = await pool.query(incomingQuery, incomingParams);
    const incoming = incomingResult.rows[0] || {};

    /**
     * Запрос 7: Статистика чат-сессий (в минутах)
     *
     * Логика:
     * 1. Группируем входящие чаты по (man_id, profile_id)
     * 2. Если разрыв между сообщениями > 3 минут - это новая сессия
     * 3. Длительность сессии = CEIL((последнее - первое) / 60) + 1 минута базовая
     * 4. Проверяем был ли ответ от переводчика в пределах сессии (+5 мин после)
     */
    const chatSessionsQuery = `
        WITH chat_messages AS (
            -- Входящие чаты с определением разрывов между сообщениями
            SELECT
                i.id,
                i.profile_id,
                i.man_id,
                i.created_at,
                i.translator_id,
                -- Время предыдущего сообщения от того же мужчины к той же анкете
                LAG(i.created_at) OVER (
                    PARTITION BY i.man_id, i.profile_id
                    ORDER BY i.created_at
                ) as prev_message_at
            FROM incoming_messages i
            WHERE i.type = 'chat'
              AND i.created_at >= $1::date
              AND i.created_at < ($2::date + interval '1 day')
              ${incomingFilter.replace(/\bi\./g, 'i.')}
        ),
        session_boundaries AS (
            -- Определяем границы сессий (новая сессия если разрыв > 3 минут)
            SELECT
                *,
                CASE
                    WHEN prev_message_at IS NULL THEN 1
                    WHEN EXTRACT(EPOCH FROM (created_at - prev_message_at)) > 180 THEN 1
                    ELSE 0
                END as is_new_session
            FROM chat_messages
        ),
        sessions AS (
            -- Присваиваем номер сессии
            SELECT
                *,
                SUM(is_new_session) OVER (
                    PARTITION BY man_id, profile_id
                    ORDER BY created_at
                ) as session_num
            FROM session_boundaries
        ),
        session_stats AS (
            -- Статистика по каждой сессии
            SELECT
                profile_id,
                man_id,
                session_num,
                MIN(created_at) as session_start,
                MAX(created_at) as session_end,
                COUNT(*) as messages_in_session,
                -- Длительность = разница времени + 1 минута базовая
                GREATEST(1, CEIL(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60) + 1) as duration_minutes
            FROM sessions
            GROUP BY profile_id, man_id, session_num
        ),
        sessions_with_replies AS (
            -- Проверяем был ли ответ от переводчика
            SELECT
                ss.*,
                CASE WHEN EXISTS (
                    SELECT 1 FROM activity_log a
                    WHERE a.action_type = 'chat'
                      AND a.profile_id = ss.profile_id
                      AND a.man_id = ss.man_id
                      -- Ответ в пределах сессии или до 5 минут после окончания
                      AND a.created_at >= ss.session_start
                      AND a.created_at <= ss.session_end + interval '5 minutes'
                ) THEN true ELSE false END as was_replied
            FROM session_stats ss
        )
        SELECT
            COUNT(*) as total_sessions,
            COALESCE(ROUND(AVG(duration_minutes)::numeric, 1), 0) as avg_duration_minutes,
            COALESCE(SUM(duration_minutes), 0) as total_minutes,
            COUNT(*) FILTER (WHERE was_replied = true) as replied_sessions,
            COUNT(*) FILTER (WHERE was_replied = false) as unreplied_sessions
        FROM sessions_with_replies
    `;

    const chatSessionsResult = await pool.query(chatSessionsQuery, incomingParams);
    const chatSessions = chatSessionsResult.rows[0] || {};

    // ========== РАСЧЁТ ВРЕМЕНИ РАБОТЫ ПО ACTIVITY PINGS (ОПТИМИЗИРОВАНО) ==========
    // ОПТИМИЗАЦИЯ: Весь расчёт в SQL вместо загрузки всех записей в JS
    // Было: загрузка N записей + цикл в JS = O(N) память и время
    // Стало: один SQL запрос с window function = O(1) на клиенте

    /**
     * Функция расчета времени работы по пингам активности (SQL-оптимизированная)
     * Использует LAG window function для расчёта интервалов прямо в БД
     * Читает из activity_pings (привязка к profile_id), не из user_activity
     */
    async function calculateWorkTime(dateFrom, dateTo, options = {}) {
        const { userId, role, filterAdminId, filterTranslatorId } = options;
        let workTimeParams = [dateFrom, dateTo];
        let workTimeFilter = '';
        let paramIndex = 3;

        // Строим фильтр по анкетам (profile_id) с учётом роли пользователя
        if (filterTranslatorId) {
            // Фильтр по конкретному переводчику - его анкеты
            workTimeFilter = `AND ap.profile_id IN (SELECT profile_id FROM allowed_profiles WHERE assigned_translator_id = $${paramIndex})`;
            workTimeParams.push(filterTranslatorId);
            paramIndex++;
        } else if (filterAdminId) {
            // Фильтр по админу - его анкеты + анкеты его переводчиков
            workTimeFilter = `AND ap.profile_id IN (
                SELECT profile_id FROM allowed_profiles
                WHERE assigned_admin_id = $${paramIndex}
                   OR assigned_translator_id IN (SELECT id FROM users WHERE owner_id = $${paramIndex})
            )`;
            workTimeParams.push(filterAdminId);
            paramIndex++;
        } else if (userId && role === 'translator') {
            // Переводчик видит только свои анкеты
            workTimeFilter = `AND ap.profile_id IN (SELECT profile_id FROM allowed_profiles WHERE assigned_translator_id = $${paramIndex})`;
            workTimeParams.push(userId);
            paramIndex++;
        } else if (userId && role === 'admin') {
            // Админ видит свои анкеты + анкеты своих переводчиков
            workTimeFilter = `AND ap.profile_id IN (
                SELECT profile_id FROM allowed_profiles
                WHERE assigned_admin_id = $${paramIndex}
                   OR assigned_translator_id IN (SELECT id FROM users WHERE owner_id = $${paramIndex})
            )`;
            workTimeParams.push(userId);
            paramIndex++;
        }
        // Директор (role === 'director') видит все анкеты - фильтр не нужен

        let workTimeMinutes = 0;
        try {
            // Оптимизированный запрос: весь расчёт в SQL
            // Читаем из activity_pings (привязка к profile_id)
            const result = await pool.query(`
                WITH pings AS (
                    SELECT
                        ap.created_at,
                        LAG(ap.created_at) OVER (PARTITION BY ap.profile_id ORDER BY ap.created_at) as prev_created_at
                    FROM activity_pings ap
                    WHERE ap.created_at >= $1::date
                      AND ap.created_at < ($2::date + interval '1 day')
                      ${workTimeFilter}
                ),
                intervals AS (
                    SELECT
                        CASE
                            WHEN prev_created_at IS NULL THEN 30 -- первый пинг = 30 сек
                            WHEN EXTRACT(EPOCH FROM (created_at - prev_created_at)) <= 120
                                THEN EXTRACT(EPOCH FROM (created_at - prev_created_at))
                            ELSE 30 -- перерыв > 2 мин = считаем как новая сессия
                        END as seconds
                    FROM pings
                )
                SELECT COALESCE(ROUND(SUM(seconds) / 60), 0) as work_minutes FROM intervals
            `, workTimeParams);

            workTimeMinutes = parseInt(result.rows[0]?.work_minutes) || 0;
        } catch (e) {
            console.log('activity_pings query error:', e.message);
        }

        return workTimeMinutes;
    }

    // Время работы за выбранный период и за месяц - ПАРАЛЛЕЛЬНО
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [workTimeMinutes, workTimeMonthMinutes] = await Promise.all([
        calculateWorkTime(periodFrom, periodTo, { userId, role, filterAdminId, filterTranslatorId }),
        calculateWorkTime(monthStart, monthEnd, { userId, role, filterAdminId, filterTranslatorId })
    ]);

    const workTimeHours = Math.floor(workTimeMinutes / 60);
    const workTimeMins = workTimeMinutes % 60;
    const workTimeFormatted = `${workTimeHours}ч ${workTimeMins}м`;

    const workTimeMonthHours = Math.floor(workTimeMonthMinutes / 60);
    const workTimeMonthMins = workTimeMonthMinutes % 60;
    const workTimeMonthFormatted = `${workTimeMonthHours}ч ${workTimeMonthMins}м`;

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

    // Новые метрики для X/Y формата
    const incomingChatsTotal = parseInt(incoming.incoming_chats_total) || 0;
    const incomingChatsAnswered = parseInt(incoming.incoming_chats_answered) || 0;
    const uniqueMenLetters = parseInt(incoming.unique_men_letters) || 0;
    const uniqueMenChats = parseInt(incoming.unique_men_chats) || 0;

    // Метрики чат-сессий (в минутах)
    const chatSessionsTotal = parseInt(chatSessions.total_sessions) || 0;
    const chatSessionsAvgMinutes = parseFloat(chatSessions.avg_duration_minutes) || 0;
    const chatSessionsTotalMinutes = parseInt(chatSessions.total_minutes) || 0;
    const chatSessionsReplied = parseInt(chatSessions.replied_sessions) || 0;
    const chatSessionsUnreplied = parseInt(chatSessions.unreplied_sessions) || 0;

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

            // Новые метрики для X/Y отображения
            incomingChatsTotal: incomingChatsTotal,
            incomingChatsAnswered: incomingChatsAnswered,
            uniqueMenLetters: uniqueMenLetters,
            uniqueMenChats: uniqueMenChats,

            // Статистика чат-сессий (в минутах)
            // Сессия = группа сообщений от одного мужчины с разрывом < 3 мин
            chatSessions: {
                total: chatSessionsTotal,           // Всего сессий
                avgMinutes: chatSessionsAvgMinutes, // Среднее время сессии (минут)
                totalMinutes: chatSessionsTotalMinutes, // Всего минут
                replied: chatSessionsReplied,       // С ответом переводчика
                unreplied: chatSessionsUnreplied    // Без ответа
            },

            // Метрики
            metrics: {
                totalProfiles: totalProfiles,
                profilesOnline: profilesOnline,
                avgResponseTime: Math.round(avgResponseSec / 60),
                medianResponseTime: Math.round(medianResponseSec / 60),
                workTime: workTimeFormatted,
                workTimeMinutes: workTimeMinutes,
                workTimeMonth: workTimeMonthFormatted,
                workTimeMonthMinutes: workTimeMonthMinutes
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
    const { userId, role, dateFrom, dateTo } = req.query;

    const total = await pool.query('SELECT COUNT(*) as cnt FROM incoming_messages');
    const byType = await pool.query('SELECT type, COUNT(*) as cnt FROM incoming_messages GROUP BY type');
    // Показываем admin_id и translator_id чтобы понять фильтрацию
    const recent = await pool.query('SELECT profile_id, man_id, type, admin_id, translator_id, created_at FROM incoming_messages ORDER BY created_at DESC LIMIT 10');
    const dateRange = await pool.query('SELECT MIN(created_at) as min_date, MAX(created_at) as max_date FROM incoming_messages');

    // Проверяем фильтрацию как в основном запросе
    const now = new Date();
    const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const periodFrom = dateFrom || defaultDateFrom;
    const periodTo = dateTo || defaultDateTo;

    let testParams = [periodFrom, periodTo];
    let testWhere = '';
    if (role === 'translator' && userId) {
        testWhere = 'AND translator_id = $3';
        testParams.push(userId);
    } else if (role === 'admin' && userId) {
        testWhere = 'AND admin_id = $3';
        testParams.push(userId);
    }

    const filtered = await pool.query(`
        SELECT COUNT(*) as cnt FROM incoming_messages
        WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day') ${testWhere}
    `, testParams);

    res.json({
        requestParams: { userId, role, periodFrom, periodTo },
        total: total.rows[0].cnt,
        filteredByPeriodAndRole: filtered.rows[0].cnt,
        byType: byType.rows,
        recent: recent.rows,
        dateRange: dateRange.rows[0]
    });
}));

module.exports = router;
