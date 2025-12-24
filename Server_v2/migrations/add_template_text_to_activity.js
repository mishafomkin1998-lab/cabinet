/**
 * Миграция: Добавление поля template_text в activity_log
 *
 * Это поле хранит оригинальный шаблон письма (до подстановки макросов),
 * что позволяет группировать письма по шаблону, а не по финальному тексту.
 */

const pool = require('../config/database');

async function up() {
    console.log('🔄 Добавление поля template_text в activity_log...');

    await pool.query(`
        ALTER TABLE activity_log
        ADD COLUMN IF NOT EXISTS template_text TEXT
    `);

    console.log('✅ Поле template_text добавлено в activity_log');
}

async function down() {
    console.log('🔄 Удаление поля template_text из activity_log...');

    await pool.query(`
        ALTER TABLE activity_log
        DROP COLUMN IF EXISTS template_text
    `);

    console.log('✅ Поле template_text удалено из activity_log');
}

module.exports = { up, down };
