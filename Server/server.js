// ==========================================
// SERVER.JS - v7.0 (Модульная архитектура)
// ==========================================

// Загрузка переменных окружения из .env файла
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Rate Limiting - защита от brute-force и DoS атак
const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 5, // 5 попыток входа в минуту
    message: { success: false, error: 'Слишком много попыток входа. Попробуйте через минуту.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 100, // 100 запросов в минуту
    message: { success: false, error: 'Слишком много запросов. Попробуйте позже.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Модули
const pool = require('./config/database');
const { initDatabase } = require('./migrations');
const { errorHandler } = require('./utils/helpers');
const { requireAuth, optionalAuth } = require('./middleware/auth');
const {
    authRoutes,
    teamRoutes,
    profilesRoutes,
    botsRoutes,
    activityRoutes,
    statsRoutes,
    dashboardRoutes,
    favoriteTemplatesRoutes,
    billingRoutes,
    botDataRoutes,
    promptTemplatesRoutes
} = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Отключаем CSP чтобы не ломать inline скрипты
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ==========================================
// МАРШРУТЫ
// ==========================================

// Главная страница - редирект на index
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// Rate limiting для API
app.use('/api/', apiLimiter);

// Аутентификация (с усиленным лимитом для логина)
app.post('/api/login', loginLimiter); // 5 попыток в минуту
app.use('/', authRoutes);

// Маршрут для обновления пользователей (POST вместо PUT для совместимости с nginx/proxy)
// Защищён авторизацией - только авторизованные пользователи
app.post('/api/users/:id/update', requireAuth, async (req, res) => {
    const pool = require('./config/database');
    const userId = req.params.id;
    const { username, password, salary, aiEnabled, is_restricted } = req.body;
    try {
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (username) {
            updates.push(`username = $${paramIndex++}`);
            params.push(username);
        }

        if (password) {
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(password, 10);
            updates.push(`password_hash = $${paramIndex++}`);
            params.push(hash);
        }

        if (salary !== undefined) {
            updates.push(`salary = $${paramIndex++}`);
            params.push(salary);
        }

        if (aiEnabled !== undefined) {
            updates.push(`ai_enabled = $${paramIndex++}`);
            params.push(aiEnabled);
        }

        if (is_restricted !== undefined) {
            updates.push(`is_restricted = $${paramIndex++}`);
            params.push(is_restricted);
        }

        if (updates.length === 0) {
            return res.json({ success: true, message: 'Нечего обновлять' });
        }

        params.push(userId);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        await pool.query(query, params);

        console.log(`✅ Пользователь ${userId} обновлён`);
        res.json({ success: true });
    } catch (e) {
        console.error('Update user error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Прямой маршрут для массового удаления анкет
// Защищён авторизацией - только авторизованные пользователи
app.post('/api/profiles/bulk-delete', requireAuth, async (req, res) => {
    const pool = require('./config/database');
    const { profileIds, userId, userName } = req.body;

    if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) {
        return res.status(400).json({ error: 'profileIds is required' });
    }

    try {
        let deleted = 0;
        for (const profileId of profileIds) {
            // Сохраняем paid_until перед удалением
            const profile = await pool.query(
                `SELECT paid_until FROM allowed_profiles WHERE profile_id = $1`,
                [profileId]
            );

            if (profile.rows.length > 0 && profile.rows[0].paid_until) {
                await pool.query(
                    `INSERT INTO profile_payment_history (profile_id, days, action_type, by_user_id, note, paid_until_backup)
                     VALUES ($1, 0, 'deletion_backup', $2, 'Бэкап при массовом удалении', $3)
                     ON CONFLICT DO NOTHING`,
                    [profileId, userId, profile.rows[0].paid_until]
                );
            }

            // Удаляем анкету
            await pool.query(`DELETE FROM allowed_profiles WHERE profile_id = $1`, [profileId]);
            await pool.query(`DELETE FROM bot_profiles WHERE profile_id = $1`, [profileId]);
            deleted++;
        }

        console.log(`✅ Удалено ${deleted} анкет`);
        res.json({ success: true, deleted });
    } catch (e) {
        console.error('Bulk delete profiles error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// API МАРШРУТЫ
// ==========================================

// Защищённые маршруты (требуют JWT токен) - для Dashboard
app.use('/api/team', requireAuth, teamRoutes);
app.use('/api/users', requireAuth, teamRoutes); // alias для совместимости
app.use('/api/profiles', optionalAuth, profilesRoutes); // optionalAuth - бот тоже использует
app.use('/api/stats', optionalAuth, statsRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/favorite-templates', requireAuth, favoriteTemplatesRoutes);
app.use('/api/prompt-templates', requireAuth, promptTemplatesRoutes);

// Маршруты с частичной защитой (некоторые эндпоинты для бота, некоторые для dashboard)
app.use('/api/bots', optionalAuth, botsRoutes);
app.use('/api/billing', optionalAuth, billingRoutes);

// Открытые маршруты (для бота) - не требуют авторизации
app.use('/api/bot-data', botDataRoutes);

// Activity маршруты (с разными префиксами для совместимости)
app.use('/api', activityRoutes);
app.use('/api/activity', activityRoutes);

// Profile history (alias для совместимости)
app.get('/api/profile-history', (req, res, next) => {
    req.url = '/history';
    profilesRoutes(req, res, next);
});

// Heartbeat маршруты
app.post('/api/heartbeat', (req, res, next) => {
    req.url = '/heartbeat';
    botsRoutes(req, res, next);
});

app.post('/api/bot/heartbeat', (req, res, next) => {
    req.url = '/bot/heartbeat';
    botsRoutes(req, res, next);
});

// Profile status
app.post('/api/profile/status', (req, res, next) => {
    req.url = '/profile/status';
    activityRoutes(req, res, next);
});

// Error endpoint
app.post('/api/error', (req, res, next) => {
    req.url = '/error';
    activityRoutes(req, res, next);
});

// ==========================================
// УТИЛИТЫ (служебные эндпоинты удалены из соображений безопасности)
// ==========================================
// Для сброса БД используйте: psql -U postgres -d ladabot_stats -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
// Для пересчёта статистики используйте: node scripts/recalculate-stats.js (создайте при необходимости)

// ==========================================
// ЗАГРУЗКА ФАЙЛОВ
// ==========================================

// Настройка хранилища для multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const fileName = file.originalname.toLowerCase();

        // Логотипы в /public/
        if (fileName.includes('logo') || fileName.includes('лого') || fileName.includes('ярлык')) {
            cb(null, path.join(__dirname, 'public'));
        } else {
            // Установщики в /public/download/
            const downloadDir = path.join(__dirname, 'public', 'download');
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }
            cb(null, downloadDir);
        }
    },
    filename: function (req, file, cb) {
        let fileName = file.originalname;

        // Переименовываем логотип
        if (fileName.toLowerCase().includes('лого')) {
            fileName = 'nova-logo.png';
        }

        cb(null, fileName);
    }
});

// Валидация типа файла
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'application/octet-stream', 'application/x-msdownload',
        'application/zip', 'application/x-zip-compressed'
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.exe', '.zip'];

    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Недопустимый тип файла'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB макс размер
    }
});

// API endpoint для загрузки файлов
// Только директор может загружать файлы (логотипы, установщики)
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    // Проверка прав - только директор
    if (req.user?.role !== 'director') {
        return res.status(403).json({ success: false, error: 'Только директор может загружать файлы' });
    }

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        res.json({
            success: true,
            file: req.file.filename,
            path: req.file.path
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК
// ==========================================

// Должен быть ПОСЛЕ всех маршрутов
app.use(errorHandler);

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================

// Инициализация базы данных
initDatabase();

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 CRM System v7.0 (Модульная архитектура) запущен на порту ${PORT}`);
    console.log(`\n📡 Эндпоинты для бота:`);
    console.log(`   • POST /api/bot/heartbeat - heartbeat (новая схема)`);
    console.log(`   • POST /api/activity/log - логирование активности`);
    console.log(`   • POST /api/profile/status - статус профиля`);
    console.log(`   • POST /api/message_sent - отправка сообщений (legacy)`);
    console.log(`   • POST /api/heartbeat - heartbeat (legacy)`);
    console.log(`   • POST /api/error - логирование ошибок`);
    console.log(`\n📊 Эндпоинты статистики:`);
    console.log(`   • GET /api/stats/detailed - детальная статистика`);
    console.log(`   • GET /api/stats/daily - статистика по дням`);
    console.log(`   • GET /api/stats/top-profiles - топ анкет`);
    console.log(`   • GET /api/stats/translators - статистика переводчиков`);
    console.log(`   • GET /api/stats/admins - статистика админов`);
    console.log(`   • GET /api/stats/by-admin - статистика по админам`);
    console.log(`   • GET /api/stats/by-translator - статистика по переводчикам`);
    console.log(`   • GET /api/stats/profile/:id - детали по анкете`);
    console.log(`   • GET /api/stats/forecast - прогноз дохода`);
    console.log(`   • GET /api/stats/hourly-activity - активность по часам`);
    console.log(`\n🖥️  API для личного кабинета:`);
    console.log(`   • GET /api/dashboard - сводка для дашборда`);
    console.log(`   • GET /api/profiles - список анкет с статистикой`);
    console.log(`   • GET /api/bots/status - статус всех ботов`);
    console.log(`   • GET /api/bots/:botId/stats - статистика конкретного бота`);
    console.log(`   • GET /api/team - команда (админы + переводчики)`);
    console.log(`   • GET /api/activity/recent - последняя активность`);
    console.log(`   • GET /api/history - история переписок`);
    console.log(`   • GET /api/error_logs - логи ошибок`);
    console.log(`\n📁 Модульная структура:`);
    console.log(`   • config/database.js - конфигурация БД`);
    console.log(`   • migrations/index.js - миграции и инициализация`);
    console.log(`   • routes/ - все маршруты API`);
    console.log(`   • utils/helpers.js - вспомогательные функции`);
});
