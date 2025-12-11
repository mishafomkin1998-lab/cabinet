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
const Logger = {
    logs: [],
    add: function(text, type, botId, data = null) {
        const now = Date.now();
        const logItem = { id: now, text, type, botId, data, time: new Date() };

        this.logs.unshift(logItem);

        if (this.logs.length > 300) {
            this.logs = this.logs.slice(0, 300);
        }

        this.render();

        const col = document.getElementById('logger-column');
        if(!col.classList.contains('show')) {
            document.getElementById('btn-logger-main').classList.add('blinking');
        }

        if (type === 'chat') playSound('chat');
        else if (type === 'chat-request') playSound('chat');
        else if (type === 'mail') playSound('message');
        else if (type === 'bday') playSound('online');
        else if (type === 'vip-online') playSound('online');
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

            if (l.type === 'chat' || l.type === 'mail') {
                // Открываем окно ответа вместо MiniChat
                linkAction = `openResponseWindow('${l.botId}', '${partnerId}', '${partnerName}', '${l.type}')`;
                content = `${l.type === 'chat' ? '💬' : '💌'} Новое ${l.type === 'chat' ? 'сообщение' : 'письмо'} от <b>${partnerName}</b> (ID ${partnerId})`;
            } else if (l.type === 'chat-request') {
                logClass = 'new-chat';
                linkAction = `openResponseWindow('${l.botId}', '${partnerId}', '${partnerName}', 'chat')`;
                const msgBody = l.data && l.data.messageBody ? l.data.messageBody : '';
                content = `🆕 Новый чат от <b>${partnerName}</b>: "${msgBody}"`;
            } else if (l.type === 'vip-online') {
                logClass = 'vip';
                // VIP клик открывает ПИСЬМО (mail), а не чат
                linkAction = `openResponseWindow('${l.botId}', '${partnerId}', '${partnerName}', 'mail')`;
                content = `👑 VIP <b>${partnerName}</b> (ID ${partnerId}) теперь ONLINE!`;
            } else if (l.type === 'bday') {
                linkAction = `selectTab('${l.botId}')`;
                content = l.text;
            } else if (l.type === 'log') {
                content = l.text;
            }

            if(l.type !== 'log') {
                html += `<div class="log-entry ${colorClass} ${logClass}">
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
    console.log(`[ResponseWindow] Окно ${windowId} закрыто`);
});
