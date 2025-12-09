// ==========================================
// MODELS/SCHEMA.JS - Инициализация таблиц БД v6.0
// ==========================================

const pool = require('../config/database');

async function initDatabase() {
    try {
        console.log('Проверка таблиц базы данных v6.0 (полная схема для личного кабинета)...');

        // 1. Таблица пользователей (обновлена)
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

        // Добавляем недостающие колонки если их нет
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login VARCHAR(100)`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary DECIMAL(10,2)`);

        // 2. Таблица Анкет (профилей) - расширенная
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

        // Добавляем недостающие колонки в allowed_profiles
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS login VARCHAR(100)`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS password VARCHAR(100)`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline'`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS last_online TIMESTAMP`);

        // 3. Таблица ботов
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bots (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(100),
                platform VARCHAR(100),
                ip VARCHAR(50),
                version VARCHAR(20),
                status VARCHAR(20) DEFAULT 'offline',
                last_heartbeat TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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

        // 5. Таблица активности (ключевая таблица!)
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

        // Индексы для activity_log
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_profile ON activity_log(profile_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(action_type)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_admin ON activity_log(admin_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_translator ON activity_log(translator_id)`);

        // 6. Таблица Сообщений (для совместимости)
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

        // Индексы для heartbeats
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_account ON heartbeats(account_display_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_bot_id ON heartbeats(bot_id)`);

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

        console.log('База данных готова к работе (v6.0 - полная схема для личного кабинета)');
    } catch (e) {
        console.error('Ошибка инициализации БД:', e.message);
    }
}

module.exports = { initDatabase };
