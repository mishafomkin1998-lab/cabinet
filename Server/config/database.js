const { Pool } = require('pg');

// Проверка обязательных переменных окружения
if (!process.env.DB_PASSWORD) {
    console.error('❌ ОШИБКА: Переменная DB_PASSWORD не установлена!');
    console.error('   Создайте файл .env в папке Server с содержимым:');
    console.error('   DB_PASSWORD=ваш_пароль');
    console.error('   Или установите переменную окружения перед запуском.');
    process.exit(1);
}

// Конфигурация PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ladabot_stats',
    password: process.env.DB_PASSWORD,  // Без fallback - обязательно из env
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
