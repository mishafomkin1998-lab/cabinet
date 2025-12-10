const { Pool } = require('pg');

// Конфигурация PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ladabot_stats',
    password: process.env.DB_PASSWORD || 'mikmik98',
    port: process.env.DB_PORT || 5432
});

// Проверка подключения
pool.on('connect', () => {
    console.log('📦 Подключение к PostgreSQL установлено');
});

pool.on('error', (err) => {
    console.error('❌ Ошибка PostgreSQL:', err.message);
});

module.exports = pool;
