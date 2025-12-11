const KEEP_ALIVE_SCRIPT = `
    console.log("%c[Lababot] Анти-сон активирован", "color: green; font-weight: bold");
    Object.defineProperty(document, 'hidden', { value: false, writable: false });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });

    setInterval(() => {
        const x = Math.floor(Math.random() * window.innerWidth);
        const y = Math.floor(Math.random() * window.innerHeight);
        const moveEvent = new MouseEvent('mousemove', {
            view: window, bubbles: true, cancelable: true, clientX: x, clientY: y
        });
        document.dispatchEvent(moveEvent);
        if (Math.random() > 0.8) {
            window.scrollBy(0, (Math.random() < 0.5 ? -10 : 10));
        }
    }, 10000 + Math.random() * 5000);

    setInterval(() => {
        document.querySelectorAll('button, a').forEach(el => {
            if(el.innerText && (el.innerText.includes('Keep me logged in') || el.innerText.includes('Online'))) {
                el.click();
                console.log("[Lababot] Нажата кнопка подтверждения активности");
            }
        });
    }, 5000);
`;

// --- ОБНОВЛЕНИЕ 1: Функция для переключения группы кнопок ---
function toggleStatusGroup() {
    const container = document.getElementById('status-buttons-container');
    const toggleBtn = document.getElementById('btn-group-toggle');
    container.classList.toggle('show');
    toggleBtn.classList.toggle('open');
    const icon = toggleBtn.querySelector('i');
    if (toggleBtn.classList.contains('open')) {
        icon.classList.remove('fa-caret-right');
        icon.classList.add('fa-caret-down');
    } else {
        icon.classList.remove('fa-caret-down');
        icon.classList.add('fa-caret-right');
    }
}

// === LOGGER - 5-я колонка ===

// Трекинг для предотвращения дублирования
const loggerTracking = {
    // VIP: partnerId -> timestamp последнего уведомления (cooldown 1 час)
    vipNotified: {},
    // Все уведомления: уникальный ключ -> true (чтобы не дублировать)
    notified: new Set(),
    // Таймеры звуковых напоминаний для писем: logId -> [timerId1, timerId2]
    mailSoundTimers: {},
    // Связь логов с окнами: windowId -> logId (для удаления при закрытии)
    windowToLog: {}
};

const VIP_COOLDOWN_MS = 60 * 60 * 1000; // 1 час
const VIP_FADE_MS = 3 * 60 * 1000; // 3 минуты до затухания

const Logger = {
    logs: [],
    add: function(text, type, botId, data = null) {
        const now = Date.now();
        const partnerId = data?.partnerId || '???';

        // Уникальный ключ для дедупликации
        const uniqueKey = `${type}-${botId}-${partnerId}-${data?.messageBody || ''}`;

        // === Дедупликация: каждое уведомление только 1 раз ===
        if (type !== 'log' && loggerTracking.notified.has(uniqueKey)) {
            console.log(`[Logger] Дубликат пропущен: ${uniqueKey}`);
            return;
        }

        // === VIP: cooldown 1 час на мужчину ===
        if (type === 'vip-online') {
            const vipKey = `${botId}-${partnerId}`;
            const lastNotified = loggerTracking.vipNotified[vipKey] || 0;
            if (now - lastNotified < VIP_COOLDOWN_MS) {
                console.log(`[Logger] VIP ${partnerId} в cooldown, пропускаем`);
                return;
            }
            loggerTracking.vipNotified[vipKey] = now;
        }

        // === Игнорируем тип 'chat' (дубликат chat-request) ===
        if (type === 'chat') {
            console.log(`[Logger] Тип 'chat' игнорируется`);
            return;
        }

        // Отмечаем как уведомлённое
        loggerTracking.notified.add(uniqueKey);

        // Очищаем старые записи из notified (старше 1 часа)
        setTimeout(() => loggerTracking.notified.delete(uniqueKey), VIP_COOLDOWN_MS);

        const logItem = { id: now, text, type, botId, data, time: new Date(), uniqueKey };
        this.logs.unshift(logItem);

        if (this.logs.length > 300) {
            this.logs = this.logs.slice(0, 300);
        }

        this.render();

        const col = document.getElementById('logger-column');
        if(!col.classList.contains('show')) {
            document.getElementById('btn-logger-main').classList.add('blinking');
        }

        // === Звуки ===
        if (type === 'chat-request') {
            playSound('chat');
        } else if (type === 'mail') {
            playSound('message');
            // Дополнительные звуки через 1 и 2 минуты
            const timer1 = setTimeout(() => {
                if (this.logs.find(l => l.id === logItem.id)) {
                    playSound('message');
                }
            }, 60000);
            const timer2 = setTimeout(() => {
                if (this.logs.find(l => l.id === logItem.id)) {
                    playSound('message');
                }
            }, 120000);
            loggerTracking.mailSoundTimers[logItem.id] = [timer1, timer2];

            // Electron уведомление для писем
            this.showElectronNotification(data, type, botId);
        } else if (type === 'vip-online') {
            playSound('online');
        } else if (type === 'bday') {
            playSound('online');
        }
    },

    // Electron уведомление
    showElectronNotification: function(data, type, botId) {
        if (!data) return;
        const partnerId = data.partnerId || '???';
        const partnerName = data.partnerName || `ID ${partnerId}`;
        const messageBody = data.messageBody || '';
        const avatarUrl = data.avatarUrl || null;

        const title = '💌 Входящее письмо';
        const body = `От ${partnerId} ${partnerName}${messageBody ? ': "' + messageBody.slice(0, 50) + '"' : ''}`;

        const notification = new Notification(title, {
            body: body,
            icon: avatarUrl || undefined,
            silent: true // Звук уже играет через playSound
        });

        notification.onclick = () => {
            openResponseWindow(botId, partnerId, partnerName, 'mail');
        };
    },

    // Удаление лога по ID
    removeLog: function(logId) {
        const index = this.logs.findIndex(l => l.id === logId);
        if (index !== -1) {
            const log = this.logs[index];
            // Отменяем таймеры звуков если есть
            if (loggerTracking.mailSoundTimers[logId]) {
                loggerTracking.mailSoundTimers[logId].forEach(t => clearTimeout(t));
                delete loggerTracking.mailSoundTimers[logId];
            }
            this.logs.splice(index, 1);
            this.render();
            console.log(`[Logger] Удалён лог ${logId}`);
        }
    },

    // Удаление лога по windowId
    removeLogByWindowId: function(windowId) {
        const logId = loggerTracking.windowToLog[windowId];
        if (logId) {
            this.removeLog(logId);
            delete loggerTracking.windowToLog[windowId];
        }
    },

    render: function() {
        const container = document.getElementById('logger-content');
        if(!this.logs.length) {
            container.innerHTML = '<div class="text-center text-muted small mt-5">Событий пока нет...</div>';
            return;
        }

        let html = '';
        const now = Date.now();

        this.logs.forEach(l => {
            const isFresh = (now - l.id) < 60000;
            const timeStr = l.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const colorClass = isFresh ? 'fresh' : 'old';

            let content = ``;
            const partnerId = l.data && l.data.partnerId ? l.data.partnerId : '???';
            const partnerName = l.data && l.data.partnerName ? l.data.partnerName : `ID ${partnerId}`;
            const targetBotDisplayId = bots[l.botId] ? bots[l.botId].displayId : '???';

            let linkAction = '';
            let logClass = '';

            // Для VIP - проверяем затухание (серый через 3 минуты)
            let vipFaded = false;
            if (l.type === 'vip-online' && (now - l.id) > VIP_FADE_MS) {
                vipFaded = true;
            }

            if (l.type === 'mail') {
                logClass = 'mail-log';
                linkAction = `openResponseWindowAndTrack('${l.botId}', '${partnerId}', '${partnerName}', 'mail', ${l.id})`;
                const msgBody = l.data && l.data.messageBody ? l.data.messageBody : '';
                const msgPreview = msgBody ? ` "${msgBody.slice(0, 30)}${msgBody.length > 30 ? '...' : ''}"` : '';
                content = `💌 Входящее письмо от ${partnerId} <b>${partnerName}</b>${msgPreview}`;
            } else if (l.type === 'chat-request') {
                logClass = 'chat-request-log';
                linkAction = `openResponseWindowAndTrack('${l.botId}', '${partnerId}', '${partnerName}', 'chat', ${l.id})`;
                const msgBody = l.data && l.data.messageBody ? l.data.messageBody : '';
                content = `🆕 Новый чат от ${partnerId} <b>${partnerName}</b> "${msgBody}"`;
            } else if (l.type === 'vip-online') {
                logClass = vipFaded ? 'vip-faded' : 'vip';
                linkAction = `openResponseWindowAndTrack('${l.botId}', '${partnerId}', '${partnerName}', 'mail', ${l.id})`;
                content = `👑 VIP ${partnerId} <b>${partnerName}</b> теперь ONLINE!`;
            } else if (l.type === 'bday') {
                linkAction = `selectTab('${l.botId}')`;
                content = l.text;
            } else if (l.type === 'log') {
                content = l.text;
            }

            if(l.type !== 'log') {
                html += `<div class="log-entry ${colorClass} ${logClass}" data-log-id="${l.id}">
                    <span class="log-time">${timeStr} | Анкета ${targetBotDisplayId}</span><br>
                    <span class="log-link" onclick="${linkAction}">${content}</span>
                </div>`;
            } else {
                 html += `<div class="log-entry ${colorClass}">${l.text}</div>`;
            }
        });
        container.innerHTML = html;
    },
    cleanOld: function() { this.render(); }
};
setInterval(() => Logger.cleanOld(), 5000);

// === TOGGLE LOGGER COLUMN ===
function toggleLogger() {
    const col = document.getElementById('logger-column');
    col.classList.toggle('show');
    if(col.classList.contains('show')) {
        document.getElementById('btn-logger-main').classList.remove('blinking');
    }
}

// === RESPONSE WINDOWS SYSTEM ===
// Используем IPC для открытия сайта в отдельном BrowserWindow
const { ipcRenderer } = require('electron');
let openedResponseWindows = new Set(); // Отслеживаем открытые окна

async function openResponseWindow(botId, partnerId, partnerName, type) {
    const windowId = `rw-${botId}-${partnerId}-${type}`;

    // Если окно уже отмечено как открытое - просто логируем (main process сфокусирует его)
    if (openedResponseWindows.has(windowId)) {
        console.log(`[ResponseWindow] Окно ${windowId} уже открыто, фокусируем...`);
    }

    const bot = bots[botId];
    if (!bot) {
        console.error(`[ResponseWindow] Бот ${botId} не найден`);
        return;
    }

    // URL для открытия на сайте
    // Чат: используем hash-навигацию /chat#partnerId
    // Письма: открываем inbox
    const siteUrl = type === 'chat'
        ? `https://ladadate.com/chat#${partnerId}`
        : `https://ladadate.com/message-inbox`;

    console.log(`[ResponseWindow] Открываем ${type} окно для ${partnerName}: ${siteUrl}`);

    try {
        const result = await ipcRenderer.invoke('open-response-window', {
            windowId,
            botId,
            partnerId,
            partnerName,
            type,
            url: siteUrl,
            login: bot.login,
            pass: bot.pass
        });

        if (result.success) {
            openedResponseWindows.add(windowId);
            console.log(`[ResponseWindow] Окно успешно открыто`);
        } else {
            console.error(`[ResponseWindow] Ошибка открытия окна:`, result.error);
            showError('Ошибка открытия окна: ' + result.error);
        }
    } catch (err) {
        console.error(`[ResponseWindow] IPC ошибка:`, err);
        showError('Ошибка открытия окна');
    }
}

// Закрытие окна через IPC (вызывается при необходимости)
async function closeResponseWindow(windowId) {
    try {
        await ipcRenderer.invoke('close-response-window', windowId);
        openedResponseWindows.delete(windowId);
    } catch (err) {
        console.error('[ResponseWindow] Ошибка закрытия:', err);
    }
}

// Слушаем событие закрытия окна от main process
ipcRenderer.on('response-window-closed', (event, windowId) => {
    openedResponseWindows.delete(windowId);
    // Удаляем связанный лог при закрытии окна
    Logger.removeLogByWindowId(windowId);
    console.log(`[ResponseWindow] Окно ${windowId} закрыто, лог удалён`);
});

// Открытие окна с трекингом для удаления лога при закрытии
async function openResponseWindowAndTrack(botId, partnerId, partnerName, type, logId) {
    const windowId = `rw-${botId}-${partnerId}-${type}`;

    // Связываем окно с логом
    loggerTracking.windowToLog[windowId] = logId;

    // Открываем окно
    await openResponseWindow(botId, partnerId, partnerName, type);
}
