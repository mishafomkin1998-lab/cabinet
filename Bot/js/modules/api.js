// ============= ИНФОРМАЦИЯ О ПРОГРАММЕ =============
// APP_VERSION определена в config.js (загружается раньше)
let APP_PLATFORM = 'Unknown';
let APP_ARCH = '';

// Получаем информацию о платформе и архитектуре
try {
    if (typeof process !== 'undefined') {
        // process.platform: 'win32', 'darwin', 'linux'
        // process.arch: 'x64', 'ia32', 'arm', 'arm64'
        const platformNames = {
            'win32': 'Windows',
            'darwin': 'macOS',
            'linux': 'Linux'
        };
        const archNames = {
            'x64': '64-bit',
            'ia32': '32-bit',
            'arm': 'ARM',
            'arm64': 'ARM64'
        };
        APP_PLATFORM = platformNames[process.platform] || process.platform;
        APP_ARCH = archNames[process.arch] || process.arch;
    } else {
        // Fallback для браузера
        APP_PLATFORM = navigator.platform || 'Unknown';
    }
} catch (e) {
    APP_PLATFORM = navigator.platform || 'Unknown';
}

console.log(`📦 Версия приложения: ${APP_VERSION}, Платформа: ${APP_PLATFORM} ${APP_ARCH}`);

// ============= MACHINE ID (уникальный ID программы-бота) =============
// Генерируется один раз при первом запуске и сохраняется в localStorage
function getMachineId() {
    let machineId = localStorage.getItem('machineId');
    if (!machineId) {
        // Генерируем уникальный ID для этой установки программы
        machineId = 'machine_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('machineId', machineId);
        console.log(`🆔 Сгенерирован новый machineId: ${machineId}`);
    }
    return machineId;
}
const MACHINE_ID = getMachineId();
console.log(`🤖 Программа запущена с machineId: ${MACHINE_ID}`);

// ============= СТАТИСТИКА СЕССИИ =============
// Отслеживает статистику с момента запуска программы
const sessionStats = {
    startedAt: new Date().toISOString(),
    mailSent: 0,
    chatSent: 0,
    errors: 0,

    // Методы для обновления статистики
    addMailSent() { this.mailSent++; },
    addChatSent() { this.chatSent++; },
    addError() { this.errors++; },

    // Получить uptime в секундах
    getUptime() {
        return Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000);
    },

    // Получить статистику для отправки
    getStats() {
        return {
            startedAt: this.startedAt,
            mailSent: this.mailSent,
            chatSent: this.chatSent,
            errors: this.errors,
            uptime: this.getUptime()
        };
    }
};

// Функция сбора информации о всех ботах (анкетах)
function collectBotsInfo() {
    // bots - глобальная переменная из config.js
    if (typeof bots === 'undefined' || !bots) {
        return { total: 0, running: 0, stopped: 0, list: [] };
    }

    const botsList = Object.values(bots);
    const list = [];
    let running = 0;
    let stopped = 0;

    for (const bot of botsList) {
        const isRunning = bot.mailRunning || bot.chatRunning || false;
        if (isRunning) running++;
        else stopped++;

        list.push({
            profileId: bot.displayId,
            status: isRunning ? 'running' : 'stopped',
            mode: bot.mailRunning ? 'mail' : (bot.chatRunning ? 'chat' : 'idle')
        });
    }

    return {
        total: botsList.length,
        running: running,
        stopped: stopped,
        list: list
    };
}

// Получить использование памяти (если доступно)
function getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
        const mem = process.memoryUsage();
        return Math.round(mem.heapUsed / 1024 / 1024); // MB
    }
    if (performance && performance.memory) {
        return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024); // MB
    }
    return null;
}

// Конвертация миллисекунд в формат PostgreSQL INTERVAL (HH:MM:SS)
function millisecondsToInterval(ms) {
    if (!ms || ms <= 0) return null;

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// 1. Функция отправки сообщения на Lababot сервер (ПОЛНАЯ СПЕЦИФИКАЦИЯ)
// ВАЖНО: botId теперь это MACHINE_ID (ID программы), accountDisplayId - ID анкеты
async function sendMessageToLababot(params) {
    // Параметры: botId (игнорируется, используется MACHINE_ID), accountDisplayId, recipientId, type, textContent, status,
    // responseTime, errorReason, isFirst, isLast, convId, mediaUrl, fileName, translatorId, usedAi

    const {
        botId,  // Оставляем для совместимости, но используем MACHINE_ID
        accountDisplayId,
        recipientId,
        type,
        textContent = '',
        status = 'success',
        responseTime = null,
        errorReason = null,
        isFirst = false,
        isLast = false,
        convId = null,
        mediaUrl = null,
        fileName = null,
        translatorId = null,
        usedAi = false
    } = params;

    console.log(`📤 Отправляю сообщение на Lababot сервер: программа=${MACHINE_ID}, анкета=${accountDisplayId}, получатель=${recipientId}, тип=${type}`);

    try {
        const payload = {
            botId: MACHINE_ID,  // ID программы-бота (один на всю программу)
            accountDisplayId: accountDisplayId,
            recipientId: String(recipientId),
            type: type, // 'outgoing' (письмо $1.5) или 'chat_msg' (чат $0.15)
            length: textContent.length || 0,
            isFirst: isFirst,
            isLast: isLast,
            convId: convId,
            responseTime: responseTime, // Формат PostgreSQL INTERVAL: "00:05:30"
            status: status, // 'success', 'failed', 'pending'
            textContent: textContent || '',
            mediaUrl: mediaUrl,
            fileName: fileName,
            translatorId: translatorId,
            errorReason: errorReason,
            usedAi: usedAi // Флаг использования ИИ генерации
        };

        console.log('📦 Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(`${LABABOT_SERVER}/api/message_sent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log(`✅ Ответ от Lababot сервера:`, data);

        if (data.status === 'ok' || data.status === 'ignored') {
            // Обновляем статистику сессии
            if (status === 'success') {
                if (type === 'outgoing') {
                    sessionStats.addMailSent();
                } else if (type === 'chat_msg') {
                    sessionStats.addChatSent();
                }
            } else if (status === 'failed') {
                sessionStats.addError();
            }
            return { success: true, data: data };
        } else {
            console.warn(`⚠️ Lababot сервер вернул:`, data);
            return { success: false, error: data.error || 'Unknown error' };
        }
    } catch (error) {
        console.error(`❌ Ошибка отправки на Lababot сервер:`, error);
        sessionStats.addError();
        return { success: false, error: error.message };
    }
}

// 2. Функция отправки входящего сообщения от мужчины
// ВАЖНО: botId теперь это MACHINE_ID (ID программы)
async function sendIncomingMessageToLababot(params) {
    const { botId, profileId, manId, manName, messageId, type = 'letter', messageText } = params;

    try {
        const response = await fetch(`${LABABOT_SERVER}/api/incoming_message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                botId: MACHINE_ID,  // ID программы-бота
                profileId: profileId,
                manId: String(manId),
                manName: manName || null,
                messageId: String(messageId),
                type: type,
                timestamp: new Date().toISOString(),
                messageText: messageText || null
            })
        });

        const data = await response.json();
        if (data.isFirstFromMan) {
            console.log(`📨 Новый уникальный мужчина: ${manName || manId} → ${profileId}`);
        }
        return { success: true, data: data };
    } catch (error) {
        console.error(`❌ Ошибка отправки входящего на Lababot:`, error);
        return { success: false, error: error.message };
    }
}

// 3. Функция отправки heartbeat с расширенной статистикой
// ВАЖНО: botId теперь это MACHINE_ID (ID программы), а не ID анкеты!
async function sendHeartbeatToLababot(botId, displayId, status = 'online', skipCommands = false) {
    console.log(`❤️ Отправляю heartbeat для анкеты ${displayId} (программа: ${MACHINE_ID})`);

    try {
        // Собираем информацию о всех анкетах
        const botsInfo = collectBotsInfo();
        const stats = sessionStats.getStats();
        const memoryMB = getMemoryUsage();

        // Определяем текущий глобальный режим
        const currentMode = (typeof globalMode !== 'undefined') ? globalMode : 'mail';

        const payload = {
            botId: MACHINE_ID,  // ID программы-бота (один на всю программу)
            accountDisplayId: displayId,  // ID анкеты (для совместимости)
            status: status,
            timestamp: new Date().toISOString(),

            // Расширенная информация о программе
            version: APP_VERSION,
            platform: APP_PLATFORM + (APP_ARCH ? ' ' + APP_ARCH : ''),
            uptime: stats.uptime,  // Секунды с запуска
            memoryUsage: memoryMB,  // MB

            // Информация об анкетах
            profilesTotal: botsInfo.total,
            profilesRunning: botsInfo.running,
            profilesStopped: botsInfo.stopped,
            profilesList: botsInfo.list,  // Список всех анкет с их статусами

            // Статистика за сессию
            sessionStats: {
                startedAt: stats.startedAt,
                mailSent: stats.mailSent,
                chatSent: stats.chatSent,
                errors: stats.errors
            },

            // Текущий режим работы
            globalMode: currentMode
        };

        const response = await fetch(`${LABABOT_SERVER}/api/heartbeat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log(`✅ Heartbeat отправлен:`, data);

        // После heartbeat проверяем статус управления (пропускаем при удалении)
        if (!skipCommands) {
            checkControlStatus();
        }

        // Обрабатываем команды для конкретной анкеты (пропускаем при удалении)
        if (data.commands && typeof bots !== 'undefined' && !skipCommands) {
            // Проверяем статус бот-машины (botEnabled) - влияет на ВСЕ анкеты
            const wasBotEnabled = controlStatus.botEnabled !== false;
            controlStatus.botEnabled = data.commands.botEnabled !== false;

            // Если бот-машина была отключена - останавливаем ВСЕ рассылки
            if (wasBotEnabled && !controlStatus.botEnabled) {
                console.log(`🔴 Бот-машина отключена администратором! Останавливаю все рассылки...`);
                stopAllMailingOnBotDisabled();
            } else if (!wasBotEnabled && controlStatus.botEnabled) {
                console.log(`🟢 Бот-машина включена администратором`);
            }

            // Ищем бота по displayId для обновления mailingEnabled (per-profile)
            for (const botId in bots) {
                const bot = bots[botId];
                if (bot && bot.displayId === displayId) {
                    // Обновляем статус mailingEnabled для этой анкеты
                    const wasEnabled = bot.mailingEnabled !== false; // По умолчанию true
                    bot.mailingEnabled = data.commands.mailingEnabled !== false;

                    // Если рассылка была отключена с сервера - останавливаем
                    if (wasEnabled && !bot.mailingEnabled) {
                        console.log(`⛔ Рассылка для ${displayId} отключена с сервера`);
                        if (bot.isMailRunning) {
                            bot.stopMail();
                            console.log(`⛔ Mail остановлен для ${displayId}`);
                        }
                        if (bot.isChatRunning) {
                            bot.stopChat();
                            console.log(`⛔ Chat остановлен для ${displayId}`);
                        }
                    } else if (!wasEnabled && bot.mailingEnabled) {
                        console.log(`✅ Рассылка для ${displayId} включена с сервера`);
                    }
                    break;
                }
            }
        }

        return data;
    } catch (error) {
        console.error(`❌ Ошибка heartbeat:`, error);
        return null;
    }
}

// 4. Функция проверки статуса управления (panic mode, stopSpam)
async function checkControlStatus() {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bots/control/panic-status`);
        const data = await response.json();

        if (data.success) {
            const wasPanic = controlStatus.panicMode;
            const wasStopSpam = controlStatus.stopSpam;

            controlStatus.panicMode = data.panicMode === true;
            controlStatus.stopSpam = data.stopSpam === true;
            controlStatus.lastCheck = new Date();

            // Если включился panic mode - остановить все рассылки (критичный)
            if (!wasPanic && controlStatus.panicMode) {
                console.log('🚨 PANIC MODE АКТИВИРОВАН! Останавливаю все рассылки...');
                stopAllMailingOnPanic();
            } else if (wasPanic && !controlStatus.panicMode) {
                console.log('✅ Panic Mode отключен');
            }

            // Если включился stopSpam - остановить все рассылки (мягкий, можно перезапустить)
            if (!wasStopSpam && controlStatus.stopSpam) {
                console.log('⛔ STOP SPAM АКТИВИРОВАН! Останавливаю все рассылки...');
                stopAllMailingOnStopSpam();
            } else if (wasStopSpam && !controlStatus.stopSpam) {
                console.log('✅ Stop Spam отключен - можно запускать рассылки');
            }
        }

        return controlStatus;
    } catch (error) {
        console.error('❌ Ошибка проверки статуса управления:', error);
        return controlStatus;
    }
}

// Функция остановки всех рассылок при panic mode (критичный - блокирует запуск)
function stopAllMailingOnPanic() {
    for (const botId in bots) {
        const bot = bots[botId];
        if (bot) {
            if (bot.isMailRunning) {
                bot.stopMail();
                console.log(`⛔ Остановлена Mail рассылка для ${bot.displayId}`);
            }
            if (bot.isChatRunning) {
                bot.stopChat();
                console.log(`⛔ Остановлена Chat рассылка для ${bot.displayId}`);
            }
        }
    }
    console.log('🚨 Panic Mode: все рассылки остановлены!');
}

// Функция остановки всех рассылок при stopSpam (мягкий - можно перезапустить)
function stopAllMailingOnStopSpam() {
    for (const botId in bots) {
        const bot = bots[botId];
        if (bot) {
            if (bot.isMailRunning) {
                bot.stopMail();
                console.log(`⛔ Остановлена Mail рассылка для ${bot.displayId}`);
            }
            if (bot.isChatRunning) {
                bot.stopChat();
                console.log(`⛔ Остановлена Chat рассылка для ${bot.displayId}`);
            }
        }
    }
    console.log('⛔ Stop Spam: все рассылки остановлены администратором');
}

// Функция остановки всех рассылок при отключении бот-машины (блокирует запуск)
function stopAllMailingOnBotDisabled() {
    for (const botId in bots) {
        const bot = bots[botId];
        if (bot) {
            if (bot.isMailRunning) {
                bot.stopMail();
                console.log(`🔴 Mail остановлен для ${bot.displayId} (бот отключен)`);
            }
            if (bot.isChatRunning) {
                bot.stopChat();
                console.log(`🔴 Chat остановлен для ${bot.displayId} (бот отключен)`);
            }
        }
    }
    console.log('🔴 Бот отключен администратором! Все рассылки остановлены.');
}

// 5. Функция отправки ошибки
// ВАЖНО: botId теперь это MACHINE_ID (ID программы)
async function sendErrorToLababot(botId, accountDisplayId, errorType, errorMessage) {
    console.log(`⚠️ Отправляю ошибку на Lababot сервер: ${errorType}`);

    try {
        const response = await fetch(`${LABABOT_SERVER}/api/error`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                botId: MACHINE_ID,  // ID программы-бота
                accountDisplayId: accountDisplayId,
                endpoint: 'bot_send_message',
                errorType: errorType,
                message: errorMessage.substring(0, 200) || 'Unknown error',
                rawData: null,
                userId: null
            })
        });

        const data = await response.json();
        console.log(`✅ Ошибка отправлена на сервер:`, data);
        return data;
    } catch (error) {
        console.error(`❌ Ошибка отправки ошибки:`, error);
        return null;
    }
}

// 4. Функция отправки activity ping (трекинг активности оператора)
// ВАЖНО: Отправляет пинг только когда переводчик РЕАЛЬНО работает (клики, печать).
// Автоматические действия бота НЕ должны вызывать эту функцию!
async function sendActivityPingToLababot(botId, profileId) {
    try {
        // Получаем ID переводчика из настроек
        const translatorId = globalSettings?.translatorId;

        if (!translatorId) {
            console.warn('⚠️ Переводчик не настроен в Settings. Пинг не отправлен.');
            return null;
        }

        // Отправляем на правильный endpoint который пишет в user_activity
        const response = await fetch(`${LABABOT_SERVER}/api/stats/activity-ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: translatorId
            })
        });
        return await response.json();
    } catch (error) {
        console.error(`❌ Ошибка activity ping:`, error);
        return null;
    }
}

// ============= СИСТЕМА ТРЕКИНГА АКТИВНОСТИ ОПЕРАТОРА =============
const activityTracker = {
    lastActivityTime: 0,
    lastPingTime: 0,
    pingInterval: 30000, // Отправлять ping каждые 30 секунд
    inactivityTimeout: 120000, // 2 минуты без активности = не работает
    isTracking: false,

    // Регистрация активности (клик или печать)
    recordActivity() {
        this.lastActivityTime = Date.now();

        // Если давно не отправляли ping и есть активный бот - отправляем
        const now = Date.now();
        if (now - this.lastPingTime >= this.pingInterval) {
            this.sendPingForActiveBot();
        }
    },

    // Отправить ping для активного бота
    sendPingForActiveBot() {
        const activeBot = this.getActiveBot();
        if (activeBot && activeBot.displayId) {
            this.lastPingTime = Date.now();
            sendActivityPingToLababot(activeBot.id, activeBot.displayId);
        }
    },

    // Получить активного бота (текущий выбранный таб)
    getActiveBot() {
        if (typeof activeTabId !== 'undefined' && activeTabId && typeof bots !== 'undefined') {
            return bots[activeTabId];
        }
        return null;
    },

    // Запуск трекинга
    startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;

        // Слушаем клики
        document.addEventListener('mousedown', () => this.recordActivity(), true);

        // Слушаем печать
        document.addEventListener('keydown', () => this.recordActivity(), true);

        console.log('%c[Lababot] Activity tracking started', 'color: green; font-weight: bold');
    }
};

// Запускаем трекинг активности
activityTracker.startTracking();

// ============= API ДЛЯ РАБОТЫ С ДАННЫМИ БОТА (шаблоны, blacklist, статистика) =============

// Загрузка данных бота с сервера
async function loadBotDataFromServer(profileId) {
    try {
        console.log(`🔄 Загрузка данных с сервера для ${profileId}...`);
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}`);
        const result = await response.json();
        console.log(`📦 Ответ сервера для ${profileId}:`, JSON.stringify(result, null, 2));
        if (result.success) {
            console.log(`📥 Данные бота загружены для ${profileId}:`, result.data);
            return result.data;
        }
        console.warn(`⚠️ Сервер вернул success=false для ${profileId}`);
        return null;
    } catch (error) {
        console.error(`❌ Ошибка загрузки данных бота:`, error);
        return null;
    }
}

// Сохранение шаблонов на сервер
async function saveTemplatesToServer(profileId, type, templates) {
    try {
        const body = type === 'chat'
            ? { templatesChat: templates }
            : { templatesMail: templates };

        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        console.log(`💾 Шаблоны ${type} сохранены для ${profileId}`);
        return result.success;
    } catch (error) {
        console.error(`❌ Ошибка сохранения шаблонов:`, error);
        return false;
    }
}

// Сохранение blacklist на сервер
async function saveBlacklistToServer(profileId, type, blacklist) {
    try {
        const body = type === 'chat'
            ? { blacklistChat: blacklist }
            : { blacklistMail: blacklist };

        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        console.log(`📝 Blacklist ${type} сохранён для ${profileId}, ответ:`, result);
        return result.success;
    } catch (error) {
        console.error(`❌ Ошибка сохранения blacklist:`, error);
        return false;
    }
}

// Увеличение счётчика статистики на сервере
async function incrementStatsOnServer(profileId, type, field, amount = 1) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}/increment-stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, field, amount })
        });
        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error(`❌ Ошибка обновления статистики:`, error);
        return false;
    }
}

// Сброс статистики на сервере
async function resetStatsOnServer(profileId, type) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}/reset-stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        });
        const result = await response.json();
        console.log(`🔄 Статистика ${type} сброшена для ${profileId}`);
        return result.success;
    } catch (error) {
        console.error(`❌ Ошибка сброса статистики:`, error);
        return false;
    }
}

// Debounce для автосохранения (3 секунды)
const saveDebounceTimers = {};
function debounceSaveTemplate(profileId, type, templates, delay = 3000) {
    const key = `${profileId}_${type}`;
    if (saveDebounceTimers[key]) {
        clearTimeout(saveDebounceTimers[key]);
    }
    saveDebounceTimers[key] = setTimeout(() => {
        saveTemplatesToServer(profileId, type, templates);
    }, delay);
}

// 5. Функция проверки статуса профиля (paused и allowed)
async function checkProfileStatus(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/profiles/${encodeURIComponent(profileId)}/status`);
        const data = await response.json();
        return {
            paused: data.paused === true,
            exists: data.exists === true,
            allowed: data.allowed === true,
            reason: data.reason || null
        };
    } catch (error) {
        console.error(`❌ Ошибка проверки статуса профиля:`, error);
        // При ошибке разрешаем работу чтобы не блокировать
        return { paused: false, exists: true, allowed: true };
    }
}

// Обратная совместимость
async function checkProfilePaused(profileId) {
    const status = await checkProfileStatus(profileId);
    return status.paused;
}

// 6. Функция проверки оплаты профиля
async function checkProfilePaymentStatus(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/billing/profile-status/${encodeURIComponent(profileId)}`);
        const data = await response.json();
        return {
            isPaid: data.isPaid === true,
            isFree: data.isFree === true, // "мой админ" - бесплатно
            isTrial: data.isTrial === true,
            trialUsed: data.trialUsed === true,
            canTrial: !data.trialUsed && !data.isPaid, // Можно активировать trial
            daysLeft: data.daysLeft || 0,
            reason: data.reason || 'unknown'
        };
    } catch (error) {
        console.error(`❌ Ошибка проверки оплаты профиля:`, error);
        // При ошибке разрешаем работу
        return { isPaid: true, isFree: false, isTrial: false, trialUsed: false, canTrial: false, daysLeft: 999 };
    }
}

// 7. Функция активации тестового периода
async function activateTrialPeriod(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bots/activate-trial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId: profileId })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`❌ Ошибка активации trial:`, error);
        return { success: false, error: error.message };
    }
}

// 8. Функция показа диалога оплаты/trial
function showPaymentDialog(profileId, canTrial) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:white;border-radius:8px;padding:20px;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);';

        let html = `
            <h3 style="margin:0 0 15px 0;font-size:16px;">ladabot</h3>
            <p style="margin:0 0 10px 0;">Анкета ${profileId} не оплачена.${canTrial ? '' : ' Тестовый период истёк.'}</p>
            <p style="margin:0 0 20px 0;color:#666;font-size:14px;">Обратитесь за пополнением в телеграм к пользователю @S_Shevil</p>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
        `;

        if (canTrial) {
            html += `<button id="trialBtn" style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;">Получить 2 тестовых дня</button>`;
        }
        html += `<button id="cancelBtn" style="padding:8px 16px;background:#f0f0f0;border:1px solid #ccc;border-radius:4px;cursor:pointer;">OK</button>`;
        html += '</div>';

        dialog.innerHTML = html;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        dialog.querySelector('#cancelBtn').onclick = () => {
            document.body.removeChild(overlay);
            resolve({ action: 'cancel' });
        };

        if (canTrial) {
            dialog.querySelector('#trialBtn').onclick = async () => {
                const btn = dialog.querySelector('#trialBtn');
                btn.disabled = true;
                btn.textContent = 'Активация...';

                const result = await activateTrialPeriod(profileId);
                document.body.removeChild(overlay);

                if (result.success) {
                    alert('✅ Тестовый период активирован на 2 дня!');
                    resolve({ action: 'trial_activated' });
                } else {
                    alert('❌ Ошибка: ' + (result.message || result.error || 'Не удалось активировать'));
                    resolve({ action: 'error', error: result.error });
                }
            };
        }
    });
}

// ============= ПОЛУЧЕНИЕ ПОЛНОГО ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ =============
// Кэш профилей (чтобы не запрашивать повторно)
const userProfileCache = new Map();
const PROFILE_CACHE_TTL = 30 * 60 * 1000; // 30 минут

// Очистка устаревших записей кэша
function cleanProfileCache() {
    const now = Date.now();
    for (const [key, value] of userProfileCache.entries()) {
        if (now - value.timestamp > PROFILE_CACHE_TTL) {
            userProfileCache.delete(key);
        }
    }
}
setInterval(cleanProfileCache, 5 * 60 * 1000); // Очищаем каждые 5 минут

// Получение полного профиля пользователя
async function fetchUserProfile(bot, userId) {
    // Проверяем кэш
    const cacheKey = `${userId}`;
    const cached = userProfileCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < PROFILE_CACHE_TTL)) {
        console.log(`📋 Профиль ${userId} из кэша`);
        return cached.data;
    }

    try {
        console.log(`🔍 Загрузка профиля ${userId}...`);

        // Получаем HTML страницу профиля
        const res = await makeApiRequest(bot, 'GET', `/profile/${userId}`);
        const html = res.data;

        console.log(`[Profile HTML] Получено ${html ? html.length : 0} символов, тип: ${typeof html}`);

        // Если вернулся объект вместо строки - возможно это JSON ответ
        if (html && typeof html === 'object') {
            console.log(`[Profile] Получен JSON объект, парсим как JSON`);
            const profile = parseProfileJson(html, userId);
            userProfileCache.set(cacheKey, { data: profile, timestamp: Date.now() });
            console.log(`✅ Профиль ${userId} загружен из JSON:`, {
                Name: profile.Name, Occupation: profile.Occupation, MaritalStatus: profile.MaritalStatus
            });
            return profile;
        }

        if (!html || typeof html !== 'string' || html.length < 100) {
            console.warn(`⚠️ Пустой или короткий ответ для профиля ${userId}`);
            return null;
        }

        // Логируем первые 500 символов для отладки
        console.log(`[Profile HTML] Первые 500 символов: ${html.substring(0, 500)}`);

        // Парсим HTML страницу профиля
        const profile = parseProfileHtml(html, userId);

        // Сохраняем в кэш
        userProfileCache.set(cacheKey, {
            data: profile,
            timestamp: Date.now()
        });

        console.log(`✅ Профиль ${userId} загружен:`, {
            Name: profile.Name,
            Age: profile.Age,
            City: profile.City,
            Occupation: profile.Occupation,
            MaritalStatus: profile.MaritalStatus,
            Children: profile.Children,
            Zodiac: profile.Zodiac,
            Height: profile.Height
        });
        return profile;

    } catch (error) {
        console.error(`❌ Ошибка загрузки профиля ${userId}:`, error);
        return null;
    }
}

// Парсинг JSON ответа профиля
function parseProfileJson(data, userId) {
    return {
        AccountId: userId,
        Name: data.Name || data.FirstName || '',
        Age: data.Age || '',
        City: data.City || data.CityName || '',
        Country: data.Country || data.CountryName || '',
        Occupation: data.Occupation || data.Job || '',
        MaritalStatus: data.MaritalStatus || data.FamilyStatus || '',
        Children: data.Children || data.Kids || '',
        WantChildren: data.WantChildren || data.WantKids || '',
        Height: data.Height || '',
        Weight: data.Weight || '',
        HairColor: data.HairColor || data.Hair || '',
        EyesColor: data.EyesColor || data.Eyes || data.EyeColor || '',
        BodyType: data.BodyType || data.Body || '',
        Zodiac: data.Zodiac || data.ZodiacSign || '',
        Birthday: data.Birthday || data.BirthDate || '',
        Religion: data.Religion || '',
        Ethnicity: data.Ethnicity || '',
        Education: data.Education || '',
        Smoke: data.Smoke || data.Smoking || '',
        Drink: data.Drink || data.Drinking || data.Alcohol || '',
        EnglishLevel: data.EnglishLevel || data.English || '',
        Languages: data.Languages || '',
        Hobby: data.Hobby || data.Hobbies || data.Interests || '',
        AboutMe: data.AboutMe || data.About || data.Description || '',
        AboutPartner: data.AboutPartner || data.LookingFor || ''
    };
}

// Парсинг HTML страницы профиля
function parseProfileHtml(html, userId) {
    const profile = {
        AccountId: userId,
        Name: '',
        Age: '',
        City: '',
        Country: '',
        Occupation: '',
        MaritalStatus: '',
        Children: '',
        WantChildren: '',
        Height: '',
        Weight: '',
        HairColor: '',
        HairStyle: '',
        EyesColor: '',
        BodyType: '',
        Zodiac: '',
        Birthday: '',
        Religion: '',
        Ethnicity: '',
        Education: '',
        Smoke: '',
        Drink: '',
        EnglishLevel: '',
        Languages: '',
        Hobby: '',
        AboutMe: '',
        AboutPartner: ''
    };

    try {
        // Имя и возраст из хлебных крошек или заголовка
        const nameAgeMatch = html.match(/<b>([^<]+)<\/b>,\s*<span>(\d+)<\/span>/);
        if (nameAgeMatch) {
            profile.Name = nameAgeMatch[1].trim();
            profile.Age = nameAgeMatch[2].trim();
            console.log(`[Parse] Найдено имя: ${profile.Name}, возраст: ${profile.Age}`);
        } else {
            console.log(`[Parse] Имя/возраст не найдены в стандартном формате`);
        }

        // Парсим поля из user_row-inner блоков
        const extractField = (label) => {
            // Ищем паттерн: <div class="name_row...">Label</div> ... <div class="value_row...">Value</div>
            const regex = new RegExp(
                `<div[^>]*class="name_row[^"]*"[^>]*>\\s*${label}\\s*</div>[\\s\\S]*?<div[^>]*class="value_row[^"]*"[^>]*>([\\s\\S]*?)</div>`,
                'i'
            );
            const match = html.match(regex);
            if (match && match[1]) {
                // Очищаем от HTML тегов и лишних пробелов
                let value = match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
                return value;
            }
            return '';
        };

        // Location (город и страна)
        const locationMatch = html.match(/<div[^>]*class="name_row[^"]*"[^>]*>\s*Location\s*<\/div>[\s\S]*?<div[^>]*class="value_row[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (locationMatch) {
            const locHtml = locationMatch[1];
            const cityMatch = locHtml.match(/<span>([^<,]+)/);
            if (cityMatch) profile.City = cityMatch[1].trim().replace(',', '');

            const countryMatch = locHtml.match(/<a[^>]*>([^<]+)/);
            if (countryMatch) profile.Country = countryMatch[1].trim();
        }

        // Остальные поля
        profile.Occupation = extractField('Occupation');
        profile.MaritalStatus = extractField('Marital Status');
        profile.Children = extractField('Children');
        profile.WantChildren = extractField('Want Children') || extractField('Want children');
        profile.Height = extractField('Height');
        profile.Weight = extractField('Weight');
        profile.HairColor = extractField('Hair Color');
        profile.HairStyle = extractField('Hair Style');
        profile.EyesColor = extractField('Eyes Color');
        profile.BodyType = extractField('Body Type');
        profile.Religion = extractField('Religion');
        profile.Ethnicity = extractField('Ethnicity');
        profile.Education = extractField('Education');
        profile.Smoke = extractField('Smoke');
        profile.Drink = extractField('Drink');
        profile.EnglishLevel = extractField('Level of English');
        profile.Languages = extractField('Languages') || extractField('Language');

        console.log(`[Parse] Извлечённые поля: Occupation=${profile.Occupation}, Marital=${profile.MaritalStatus}, Children=${profile.Children}, Height=${profile.Height}`);

        // Birthday и Zodiac
        const birthdayMatch = html.match(/<div[^>]*class="name_row[^"]*"[^>]*>\s*Birthday\s*<\/div>[\s\S]*?<div[^>]*class="value_row[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (birthdayMatch) {
            const bdHtml = birthdayMatch[1];
            // Зодиак
            const zodiacMatch = bdHtml.match(/<a[^>]*>([^<]+)<\/a>/);
            if (zodiacMatch) profile.Zodiac = zodiacMatch[1].trim();
            // Дата рождения
            const dateMatch = bdHtml.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
            if (dateMatch) profile.Birthday = dateMatch[1].trim();
        }

        // Hobby
        const hobbyMatch = html.match(/<h2[^>]*>Hobby<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
        if (hobbyMatch) {
            profile.Hobby = hobbyMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        }

        // About Myself
        const aboutMatch = html.match(/<h2[^>]*>About Myself<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
        if (aboutMatch) {
            profile.AboutMe = aboutMatch[1].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
        }

        // About Partner
        const partnerMatch = html.match(/<h2[^>]*>About Partner[^<]*<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
        if (partnerMatch) {
            profile.AboutPartner = partnerMatch[1].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
        }

    } catch (e) {
        console.error('Ошибка парсинга профиля:', e);
    }

    return profile;
}

// Очистка кэша профилей (для использования извне)
function clearProfileCache() {
    userProfileCache.clear();
    console.log('🗑️ Кэш профилей очищен');
}

// === КРИТИЧЕСКИ ВАЖНО: Скрипт "Анти-сон" ===
