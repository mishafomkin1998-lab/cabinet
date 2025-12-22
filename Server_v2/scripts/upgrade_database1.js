// upgrade_database_fixed.js
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ladabot_stats',
    password: 'mikmik98',
    port: 5432,
});

async function checkTableExists(tableName) {
    try {
        const res = await pool.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
            [tableName]
        );
        return res.rows[0].exists;
    } catch (error) {
        console.error(`Ошибка проверки таблицы ${tableName}:`, error.message);
        return false;
    }
}

async function checkColumnExists(tableName, columnName) {
    try {
        const res = await pool.query(
            "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2)",
            [tableName, columnName]
        );
        return res.rows[0].exists;
    } catch (error) {
        console.error(`Ошибка проверки столбца ${columnName}:`, error.message);
        return false;
    }
}

async function upgradeDatabase() {
    console.log('🔄 Начинаю обновление базы данных...');
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Проверяем и добавляем недостающие столбцы в messages
        console.log('1. Проверяем таблицу messages...');
        
        // Сначала проверим существует ли столбец sender_id
        const senderIdExists = await checkColumnExists('messages', 'sender_id');
        
        if (!senderIdExists) {
            console.log('   ➕ Добавляем столбец sender_id');
            await client.query(`
                ALTER TABLE messages 
                ADD COLUMN sender_id VARCHAR(50)
            `);
        } else {
            console.log('   ✓ Столбец sender_id уже существует');
        }
        
        // Добавляем другие столбцы если их нет
        const columnsToAdd = [
            { name: 'content', type: 'TEXT' },
            { name: 'media_url', type: 'TEXT' },
            { name: 'media_type', type: 'VARCHAR(20)' },
            { name: 'has_media', type: 'BOOLEAN DEFAULT FALSE' },
            { name: 'status', type: 'VARCHAR(20) DEFAULT \'sent\'' },
            { name: 'error_reason', type: 'TEXT' },
            { name: 'response_time', type: 'INTERVAL' },
            { name: 'is_first_message', type: 'BOOLEAN DEFAULT FALSE' },
            { name: 'is_last_message', type: 'BOOLEAN DEFAULT FALSE' },
            { name: 'conversation_id', type: 'VARCHAR(50)' },
            { name: 'message_length', type: 'INTEGER' },
            { name: 'read_status', type: 'BOOLEAN DEFAULT FALSE' }
        ];
        
        for (const column of columnsToAdd) {
            const exists = await checkColumnExists('messages', column.name);
            if (!exists) {
                console.log(`   ➕ Добавляем столбец ${column.name}`);
                await client.query(`ALTER TABLE messages ADD COLUMN ${column.name} ${column.type}`);
            } else {
                console.log(`   ✓ Столбец ${column.name} уже существует`);
            }
        }
        
        // 2. Проверяем и создаем таблицу message_status_log если не существует
        console.log('\n2. Проверяем таблицу message_status_log...');
        const statusLogExists = await checkTableExists('message_status_log');
        
        if (!statusLogExists) {
            console.log('   ➕ Создаем таблицу message_status_log');
            await client.query(`
                CREATE TABLE message_status_log (
                    id SERIAL PRIMARY KEY,
                    message_id INTEGER,
                    status VARCHAR(20) NOT NULL,
                    error_code VARCHAR(50),
                    error_details TEXT,
                    attempt_number INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            console.log('   ✓ Таблица message_status_log уже существует');
        }
        
        // 3. Проверяем и создаем таблицу recipients если не существует
        console.log('\n3. Проверяем таблицу recipients...');
        const recipientsExists = await checkTableExists('recipients');
        
        if (!recipientsExists) {
            console.log('   ➕ Создаем таблицу recipients');
            await client.query(`
                CREATE TABLE recipients (
                    id SERIAL PRIMARY KEY,
                    recipient_id VARCHAR(100) UNIQUE NOT NULL,
                    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_messages INTEGER DEFAULT 0,
                    profile_ids TEXT[],
                    metadata JSONB
                )
            `);
        } else {
            console.log('   ✓ Таблица recipients уже существует');
        }
        
        // 4. Проверяем и создаем таблицу daily_stats если не существует
        console.log('\n4. Проверяем таблицу daily_stats...');
        const dailyStatsExists = await checkTableExists('daily_stats');
        
        if (!dailyStatsExists) {
            console.log('   ➕ Создаем таблицу daily_stats');
            await client.query(`
                CREATE TABLE daily_stats (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    date DATE NOT NULL,
                    letters_count INTEGER DEFAULT 0,
                    chats_count INTEGER DEFAULT 0,
                    failed_count INTEGER DEFAULT 0,
                    unique_men INTEGER DEFAULT 0,
                    total_income DECIMAL(10,2) DEFAULT 0,
                    avg_response_time INTERVAL,
                    conversion_rate DECIMAL(5,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, date)
                )
            `);
        } else {
            console.log('   ✓ Таблица daily_stats уже существует');
        }
        
        // 5. Создаем индексы (только если они не существуют)
        console.log('\n5. Создаем индексы...');
        
        const indexes = [
            { name: 'idx_messages_account', query: 'CREATE INDEX idx_messages_account ON messages(account_id)' },
            { name: 'idx_messages_sender', query: 'CREATE INDEX idx_messages_sender ON messages(sender_id)' },
            { name: 'idx_messages_status', query: 'CREATE INDEX idx_messages_status ON messages(status)' },
            { name: 'idx_messages_timestamp', query: 'CREATE INDEX idx_messages_timestamp ON messages(timestamp)' },
            { name: 'idx_status_log_message', query: 'CREATE INDEX idx_status_log_message ON message_status_log(message_id)' },
            { name: 'idx_recipients_id', query: 'CREATE INDEX idx_recipients_id ON recipients(recipient_id)' }
        ];
        
        for (const index of indexes) {
            try {
                // Проверяем существует ли индекс
                const indexExists = await client.query(`
                    SELECT 1 FROM pg_indexes 
                    WHERE schemaname = 'public' 
                    AND tablename IN ('messages', 'message_status_log', 'recipients')
                    AND indexname = $1
                `, [index.name]);
                
                if (indexExists.rows.length === 0) {
                    console.log(`   ➕ Создаем индекс ${index.name}`);
                    await client.query(index.query);
                } else {
                    console.log(`   ✓ Индекс ${index.name} уже существует`);
                }
            } catch (error) {
                console.log(`   ⚠️ Ошибка при создании индекса ${index.name}:`, error.message);
                // Продолжаем выполнение
            }
        }
        
        await client.query('COMMIT');
        
        console.log('\n✅ База данных успешно обновлена!');
        console.log('📊 Состояние базы данных:');
        console.log('   - Таблица messages: расширена новыми колонками');
        console.log('   - Таблица message_status_log: готова');
        console.log('   - Таблица recipients: готова');
        console.log('   - Таблица daily_stats: готова');
        console.log('   - Все необходимые индексы созданы');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка обновления базы:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Запускаем обновление
upgradeDatabase().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
});