// ==========================================
// SERVER.JS - v3.0 (Development Version)
// ==========================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Модули
const pool = require('./config/database');
const { initDatabase } = require('./migrations');
const { errorHandler } = require('./utils/helpers');
const {
    authRoutes,
    teamRoutes,
    profilesRoutes,
    botsRoutes,
    activityRoutes,
    dashboardRoutes,
    favoriteTemplatesRoutes,
    billingRoutes,
    botDataRoutes,
    promptTemplatesRoutes
} = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ==========================================
// МАРШРУТЫ
// ==========================================

// Главная страница - редирект на index
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// Аутентификация
app.use('/', authRoutes);

// Маршрут для обновления пользователей (POST вместо PUT для совместимости с nginx/proxy)
app.post('/api/users/:id/update', async (req, res) => {
    console.log(`📝 [POST /api/users/:id/update] userId=${req.params.id}, body=`, req.body);
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
app.post('/api/profiles/bulk-delete', async (req, res) => {
    console.log(`🗑️ [POST /api/profiles/bulk-delete] body=`, req.body);
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

// API маршруты
app.use('/api/team', teamRoutes);
app.use('/api/users', teamRoutes); // alias для совместимости
app.use('/api/profiles', profilesRoutes);
app.use('/api/bots', botsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/favorite-templates', favoriteTemplatesRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/bot-data', botDataRoutes);
app.use('/api/prompt-templates', promptTemplatesRoutes);

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
// УТИЛИТЫ
// ==========================================

// Сброс базы данных
app.get('/reset-database', async (req, res) => {
    try {
        console.log('⚠️ ЗАПУЩЕН СБРОС БАЗЫ ДАННЫХ...');
        await pool.query('DROP TABLE IF EXISTS daily_stats CASCADE');
        await pool.query('DROP TABLE IF EXISTS error_logs CASCADE');
        await pool.query('DROP TABLE IF EXISTS message_content CASCADE');
        await pool.query('DROP TABLE IF EXISTS messages CASCADE');
        await pool.query('DROP TABLE IF EXISTS allowed_profiles CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');

        console.log('✅ Таблицы удалены. Перезапустите сервер.');
        res.send('<h1>✅ База данных очищена!</h1><p>Теперь <b>перезапустите server.js</b> чтобы создать новые таблицы.</p>');
    } catch(e) {
        res.send('Ошибка: ' + e.message);
    }
});


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

const upload = multer({ storage: storage });

// API endpoint для загрузки файлов
app.post('/api/upload', upload.single('file'), (req, res) => {
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
    console.log(`🚀 Server_v3 (Development) запущен на порту ${PORT}`);
    console.log(`\n📡 Эндпоинты для бота:`);
    console.log(`   • POST /api/bot/heartbeat - heartbeat (новая схема)`);
    console.log(`   • POST /api/activity/log - логирование активности`);
    console.log(`   • POST /api/profile/status - статус профиля`);
    console.log(`   • POST /api/message_sent - отправка сообщений (legacy)`);
    console.log(`   • POST /api/heartbeat - heartbeat (legacy)`);
    console.log(`   • POST /api/error - логирование ошибок`);
    console.log(`\n🖥️  API для личного кабинета:`);
    console.log(`   • GET /api/dashboard - сводка для дашборда`);
    console.log(`   • GET /api/profiles - список анкет с статистикой`);
    console.log(`   • GET /api/bots/status - статус всех ботов`);
    console.log(`   • GET /api/bots/:botId/stats - статистика конкретного бота`);
    console.log(`   • GET /api/team - команда (админы + переводчики)`);
    console.log(`   • GET /api/activity/recent - последняя активность`);
    console.log(`   • GET /api/history - история переписок`);
    console.log(`\n📁 Структура проекта:`);
    console.log(`   • config/       - конфигурация (database.js)`);
    console.log(`   • middleware/   - middleware (auth.js)`);
    console.log(`   • migrations/   - миграции БД`);
    console.log(`   • routes/       - API маршруты`);
    console.log(`   • utils/        - вспомогательные функции`);
    console.log(`   • views/        - HTML страницы`);
    console.log(`   • public/       - статика (css, js, images)`);
    console.log(`   • docs/         - документация`);
    console.log(`   • scripts/      - утилиты и скрипты`);
});
