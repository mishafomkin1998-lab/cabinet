/**
 * Миграция: Создание таблицы profile_bot_data
 * Хранит данные бота для каждой анкеты (шаблоны, blacklist, статистика)
 */

const pool = require('../config/database');

async function up() {
    console.log('🔄 Создание таблицы profile_bot_data...');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS profile_bot_data (
            id SERIAL PRIMARY KEY,
            profile_id VARCHAR(50) UNIQUE NOT NULL,

            -- Шаблоны (JSON массивы: [{name, text, is_favorite}])
            templates_mail JSONB DEFAULT '[]',
            templates_chat JSONB DEFAULT '[]',

            -- Черные списки (JSON массивы ID мужчин)
            blacklist_mail JSONB DEFAULT '[]',
            blacklist_chat JSONB DEFAULT '[]',

            -- Статистика
            stats_mail_sent INTEGER DEFAULT 0,
            stats_mail_errors INTEGER DEFAULT 0,
            stats_chat_sent INTEGER DEFAULT 0,
            stats_chat_errors INTEGER DEFAULT 0,

            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        -- Индекс для быстрого поиска по profile_id
        CREATE INDEX IF NOT EXISTS idx_profile_bot_data_profile_id ON profile_bot_data(profile_id);
    `);

    console.log('✅ Таблица profile_bot_data создана успешно');
}

async function down() {
    console.log('🔄 Удаление таблицы profile_bot_data...');
    await pool.query('DROP TABLE IF EXISTS profile_bot_data');
    console.log('✅ Таблица profile_bot_data удалена');
}

// Запуск миграции
if (require.main === module) {
    const action = process.argv[2] || 'up';

    (async () => {
        try {
            if (action === 'down') {
                await down();
            } else {
                await up();
            }
            process.exit(0);
        } catch (error) {
            console.error('❌ Ошибка миграции:', error);
            process.exit(1);
        }
    })();
}

module.exports = { up, down };
