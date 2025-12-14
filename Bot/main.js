const { app, BrowserWindow, ipcMain, session, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;

// =====================================================
// === АВТООБНОВЛЕНИЕ ===
// =====================================================

// Настройка логирования для отладки
autoUpdater.logger = require('electron').app.getLogger ? require('electron').app.getLogger() : console;

// Отключаем автоматическое скачивание - сначала спрашиваем пользователя
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Проверка обновлений при запуске (с задержкой 5 сек)
function initAutoUpdater() {
    // Не проверяем в dev режиме
    if (!app.isPackaged) {
        console.log('[AutoUpdater] Пропуск проверки - режим разработки');
        return;
    }

    setTimeout(() => {
        console.log('[AutoUpdater] Проверяю обновления...');
        autoUpdater.checkForUpdates().catch(err => {
            console.error('[AutoUpdater] Ошибка проверки:', err.message);
        });
    }, 5000);
}

// Найдено обновление
autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Доступно обновление:', info.version);

    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Доступно обновление',
        message: `Найдена новая версия: ${info.version}`,
        detail: `Текущая версия: ${app.getVersion()}\n\nСкачать обновление сейчас?`,
        buttons: ['Скачать', 'Позже'],
        defaultId: 0,
        cancelId: 1
    }).then(result => {
        if (result.response === 0) {
            // Показываем прогресс в главном окне
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-downloading', { version: info.version });
            }
            autoUpdater.downloadUpdate();
        }
    });
});

// Обновление не найдено
autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Обновлений нет, версия актуальна:', info.version);
});

// Прогресс скачивания
autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[AutoUpdater] Скачивание: ${percent}%`);

    // Отправляем прогресс в renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-progress', { percent });
    }
});

// Обновление скачано
autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Обновление скачано:', info.version);

    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Обновление готово',
        message: 'Обновление загружено!',
        detail: `Версия ${info.version} готова к установке.\n\nПерезапустить приложение сейчас?`,
        buttons: ['Перезапустить', 'Позже'],
        defaultId: 0,
        cancelId: 1
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall(false, true);
        }
    });
});

// Ошибка обновления
autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Ошибка:', err.message);

    // Не показываем ошибку пользователю если это просто проблема с сетью
    // Можно раскомментировать для отладки:
    // dialog.showErrorBox('Ошибка обновления', err.message);
});

// IPC: Ручная проверка обновлений (из настроек)
ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
        return { available: false, message: 'Режим разработки' };
    }

    try {
        const result = await autoUpdater.checkForUpdates();
        return {
            available: result?.updateInfo?.version !== app.getVersion(),
            version: result?.updateInfo?.version,
            currentVersion: app.getVersion()
        };
    } catch (err) {
        return { available: false, error: err.message };
    }
});

// IPC: Получить текущую версию
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// =====================================================
// === ПРОКСИ ДЛЯ WEBVIEW СЕССИЙ ===
// =====================================================

// IPC: Установить прокси для сессии бота
ipcMain.handle('set-session-proxy', async (event, { botId, proxyString }) => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Proxy MAIN] IPC set-session-proxy получен`);
    console.log(`[Proxy MAIN] botId: "${botId}"`);
    console.log(`[Proxy MAIN] proxyString: "${proxyString}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
        const ses = session.fromPartition(`persist:${botId}`);
        console.log(`[Proxy MAIN] Создан session для partition: persist:${botId}`);

        if (!proxyString || proxyString.trim() === '') {
            // Убираем прокси - прямое соединение
            await ses.setProxy({ proxyRules: '' });
            console.log(`[Proxy MAIN] ${botId}: прокси отключен (прямое соединение)`);
            return { success: true, proxy: null };
        }

        // Парсим прокси (поддержка форматов: ip:port, domain:port, domain:port:user:pass)
        const trimmed = proxyString.trim();
        const parts = trimmed.split(':');
        console.log(`[Proxy MAIN] Парсинг прокси, parts:`, parts);

        let proxyUrl;
        let username = null;
        let password = null;

        if (parts.length === 2) {
            // Формат: ip:port или domain:port
            const [host, port] = parts;
            proxyUrl = `http://${host}:${port}`;
            console.log(`[Proxy MAIN] Формат: ip:port / domain:port → ${proxyUrl}`);
        } else if (parts.length === 4) {
            // Формат: domain:port:user:pass
            const [host, port, user, pass] = parts;

            // НЕ встраиваем credentials в URL - Electron не поддерживает
            proxyUrl = `http://${host}:${port}`;
            username = user;
            password = pass;
            console.log(`[Proxy MAIN] Формат: domain:port:user:pass → ${proxyUrl} (auth: ${username})`);
        } else if (trimmed.includes('://')) {
            // Формат: http://domain:port (уже с протоколом)
            proxyUrl = trimmed;
            console.log(`[Proxy MAIN] Формат: полный URL → ${proxyUrl}`);
        } else {
            console.error(`[Proxy MAIN] ${botId}: НЕВЕРНЫЙ ФОРМАТ ПРОКСИ: ${proxyString}`);
            return { success: false, error: 'Неверный формат прокси' };
        }

        // ВАЖНО: Настраиваем обработчик аутентификации ДО установки прокси
        if (username && password) {
            // Убираем предыдущие обработчики для этой сессии
            ses.removeAllListeners('login');

            // Добавляем обработчик аутентификации ПЕРЕД setProxy
            ses.on('login', (loginEvent, webContents, request, authInfo, callback) => {
                console.log(`[Proxy Auth] ${botId}: запрошена аутентификация для ${authInfo.host}:${authInfo.port}`);
                console.log(`[Proxy Auth] ${botId}: отправляю credentials: ${username} / ${password.substring(0, 3)}***`);
                loginEvent.preventDefault();
                callback(username, password);
            });

            console.log(`[Proxy MAIN] ✅ Настроена аутентификация ДО установки прокси (user: ${username})`);

            // КРИТИЧНО: Добавляем Proxy-Authorization header ко ВСЕМ запросам
            // Это нужно потому что Decodo прокси не отправляет 407, а ожидает header сразу
            const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

            // Счётчик запросов для отладки
            let requestCount = 0;

            ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
                requestCount++;
                // Логируем первые 5 запросов для отладки
                if (requestCount <= 5) {
                    console.log(`[Proxy WebRequest #${requestCount}] ${botId}: ${details.method} ${details.url.substring(0, 80)}...`);
                }
                details.requestHeaders['Proxy-Authorization'] = authHeader;
                callback({ requestHeaders: details.requestHeaders });
            });

            console.log(`[Proxy MAIN] ✅ Настроен Proxy-Authorization header для всех запросов (с URL filter)`);
        }

        // Устанавливаем прокси для сессии
        console.log(`[Proxy MAIN] Вызов ses.setProxy({ proxyRules: "${proxyUrl}" })...`);
        await ses.setProxy({ proxyRules: proxyUrl });
        console.log(`[Proxy MAIN] ✅ Прокси успешно установлен для ${botId}: ${proxyUrl}`);

        return { success: true, proxy: proxyUrl };
    } catch (error) {
        console.error(`[Proxy MAIN] ❌ ОШИБКА установки прокси для ${botId}:`, error.message);
        console.error(`[Proxy MAIN] Stack trace:`, error.stack);
        return { success: false, error: error.message };
    }
});

// IPC: Настроить прокси для конкретного webContents (по ID)
ipcMain.handle('set-webcontents-proxy', async (event, { webContentsId, proxyString, botId }) => {
    const { webContents } = require('electron');

    console.log(`\n[Proxy WebContents] Настройка прокси для webContentsId: ${webContentsId}`);
    console.log(`[Proxy WebContents] proxyString: "${proxyString}"`);

    try {
        const wc = webContents.fromId(webContentsId);
        if (!wc) {
            console.error(`[Proxy WebContents] ❌ webContents с ID ${webContentsId} не найден!`);
            return { success: false, error: 'WebContents not found' };
        }

        const ses = wc.session;
        console.log(`[Proxy WebContents] ✅ Получена сессия webContents`);

        if (!proxyString || proxyString.trim() === '') {
            await ses.setProxy({ proxyRules: '' });
            console.log(`[Proxy WebContents] Прокси отключен`);
            return { success: true, proxy: null };
        }

        // Парсим прокси
        const parts = proxyString.trim().split(':');
        let proxyUrl, username, password;

        if (parts.length === 4) {
            const [host, port, user, pass] = parts;
            proxyUrl = `http://${host}:${port}`;
            username = user;
            password = pass;
        } else if (parts.length === 2) {
            proxyUrl = `http://${parts[0]}:${parts[1]}`;
        } else {
            return { success: false, error: 'Неверный формат прокси' };
        }

        // Настраиваем аутентификацию
        if (username && password) {
            ses.removeAllListeners('login');
            ses.on('login', (loginEvent, request, authInfo, callback) => {
                console.log(`[Proxy WebContents Auth] Запрос авторизации для ${authInfo.host}`);
                loginEvent.preventDefault();
                callback(username, password);
            });

            // Добавляем Proxy-Authorization header
            const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

            ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
                details.requestHeaders['Proxy-Authorization'] = authHeader;
                callback({ requestHeaders: details.requestHeaders });
            });

            console.log(`[Proxy WebContents] ✅ Аутентификация настроена`);
        }

        await ses.setProxy({ proxyRules: proxyUrl });
        console.log(`[Proxy WebContents] ✅ Прокси установлен: ${proxyUrl}`);

        return { success: true, proxy: proxyUrl };
    } catch (error) {
        console.error(`[Proxy WebContents] ❌ Ошибка:`, error.message);
        return { success: false, error: error.message };
    }
});

// IPC: Получить текущий прокси сессии
ipcMain.handle('get-session-proxy', async (event, { botId }) => {
    try {
        const ses = session.fromPartition(`persist:${botId}`);
        const proxy = await ses.resolveProxy('https://ladadate.com');
        return { success: true, proxy };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// IPC: Установить прокси для default session (для axios запросов из renderer)
ipcMain.handle('set-default-session-proxy', async (event, { proxyString }) => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Proxy Default MAIN] IPC set-default-session-proxy получен`);
    console.log(`[Proxy Default MAIN] proxyString: "${proxyString}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
        const ses = session.defaultSession;
        console.log(`[Proxy Default MAIN] Используем defaultSession`);

        if (!proxyString || proxyString.trim() === '') {
            await ses.setProxy({ proxyRules: '' });
            console.log('[Proxy Default MAIN] Прокси отключен');
            return { success: true, proxy: null };
        }

        // Парсим прокси (как в set-session-proxy)
        const trimmed = proxyString.trim();
        const parts = trimmed.split(':');
        console.log(`[Proxy Default MAIN] Парсинг прокси, parts:`, parts);

        let proxyUrl;
        let username = null;
        let password = null;

        if (parts.length === 2) {
            const [host, port] = parts;
            proxyUrl = `http://${host}:${port}`;
            console.log(`[Proxy Default MAIN] Формат: ip:port / domain:port → ${proxyUrl}`);
        } else if (parts.length === 4) {
            const [host, port, user, pass] = parts;

            // НЕ встраиваем credentials в URL - Electron не поддерживает
            proxyUrl = `http://${host}:${port}`;
            username = user;
            password = pass;
            console.log(`[Proxy Default MAIN] Формат: domain:port:user:pass → ${proxyUrl} (auth: ${username})`);
        } else if (trimmed.includes('://')) {
            proxyUrl = trimmed;
            console.log(`[Proxy Default MAIN] Формат: полный URL → ${proxyUrl}`);
        } else {
            console.error('[Proxy Default MAIN] НЕВЕРНЫЙ ФОРМАТ ПРОКСИ:', proxyString);
            return { success: false, error: 'Неверный формат прокси' };
        }

        // ВАЖНО: Настраиваем обработчик аутентификации ДО установки прокси
        if (username && password) {
            ses.removeAllListeners('login');
            ses.on('login', (loginEvent, webContents, request, authInfo, callback) => {
                console.log(`[Proxy Default Auth] Запрошена аутентификация для ${authInfo.host}:${authInfo.port}`);
                console.log(`[Proxy Default Auth] Отправляю credentials: ${username} / ${password.substring(0, 3)}***`);
                loginEvent.preventDefault();
                callback(username, password);
            });
            console.log(`[Proxy Default MAIN] ✅ Настроена аутентификация ДО установки прокси (user: ${username})`);
        }

        console.log(`[Proxy Default MAIN] Вызов ses.setProxy({ proxyRules: "${proxyUrl}" })...`);
        await ses.setProxy({ proxyRules: proxyUrl });
        console.log(`[Proxy Default MAIN] ✅ Прокси успешно установлен: ${proxyUrl}`);

        return { success: true, proxy: proxyUrl };
    } catch (error) {
        console.error('[Proxy Default MAIN] ❌ ОШИБКА:', error.message);
        console.error('[Proxy Default MAIN] Stack trace:', error.stack);
        return { success: false, error: error.message };
    }
});

// =====================================================

// IPC: Реальное тестирование прокси через HttpsProxyAgent
ipcMain.handle('test-proxy', async (event, { proxyString }) => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Proxy Test] Тестирование прокси: "${proxyString}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (!proxyString || proxyString.trim() === '') {
        return { success: false, error: 'Прокси не указан' };
    }

    try {
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');

        // Парсим прокси
        const trimmed = proxyString.trim();
        const parts = trimmed.split(':');

        let proxyUrl;
        if (parts.length === 2) {
            proxyUrl = `http://${parts[0]}:${parts[1]}`;
        } else if (parts.length === 4) {
            const [host, port, user, pass] = parts;
            proxyUrl = `http://${user}:${pass}@${host}:${port}`;
        } else {
            return { success: false, error: 'Неверный формат прокси. Используйте ip:port или domain:port:user:pass' };
        }

        console.log(`[Proxy Test] Proxy URL: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);

        const agent = new HttpsProxyAgent(proxyUrl);

        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: agent,
            proxy: false,
            timeout: 10000
        });

        console.log(`[Proxy Test] ✅ Успех! IP: ${response.data.ip}`);
        return { success: true, ip: response.data.ip };

    } catch (error) {
        console.error(`[Proxy Test] ❌ Ошибка:`, error.message);
        return { success: false, error: error.message };
    }
});

// =====================================================

// Хранилище прокси настроек для ботов
let proxySettings = {};

// IPC: API запросы через main процесс с поддержкой прокси
ipcMain.handle('api-request', async (event, { method, url, headers, data, botId }) => {
    console.log(`\n========== API REQUEST ==========`);
    console.log(`[API Request] ${method} ${url}`);
    console.log(`[API Request] botId: ${botId || 'none'}`);

    try {
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');

        // Получаем прокси для этого бота
        const proxyString = proxySettings[botId] || proxySettings['default'] || null;
        console.log(`[API Request] proxyString: ${proxyString || 'НЕТ ПРОКСИ'}`);

        let axiosConfig = {
            method: method,
            url: url,
            headers: headers,
            timeout: 30000
        };

        if (data) {
            axiosConfig.data = data;
        }

        // Если есть прокси - используем HttpsProxyAgent (как в примере Decodo)
        if (proxyString) {
            const proxyParts = proxyString.split(':');

            let proxyUrl;
            if (proxyParts.length === 2) {
                // Формат: host:port
                proxyUrl = `http://${proxyParts[0]}:${proxyParts[1]}`;
            } else if (proxyParts.length === 4) {
                // Формат: host:port:user:pass
                const [host, port, user, pass] = proxyParts;
                proxyUrl = `http://${user}:${pass}@${host}:${port}`;
            } else {
                console.error('[API Request] Неверный формат прокси:', proxyString);
            }

            if (proxyUrl) {
                console.log(`[API Request] Прокси URL: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);
                axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
                axiosConfig.proxy = false; // Отключаем встроенный proxy axios
            }
        }

        const response = await axios(axiosConfig);
        console.log(`[API Request] ✅ Успех: ${response.status}`);

        return {
            success: true,
            data: response.data,
            status: response.status,
            headers: response.headers
        };

    } catch (error) {
        console.error('[API Request] ❌ Ошибка:', error.message);

        if (error.response) {
            return {
                success: false,
                error: error.message,
                data: error.response.data,
                status: error.response.status,
                response: { status: error.response.status }
            };
        }

        return { success: false, error: error.message };
    }
});

// IPC: Установить прокси для бота
ipcMain.handle('set-bot-proxy', async (event, { botId, proxyString }) => {
    console.log(`[Proxy] Устанавливаю прокси для ${botId || 'default'}: ${proxyString || 'none'}`);
    if (proxyString) {
        proxySettings[botId || 'default'] = proxyString;
    } else {
        delete proxySettings[botId || 'default'];
    }
    return { success: true };
});

// =====================================================

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
    { var: '{country}', label: '{country} - Страна' }
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
            const transcriptionItems = TRANSCRIPTION_VARS.map(item => ({
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
                ...transcriptionItems,
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

app.whenReady().then(() => {
    createWindow();
    initAutoUpdater(); // Проверка обновлений при запуске
});

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

        // Собираем историю переписки (20-25 последних сообщений) и длину последнего сообщения мужчины
        const historyData = await win.webContents.executeJavaScript(`
            (function() {
                let history = '';
                let lastPartnerMessageLength = 0;

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
                        if (text && text.length > 1 && text.length < 2000 && !allMessages.includes(text)) {
                            allMessages.push(text);
                        }
                    });
                });

                if (allMessages.length > 0) {
                    // Берём 20-25 последних сообщений
                    history = allMessages.slice(-25).join('\\n---\\n');

                    // Определяем длину последнего сообщения (предположительно от мужчины)
                    // Обычно последнее сообщение в списке - это то, на которое нужно ответить
                    if (allMessages.length >= 1) {
                        lastPartnerMessageLength = allMessages[allMessages.length - 1].length;
                    }
                } else {
                    // Fallback - берём текст из основной области
                    const mainArea = document.querySelector('main, .chat-body, .messages, .content, [class*="chat"]');
                    if (mainArea) {
                        history = mainArea.innerText?.slice(-5000) || '';
                        // Примерная оценка длины последнего сообщения
                        const lines = history.split('\\n').filter(l => l.trim().length > 10);
                        if (lines.length > 0) {
                            lastPartnerMessageLength = lines[lines.length - 1].length;
                        }
                    }
                }

                return { history, lastPartnerMessageLength };
            })()
        `);

        const historyResult = historyData?.history || '';
        const lastMsgLength = historyData?.lastPartnerMessageLength || 100;

        console.log('[AI Context Menu] History length:', historyResult?.length || 0, 'Last msg length:', lastMsgLength);

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
                const lastMsgLength = ${lastMsgLength};

                // Получаем промпт из настроек
                const userPrompt = isChat
                    ? (globalSettings.chatPrompt || '').trim()
                    : (globalSettings.aiReplyPrompt || '').trim();

                // Определяем инструкцию по длине ответа на основе длины последнего сообщения
                let lengthInstruction = '';
                if (lastMsgLength < 50) {
                    lengthInstruction = 'Ответ должен быть коротким (1-2 предложения).';
                } else if (lastMsgLength < 150) {
                    lengthInstruction = 'Ответ должен быть средней длины (2-3 предложения).';
                } else if (lastMsgLength < 300) {
                    lengthInstruction = 'Ответ должен быть развёрнутым (3-5 предложений).';
                } else {
                    lengthInstruction = 'Ответ должен быть большим и подробным, ответь на все вопросы и темы из сообщения мужчины.';
                }

                // Формируем системный промпт
                let systemPrompt;
                if (userPrompt) {
                    // Если есть пользовательский промпт - используем его + инструкция по длине
                    systemPrompt = userPrompt + '\\n\\n' + lengthInstruction + ' Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.';
                } else {
                    // Дефолтный промпт
                    systemPrompt = isChat
                        ? 'Ты помощник оператора на сайте знакомств. Пиши ответы в чат от лица девушки, естественно и игриво. Отвечай на последнее сообщение мужчины. ' + lengthInstruction + ' Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.'
                        : 'Ты помощник оператора на сайте знакомств. Пиши ответы на письма от лица девушки, тепло и романтично. Отвечай на последнее сообщение мужчины. ' + lengthInstruction + ' Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.';
                }

                // Адаптивный max_tokens в зависимости от длины сообщения
                let maxTokens = 300;
                if (lastMsgLength > 300) maxTokens = 600;
                if (lastMsgLength > 500) maxTokens = 800;

                try {
                    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Контекст переписки:\\n' + history + '\\n\\nНапиши ответ:' }
                        ],
                        max_tokens: maxTokens,
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

// =====================================================
// === ВИДЕОЧАТ (SHARE MY CAM) ===
// =====================================================

const videoChatWindows = new Map();

// Открыть окно видеочата
ipcMain.handle('open-video-chat-window', async (event, data) => {
    const { botId, displayId, login, pass, cameraId } = data;

    // Если окно уже открыто - фокусируем
    if (videoChatWindows.has(botId)) {
        const existingWin = videoChatWindows.get(botId);
        if (existingWin && !existingWin.isDestroyed()) {
            existingWin.focus();
            return { success: true, focused: true };
        }
    }

    // Используем partition для сессии
    const ses = session.fromPartition(`persist:${botId}`);

    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        title: `Видеочат - ${displayId}`,
        webPreferences: {
            partition: `persist:${botId}`,
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.setMenuBarVisibility(false);

    // Обработка закрытия
    win.on('closed', () => {
        videoChatWindows.delete(botId);
        // Уведомляем renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('video-chat-window-closed', botId);
        }
    });

    // Сохраняем окно
    videoChatWindows.set(botId, win);

    // Загружаем страницу чата
    try {
        await win.loadURL('https://ladadate.com/chat#');

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
                        emailInput.dispatchEvent(new Event('change', { bubbles: true }));

                        nativeInputValueSetter.call(passInput, "${pass}");
                        passInput.dispatchEvent(new Event('input', { bubbles: true }));
                        passInput.dispatchEvent(new Event('change', { bubbles: true }));

                        console.log("VideoChat: Данные введены. Нажимаем войти...");
                        if(btn) setTimeout(() => btn.click(), 500);
                    }
                }, 2000);
            `);
        }

        // Запускаем мониторинг камеры мужчины (каждые 10 секунд)
        startVideoChatMonitoring(botId, win);

        return { success: true };

    } catch (error) {
        console.error('[VideoChat] Error loading:', error);
        win.close();
        return { success: false, error: error.message };
    }
});

// Фокус на окно видеочата
ipcMain.handle('focus-video-chat-window', async (event, data) => {
    const { botId } = data;
    const win = videoChatWindows.get(botId);
    if (win && !win.isDestroyed()) {
        win.focus();
        return { success: true };
    }
    return { success: false };
});

// Мониторинг камеры мужчины
function startVideoChatMonitoring(botId, win) {
    // Состояние мониторинга
    let lastManCameraState = false;
    let lastWatchingState = false;

    const checkInterval = setInterval(async () => {
        if (!win || win.isDestroyed()) {
            clearInterval(checkInterval);
            return;
        }

        try {
            // Проверяем наличие видео мужчины и смотрит ли он нашу камеру
            const result = await win.webContents.executeJavaScript(`
                (function() {
                    // Ищем видео элемент партнёра (мужчины)
                    // Обычно это video элемент в области партнёра или с определённым классом
                    const partnerVideos = document.querySelectorAll('video');
                    let manCameraOn = false;
                    let manWatching = false;
                    let manName = '';
                    let manId = '';

                    // Проверяем все video элементы
                    partnerVideos.forEach(video => {
                        // Если видео имеет srcObject и играет - камера включена
                        if (video.srcObject && !video.paused && video.videoWidth > 0) {
                            // Проверяем, не наша ли это камера (обычно наша камера меньше или в другом месте)
                            const rect = video.getBoundingClientRect();
                            // Видео партнёра обычно больше и справа/сверху
                            if (rect.width > 200) {
                                manCameraOn = true;
                            }
                        }
                    });

                    // Пытаемся найти имя активного собеседника
                    const activeChat = document.querySelector('.chat-item.active, .user-item.active, [class*="active"] .user-name');
                    if (activeChat) {
                        const nameEl = activeChat.querySelector('.name, .user-name, span');
                        if (nameEl) manName = nameEl.textContent.trim();
                    }

                    // Проверяем, смотрит ли мужчина нашу камеру (ищем индикатор просмотра)
                    const viewerIndicator = document.querySelector('.viewer-count, .watching-indicator, [class*="viewer"]');
                    if (viewerIndicator && viewerIndicator.textContent.includes('1')) {
                        manWatching = true;
                    }

                    return { manCameraOn, manWatching, manName, manId };
                })()
            `);

            // Уведомляем если состояние изменилось
            if (result.manCameraOn && !lastManCameraState) {
                // Камера мужчины включилась
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('video-chat-man-camera', {
                        botId,
                        manName: result.manName || 'Мужчина',
                        manId: result.manId || '?',
                        type: 'camera_on'
                    });
                }
            }

            if (result.manWatching && !lastWatchingState) {
                // Мужчина начал смотреть нашу камеру
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('video-chat-man-camera', {
                        botId,
                        manName: result.manName || 'Мужчина',
                        manId: result.manId || '?',
                        type: 'watching'
                    });
                }
            }

            lastManCameraState = result.manCameraOn;
            lastWatchingState = result.manWatching;

        } catch (error) {
            // Ошибки игнорируем (страница могла ещё не загрузиться)
        }
    }, 10000); // Каждые 10 секунд
}