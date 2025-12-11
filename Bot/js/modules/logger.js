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

    // URL для открытия на сайте
    // Чат: используем hash-навигацию /chat#partnerId
    // Письма: открываем inbox (прямой ссылки на переписку по partnerId нет)
    const siteUrl = type === 'chat'
        ? `https://ladadate.com/chat#${partnerId}`
        : `https://ladadate.com/message-inbox`;

    const win = document.createElement('div');
    win.className = 'response-window response-window-webview focused';
    win.id = windowId;
    win.style.left = offsetX + 'px';
    win.style.top = offsetY + 'px';
    win.style.zIndex = ++responseWindowZIndex;
    win.style.width = '500px';
    win.style.height = '600px';

    win.innerHTML = `
        <div class="response-window-header" onmousedown="startDragResponseWindow(event, '${windowId}')">
            <div class="window-info">
                <span class="window-title">${typeLabel} с ${partnerName}</span>
                <span class="window-subtitle">Анкета: ${bot ? bot.displayId : '???'} | ID: ${partnerId}</span>
            </div>
            <div class="window-controls">
                <button class="btn-reload-window" onclick="reloadResponseWindowWebview('${windowId}')" title="Обновить"><i class="fa fa-refresh"></i></button>
                <button class="btn-close-window" onclick="closeResponseWindow('${windowId}')"><i class="fa fa-times"></i></button>
            </div>
        </div>
        <div class="response-window-ai-panel">
            <input class="form-control form-control-sm" id="ai-prompt-${windowId}" placeholder="AI промпт (игриво, романтично...)">
            <button class="btn btn-primary btn-sm" onclick="generateResponseWindowAI('${windowId}')" title="Сгенерировать ответ">
                <i class="fa fa-magic"></i> AI
            </button>
        </div>
        <div class="response-window-webview-container">
            <webview id="webview-${windowId}"
                     src="${siteUrl}"
                     partition="persist:${botId}"
                     class="response-webview"
                     allowpopups>
            </webview>
            <div class="webview-loading" id="loading-${windowId}">
                <i class="fa fa-spinner fa-spin"></i> Загрузка сайта...
            </div>
        </div>
        <div class="response-window-resize" onmousedown="startResizeResponseWindow(event, '${windowId}')"></div>
    `;

    container.appendChild(win);

    // Настраиваем WebView
    const webview = document.getElementById(`webview-${windowId}`);
    const loadingEl = document.getElementById(`loading-${windowId}`);

    webview.addEventListener('did-start-loading', () => {
        loadingEl.style.display = 'flex';
        console.log(`[ResponseWindow] Загрузка началась: ${siteUrl}`);
    });

    webview.addEventListener('did-finish-load', () => {
        loadingEl.style.display = 'none';
        // Блокируем звуки на странице
        webview.setAudioMuted(true);

        // Проверяем текущий URL (может быть редирект на логин)
        const currentUrl = webview.getURL();
        console.log(`[ResponseWindow] Загрузка завершена: ${currentUrl}`);

        // Если редирект на логин - пробуем авторизоваться
        if (currentUrl.includes('/login')) {
            console.log(`[ResponseWindow] Обнаружен редирект на логин, пробуем авторизоваться...`);
            const botData = bots[botId];
            if (botData) {
                webview.executeJavaScript(`
                    setTimeout(() => {
                        const emailInput = document.querySelector('input[name="login"]');
                        const passInput = document.querySelector('input[name="password"]');
                        const btn = document.querySelector('button[type="submit"]');

                        if(emailInput && passInput) {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

                            nativeInputValueSetter.call(emailInput, "${botData.login}");
                            emailInput.dispatchEvent(new Event('input', { bubbles: true }));

                            nativeInputValueSetter.call(passInput, "${botData.pass}");
                            passInput.dispatchEvent(new Event('input', { bubbles: true }));

                            if(btn) setTimeout(() => btn.click(), 500);
                        }
                    }, 1000);
                `).catch(e => console.error('[ResponseWindow] Ошибка авто-логина:', e));
            }
        }

        // Инжектируем блокировку Audio API
        webview.executeJavaScript(`
            if (!window.__audioMuted) {
                window.__audioMuted = true;
                Audio.prototype.play = function() { return Promise.resolve(); };
                HTMLMediaElement.prototype.play = function() { return Promise.resolve(); };
            }
        `).catch(() => {});
    });

    webview.addEventListener('did-fail-load', (e) => {
        console.error(`[ResponseWindow] Ошибка загрузки:`, e.errorCode, e.errorDescription);
        if (e.errorCode !== -3) { // -3 = операция отменена (нормально при навигации)
            loadingEl.innerHTML = `<i class="fa fa-exclamation-triangle text-warning"></i> Ошибка загрузки`;
        }
    });

    // Логируем навигацию
    webview.addEventListener('will-navigate', (e) => {
        console.log(`[ResponseWindow] Навигация на: ${e.url}`);
    });

    // Сохраняем данные окна
    responseWindows[windowId] = {
        botId,
        partnerId,
        partnerName,
        type,
        element: win,
        webview: webview
    };

    // Убираем фокус с других окон
    document.querySelectorAll('.response-window').forEach(w => w.classList.remove('focused'));
    win.classList.add('focused');

    // Фокус на клик
    win.addEventListener('mousedown', () => focusResponseWindow(windowId));
}

// Перезагрузить WebView в окне
function reloadResponseWindowWebview(windowId) {
    const data = responseWindows[windowId];
    if (data && data.webview) {
        data.webview.reload();
    }
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

// === RESPONSE WINDOW - AI GENERATE ===
async function generateResponseWindowAI(windowId) {
    const data = responseWindows[windowId];
    if (!data || !data.webview) return;

    const promptInput = document.getElementById(`ai-prompt-${windowId}`);
    const prompt = promptInput.value.trim();
    const aiBtn = promptInput.nextElementSibling;

    if (!globalSettings.apiKey) {
        showError('API ключ OpenAI не указан в настройках');
        return;
    }

    const bot = bots[data.botId];
    if (!bot) return;

    const originalBtnHtml = aiBtn.innerHTML;
    aiBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    aiBtn.disabled = true;
    promptInput.disabled = true;

    try {
        // Получаем историю переписки из WebView
        const historyResult = await data.webview.executeJavaScript(`
            (function() {
                // Пробуем разные селекторы для получения сообщений
                let messages = [];

                // Для чата
                const chatMessages = document.querySelectorAll('.chat-message, .message-item, [class*="message"]');
                chatMessages.forEach(msg => {
                    const text = msg.innerText || msg.textContent;
                    if (text && text.length > 2 && text.length < 1000) {
                        messages.push(text.trim());
                    }
                });

                // Если не нашли - берём весь контент области сообщений
                if (messages.length === 0) {
                    const chatArea = document.querySelector('.chat-body, .messages-list, .conversation, [class*="chat"], [class*="message"]');
                    if (chatArea) {
                        messages.push(chatArea.innerText.slice(-2000));
                    }
                }

                return messages.slice(-10).join('\\n---\\n');
            })()
        `);

        const historyText = historyResult || 'Нет истории';
        console.log('[AI] История из WebView:', historyText.slice(0, 200));

        const isChat = data.type === 'chat';
        const systemPrompt = isChat
            ? `Ты помощник оператора на сайте знакомств. Пиши короткие ответы (1-2 предложения) в чат от лица девушки, ${prompt || 'естественно и игриво'}. Отвечай на последнее сообщение мужчины. Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.`
            : `Ты помощник оператора на сайте знакомств. Пиши ответы (2-4 предложения) на письма от лица девушки, ${prompt || 'тепло и романтично'}. Отвечай на последнее сообщение мужчины. Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Контекст переписки:\n${historyText}\n\nНапиши ответ:` }
            ],
            max_tokens: 300,
            temperature: 0.8
        }, {
            headers: {
                'Authorization': `Bearer ${globalSettings.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.choices && response.data.choices[0]) {
            const generatedText = response.data.choices[0].message.content.trim();
            console.log('[AI] Сгенерировано:', generatedText);

            // Вставляем текст в поле ввода на сайте
            const insertResult = await data.webview.executeJavaScript(`
                (function() {
                    const text = ${JSON.stringify(generatedText)};

                    // Пробуем разные селекторы для поля ввода
                    const selectors = [
                        'textarea[name="message"]',
                        'textarea.message-input',
                        'textarea[placeholder*="message"]',
                        'textarea[placeholder*="Message"]',
                        'textarea',
                        'input[type="text"][name="message"]',
                        '[contenteditable="true"]'
                    ];

                    for (const selector of selectors) {
                        const input = document.querySelector(selector);
                        if (input) {
                            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                                input.value = text;
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                                input.focus();
                            } else {
                                // contenteditable
                                input.innerText = text;
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            return { success: true, selector };
                        }
                    }
                    return { success: false, error: 'Поле ввода не найдено' };
                })()
            `);

            if (insertResult.success) {
                console.log('[AI] Текст вставлен в:', insertResult.selector);
                promptInput.value = '';
            } else {
                console.warn('[AI] Не удалось вставить:', insertResult.error);
                showError('Не удалось вставить текст. Скопируйте: ' + generatedText.slice(0, 50) + '...');
                // Копируем в буфер обмена как fallback
                navigator.clipboard.writeText(generatedText).catch(() => {});
            }
        }

    } catch (err) {
        console.error('AI Error:', err);
        showError('Ошибка AI генерации: ' + (err.response?.data?.error?.message || err.message));
    } finally {
        aiBtn.innerHTML = originalBtnHtml;
        aiBtn.disabled = false;
        promptInput.disabled = false;
    }
}
