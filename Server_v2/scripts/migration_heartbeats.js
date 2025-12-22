// ==========================================
// МИГРАЦИЯ БД: Создание таблицы heartbeats
// ==========================================

const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ladabot_stats',
    password: 'mikmik98',
    port: 5432,
});

async function migrate() {
    try {
        console.log('🔄 Начинаем миграцию базы данных...');

        // Создаем таблицу heartbeats
        await pool.query(`
            CREATE TABLE IF NOT EXISTS heartbeats (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(255) NOT NULL,
                account_display_id VARCHAR(255) NOT NULL,
                status VARCHAR(50),
                ip VARCHAR(50),
                version VARCHAR(50),
                platform VARCHAR(100),
                timestamp TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица heartbeats создана');

        // Создаем индексы для быстрого поиска
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_heartbeats_account
            ON heartbeats(account_display_id)
        `);
        console.log('✅ Индекс idx_heartbeats_account создан');

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp
            ON heartbeats(timestamp)
        `);
        console.log('✅ Индекс idx_heartbeats_timestamp создан');

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_heartbeats_bot_id
            ON heartbeats(bot_id)
        `);
        console.log('✅ Индекс idx_heartbeats_bot_id создан');

        console.log('');
        console.log('✅ Миграция успешно завершена!');
        console.log('');

        // Показываем текущие таблицы
        const tables = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        console.log('📊 Таблицы в базе данных:');
        tables.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

        process.exit(0);

    } catch (error) {
        console.error('❌ Ошибка миграции:', error.message);
        console.error(error);
        process.exit(1);
    }
}

migrate();
