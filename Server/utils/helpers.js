const pool = require('../config/database');

// Цены для расчёта дохода
const PRICE_LETTER = 1.5;
const PRICE_CHAT = 0.15;

// Логирование ошибок в БД
async function logError(endpoint, errorType, errorMessage, details = null, userId = null) {
    try {
        await pool.query(`
            INSERT INTO error_logs (endpoint, error_type, error_message, details, user_id, timestamp)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [endpoint, errorType, errorMessage, JSON.stringify(details), userId]);
    } catch (e) {
        console.error('Failed to log error:', e.message);
    }
}

/**
 * Обёртка для async обработчиков роутов
 * Автоматически ловит ошибки и передаёт их в next()
 *
 * @param {Function} fn - async функция обработчика
 * @returns {Function} обёрнутый обработчик
 *
 * @example
 * router.get('/endpoint', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 * }));
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Глобальный обработчик ошибок Express
 * Единообразно обрабатывает все ошибки:
 * 1. Логирует в консоль
 * 2. Сохраняет в БД (error_logs)
 * 3. Возвращает JSON ответ клиенту
 *
 * @param {Error} err - объект ошибки
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next
 */
async function errorHandler(err, req, res, next) {
    // Определяем endpoint для логирования
    const endpoint = req.originalUrl || req.url || 'unknown';

    // Определяем userId из query или body
    const userId = req.query?.userId || req.body?.translatorId || req.body?.userId || null;

    // Определяем тип ошибки
    const errorType = err.code ? `DB_${err.code}` : 'ServerError';

    // Логируем в консоль
    console.error(`❌ [${endpoint}] ${err.message}`);

    // Логируем в БД (асинхронно, не блокируем ответ)
    logError(endpoint, errorType, err.message, {
        query: req.query,
        body: req.body,
        stack: err.stack
    }, userId);

    // HTTP статус: 400 для клиентских ошибок, 500 для серверных
    const status = err.status || err.statusCode || 500;

    // Возвращаем JSON ответ
    res.status(status).json({
        success: false,
        error: err.message,
        code: err.code || 'INTERNAL_ERROR'
    });
}

/**
 * Строит SQL-фильтр на основе роли пользователя
 * Централизует логику фильтрации данных по ролям (translator/admin/director)
 *
 * @param {string} role - Роль пользователя (translator/admin/director)
 * @param {string} userId - ID пользователя для фильтрации
 * @param {Object} options - Опции фильтрации:
 *   @param {string} options.table - Тип таблицы: 'profiles' или 'activity' (по умолчанию 'profiles')
 *   @param {string} options.alias - Алиас таблицы (по умолчанию 'p' для profiles, 'a' для activity)
 *   @param {string} options.prefix - Префикс: 'WHERE', 'AND' или '' (по умолчанию 'WHERE')
 *   @param {number} options.paramIndex - Номер параметра $N (по умолчанию 1)
 * @returns {Object} { filter: string, params: array, nextParamIndex: number }
 *
 * @example
 * // Для таблицы allowed_profiles
 * const { filter, params } = buildRoleFilter(role, userId);
 * // translator → { filter: 'WHERE p.assigned_translator_id = $1', params: [userId] }
 * // admin → { filter: 'WHERE p.assigned_admin_id = $1', params: [userId] }
 * // director → { filter: '', params: [] }
 *
 * @example
 * // Для таблицы activity_log с другим параметром
 * const { filter, params } = buildRoleFilter(role, userId, {
 *     table: 'activity',
 *     alias: 'a',
 *     prefix: 'AND',
 *     paramIndex: 2
 * });
 * // translator → { filter: 'AND a.translator_id = $2', params: [userId] }
 */
function buildRoleFilter(role, userId, options = {}) {
    const {
        table = 'profiles',
        alias = table === 'activity' ? 'a' : 'p',
        prefix = 'WHERE',
        paramIndex = 1
    } = options;

    // Director видит всё — фильтр пустой
    if (role === 'director' || !role) {
        return { filter: '', params: [], nextParamIndex: paramIndex };
    }

    // Определяем поле для фильтрации в зависимости от таблицы и роли
    let field;
    if (table === 'activity') {
        field = role === 'translator' ? 'translator_id' : 'admin_id';
    } else {
        field = role === 'translator' ? 'assigned_translator_id' : 'assigned_admin_id';
    }

    const condition = `${alias}.${field} = $${paramIndex}`;
    const filter = prefix ? `${prefix} ${condition}` : condition;

    return {
        filter,
        params: [userId],
        nextParamIndex: paramIndex + 1
    };
}

// Форматирование даты
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Получение начала текущего месяца
function getMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

module.exports = {
    PRICE_LETTER,
    PRICE_CHAT,
    logError,
    formatDate,
    getMonthStart,
    asyncHandler,
    errorHandler,
    buildRoleFilter
};
