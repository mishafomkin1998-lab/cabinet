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
    errorHandler
};
