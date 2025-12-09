// ==========================================
// UTILS/LOGGER.JS - Функция логирования ошибок
// ==========================================

const pool = require('../config/database');

async function logError(endpoint, errorType, message, rawData, userId) {
    try {
        await pool.query(
            `INSERT INTO error_logs (endpoint, error_type, message, raw_data, user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [endpoint, errorType, message, rawData || null, userId || null]
        );
    } catch (e) {
        console.error('Критическая ошибка записи лога:', e.message);
    }
}

module.exports = { logError };
