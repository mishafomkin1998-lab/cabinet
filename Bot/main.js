const { app, BrowserWindow, ipcMain, session, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

// === КРИТИЧЕСКИ ВАЖНО: Флаги для поддержания ОНЛАЙНА ===
// Эти настройки запрещают Chromium "усыплять" скрытые вкладки.
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,OnConnect,OutOfBlinkCors');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// =======================================================

// Переменные транскрипции для контекстного меню
const TRANSCRIPTION_VARS = [
    { var: '{name}', label: '{name} - Имя' },
    { var: '{age}', label: '{age} - Возраст' },
    { var: '{city}', label: '{city} - Город' },
    { var: '{country}', label: '{country} - Страна' },
    { var: '{countryCode}', label: '{countryCode} - Код страны' },
    { var: '{accountId}', label: '{accountId} - ID аккаунта' },
    { var: '{birthday}', label: '{birthday} - День рождения' },
    { var: '{ageFrom}', label: '{ageFrom} - Ищет от (возраст)' },
    { var: '{ageTo}', label: '{ageTo} - Ищет до (возраст)' },
    { var: '{profilePhoto}', label: '{profilePhoto} - URL фото' }
];

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 800,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            backgroundThrottling: false // ВАЖНО
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('index.html');

    // Контекстное меню для главного окна с переменными транскрипции
    mainWindow.webContents.on('context-menu', (e, params) => {
        // Проверяем, что клик был в textarea (editable field)
        if (params.isEditable) {
            const transcriptionSubmenu = TRANSCRIPTION_VARS.map(item => ({
                label: item.label,
                click: () => {
                    // Вставляем переменную в текущее поле
                    mainWindow.webContents.executeJavaScript(`
                        (function() {
                            const el = document.activeElement;
                            if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                                const start = el.selectionStart;
                                const end = el.selectionEnd;
                                const text = el.value;
                                el.value = text.substring(0, start) + '${item.var}' + text.substring(end);
                                el.selectionStart = el.selectionEnd = start + '${item.var}'.length;
                                el.focus();
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        })()
                    `);
                }
            }));

            const contextMenu = Menu.buildFromTemplate([
                {
                    label: '📝 Вставить переменную',
                    submenu: transcriptionSubmenu
                },
                { type: 'separator' },
                { label: 'Вырезать', role: 'cut' },
                { label: 'Копировать', role: 'copy' },
                { label: 'Вставить', role: 'paste' },
                { type: 'separator' },
                { label: 'Выделить всё', role: 'selectAll' }
            ]);
            contextMenu.popup();
        } else {
            // Обычное контекстное меню для не-editable элементов
            const contextMenu = Menu.buildFromTemplate([
                { label: 'Копировать', role: 'copy' },
                { label: 'Выделить всё', role: 'selectAll' }
            ]);
            contextMenu.popup();
        }
    });

    require('events').EventEmitter.defaultMaxListeners = 100;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// === Response Windows - открытие сайта в отдельном окне ===
const responseWindows = new Map();

ipcMain.handle('open-response-window', async (event, data) => {
    const { windowId, botId, partnerId, partnerName, type, url, login, pass } = data;

    // Если окно уже открыто - фокусируем
    if (responseWindows.has(windowId)) {
        const existingWin = responseWindows.get(windowId);
        if (!existingWin.isDestroyed()) {
            existingWin.focus();
            return { success: true, focused: true };
        }
    }

    // Используем сессию бота (persist:botId)
    const ses = session.fromPartition(`persist:${botId}`);

    const win = new BrowserWindow({
        width: 800,
        height: 700,
        minWidth: 500,
        minHeight: 400,
        title: `${type === 'chat' ? 'Чат' : 'Письмо'} с ${partnerName}`,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            session: ses,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload-response.js')
        }
    });

    // Сохраняем тип окна для AI
    win.windowType = type;

    win.setMenuBarVisibility(false);

    // Блокируем звук
    win.webContents.setAudioMuted(true);

    // Контекстное меню с AI
    win.webContents.on('context-menu', (e, params) => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '✨ AI Ответ',
                click: () => generateAIForResponseWindow(win)
            },
            { type: 'separator' },
            { label: 'Вырезать', role: 'cut' },
            { label: 'Копировать', role: 'copy' },
            { label: 'Вставить', role: 'paste' },
            { type: 'separator' },
            { label: 'Выделить всё', role: 'selectAll' }
        ]);
        contextMenu.popup();
    });

    // Обработка закрытия
    win.on('closed', () => {
        responseWindows.delete(windowId);
        // Уведомляем renderer о закрытии окна
        if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('response-window-closed', windowId);
        }
    });

    // Сохраняем окно
    responseWindows.set(windowId, win);

    // Загружаем URL
    try {
        await win.loadURL(url);

        // Проверяем на редирект на логин
        const currentUrl = win.webContents.getURL();
        if (currentUrl.includes('/login') && login && pass) {
            // Авто-логин
            await win.webContents.executeJavaScript(`
                setTimeout(() => {
                    const emailInput = document.querySelector('input[name="login"]');
                    const passInput = document.querySelector('input[name="password"]');
                    const btn = document.querySelector('button[type="submit"]');

                    if(emailInput && passInput) {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

                        nativeInputValueSetter.call(emailInput, "${login}");
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

                        nativeInputValueSetter.call(passInput, "${pass}");
                        passInput.dispatchEvent(new Event('input', { bubbles: true }));

                        if(btn) setTimeout(() => btn.click(), 500);
                    }
                }, 1000);
            `);
        }

        // Блокируем Audio API
        await win.webContents.executeJavaScript(`
            if (!window.__audioMuted) {
                window.__audioMuted = true;
                Audio.prototype.play = function() { return Promise.resolve(); };
                HTMLMediaElement.prototype.play = function() { return Promise.resolve(); };
            }
        `);

        // Инжектируем CSS для улучшения поля ввода
        await win.webContents.insertCSS(`
            /* Увеличиваем поле ввода сообщения */
            input[placeholder*="message" i],
            input[placeholder*="Write" i],
            textarea[placeholder*="message" i] {
                min-height: 60px !important;
                height: auto !important;
                font-size: 16px !important;
                padding: 12px 15px !important;
                line-height: 1.4 !important;
            }

            /* Делаем textarea если это input */
            .chat-input, .message-input, form[class*="chat"], form[class*="message"] {
                flex-direction: column !important;
            }

            /* Увеличиваем область ввода */
            textarea, input[type="text"][placeholder*="message" i] {
                resize: vertical !important;
                min-height: 80px !important;
                max-height: 200px !important;
            }
        `);

        // Инжектируем кнопку AI после загрузки страницы
        win.webContents.on('did-finish-load', () => {
            injectAIButton(win);
        });

        // Также инжектируем при навигации внутри SPA
        win.webContents.on('did-navigate-in-page', () => {
            setTimeout(() => injectAIButton(win), 500);
        });

        return { success: true };
    } catch (err) {
        console.error('[ResponseWindow] Error loading URL:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('close-response-window', async (event, windowId) => {
    if (responseWindows.has(windowId)) {
        const win = responseWindows.get(windowId);
        if (!win.isDestroyed()) {
            win.close();
        }
        responseWindows.delete(windowId);
    }
    return { success: true };
});

// === AI для Response Windows ===

// Функция инъекции кнопки AI на сайт (с retry)
function injectAIButton(win, attempt = 0) {
    if (win.isDestroyed()) return;
    if (attempt > 10) {
        console.log('[InjectAI] Max attempts reached, giving up');
        return;
    }

    const isChat = win.windowType === 'chat';

    win.webContents.executeJavaScript(`
        (function() {
            // Не добавляем повторно
            if (document.getElementById('lababot-ai-container')) {
                return { success: true, alreadyExists: true };
            }

            // Ищем поле ввода сообщения - расширенные селекторы
            const selectors = [
                // Общие селекторы для input/textarea
                'input[placeholder*="message" i]',
                'input[placeholder*="Write" i]',
                'textarea[placeholder*="message" i]',
                'textarea[placeholder*="Write" i]',
                // Специфичные для чата
                '.chat-input input',
                '.chat-input textarea',
                '.message-form input',
                '.message-form textarea',
                // По классам
                'input.chat-input',
                'textarea.chat-textarea',
                // Fallback
                'input[type="text"]',
                'textarea'
            ];

            let inputEl = null;
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                // Проверяем что элемент видимый и не скрытый
                if (el && el.offsetParent !== null) {
                    inputEl = el;
                    console.log('[LababotAI] Found input with selector:', sel);
                    break;
                }
            }

            if (!inputEl) {
                console.log('[LababotAI] Input not found yet, attempt ${attempt}');
                return { success: false, retry: true };
            }

            // Находим контейнер для вставки (родитель поля ввода или форма)
            let insertParent = inputEl.closest('form') || inputEl.closest('.chat-input') || inputEl.closest('.message-form') || inputEl.parentNode;

            // Создаём контейнер для AI кнопки
            const container = document.createElement('div');
            container.id = 'lababot-ai-container';
            container.style.cssText = 'display:flex;gap:8px;align-items:center;padding:10px;background:linear-gradient(135deg,#e8f4fd 0%,#f0e6ff 100%);border-radius:10px;border:1px solid #c5ddf8;margin:10px;position:relative;z-index:9999;';

            // Поле для промпта
            const promptInput = document.createElement('input');
            promptInput.type = 'text';
            promptInput.id = 'lababot-ai-prompt';
            promptInput.placeholder = 'AI промпт (опционально)...';
            promptInput.style.cssText = 'flex:1;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:white;';

            // Кнопка генерации
            const aiBtn = document.createElement('button');
            aiBtn.id = 'lababot-ai-btn';
            aiBtn.innerHTML = '✨ AI Ответ';
            aiBtn.type = 'button';
            aiBtn.style.cssText = 'padding:10px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;transition:all 0.2s;white-space:nowrap;';
            aiBtn.onmouseenter = () => { aiBtn.style.transform = 'scale(1.05)'; aiBtn.style.boxShadow = '0 4px 15px rgba(102,126,234,0.5)'; };
            aiBtn.onmouseleave = () => { aiBtn.style.transform = 'scale(1)'; aiBtn.style.boxShadow = 'none'; };

            // Сохраняем ссылку на input для использования в обработчике
            container.dataset.inputSelector = inputEl.tagName.toLowerCase() + (inputEl.placeholder ? '[placeholder="' + inputEl.placeholder + '"]' : '');

            // Обработчик клика
            aiBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (aiBtn.disabled) return;

                const originalText = aiBtn.innerHTML;
                aiBtn.innerHTML = '⏳ Генерирую...';
                aiBtn.disabled = true;
                aiBtn.style.opacity = '0.7';

                try {
                    // Собираем историю переписки
                    let history = '';

                    // Ищем сообщения на странице
                    const messageSelectors = [
                        '.message-text',
                        '.chat-message',
                        '.message-content',
                        '.msg-text',
                        '[class*="message"]',
                        '[class*="chat"] [class*="text"]'
                    ];

                    const allMessages = [];
                    messageSelectors.forEach(sel => {
                        document.querySelectorAll(sel).forEach(m => {
                            const text = m.innerText?.trim();
                            if (text && text.length > 1 && text.length < 1000 && !allMessages.includes(text)) {
                                allMessages.push(text);
                            }
                        });
                    });

                    if (allMessages.length > 0) {
                        history = allMessages.slice(-15).join('\\n---\\n');
                    } else {
                        // Fallback - берём текст из основной области
                        const mainArea = document.querySelector('main, .chat-body, .messages, .content, [class*="chat"]');
                        if (mainArea) {
                            history = mainArea.innerText?.slice(-3000) || '';
                        }
                    }

                    console.log('[LababotAI] History collected, length:', history.length);

                    // Вызываем AI через preload
                    if (!window.lababotAI) {
                        throw new Error('AI API не доступен');
                    }

                    const result = await window.lababotAI.generate(
                        history,
                        '${isChat ? 'chat' : 'mail'}',
                        document.getElementById('lababot-ai-prompt')?.value?.trim() || ''
                    );

                    if (result.success && result.text) {
                        // Находим текущий input (мог измениться)
                        const currentInput = document.querySelector('input[placeholder*="message" i], input[placeholder*="Write" i], textarea[placeholder*="message" i]') || inputEl;

                        // Вставляем текст
                        if (currentInput.tagName === 'INPUT' || currentInput.tagName === 'TEXTAREA') {
                            // Используем нативный setter для React/Angular
                            const nativeSetter = Object.getOwnPropertyDescriptor(
                                currentInput.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
                                'value'
                            ).set;
                            nativeSetter.call(currentInput, result.text);

                            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
                            currentInput.dispatchEvent(new Event('change', { bubbles: true }));
                            currentInput.focus();
                        }

                        // Очищаем промпт
                        const promptEl = document.getElementById('lababot-ai-prompt');
                        if (promptEl) promptEl.value = '';

                        console.log('[LababotAI] Text inserted successfully');
                    } else {
                        alert('Ошибка AI: ' + (result.error || 'Неизвестная ошибка'));
                    }
                } catch (err) {
                    console.error('[LababotAI] Error:', err);
                    alert('Ошибка: ' + err.message);
                } finally {
                    aiBtn.innerHTML = originalText;
                    aiBtn.disabled = false;
                    aiBtn.style.opacity = '1';
                }
            };

            container.appendChild(promptInput);
            container.appendChild(aiBtn);

            // Вставляем в начало родительского контейнера или перед формой
            if (insertParent.tagName === 'FORM') {
                insertParent.parentNode.insertBefore(container, insertParent);
            } else {
                insertParent.insertBefore(container, insertParent.firstChild);
            }

            console.log('[LababotAI] AI button injected successfully');
            return { success: true };
        })();
    `).then(result => {
        if (result && result.retry) {
            // Повторяем через 500мс
            setTimeout(() => injectAIButton(win, attempt + 1), 500);
        }
    }).catch(err => {
        console.log('[InjectAI] Script execution failed:', err.message);
        // Повторяем при ошибке
        setTimeout(() => injectAIButton(win, attempt + 1), 500);
    });
}

// IPC: Проверка доступности AI
ipcMain.handle('response-window-ai-check', async (event) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return { available: false };
    }

    try {
        // Спрашиваем у renderer есть ли API key
        const result = await mainWindow.webContents.executeJavaScript(`
            (function() {
                return { available: !!(typeof globalSettings !== 'undefined' && globalSettings.apiKey) };
            })()
        `);
        return result;
    } catch (err) {
        return { available: false };
    }
});

// IPC: Генерация AI ответа
ipcMain.handle('response-window-ai-generate', async (event, data) => {
    const { history, type, prompt } = data;

    if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
    }

    try {
        // Отправляем запрос в renderer для генерации через OpenAI
        const result = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                // globalSettings - локальная переменная, не window.globalSettings
                const apiKey = typeof globalSettings !== 'undefined' ? globalSettings.apiKey : null;
                if (!apiKey) {
                    return { success: false, error: 'API ключ OpenAI не указан в настройках' };
                }

                const isChat = ${type === 'chat'};
                const userPrompt = ${JSON.stringify(prompt || '')};
                const history = ${JSON.stringify(history || '')};

                const systemPrompt = isChat
                    ? 'Ты помощник оператора на сайте знакомств. Пиши короткие ответы (1-2 предложения) в чат от лица девушки' + (userPrompt ? ', ' + userPrompt : ', естественно и игриво') + '. Отвечай на последнее сообщение мужчины. Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.'
                    : 'Ты помощник оператора на сайте знакомств. Пиши ответы (2-4 предложения) на письма от лица девушки' + (userPrompt ? ', ' + userPrompt : ', тепло и романтично') + '. Отвечай на последнее сообщение мужчины. Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.';

                try {
                    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Контекст переписки:\\n' + history + '\\n\\nНапиши ответ:' }
                        ],
                        max_tokens: 300,
                        temperature: 0.8
                    }, {
                        headers: {
                            'Authorization': 'Bearer ' + apiKey,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.choices && response.data.choices[0]) {
                        return {
                            success: true,
                            text: response.data.choices[0].message.content.trim()
                        };
                    } else {
                        return { success: false, error: 'Пустой ответ от AI' };
                    }
                } catch (err) {
                    console.error('[AI] Error:', err);
                    return {
                        success: false,
                        error: err.response?.data?.error?.message || err.message
                    };
                }
            })()
        `);

        return result;
    } catch (err) {
        console.error('[ResponseWindow AI] Error:', err);
        return { success: false, error: err.message };
    }
});

// Функция генерации AI ответа для Response Window (вызывается из контекстного меню)
async function generateAIForResponseWindow(win) {
    if (win.isDestroyed()) return;

    const isChat = win.windowType === 'chat';

    try {
        // Показываем индикатор загрузки
        await win.webContents.executeJavaScript(`
            (function() {
                // Создаём overlay с индикатором
                if (!document.getElementById('lababot-ai-loading')) {
                    const overlay = document.createElement('div');
                    overlay.id = 'lababot-ai-loading';
                    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:99999;';
                    overlay.innerHTML = '<div style="background:white;padding:20px 40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:16px;display:flex;align-items:center;gap:12px;"><span style="font-size:24px;">⏳</span> Генерирую AI ответ...</div>';
                    document.body.appendChild(overlay);
                }
            })()
        `);

        // Собираем историю переписки
        const historyResult = await win.webContents.executeJavaScript(`
            (function() {
                let history = '';

                // Ищем сообщения на странице
                const messageSelectors = [
                    '.message-text',
                    '.chat-message',
                    '.message-content',
                    '.msg-text',
                    '[class*="message"]'
                ];

                const allMessages = [];
                messageSelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(m => {
                        const text = m.innerText?.trim();
                        if (text && text.length > 1 && text.length < 1000 && !allMessages.includes(text)) {
                            allMessages.push(text);
                        }
                    });
                });

                if (allMessages.length > 0) {
                    history = allMessages.slice(-15).join('\\n---\\n');
                } else {
                    // Fallback - берём текст из основной области
                    const mainArea = document.querySelector('main, .chat-body, .messages, .content, [class*="chat"]');
                    if (mainArea) {
                        history = mainArea.innerText?.slice(-3000) || '';
                    }
                }

                return history;
            })()
        `);

        console.log('[AI Context Menu] History length:', historyResult?.length || 0);

        // Генерируем ответ через main window
        if (!mainWindow || mainWindow.isDestroyed()) {
            throw new Error('Main window not available');
        }

        const aiResult = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                // globalSettings - локальная переменная, не window.globalSettings
                const apiKey = typeof globalSettings !== 'undefined' ? globalSettings.apiKey : null;
                if (!apiKey) {
                    return { success: false, error: 'API ключ OpenAI не указан в настройках' };
                }

                const isChat = ${isChat};
                const history = ${JSON.stringify(historyResult || '')};

                const systemPrompt = isChat
                    ? 'Ты помощник оператора на сайте знакомств. Пиши короткие ответы (1-2 предложения) в чат от лица девушки, естественно и игриво. Отвечай на последнее сообщение мужчины. Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.'
                    : 'Ты помощник оператора на сайте знакомств. Пиши ответы (2-4 предложения) на письма от лица девушки, тепло и романтично. Отвечай на последнее сообщение мужчины. Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.';

                try {
                    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Контекст переписки:\\n' + history + '\\n\\nНапиши ответ:' }
                        ],
                        max_tokens: 300,
                        temperature: 0.8
                    }, {
                        headers: {
                            'Authorization': 'Bearer ' + apiKey,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.choices && response.data.choices[0]) {
                        return {
                            success: true,
                            text: response.data.choices[0].message.content.trim()
                        };
                    } else {
                        return { success: false, error: 'Пустой ответ от AI' };
                    }
                } catch (err) {
                    console.error('[AI] Error:', err);
                    return {
                        success: false,
                        error: err.response?.data?.error?.message || err.message
                    };
                }
            })()
        `);

        // Убираем индикатор загрузки
        await win.webContents.executeJavaScript(`
            (function() {
                const overlay = document.getElementById('lababot-ai-loading');
                if (overlay) overlay.remove();
            })()
        `);

        if (aiResult.success && aiResult.text) {
            // Вставляем текст в поле ввода
            await win.webContents.executeJavaScript(`
                (function() {
                    const text = ${JSON.stringify(aiResult.text)};

                    // Ищем поле ввода
                    const selectors = [
                        'input[placeholder*="message" i]',
                        'input[placeholder*="Write" i]',
                        'textarea[placeholder*="message" i]',
                        'textarea',
                        'input[type="text"]'
                    ];

                    let inputEl = null;
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.offsetParent !== null) {
                            inputEl = el;
                            break;
                        }
                    }

                    if (inputEl) {
                        // Используем нативный setter для React
                        const proto = inputEl.tagName === 'TEXTAREA'
                            ? window.HTMLTextAreaElement.prototype
                            : window.HTMLInputElement.prototype;
                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                        nativeSetter.call(inputEl, text);

                        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                        inputEl.focus();

                        console.log('[LababotAI] Text inserted via context menu');
                        return { success: true };
                    } else {
                        // Копируем в буфер если не нашли поле
                        navigator.clipboard.writeText(text);
                        alert('Текст скопирован в буфер обмена (поле ввода не найдено):\\n\\n' + text);
                        return { success: false, copied: true };
                    }
                })()
            `);

            console.log('[AI Context Menu] Text inserted successfully');
        } else {
            // Показываем ошибку
            await win.webContents.executeJavaScript(`
                alert('Ошибка AI: ${(aiResult.error || 'Неизвестная ошибка').replace(/'/g, "\\'")}');
            `);
        }

    } catch (err) {
        console.error('[AI Context Menu] Error:', err);

        // Убираем индикатор и показываем ошибку
        try {
            await win.webContents.executeJavaScript(`
                (function() {
                    const overlay = document.getElementById('lababot-ai-loading');
                    if (overlay) overlay.remove();
                    alert('Ошибка: ${err.message.replace(/'/g, "\\'")}');
                })()
            `);
        } catch (e) {}
    }
}