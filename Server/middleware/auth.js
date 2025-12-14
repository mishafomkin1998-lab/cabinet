/**
 * Authentication Middleware
 * JWT токен авторизация для API
 */

const jwt = require('jsonwebtoken');

// Секретный ключ для JWT (ОБЯЗАТЕЛЬНО из переменных окружения)
if (!process.env.JWT_SECRET) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не установлен в переменных окружения!');
    console.error('   Добавьте JWT_SECRET в файл .env');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // Токен живёт 7 дней

/**
 * Генерация JWT токена
 * @param {object} user - данные пользователя
 * @returns {string} - JWT токен
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Верификация JWT токена
 * @param {string} token - JWT токен
 * @returns {object|null} - декодированные данные или null
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Middleware: Обязательная авторизация
 * Запрос должен содержать валидный токен
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Требуется авторизация',
            code: 'NO_TOKEN'
        });
    }

    const token = authHeader.substring(7); // Убираем "Bearer "
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Недействительный или истёкший токен',
            code: 'INVALID_TOKEN'
        });
    }

    // Добавляем данные пользователя в request
    req.user = decoded;
    next();
}

/**
 * Middleware: Опциональная авторизация
 * Если токен есть - проверяем, если нет - пропускаем
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }

    next();
}

/**
 * Middleware: Проверка роли
 * @param {...string} roles - разрешённые роли
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Требуется авторизация',
                code: 'NO_USER'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Недостаточно прав',
                code: 'FORBIDDEN',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
}

/**
 * Middleware: Только директор
 */
const requireDirector = [requireAuth, requireRole('director')];

/**
 * Middleware: Директор или админ
 */
const requireAdmin = [requireAuth, requireRole('director', 'admin')];

/**
 * Middleware: Любой авторизованный пользователь
 */
const requireUser = [requireAuth, requireRole('director', 'admin', 'translator')];

module.exports = {
    generateToken,
    verifyToken,
    requireAuth,
    optionalAuth,
    requireRole,
    requireDirector,
    requireAdmin,
    requireUser,
    JWT_SECRET,
    JWT_EXPIRES_IN
};
