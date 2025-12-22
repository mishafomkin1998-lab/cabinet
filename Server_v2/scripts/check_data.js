const pool = require('./config/database');

async function checkData() {
    try {
        // Проверяем отправленные письма в activity_log
        const letters = await pool.query(`
            SELECT
                profile_id,
                action_type,
                message_text,
                created_at,
                COUNT(*) OVER() as total_count
            FROM activity_log
            WHERE action_type = 'letter'
            ORDER BY created_at DESC
            LIMIT 5
        `);

        console.log('📧 Последние письма в activity_log:');
        console.log(`   Всего писем: ${letters.rows[0]?.total_count || 0}`);
        letters.rows.forEach(row => {
            const text = row.message_text ? row.message_text.substring(0, 50) : '(пусто)';
            console.log(`   - Анкета ${row.profile_id}: "${text}..." (${row.created_at})`);
        });

        // Проверяем входящие сообщения
        const incoming = await pool.query(`
            SELECT
                type,
                COUNT(*) as count,
                MIN(created_at) as first_date,
                MAX(created_at) as last_date
            FROM incoming_messages
            GROUP BY type
        `);

        console.log('\n📥 Входящие сообщения в incoming_messages:');
        incoming.rows.forEach(row => {
            console.log(`   ${row.type}: ${row.count} (${row.first_date} - ${row.last_date})`);
        });

        // Проверяем общее количество
        const totalActivity = await pool.query('SELECT COUNT(*) as cnt FROM activity_log');
        const totalIncoming = await pool.query('SELECT COUNT(*) as cnt FROM incoming_messages');

        console.log('\n📊 Общая статистика:');
        console.log(`   activity_log: ${totalActivity.rows[0].cnt} записей`);
        console.log(`   incoming_messages: ${totalIncoming.rows[0].cnt} записей`);

        process.exit(0);
    } catch (e) {
        console.error('Ошибка:', e.message);
        process.exit(1);
    }
}

checkData();
