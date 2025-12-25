/**
 * Authentication Middleware
 * Middleware для аутентификации и авторизации
 */

const pool = require('../config/database');

/**
 * Проверка авторизации пользователя
 * Проверяет наличие userId в query или body запроса
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next
 */
async function requireAuth(req, res, next) {
    const userId = req.query.userId || req.body.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'Требуется авторизация'
        });
    }

    try {
        const result = await pool.query(
            'SELECT id, username, role FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка авторизации'
        });
    }
}

/**
 * Проверка роли директора
 * Используется после requireAuth
 */
function requireDirector(req, res, next) {
    if (!req.user || req.user.role !== 'director') {
        return res.status(403).json({
            success: false,
            error: 'Требуются права директора'
        });
    }
    next();
}

/**
 * Проверка роли админа или директора
 * Используется после requireAuth
 */
function requireAdmin(req, res, next) {
    if (!req.user || !['admin', 'director'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: 'Требуются права администратора'
        });
    }
    next();
}

/**
 * Валидация обязательных полей в body запроса
 * @param {string[]} fields - массив обязательных полей
 */
function validateFields(fields) {
    return (req, res, next) => {
        const missing = fields.filter(field => !req.body[field] && req.body[field] !== 0);

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Отсутствуют обязательные поля: ${missing.join(', ')}`
            });
        }

        next();
    };
}

/**
 * Rate limiting простой реализации (in-memory)
 * @param {number} maxRequests - максимум запросов
 * @param {number} windowMs - окно в миллисекундах
 */
function rateLimit(maxRequests = 100, windowMs = 60000) {
    const requests = new Map();

    // Очистка старых записей каждую минуту
    setInterval(() => {
        const now = Date.now();
        for (const [key, data] of requests) {
            if (now - data.startTime > windowMs) {
                requests.delete(key);
            }
        }
    }, windowMs);

    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        if (!requests.has(key)) {
            requests.set(key, { count: 1, startTime: now });
            return next();
        }

        const data = requests.get(key);

        if (now - data.startTime > windowMs) {
            requests.set(key, { count: 1, startTime: now });
            return next();
        }

        data.count++;

        if (data.count > maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Слишком много запросов. Попробуйте позже.'
            });
        }

        next();
    };
}

module.exports = {
    requireAuth,
    requireDirector,
    requireAdmin,
    validateFields,
    rateLimit
};
