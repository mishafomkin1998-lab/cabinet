/**
 * Миграция: Создание таблицы prompt_templates
 * Хранит шаблоны промптов для переводчиков (по translator_id)
 */

const pool = require('../config/database');

async function up() {
    console.log('🔄 Создание таблицы prompt_templates...');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS prompt_templates (
            id SERIAL PRIMARY KEY,
            translator_id INTEGER NOT NULL,

            -- Тип промпта: 'myPrompt', 'replyPrompt', 'chatPrompt'
            prompt_type VARCHAR(50) NOT NULL,

            -- Название шаблона
            name VARCHAR(255) NOT NULL,

            -- Текст промпта
            text TEXT NOT NULL,

            -- Активный ли этот шаблон (используется по умолчанию)
            is_active BOOLEAN DEFAULT FALSE,

            -- Порядок сортировки
            sort_order INTEGER DEFAULT 0,

            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),

            -- Уникальность: один активный шаблон на тип для переводчика
            CONSTRAINT unique_translator_prompt_type_name UNIQUE (translator_id, prompt_type, name)
        );

        -- Индексы для быстрого поиска
        CREATE INDEX IF NOT EXISTS idx_prompt_templates_translator ON prompt_templates(translator_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_templates_type ON prompt_templates(translator_id, prompt_type);
        CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(translator_id, prompt_type, is_active);
    `);

    console.log('✅ Таблица prompt_templates создана успешно');
}

async function down() {
    console.log('🔄 Удаление таблицы prompt_templates...');
    await pool.query('DROP TABLE IF EXISTS prompt_templates');
    console.log('✅ Таблица prompt_templates удалена');
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
