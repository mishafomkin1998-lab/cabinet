// ============= ONLINE SMART - Горячая очередь и глобальные лимиты =============

// Добавить мужчину в горячую очередь (вызывается при успешной отправке)
function addToHotQueue(manId, manName, botId) {
    const manIdStr = manId.toString();
    const now = Date.now();

    if (hotManQueue[manIdStr]) {
        // Уже в очереди - добавляем бота в список отправивших
        if (!hotManQueue[manIdStr].sentBy.includes(botId)) {
            hotManQueue[manIdStr].sentBy.push(botId);
        }
        // Обновляем время (продлеваем жизнь в очереди)
        hotManQueue[manIdStr].addedAt = now;
    } else {
        // Новый в очереди
        hotManQueue[manIdStr] = {
            addedAt: now,
            sentBy: [botId],
            name: manName || `ID ${manId}`
        };
    }

    console.log(`[OnlineSmart] 🔥 ${manName || manId} добавлен в горячую очередь (отправили: ${hotManQueue[manIdStr].sentBy.length} анкет)`);
}

// Получить мужчину из горячей очереди для конкретного бота
// Возвращает { manId, name } или null если нет подходящих
function getFromHotQueue(botId, bot) {
    const now = Date.now();

    // Очищаем просроченные записи
    cleanupHotQueue();

    // Ищем мужчину, которому этот бот ещё не отправлял
    for (const manId in hotManQueue) {
        const entry = hotManQueue[manId];

        // Пропускаем если этот бот уже отправлял
        if (entry.sentBy.includes(botId)) continue;

        // Пропускаем если в blacklist, sent или errors этого бота
        if (!bot.canSendMailTo(parseInt(manId))) continue;

        // Пропускаем если в глобальных лимитах (2+ анкеты получили лимит)
        if (globalLimitedMen[manId] && globalLimitedMen[manId].failedBots.length >= 2) continue;

        return {
            manId: parseInt(manId),
            name: entry.name
        };
    }

    return null;
}

// Обработать ошибку глобального лимита
function handleGlobalLimit(manId, manName, botId) {
    const manIdStr = manId.toString();
    const now = Date.now();

    if (!globalLimitedMen[manIdStr]) {
        globalLimitedMen[manIdStr] = {
            failedBots: [botId],
            limitedAt: now,
            name: manName || `ID ${manId}`
        };
    } else {
        if (!globalLimitedMen[manIdStr].failedBots.includes(botId)) {
            globalLimitedMen[manIdStr].failedBots.push(botId);
        }
    }

    const failedCount = globalLimitedMen[manIdStr].failedBots.length;
    console.log(`[OnlineSmart] ⚠️ Лимит для ${manName || manId}: ${failedCount} анкет не смогли отправить`);

    // Если 2+ анкеты получили лимит - добавляем в errors ВСЕХ ботов
    if (failedCount >= 2) {
        console.log(`[OnlineSmart] 🚫 ${manName || manId}: глобальный лимит! Добавляем в ошибки всех анкет`);

        Object.values(bots).forEach(bot => {
            const errorEntry = `${manId}: Global hourly limit`;
            // Проверяем что ещё не в ошибках
            const alreadyInErrors = bot.mailHistory.errors.some(e => e.startsWith(`${manId}:`));
            if (!alreadyInErrors) {
                bot.mailHistory.errors.push(errorEntry);
                bot.mailStats.errors++;
                bot.updateUI();
            }
        });

        // Удаляем из горячей очереди
        delete hotManQueue[manIdStr];

        showToast(`🚫 ID ${manId}: глобальный лимит (добавлен в ошибки всех анкет)`, 'warning');
    }
}

// Очистка просроченных записей в горячей очереди (старше 5 минут)
function cleanupHotQueue() {
    const now = Date.now();
    let cleaned = 0;

    for (const manId in hotManQueue) {
        if (now - hotManQueue[manId].addedAt > HOT_QUEUE_EXPIRY_MS) {
            delete hotManQueue[manId];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`[OnlineSmart] 🧹 Очищено ${cleaned} просроченных записей из горячей очереди`);
    }
}
