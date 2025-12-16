/**
 * Migration: Add Performance Indexes
 *
 * Добавляет индексы для ускорения медленных запросов в dashboard
 *
 * Запуск: node migrations/add_performance_indexes.js
 */

const pool = require('../config/database');

async function migrate() {
    console.log('🚀 Adding performance indexes...\n');

    const indexes = [
        // activity_log indexes - критично для team.js и stats.js
        {
            name: 'idx_activity_log_admin_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_activity_log_admin_id ON activity_log(admin_id)'
        },
        {
            name: 'idx_activity_log_translator_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_activity_log_translator_id ON activity_log(translator_id)'
        },
        {
            name: 'idx_activity_log_created_at',
            sql: 'CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at)'
        },
        {
            name: 'idx_activity_log_action_type',
            sql: 'CREATE INDEX IF NOT EXISTS idx_activity_log_action_type ON activity_log(action_type)'
        },
        // Composite index for common query pattern
        {
            name: 'idx_activity_log_translator_created',
            sql: 'CREATE INDEX IF NOT EXISTS idx_activity_log_translator_created ON activity_log(translator_id, created_at)'
        },
        {
            name: 'idx_activity_log_admin_created',
            sql: 'CREATE INDEX IF NOT EXISTS idx_activity_log_admin_created ON activity_log(admin_id, created_at)'
        },

        // allowed_profiles indexes
        {
            name: 'idx_allowed_profiles_admin_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_allowed_profiles_admin_id ON allowed_profiles(assigned_admin_id)'
        },
        {
            name: 'idx_allowed_profiles_translator_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_allowed_profiles_translator_id ON allowed_profiles(assigned_translator_id)'
        },

        // user_activity indexes - для расчёта времени работы
        {
            name: 'idx_user_activity_user_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id)'
        },
        {
            name: 'idx_user_activity_created_at',
            sql: 'CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at)'
        },
        {
            name: 'idx_user_activity_user_created',
            sql: 'CREATE INDEX IF NOT EXISTS idx_user_activity_user_created ON user_activity(user_id, created_at)'
        },

        // incoming_messages indexes
        {
            name: 'idx_incoming_messages_created_at',
            sql: 'CREATE INDEX IF NOT EXISTS idx_incoming_messages_created_at ON incoming_messages(created_at)'
        },
        {
            name: 'idx_incoming_messages_translator_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_incoming_messages_translator_id ON incoming_messages(translator_id)'
        },
        {
            name: 'idx_incoming_messages_admin_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_incoming_messages_admin_id ON incoming_messages(admin_id)'
        },

        // messages indexes (КРИТИЧНО для translators/admins статистики)
        {
            name: 'idx_messages_account_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id)'
        },
        {
            name: 'idx_messages_timestamp',
            sql: 'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)'
        },
        {
            name: 'idx_messages_type',
            sql: 'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)'
        },
        {
            // КРИТИЧЕСКИЙ: для JOIN messages с фильтром по времени
            name: 'idx_messages_account_timestamp',
            sql: 'CREATE INDEX IF NOT EXISTS idx_messages_account_timestamp ON messages(account_id, timestamp DESC)'
        },
        {
            // Для фильтрации по типу и времени
            name: 'idx_messages_timestamp_type',
            sql: 'CREATE INDEX IF NOT EXISTS idx_messages_timestamp_type ON messages(timestamp, type)'
        },

        // heartbeats indexes - для онлайн статуса (КРИТИЧНО для /api/bots/status)
        {
            name: 'idx_heartbeats_timestamp',
            sql: 'CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp)'
        },
        {
            name: 'idx_heartbeats_account_display_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_heartbeats_account_display_id ON heartbeats(account_display_id)'
        },
        {
            // КРИТИЧЕСКИЙ ИНДЕКС: для DISTINCT ON с фильтром по времени
            name: 'idx_heartbeats_timestamp_account',
            sql: 'CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp_account ON heartbeats(timestamp DESC, account_display_id)'
        },
        {
            // Составной индекс для покрытия запроса
            name: 'idx_heartbeats_account_timestamp',
            sql: 'CREATE INDEX IF NOT EXISTS idx_heartbeats_account_timestamp ON heartbeats(account_display_id, timestamp DESC)'
        },

        // users indexes
        {
            name: 'idx_users_role',
            sql: 'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)'
        },
        {
            name: 'idx_users_owner_id',
            sql: 'CREATE INDEX IF NOT EXISTS idx_users_owner_id ON users(owner_id)'
        }
    ];

    let created = 0;
    let failed = 0;

    for (const index of indexes) {
        try {
            await pool.query(index.sql);
            console.log(`✅ ${index.name}`);
            created++;
        } catch (e) {
            console.log(`❌ ${index.name}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Results: ${created} created, ${failed} failed`);
    console.log('🏁 Migration completed!\n');

    // Запускаем ANALYZE для обновления статистики
    console.log('📈 Running ANALYZE on tables...');
    try {
        await pool.query('ANALYZE activity_log');
        await pool.query('ANALYZE allowed_profiles');
        await pool.query('ANALYZE user_activity');
        await pool.query('ANALYZE incoming_messages');
        await pool.query('ANALYZE messages');
        await pool.query('ANALYZE heartbeats');
        await pool.query('ANALYZE users');
        console.log('✅ ANALYZE completed\n');
    } catch (e) {
        console.log('⚠️ ANALYZE failed:', e.message);
    }

    process.exit(0);
}

migrate().catch(e => {
    console.error('Migration error:', e);
    process.exit(1);
});
