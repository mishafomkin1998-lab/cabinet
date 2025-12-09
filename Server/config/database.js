// ==========================================
// CONFIG/DATABASE.JS - Подключение к PostgreSQL
// ==========================================

const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ladabot_stats',
    password: 'mikmik98',
    port: 5432,
});

module.exports = pool;
