// ============= ПЕРИОДИЧЕСКАЯ ОЧИСТКА ПАМЯТИ =============
// Предотвращает утечки памяти при длительной работе (95+ анкет весь день)

function startMemoryCleanup() {
    // Очистка каждые 10 минут для hotManQueue и freshOnline (записи старше 5 мин)
    setInterval(() => {
        cleanupHotQueue();
        cleanupFreshOnline();
    }, 10 * 60 * 1000);

    // Очистка каждый час для остальных объектов
    setInterval(() => {
        cleanupLoggerTracking();
        cleanupAllConversations();
    }, 60 * 60 * 1000);

    console.log('✅ Периодическая очистка памяти запущена');
}

// Очистка логгера (сбрасываем Set уведомлений каждый час)
function cleanupLoggerTracking() {
    const size = loggerTracking.notified.size;
    if (size > 0) {
        loggerTracking.notified.clear();
        console.log(`🧹 loggerTracking.notified: очищено ${size} записей`);
    }
}

// Очистка conversations для всех ботов (записи старше 24 часов)
function cleanupAllConversations() {
    let totalCleaned = 0;

    for (const botId in bots) {
        const bot = bots[botId];
        if (bot && typeof bot.cleanupConversations === 'function') {
            const before = Object.keys(bot.conversations || {}).length;
            bot.cleanupConversations();
            const after = Object.keys(bot.conversations || {}).length;
            totalCleaned += (before - after);
        }
    }

    if (totalCleaned > 0) {
        console.log(`🧹 conversations: очищено ${totalCleaned} записей у всех ботов`);
    }
}
