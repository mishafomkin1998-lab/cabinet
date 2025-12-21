const { Pool } = require('pg');

// Конфигурация PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'novabotbase',
    password: process.env.DB_PASSWORD || 'mikmik98',
    port: process.env.DB_PORT || 5432,
    // Оптимизация connection pool для параллельных запросов
    max: 50,                      // Максимум соединений (было 10 по умолчанию)
    idleTimeoutMillis: 30000,     // Закрывать idle соединения через 30 сек
    connectionTimeoutMillis: 5000 // Таймаут подключения 5 сек
});

// Проверка подключения
pool.on('connect', () => {
    console.log('📦 Подключение к PostgreSQL установлено');
});

pool.on('error', (err) => {
    console.error('❌ Ошибка PostgreSQL:', err.message);
});

module.exports = pool;
