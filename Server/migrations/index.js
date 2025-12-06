/**
 * Database Migrations
 * Инициализация и миграции базы данных
 */

const pool = require('../config/database');

async function initDatabase() {
    try {
        console.log('⚙️ Проверка таблиц базы данных v6.0 (полная схема для личного кабинета)...');

        // 1. Таблица пользователей
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                login VARCHAR(100),
                role VARCHAR(20) NOT NULL,
                owner_id INTEGER REFERENCES users(id),
                salary DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(username)
            )
        `);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login VARCHAR(100)`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary DECIMAL(10,2)`);

        // 2. Таблица Анкет (профилей)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS profiles (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) UNIQUE NOT NULL,
                login VARCHAR(100),
                password VARCHAR(100),
                admin_id INTEGER REFERENCES users(id),
                translator_id INTEGER REFERENCES users(id),
                note TEXT,
                paused BOOLEAN DEFAULT FALSE,
                status VARCHAR(20) DEFAULT 'offline',
                last_online TIMESTAMP,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Синхронизируем с allowed_profiles для совместимости
        await pool.query(`
            CREATE TABLE IF NOT EXISTS allowed_profiles (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) UNIQUE NOT NULL,
                note TEXT,
                assigned_admin_id INTEGER,
                assigned_translator_id INTEGER,
                login VARCHAR(100),
                password VARCHAR(100),
                paused BOOLEAN DEFAULT FALSE,
                status VARCHAR(20) DEFAULT 'offline',
                last_online TIMESTAMP,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS login VARCHAR(100)`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS password VARCHAR(100)`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline'`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS last_online TIMESTAMP`);

        // 3. Таблица ботов - миграция типа id
        await migrateBotsTable();

        // 4. Связь бота с анкетами
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_profiles (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(100) NOT NULL,
                profile_id VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bot_id, profile_id)
            )
        `);
        await fixSerialSequence('bot_profiles');

        // 5. Таблица активности
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) NOT NULL,
                bot_id VARCHAR(100),
                admin_id INTEGER,
                translator_id INTEGER,
                action_type VARCHAR(50) NOT NULL,
                man_id VARCHAR(100),
                message_text TEXT,
                response_time_sec INTEGER,
                used_ai BOOLEAN DEFAULT FALSE,
                income DECIMAL(10,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_profile ON activity_log(profile_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(action_type)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_admin ON activity_log(admin_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_translator ON activity_log(translator_id)`);
        await fixSerialSequence('activity_log');

        // Миграция: Исправляем SERIAL для profiles
        await fixSerialSequence('profiles');

        // 6. Таблица Сообщений
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(50),
                account_id VARCHAR(50),
                type VARCHAR(20),
                sender_id VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                response_time INTEGER,
                is_first_message BOOLEAN DEFAULT FALSE,
                is_last_message BOOLEAN DEFAULT FALSE,
                conversation_id VARCHAR(50),
                message_length INTEGER,
                read_status BOOLEAN DEFAULT FALSE,
                status VARCHAR(20) DEFAULT 'success',
                message_content_id INTEGER,
                error_log_id INTEGER
            )
        `);

        // Меняем тип response_time на INTEGER если он INTERVAL
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'messages'
                    AND column_name = 'response_time'
                    AND data_type = 'interval'
                ) THEN
                    ALTER TABLE messages ALTER COLUMN response_time TYPE INTEGER USING EXTRACT(EPOCH FROM response_time)::INTEGER;
                END IF;
            END $$;
        `);

        // 7. Хранение контента сообщения
        await pool.query(`
            CREATE TABLE IF NOT EXISTS message_content (
                id SERIAL PRIMARY KEY,
                text_content TEXT,
                media_url VARCHAR(255),
                file_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 8. Логи ошибок
        await pool.query(`
            CREATE TABLE IF NOT EXISTS error_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                endpoint VARCHAR(100),
                error_type VARCHAR(100),
                message TEXT,
                raw_data JSONB,
                user_id INTEGER
            )
        `);

        // 9. Heartbeats от бота
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
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_account ON heartbeats(account_display_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_bot_id ON heartbeats(bot_id)`);

        // Миграции SERIAL для всех таблиц
        const tablesToFix = ['messages', 'message_content', 'error_logs', 'heartbeats'];
        for (const tableName of tablesToFix) {
            await fixSerialSequence(tableName);
        }

        // 10. Таблица для ежедневной статистики
        await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                date DATE NOT NULL,
                letters_count INTEGER DEFAULT 0,
                chats_count INTEGER DEFAULT 0,
                unique_men INTEGER DEFAULT 0,
                total_income DECIMAL(10,2) DEFAULT 0,
                avg_response_time INTEGER,
                conversion_rate DECIMAL(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, date)
            )
        `);

        try {
            await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS daily_stats_user_date_unique ON daily_stats(user_id, date)`);
        } catch (e) {
            console.log('Миграция daily_stats_user_date_unique уже выполнена');
        }

        // 11. Таблица входящих сообщений от мужчин
        await pool.query(`
            CREATE TABLE IF NOT EXISTS incoming_messages (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) NOT NULL,
                bot_id VARCHAR(100),
                man_id VARCHAR(100) NOT NULL,
                man_name VARCHAR(255),
                platform_message_id VARCHAR(100),
                type VARCHAR(20) DEFAULT 'letter',
                is_first_from_man BOOLEAN DEFAULT FALSE,
                admin_id INTEGER,
                translator_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_incoming_profile ON incoming_messages(profile_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_incoming_man ON incoming_messages(man_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_incoming_date ON incoming_messages(created_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_incoming_first ON incoming_messages(is_first_from_man)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_incoming_translator ON incoming_messages(translator_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_incoming_admin ON incoming_messages(admin_id)`);
        await fixSerialSequence('incoming_messages');

        // 12. Таблица настроек
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                key VARCHAR(100) UNIQUE NOT NULL,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try {
            await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS settings_key_unique ON settings(key)`);
        } catch (e) { /* уже существует */ }

        // 13. Таблица избранных шаблонов рассылки
        await pool.query(`
            CREATE TABLE IF NOT EXISTS favorite_templates (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) NOT NULL,
                bot_id VARCHAR(100),
                template_name VARCHAR(255),
                template_text TEXT NOT NULL,
                type VARCHAR(20) DEFAULT 'mail',
                admin_id INTEGER,
                translator_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_fav_tpl_profile ON favorite_templates(profile_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_fav_tpl_admin ON favorite_templates(admin_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_fav_tpl_translator ON favorite_templates(translator_id)`);
        await fixSerialSequence('favorite_templates');

        // Очистка старых данных
        await cleanupOldData();

        console.log('✅ База данных готова к работе (v6.0 - полная схема для личного кабинета)');
    } catch (e) {
        console.error('❌ Ошибка инициализации БД:', e.message);
    }
}

// Миграция таблицы bots
async function migrateBotsTable() {
    try {
        const idTypeCheck = await pool.query(`
            SELECT data_type FROM information_schema.columns
            WHERE table_name = 'bots' AND column_name = 'id'
        `);

        if (idTypeCheck.rows.length > 0 && idTypeCheck.rows[0].data_type !== 'integer') {
            console.log('⚠️ Таблица bots имеет неправильный тип id, пересоздаём...');

            const oldData = await pool.query(`SELECT bot_id, name, platform, ip, version, status, last_heartbeat, created_at FROM bots`);
            await pool.query(`DROP TABLE IF EXISTS bots CASCADE`);

            await pool.query(`
                CREATE TABLE bots (
                    id SERIAL PRIMARY KEY,
                    bot_id VARCHAR(100) UNIQUE,
                    name VARCHAR(100),
                    platform VARCHAR(100),
                    ip VARCHAR(50),
                    version VARCHAR(20),
                    status VARCHAR(20) DEFAULT 'offline',
                    last_heartbeat TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            for (const row of oldData.rows) {
                await pool.query(`
                    INSERT INTO bots (bot_id, name, platform, ip, version, status, last_heartbeat, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [row.bot_id, row.name, row.platform, row.ip, row.version, row.status, row.last_heartbeat, row.created_at]);
            }

            console.log('✅ Таблица bots пересоздана с правильной структурой');
        }
    } catch (e) {
        console.log('Проверка типа bots.id:', e.message);
    }

    // Создаём таблицу если не существует
    await pool.query(`
        CREATE TABLE IF NOT EXISTS bots (
            id SERIAL PRIMARY KEY,
            bot_id VARCHAR(100) UNIQUE,
            name VARCHAR(100),
            platform VARCHAR(100),
            ip VARCHAR(50),
            version VARCHAR(20),
            status VARCHAR(20) DEFAULT 'offline',
            last_heartbeat TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Миграция: добавляем недостающие столбцы
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS bot_id VARCHAR(100)`);
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS name VARCHAR(100)`);
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS platform VARCHAR(100)`);
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS ip VARCHAR(50)`);
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS version VARCHAR(20)`);
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline'`);
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP`);
    await pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS bots_bot_id_unique ON bots(bot_id) WHERE bot_id IS NOT NULL`);
    } catch (e) { /* Индекс уже существует */ }
}

// Исправление SERIAL последовательностей
async function fixSerialSequence(tableName) {
    try {
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS ${tableName}_id_seq`);
        const maxId = await pool.query(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${tableName}`);
        await pool.query(`SELECT setval('${tableName}_id_seq', $1, true)`, [Math.max(maxId.rows[0].max_id || 0, 1)]);
        await pool.query(`ALTER TABLE ${tableName} ALTER COLUMN id SET DEFAULT nextval('${tableName}_id_seq')`);
    } catch (e) { /* уже выполнено */ }
}

// Очистка старых данных
async function cleanupOldData() {
    // Удаляем записи из bots которые не имели heartbeat более 24 часов
    try {
        const cleanupResult = await pool.query(`
            DELETE FROM bots
            WHERE last_heartbeat < NOW() - INTERVAL '24 hours'
               OR last_heartbeat IS NULL
        `);
        if (cleanupResult.rowCount > 0) {
            console.log(`🧹 Очищено ${cleanupResult.rowCount} старых записей из таблицы bots`);
        }
    } catch (e) {
        console.log('Очистка bots:', e.message);
    }

    // Удаляем старые heartbeats (старше 7 дней)
    try {
        const heartbeatCleanup = await pool.query(`
            DELETE FROM heartbeats
            WHERE timestamp < NOW() - INTERVAL '7 days'
        `);
        if (heartbeatCleanup.rowCount > 0) {
            console.log(`🧹 Очищено ${heartbeatCleanup.rowCount} старых heartbeats`);
        }
    } catch (e) {
        console.log('Очистка heartbeats:', e.message);
    }
}

module.exports = {
    initDatabase,
    migrateBotsTable,
    fixSerialSequence,
    cleanupOldData
};
