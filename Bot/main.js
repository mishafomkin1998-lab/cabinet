const { app, BrowserWindow, ipcMain, session } = require('electron');
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

// Функция инъекции кнопки AI на сайт
function injectAIButton(win) {
    if (win.isDestroyed()) return;

    const isChat = win.windowType === 'chat';

    win.webContents.executeJavaScript(`
        (function() {
            // Не добавляем повторно
            if (document.getElementById('lababot-ai-container')) return;

            // Ищем textarea для ввода сообщения
            const selectors = ${isChat ? `[
                'textarea.chat-textarea',
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="Message"]',
                '.chat-input textarea',
                '.message-input textarea',
                'textarea'
            ]` : `[
                'textarea[name="content"]',
                'textarea.message-textarea',
                '.compose-message textarea',
                'textarea'
            ]`};

            let textarea = null;
            for (const sel of selectors) {
                textarea = document.querySelector(sel);
                if (textarea) break;
            }

            if (!textarea) {
                console.log('[LababotAI] Textarea not found, will retry...');
                return;
            }

            // Создаём контейнер для AI кнопки
            const container = document.createElement('div');
            container.id = 'lababot-ai-container';
            container.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#f0f7ff;border-radius:8px;border:1px solid #c5ddf8;';

            // Поле для промпта
            const promptInput = document.createElement('input');
            promptInput.type = 'text';
            promptInput.placeholder = 'AI промпт (опционально)...';
            promptInput.style.cssText = 'flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;';

            // Кнопка генерации
            const aiBtn = document.createElement('button');
            aiBtn.innerHTML = '✨ AI Ответ';
            aiBtn.style.cssText = 'padding:8px 16px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px;transition:transform 0.2s,box-shadow 0.2s;';
            aiBtn.onmouseenter = () => { aiBtn.style.transform = 'scale(1.05)'; aiBtn.style.boxShadow = '0 4px 12px rgba(102,126,234,0.4)'; };
            aiBtn.onmouseleave = () => { aiBtn.style.transform = 'scale(1)'; aiBtn.style.boxShadow = 'none'; };

            // Обработчик клика
            aiBtn.onclick = async () => {
                if (aiBtn.disabled) return;

                const originalText = aiBtn.innerHTML;
                aiBtn.innerHTML = '⏳ Генерирую...';
                aiBtn.disabled = true;
                aiBtn.style.opacity = '0.7';

                try {
                    // Собираем историю переписки
                    let history = '';

                    ${isChat ? `
                    // Для чата - ищем сообщения
                    const messages = document.querySelectorAll('.chat-message, .message-item, [class*="chat-msg"], [class*="message-text"]');
                    const msgTexts = [];
                    messages.forEach(m => {
                        const text = m.innerText?.trim();
                        if (text && text.length > 2 && text.length < 500) {
                            msgTexts.push(text);
                        }
                    });
                    history = msgTexts.slice(-10).join('\\n---\\n');

                    if (!history) {
                        const chatBody = document.querySelector('.chat-body, .messages-container, [class*="chat-content"]');
                        if (chatBody) history = chatBody.innerText?.slice(-2000) || '';
                    }
                    ` : `
                    // Для письма - ищем текст письма
                    const letterContent = document.querySelector('.letter-content, .message-content, .mail-body, [class*="letter-text"]');
                    if (letterContent) {
                        history = letterContent.innerText?.slice(-2000) || '';
                    }
                    if (!history) {
                        const mainContent = document.querySelector('main, .content, article');
                        if (mainContent) history = mainContent.innerText?.slice(-2000) || '';
                    }
                    `}

                    console.log('[LababotAI] History collected:', history.slice(0, 200));

                    // Вызываем AI через preload
                    const result = await window.lababotAI.generate(
                        history,
                        '${isChat ? 'chat' : 'mail'}',
                        promptInput.value.trim()
                    );

                    if (result.success && result.text) {
                        // Вставляем текст в textarea
                        textarea.value = result.text;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        textarea.focus();

                        promptInput.value = '';
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

            // Вставляем перед textarea
            textarea.parentNode.insertBefore(container, textarea);

            console.log('[LababotAI] AI button injected successfully');
        })();
    `).catch(err => {
        console.log('[InjectAI] Script execution failed:', err.message);
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
                return { available: !!(window.globalSettings && window.globalSettings.apiKey) };
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
                const apiKey = window.globalSettings?.apiKey;
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