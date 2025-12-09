// ==========================================
// SERVER.JS - v7.0 (Модульная архитектура)
// ==========================================
// Точка входа сервера. Все роуты вынесены в отдельные модули.
// Смотри ARCHITECTURE.md для полной документации структуры.
// ==========================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Инициализация базы данных
const { initDatabase } = require('./models/schema');

// Импорт роутов
const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/team');
const profilesRoutes = require('./routes/profiles');
const botRoutes = require('./routes/bot');
const statsRoutes = require('./routes/stats');
const dashboardRoutes = require('./routes/dashboard');
const utilitiesRoutes = require('./routes/utilities');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Инициализация БД при старте
initDatabase();

// Подключение роутов
app.use(authRoutes);
app.use(teamRoutes);
app.use(profilesRoutes);
app.use(botRoutes);
app.use(statsRoutes);
app.use(dashboardRoutes);
app.use(utilitiesRoutes);

// Запуск сервера
app.listen(PORT, () => {
    console.log(`CRM System v7.0 (Модульная архитектура) запущен на порту ${PORT}`);
    console.log(`\nЭндпоинты для бота:`);
    console.log(`   POST /api/bot/heartbeat - heartbeat (новая схема)`);
    console.log(`   POST /api/activity/log - логирование активности`);
    console.log(`   POST /api/profile/status - статус профиля`);
    console.log(`   POST /api/message_sent - отправка сообщений (legacy)`);
    console.log(`   POST /api/heartbeat - heartbeat (legacy)`);
    console.log(`   POST /api/error - логирование ошибок`);
    console.log(`\nЭндпоинты статистики:`);
    console.log(`   GET /api/stats/detailed - детальная статистика`);
    console.log(`   GET /api/stats/daily - статистика по дням`);
    console.log(`   GET /api/stats/top-profiles - топ анкет`);
    console.log(`   GET /api/stats/translators - статистика переводчиков`);
    console.log(`   GET /api/stats/admins - статистика админов`);
    console.log(`   GET /api/stats/by-admin - статистика по админам`);
    console.log(`   GET /api/stats/by-translator - статистика по переводчикам`);
    console.log(`   GET /api/stats/profile/:id - детали по анкете`);
    console.log(`   GET /api/stats/forecast - прогноз дохода`);
    console.log(`   GET /api/stats/hourly-activity - активность по часам`);
    console.log(`\nAPI для личного кабинета:`);
    console.log(`   GET /api/dashboard - сводка для дашборда`);
    console.log(`   GET /api/profiles - список анкет с статистикой`);
    console.log(`   GET /api/bots/status - статус всех ботов`);
    console.log(`   GET /api/bots/:botId/stats - статистика конкретного бота`);
    console.log(`   GET /api/team - команда (админы + переводчики)`);
    console.log(`   GET /api/activity/recent - последняя активность`);
    console.log(`   GET /api/history - история переписок`);
    console.log(`   GET /api/error_logs - логи ошибок`);
});
