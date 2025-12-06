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
    getMonthStart
};
