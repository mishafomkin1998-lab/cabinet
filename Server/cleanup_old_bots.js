// Скрипт очистки старых heartbeat записей
const pool = require('./config/database');

async function cleanup() {
    try {
        // Удаляем все heartbeat старше 5 минут (неактивные боты)
        const result = await pool.query(`
            DELETE FROM heartbeats
            WHERE timestamp < NOW() - INTERVAL '5 minutes'
        `);

        console.log(`✅ Удалено старых записей: ${result.rowCount}`);

        // Показываем что осталось
        const remaining = await pool.query(`
            SELECT DISTINCT bot_id, COUNT(*) as profiles
            FROM heartbeats
            GROUP BY bot_id
        `);

        console.log(`📊 Осталось ботов: ${remaining.rows.length}`);
        remaining.rows.forEach(r => {
            console.log(`   - ${r.bot_id}: ${r.profiles} анкет`);
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        await pool.end();
    }
}

cleanup();
