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
let responseWindows = {};
let responseWindowZIndex = 1600;

function openResponseWindow(botId, partnerId, partnerName, type) {
    const windowId = `rw-${botId}-${partnerId}-${type}`;

    // Если окно уже открыто - фокусируем его
    if (responseWindows[windowId]) {
        focusResponseWindow(windowId);
        return;
    }

    const container = document.getElementById('response-windows-container');
    const bot = bots[botId];
    const typeLabel = type === 'chat' ? 'Чат' : 'Письмо';

    // Рассчитываем позицию (каскадом)
    const windowCount = Object.keys(responseWindows).length;
    const offsetX = 100 + (windowCount % 5) * 30;
    const offsetY = 100 + (windowCount % 5) * 30;

    const win = document.createElement('div');
    win.className = 'response-window focused';
    win.id = windowId;
    win.style.left = offsetX + 'px';
    win.style.top = offsetY + 'px';
    win.style.zIndex = ++responseWindowZIndex;

    win.innerHTML = `
        <div class="response-window-header" onmousedown="startDragResponseWindow(event, '${windowId}')">
            <div class="window-info">
                <span class="window-title">${typeLabel} с ${partnerName}</span>
                <span class="window-subtitle">Анкета: ${bot ? bot.displayId : '???'} | ID партнёра: ${partnerId}</span>
            </div>
            <button class="btn-close-window" onclick="closeResponseWindow('${windowId}')"><i class="fa fa-times"></i></button>
        </div>
        <div class="response-window-body">
            <div class="response-window-history" id="history-${windowId}">
                <div class="text-center text-muted small">Загрузка истории...</div>
            </div>
            <div class="response-window-ai">
                <div class="d-flex">
                    <i class="fa fa-robot text-primary"></i>
                    <input class="form-control form-control-sm" id="ai-prompt-${windowId}" placeholder="Как ответить? (игриво, романтично...)">
                    <button class="btn btn-primary btn-sm" onclick="generateResponseWindowAI('${windowId}')">
                        <i class="fa fa-magic"></i> AI
                    </button>
                </div>
            </div>
            <div class="response-window-input">
                <textarea class="form-control" id="input-${windowId}" rows="2" placeholder="Сообщение..."></textarea>
                <button class="btn btn-primary" onclick="sendResponseWindowMessage('${windowId}')"><i class="fa fa-paper-plane"></i></button>
            </div>
        </div>
        <div class="response-window-resize" onmousedown="startResizeResponseWindow(event, '${windowId}')"></div>
    `;

    container.appendChild(win);

    // Сохраняем данные окна
    responseWindows[windowId] = {
        botId,
        partnerId,
        partnerName,
        type,
        element: win
    };

    // Убираем фокус с других окон
    document.querySelectorAll('.response-window').forEach(w => w.classList.remove('focused'));
    win.classList.add('focused');

    // Загружаем историю
    loadResponseWindowHistory(windowId);

    // Фокус на клик
    win.addEventListener('mousedown', () => focusResponseWindow(windowId));
}

function closeResponseWindow(windowId) {
    const win = document.getElementById(windowId);
    if (win) {
        win.remove();
        delete responseWindows[windowId];
    }
}

function focusResponseWindow(windowId) {
    document.querySelectorAll('.response-window').forEach(w => w.classList.remove('focused'));
    const win = document.getElementById(windowId);
    if (win) {
        win.classList.add('focused');
        win.style.zIndex = ++responseWindowZIndex;
    }
}

// === DRAG & RESIZE FOR RESPONSE WINDOWS ===
let dragState = { active: false, windowId: null, offsetX: 0, offsetY: 0 };
let resizeState = { active: false, windowId: null, startX: 0, startY: 0, startW: 0, startH: 0 };

function startDragResponseWindow(e, windowId) {
    const win = document.getElementById(windowId);
    if (!win) return;
    dragState = {
        active: true,
        windowId,
        offsetX: e.clientX - win.offsetLeft,
        offsetY: e.clientY - win.offsetTop
    };
    focusResponseWindow(windowId);
    e.preventDefault();
}

function startResizeResponseWindow(e, windowId) {
    const win = document.getElementById(windowId);
    if (!win) return;
    const rect = win.getBoundingClientRect();
    resizeState = {
        active: true,
        windowId,
        startX: e.clientX,
        startY: e.clientY,
        startW: rect.width,
        startH: rect.height
    };
    focusResponseWindow(windowId);
    e.preventDefault();
    e.stopPropagation();
}

document.addEventListener('mousemove', (e) => {
    if (dragState.active) {
        const win = document.getElementById(dragState.windowId);
        if (win) {
            win.style.left = (e.clientX - dragState.offsetX) + 'px';
            win.style.top = (e.clientY - dragState.offsetY) + 'px';
        }
    }
    if (resizeState.active) {
        const win = document.getElementById(resizeState.windowId);
        if (win) {
            const newW = resizeState.startW + (e.clientX - resizeState.startX);
            const newH = resizeState.startH + (e.clientY - resizeState.startY);
            if (newW >= 350) win.style.width = newW + 'px';
            if (newH >= 350) win.style.height = newH + 'px';
        }
    }
});

document.addEventListener('mouseup', () => {
    dragState.active = false;
    resizeState.active = false;
});

// === RESPONSE WINDOW - LOAD HISTORY ===
async function loadResponseWindowHistory(windowId) {
    const data = responseWindows[windowId];
    if (!data) return;

    const historyContainer = document.getElementById(`history-${windowId}`);
    const bot = bots[data.botId];
    if (!bot) {
        historyContainer.innerHTML = '<div class="text-danger">Бот не найден</div>';
        return;
    }

    try {
        let messages = [];

        if (data.type === 'chat') {
            // Загружаем историю ЧАТА через WebView
            if (bot.webview) {
                try {
                    const result = await bot.webview.executeJavaScript(`
                        (async () => {
                            try {
                                const res = await fetch('https://ladadate.com/chat-messages', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: ${data.partnerId} }),
                                    credentials: 'include'
                                });
                                const text = await res.text();
                                try {
                                    return { success: true, data: JSON.parse(text) };
                                } catch {
                                    return { success: false, error: 'Not JSON' };
                                }
                            } catch(e) {
                                return { success: false, error: e.message };
                            }
                        })()
                    `);

                    if (result.success && result.data && result.data.messages) {
                        messages = result.data.messages.map(m => ({
                            isMe: m.is_owner,
                            text: m.body,
                            time: new Date(m.created)
                        }));
                    }
                } catch (wvErr) {
                    console.error('WebView error:', wvErr);
                }
            }
        } else {
            // Загружаем историю ПИСЕМ
            const res = await makeApiRequest(bot, 'GET', `/api/messages?fromAccountId=${data.partnerId}`);
            const msgs = res.data.Messages || [];

            for (const msg of msgs) {
                try {
                    const detailRes = await makeApiRequest(bot, 'GET', `/api/messages/${msg.MessageId}`);
                    const detailedMsg = detailRes.data;
                    if (detailedMsg && detailedMsg.Body) {
                        messages.push({
                            isMe: detailedMsg.User.AccountId != data.partnerId,
                            text: detailedMsg.Body,
                            time: new Date(detailedMsg.DatePost)
                        });
                    }
                } catch (e) {
                    console.error('Error loading message detail:', e);
                }
            }
        }

        if (messages.length === 0) {
            historyContainer.innerHTML = '<div class="text-muted text-center">Нет сообщений</div>';
            return;
        }

        // Сортируем от старых к новым
        messages.sort((a, b) => a.time - b.time);

        let html = '';
        messages.forEach(m => {
            const timeStr = m.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const dateStr = m.time.toLocaleDateString();
            const cls = m.isMe ? 'text-end' : 'text-start';
            const bg = m.isMe ? 'background: #d1e7dd; border-radius: 10px 10px 0 10px;' : 'background: #e9ecef; border-radius: 10px 10px 10px 0;';
            html += `<div class="${cls} mb-2">
                <div style="${bg} padding: 8px 12px; display: inline-block; max-width: 80%;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 2px;">${dateStr} ${timeStr}</div>
                    <div>${m.text}</div>
                </div>
            </div>`;
        });

        historyContainer.innerHTML = html;
        historyContainer.scrollTop = historyContainer.scrollHeight;

    } catch (err) {
        console.error('Error loading history:', err);
        historyContainer.innerHTML = '<div class="text-danger">Ошибка загрузки истории</div>';
    }
}

// === RESPONSE WINDOW - SEND MESSAGE ===
async function sendResponseWindowMessage(windowId) {
    const data = responseWindows[windowId];
    if (!data) return;

    const input = document.getElementById(`input-${windowId}`);
    const text = input.value.trim();
    if (!text) return;

    const bot = bots[data.botId];
    if (!bot) {
        showError('Бот не найден');
        return;
    }

    try {
        if (data.type === 'chat') {
            // Отправка через WebView (чат)
            if (bot.webview) {
                await bot.webview.executeJavaScript(`
                    (async () => {
                        await fetch('https://ladadate.com/chat-send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: ${data.partnerId}, body: ${JSON.stringify(text)} }),
                            credentials: 'include'
                        });
                    })()
                `);
            }
        } else {
            // Отправка письма
            const checkRes = await makeApiRequest(bot, 'GET', `/api/messages/check-send/${data.partnerId}`);
            if (!checkRes.data.CheckId) {
                showError('Невозможно отправить письмо этому пользователю');
                return;
            }

            const payload = {
                CheckId: checkRes.data.CheckId,
                RecipientAccountId: parseInt(data.partnerId),
                Body: text,
                PhotoId: null
            };
            await makeApiRequest(bot, 'POST', '/api/messages/send', payload);
        }

        input.value = '';
        // Перезагружаем историю
        await loadResponseWindowHistory(windowId);

    } catch (err) {
        console.error('Error sending message:', err);
        showError('Ошибка отправки сообщения');
    }
}

// === RESPONSE WINDOW - AI GENERATE ===
async function generateResponseWindowAI(windowId) {
    const data = responseWindows[windowId];
    if (!data) return;

    const promptInput = document.getElementById(`ai-prompt-${windowId}`);
    const msgInput = document.getElementById(`input-${windowId}`);
    const prompt = promptInput.value.trim();

    if (!globalSettings.apiKey) {
        showError('API ключ OpenAI не указан в настройках');
        return;
    }

    const bot = bots[data.botId];
    if (!bot) return;

    // Получаем последние сообщения для контекста
    const historyContainer = document.getElementById(`history-${windowId}`);
    const historyText = historyContainer.innerText.slice(-1500);

    try {
        msgInput.disabled = true;
        msgInput.placeholder = 'AI генерирует ответ...';

        const systemPrompt = `Ты помощник оператора на сайте знакомств. Пиши ответы от лица девушки, ${prompt || 'естественно и романтично'}. Отвечай на последнее сообщение мужчины, учитывая контекст переписки. Пиши ТОЛЬКО текст ответа, без пояснений.`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Контекст переписки:\n${historyText}\n\nНапиши ответ:` }
            ],
            max_tokens: 300
        }, {
            headers: {
                'Authorization': `Bearer ${globalSettings.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.choices && response.data.choices[0]) {
            msgInput.value = response.data.choices[0].message.content.trim();
        }

    } catch (err) {
        console.error('AI Error:', err);
        showError('Ошибка AI генерации');
    } finally {
        msgInput.disabled = false;
        msgInput.placeholder = 'Сообщение...';
        msgInput.focus();
    }
}
