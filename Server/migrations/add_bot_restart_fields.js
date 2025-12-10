/**
 * Миграция: Добавление полей для управления перезапуском ботов
 * Добавляет restart_requested и restart_requested_at в таблицу bots
 */

const pool = require('../config/database');

async function up() {
    console.log('🔄 Добавление полей restart_requested в таблицу bots...');

    await pool.query(`
        ALTER TABLE bots
        ADD COLUMN IF NOT EXISTS restart_requested BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS restart_requested_at TIMESTAMP;

        -- Индекс для быстрого поиска ботов с запросом на перезапуск
        CREATE INDEX IF NOT EXISTS idx_bots_restart_requested ON bots(restart_requested) WHERE restart_requested = TRUE;
    `);

    console.log('✅ Поля restart_requested добавлены успешно');
}

async function down() {
    console.log('🔄 Удаление полей restart_requested из таблицы bots...');

    await pool.query(`
        DROP INDEX IF EXISTS idx_bots_restart_requested;
        ALTER TABLE bots
        DROP COLUMN IF EXISTS restart_requested,
        DROP COLUMN IF EXISTS restart_requested_at;
    `);

    console.log('✅ Поля restart_requested удалены');
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
