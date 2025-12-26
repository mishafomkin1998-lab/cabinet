/**
 * Middleware Index
 * Экспорт всех middleware
 */

const {
    requireAuth,
    requireDirector,
    requireAdmin,
    validateFields,
    rateLimit
} = require('./auth');

module.exports = {
    requireAuth,
    requireDirector,
    requireAdmin,
    validateFields,
    rateLimit
};
