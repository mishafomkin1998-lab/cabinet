// ============= ONLINE SMART - Горячая очередь =============

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

        return {
            manId: parseInt(manId),
            name: entry.name
        };
    }

    return null;
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

// ============= FRESH ONLINE - Детектор новых онлайн =============

// Обновить список свежих онлайн (вызывается при получении списка online)
function updateFreshOnline(currentUsers) {
    const now = Date.now();
    const currentIds = new Set();
    let newCount = 0;

    for (const user of currentUsers) {
        const id = user.AccountId.toString();
        currentIds.add(id);

        // Если НЕ был в предыдущем списке — это НОВЫЙ онлайн!
        if (!previousOnlineIds.has(id)) {
            if (!freshOnlineUsers.has(id)) {
                freshOnlineUsers.set(id, {
                    firstSeen: now,
                    user: user
                });
                newCount++;
            }
        }
    }

    previousOnlineIds = currentIds;
    cleanupFreshOnline();

    if (newCount > 0) {
        console.log(`[FreshOnline] 🆕 Обнаружено ${newCount} новых онлайн! Всего свежих: ${freshOnlineUsers.size}`);
    }
}

// Получить свежего пользователя для бота
function getFromFreshOnline(botId, bot) {
    cleanupFreshOnline();

    for (const [id, entry] of freshOnlineUsers) {
        // Пропускаем если в blacklist/sent/errors
        if (!bot.canSendMailTo(parseInt(id))) continue;

        // Пропускаем если уже отправляли через hotQueue
        if (hotManQueue[id] && hotManQueue[id].sentBy.includes(botId)) continue;

        console.log(`[FreshOnline] 🎯 Найден свежий: ${entry.user.Name} (ID ${id})`);
        return entry.user;
    }
    return null;
}

// Удалить из свежих после отправки
function removeFromFreshOnline(userId) {
    const id = userId.toString();
    if (freshOnlineUsers.has(id)) {
        freshOnlineUsers.delete(id);
    }
}

// Очистка старых записей (> 5 минут)
function cleanupFreshOnline() {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, entry] of freshOnlineUsers) {
        if (now - entry.firstSeen > FRESH_ONLINE_EXPIRY_MS) {
            freshOnlineUsers.delete(id);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`[FreshOnline] 🧹 Очищено ${cleaned} устаревших записей`);
    }
}
