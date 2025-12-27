const { app, BrowserWindow, ipcMain, session, Menu, dialog, powerMonitor, screen, globalShortcut, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const http = require('http');
const net = require('net');
const { exec } = require('child_process');

// =====================================================
// === ЛОКАЛЬНЫЙ ПРОКСИ ДЛЯ WEBVIEW ===
// =====================================================
// Создаёт локальный прокси без аутентификации который перенаправляет
// все запросы на upstream прокси (Decodo) с аутентификацией.
// Это решает проблему Electron не поддерживающего proxy auth в CONNECT.

const localProxyServers = new Map(); // botId -> { server, port }
let nextLocalProxyPort = 19000;

function createLocalProxyServer(upstreamHost, upstreamPort, upstreamUser, upstreamPass) {
    return new Promise((resolve, reject) => {
        const localPort = nextLocalProxyPort++;

        const server = http.createServer((req, res) => {
            // HTTP запросы (не CONNECT) - форвардим напрямую
            const options = {
                hostname: upstreamHost,
                port: upstreamPort,
                path: req.url,
                method: req.method,
                headers: {
                    ...req.headers,
                    'Proxy-Authorization': 'Basic ' + Buffer.from(`${upstreamUser}:${upstreamPass}`).toString('base64')
                }
            };

            const proxyReq = http.request(options, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                console.error('[LocalProxy] HTTP request error:', err.message);
                res.writeHead(502);
                res.end('Bad Gateway');
            });

            req.pipe(proxyReq);
        });

        // CONNECT для HTTPS туннелирования
        server.on('connect', (req, clientSocket, head) => {
            const [targetHost, targetPort] = req.url.split(':');

            // Подключаемся к upstream прокси
            const upstreamSocket = net.connect(upstreamPort, upstreamHost, () => {
                // Отправляем CONNECT запрос к upstream прокси с аутентификацией
                const authHeader = 'Basic ' + Buffer.from(`${upstreamUser}:${upstreamPass}`).toString('base64');
                const connectRequest = [
                    `CONNECT ${req.url} HTTP/1.1`,
                    `Host: ${req.url}`,
                    `Proxy-Authorization: ${authHeader}`,
                    `Proxy-Connection: Keep-Alive`,
                    '',
                    ''
                ].join('\r\n');

                upstreamSocket.write(connectRequest);
            });

            let connected = false;
            let buffer = Buffer.alloc(0);

            upstreamSocket.on('data', (data) => {
                if (!connected) {
                    buffer = Buffer.concat([buffer, data]);
                    const headerEnd = buffer.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                        const header = buffer.slice(0, headerEnd).toString();
                        if (header.includes('200')) {
                            connected = true;
                            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

                            // Если есть данные после заголовка - передаём
                            const remaining = buffer.slice(headerEnd + 4);
                            if (remaining.length > 0) {
                                clientSocket.write(remaining);
                            }

                            // Устанавливаем двунаправленный pipe
                            upstreamSocket.pipe(clientSocket);
                            clientSocket.pipe(upstreamSocket);

                            if (head && head.length > 0) {
                                upstreamSocket.write(head);
                            }
                        } else {
                            console.error('[LocalProxy] Upstream CONNECT failed:', header.split('\r\n')[0]);
                            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                            clientSocket.destroy();
                            upstreamSocket.destroy();
                        }
                    }
                }
            });

            upstreamSocket.on('error', (err) => {
                console.error('[LocalProxy] Upstream socket error:', err.message);
                clientSocket.destroy();
            });

            clientSocket.on('error', (err) => {
                console.error('[LocalProxy] Client socket error:', err.message);
                upstreamSocket.destroy();
            });

            upstreamSocket.on('close', () => clientSocket.destroy());
            clientSocket.on('close', () => upstreamSocket.destroy());
        });

        server.on('error', (err) => {
            console.error('[LocalProxy] Server error:', err.message);
            reject(err);
        });

        server.listen(localPort, '127.0.0.1', () => {
            console.log(`[LocalProxy] ✅ Локальный прокси запущен на 127.0.0.1:${localPort}`);
            resolve({ server, port: localPort });
        });
    });
}

// Исправление DPI scaling на Windows - предотвращает обрезание окна
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Отключение IPv6 - решает проблему ETIMEDOUT к Cloudflare
app.commandLine.appendSwitch('disable-ipv6');

let mainWindow = null;

// Хранение прокси для каждого бота (для использования в IPC handlers)
const botProxies = {};

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

// Найдено обновление - отправляем в renderer для показа кастомного диалога
autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Доступно обновление:', info.version);

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', {
            newVersion: info.version,
            currentVersion: app.getVersion()
        });
    }
});

// Обработка ответа пользователя на диалог обновления
ipcMain.on('update-response', (event, action) => {
    if (action === 'download') {
        console.log('[AutoUpdater] Пользователь выбрал скачать');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-downloading', { downloading: true });
        }
        autoUpdater.downloadUpdate();
    } else {
        console.log('[AutoUpdater] Пользователь отложил обновление');
    }
});

// Обработка ответа на диалог установки
ipcMain.on('update-install-response', (event, action) => {
    if (action === 'install') {
        console.log('[AutoUpdater] Пользователь выбрал установить');
        autoUpdater.quitAndInstall(false, true);
    }
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

// Обновление скачано - отправляем в renderer для показа кастомного диалога
autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Обновление скачано:', info.version);

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', {
            version: info.version
        });
    }
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

// IPC: Получить использование памяти всего приложения
ipcMain.handle('get-app-memory', async () => {
    try {
        // app.getAppMetrics() возвращает метрики всех процессов Electron
        const metrics = app.getAppMetrics();
        let totalMemory = 0;

        for (const metric of metrics) {
            // workingSetSize = реальное использование RAM в KB
            totalMemory += metric.memory.workingSetSize || 0;
        }

        // Конвертируем KB в MB
        return Math.round(totalMemory / 1024);
    } catch (e) {
        // Fallback на память main процесса
        const mem = process.memoryUsage();
        return Math.round(mem.rss / 1024 / 1024);
    }
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
            delete botProxies[botId]; // Удаляем из хранилища
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

        // Сохраняем прокси URL для использования в HTTP запросах (upload-photo-internal и т.д.)
        botProxies[botId] = proxyUrl;

        return { success: true, proxy: proxyUrl };
    } catch (error) {
        console.error(`[Proxy MAIN] ❌ ОШИБКА установки прокси для ${botId}:`, error.message);
        console.error(`[Proxy MAIN] Stack trace:`, error.stack);
        return { success: false, error: error.message };
    }
});

// ============================================================
// IPC: Установить прокси для WebView сессии (partition wv_)
// ============================================================
ipcMain.handle('set-webview-proxy', async (event, { botId, proxyString }) => {
    const partitionName = `persist:wv_${botId}`;

    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  [WebView Proxy] Установка прокси для WebView                ║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  botId: ${botId}`);
    console.log(`║  partition: ${partitionName}`);
    console.log(`║  proxyString: ${proxyString ? proxyString.replace(/:[^:]+$/, ':***') : 'НЕТ'}`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    try {
        const ses = session.fromPartition(partitionName);

        // Закрываем предыдущий локальный прокси если был
        if (localProxyServers.has(botId)) {
            const oldProxy = localProxyServers.get(botId);
            try {
                oldProxy.server.close();
                console.log(`[WebView Proxy] 🔄 Закрыт старый локальный прокси на порту ${oldProxy.port}`);
            } catch (e) {}
            localProxyServers.delete(botId);
        }

        if (!proxyString || proxyString.trim() === '') {
            await ses.setProxy({ proxyRules: '' });
            console.log(`[WebView Proxy] ⚪ ${botId}: прокси отключен (прямое соединение)`);
            return { success: true, proxy: null };
        }

        // Парсим прокси (формат: domain:port:user:pass)
        const trimmed = proxyString.trim();
        const parts = trimmed.split(':');

        let upstreamHost, upstreamPort, username, password;

        if (parts.length === 2) {
            // Формат: ip:port (без аутентификации)
            [upstreamHost, upstreamPort] = parts;
            upstreamPort = parseInt(upstreamPort);

            // Без аутентификации - используем напрямую
            const proxyUrl = `http://${upstreamHost}:${upstreamPort}`;
            console.log(`[WebView Proxy] Формат: ip:port → ${proxyUrl} (без auth)`);
            await ses.setProxy({ proxyRules: proxyUrl });

            console.log(`\n[WebView Proxy] ✅✅✅ ПРОКСИ УСПЕШНО УСТАНОВЛЕН ✅✅✅`);
            return { success: true, proxy: proxyUrl, partition: partitionName };

        } else if (parts.length === 4) {
            // Формат: domain:port:user:pass (С аутентификацией)
            [upstreamHost, upstreamPort, username, password] = parts;
            upstreamPort = parseInt(upstreamPort);
            console.log(`[WebView Proxy] Формат: domain:port:user:pass → ${upstreamHost}:${upstreamPort} (auth: ${username})`);

            // Создаём локальный прокси-туннель
            console.log(`[WebView Proxy] 🔧 Создаём локальный прокси-туннель...`);

            try {
                const localProxy = await createLocalProxyServer(upstreamHost, upstreamPort, username, password);
                localProxyServers.set(botId, localProxy);

                // WebView подключается к локальному прокси (без аутентификации!)
                const localProxyUrl = `http://127.0.0.1:${localProxy.port}`;
                console.log(`[WebView Proxy] 📡 Локальный прокси: ${localProxyUrl}`);
                console.log(`[WebView Proxy] 📡 Upstream прокси: ${upstreamHost}:${upstreamPort}`);

                await ses.setProxy({ proxyRules: localProxyUrl });

                console.log(`\n[WebView Proxy] ✅✅✅ ПРОКСИ УСПЕШНО УСТАНОВЛЕН (через локальный туннель) ✅✅✅`);
                console.log(`[WebView Proxy] Partition: ${partitionName}`);
                console.log(`[WebView Proxy] Local: 127.0.0.1:${localProxy.port}`);
                console.log(`[WebView Proxy] Upstream: ${upstreamHost}:${upstreamPort}\n`);

                return { success: true, proxy: localProxyUrl, partition: partitionName, localPort: localProxy.port };

            } catch (proxyErr) {
                console.error(`[WebView Proxy] ❌ Ошибка создания локального прокси:`, proxyErr.message);
                return { success: false, error: `Ошибка локального прокси: ${proxyErr.message}` };
            }

        } else {
            console.error(`[WebView Proxy] ❌ НЕВЕРНЫЙ ФОРМАТ ПРОКСИ: ${proxyString}`);
            return { success: false, error: 'Неверный формат прокси' };
        }
    } catch (error) {
        console.error(`[WebView Proxy] ❌ ОШИБКА:`, error.message);
        console.error(`[WebView Proxy] Stack:`, error.stack);
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

// IPC: Оптимизация WebView сессии (блокировка изображений для экономии RAM)
ipcMain.handle('optimize-webview-session', async (event, { botId }) => {
    try {
        const ses = session.fromPartition(`persist:wv_${botId}`);

        // Блокируем загрузку изображений, видео, шрифтов для экономии памяти
        ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
            const url = details.url.toLowerCase();

            // Блокируем тяжёлые ресурсы (изображения, видео, шрифты)
            const blockExtensions = [
                '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp',
                '.mp4', '.webm', '.avi', '.mov',
                '.woff', '.woff2', '.ttf', '.eot', '.otf'
            ];

            // Не блокируем если это API запрос или основная страница
            const isApiRequest = url.includes('/api/') || url.includes('/chat-') || url.includes('/message-');

            if (!isApiRequest && blockExtensions.some(ext => url.includes(ext))) {
                // console.log(`[WebView Optimize] Заблокирован: ${url.substring(0, 80)}...`);
                callback({ cancel: true });
            } else {
                callback({ cancel: false });
            }
        });

        console.log(`[WebView Optimize] ✅ Оптимизация включена для wv_${botId} (блокировка изображений)`);
        return { success: true };
    } catch (error) {
        console.error(`[WebView Optimize] ❌ Ошибка:`, error.message);
        return { success: false, error: error.message };
    }
});

// IPC: Очистка кэша всех WebView сессий (для предотвращения утечки памяти)
ipcMain.handle('clear-webview-cache', async (event, { botIds }) => {
    try {
        let clearedCount = 0;
        let totalSize = 0;

        for (const botId of botIds) {
            try {
                const ses = session.fromPartition(`persist:wv_${botId}`);

                // Получаем размер кэша до очистки
                const cacheSize = await ses.getCacheSize();
                totalSize += cacheSize;

                // Очищаем кэш
                await ses.clearCache();
                clearedCount++;
            } catch (e) {
                console.warn(`[Cache Clear] Ошибка для wv_${botId}:`, e.message);
            }
        }

        const totalMB = (totalSize / 1024 / 1024).toFixed(2);
        console.log(`🧹 [Cache Clear] Очищено ${clearedCount} сессий, освобождено ~${totalMB} MB`);

        return { success: true, clearedCount, totalMB };
    } catch (error) {
        console.error(`[Cache Clear] ❌ Ошибка:`, error.message);
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

// IPC: Вставка перевода в response window
ipcMain.on('insert-translation-to-window', (event, { windowId, text }) => {
    const win = responseWindows.get(windowId);
    if (win && !win.isDestroyed()) {
        // Вставляем переведённый текст вместо выделенного
        win.webContents.executeJavaScript(`
            (function() {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(${JSON.stringify(text)}));
                    selection.removeAllRanges();
                }
            })()
        `).catch(err => console.error('[Translator] Insert error:', err));
    }
});

// IPC: Контекстное меню для WebView
ipcMain.on('show-webview-context-menu', (event, { botId, x, y, selectionText, isEditable }) => {
    console.log('[Main] show-webview-context-menu:', { botId, selectionText: selectionText?.substring(0, 30), isEditable });
    const menuItems = [];

    // Стандартные пункты
    if (isEditable) {
        menuItems.push(
            { label: 'Вырезать', role: 'cut' },
            { label: 'Копировать', role: 'copy' },
            { label: 'Вставить', role: 'paste' }
        );
    } else {
        menuItems.push({ label: 'Копировать', role: 'copy' });
    }

    // Пункты перевода (если есть выделение)
    if (selectionText) {
        menuItems.push(
            { type: 'separator' },
            {
                label: '🌐 Перевести',
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('translate-selection', {
                            text: selectionText,
                            x: x,
                            y: y,
                            mode: 'show'
                        });
                    }
                }
            }
        );

        if (isEditable) {
            menuItems.push({
                label: '🔄 Заменить переводом',
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('translate-selection', {
                            text: selectionText,
                            x: x,
                            y: y,
                            mode: 'replace',
                            botId: botId // для замены в webview
                        });
                    }
                }
            });
        }
    }

    menuItems.push(
        { type: 'separator' },
        { label: 'Выделить всё', role: 'selectAll' }
    );

    const contextMenu = Menu.buildFromTemplate(menuItems);
    contextMenu.popup();
});

// IPC: Замена текста в webview (для переводчика)
ipcMain.on('replace-text-in-webview', (event, { botId, text }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        // Отправляем команду в renderer чтобы он заменил текст в webview
        mainWindow.webContents.send('do-replace-in-webview', { botId, text });
    }
});

// IPC: Запрос перевода от плавающей кнопки в webview
ipcMain.on('webview-translate-request', (event, { botId, text, x, y }) => {
    console.log('[Main] webview-translate-request:', { botId, text: text?.substring(0, 30), x, y });

    if (mainWindow && !mainWindow.isDestroyed()) {
        // Отправляем в renderer для перевода (используем тот же механизм что и контекстное меню)
        mainWindow.webContents.send('translate-selection', {
            text: text,
            x: x,
            y: y,
            mode: 'show',
            botId: botId
        });
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
            console.log('[API Request] Response data:', JSON.stringify(error.response.data));
            return {
                success: false,
                error: error.message,
                data: error.response.data,
                status: error.response.status,
                response: {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                }
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

// IPC: Запрос перевода через main процесс с поддержкой прокси
ipcMain.handle('translate-request', async (event, { service, text, targetLang, sourceLang, apiKey, email, botId }) => {
    console.log(`[Translator] Запрос перевода: ${service}, ${sourceLang} → ${targetLang}, botId: ${botId || 'none'}`);

    try {
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');

        // Получаем прокси для этого бота или дефолтный
        const proxyString = proxySettings[botId] || proxySettings['default'] || null;
        console.log(`[Translator] proxyString: ${proxyString || 'НЕТ ПРОКСИ'}`);

        let httpsAgent = null;

        // Настраиваем прокси если есть
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
                console.error('[Translator] Неверный формат прокси:', proxyString);
            }

            if (proxyUrl) {
                console.log(`[Translator] Прокси URL: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);
                httpsAgent = new HttpsProxyAgent(proxyUrl);
            }
        }

        let result;

        if (service === 'deepl') {
            // DeepL API
            const isFreeKey = apiKey.endsWith(':fx');
            const baseUrl = isFreeKey
                ? 'https://api-free.deepl.com/v2/translate'
                : 'https://api.deepl.com/v2/translate';

            const params = new URLSearchParams();
            params.append('text', text);
            params.append('target_lang', targetLang);
            if (sourceLang && sourceLang !== 'auto') {
                params.append('source_lang', sourceLang);
            }

            const axiosConfig = {
                method: 'POST',
                url: baseUrl,
                headers: {
                    'Authorization': `DeepL-Auth-Key ${apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: params.toString(),
                timeout: 15000,
                proxy: false
            };

            if (httpsAgent) {
                axiosConfig.httpsAgent = httpsAgent;
            }

            const response = await axios(axiosConfig);
            const translatedText = response.data.translations?.[0]?.text;

            if (translatedText) {
                result = {
                    success: true,
                    text: translatedText,
                    detectedLang: response.data.translations?.[0]?.detected_source_language,
                    service: 'DeepL'
                };
            } else {
                result = { success: false, error: 'Нет результата от DeepL' };
            }

        } else if (service === 'google') {
            // Google Cloud Translation API
            const googleUrl = `https://translation.googleapis.com/language/translate/v2`;

            const axiosConfig = {
                method: 'POST',
                url: googleUrl,
                headers: {
                    'Content-Type': 'application/json'
                },
                params: {
                    key: apiKey
                },
                data: {
                    q: text,
                    target: targetLang.toLowerCase(),
                    source: sourceLang === 'auto' ? undefined : sourceLang.toLowerCase(),
                    format: 'text'
                },
                timeout: 15000,
                proxy: false
            };

            if (httpsAgent) {
                axiosConfig.httpsAgent = httpsAgent;
            }

            const response = await axios(axiosConfig);
            const translatedText = response.data?.data?.translations?.[0]?.translatedText;
            const detectedLang = response.data?.data?.translations?.[0]?.detectedSourceLanguage;

            if (translatedText) {
                // Проверяем не тот же ли это язык
                if (detectedLang && detectedLang.toUpperCase() === targetLang.toUpperCase()) {
                    result = {
                        success: true,
                        text: text,
                        service: 'Google',
                        sameLanguage: true
                    };
                } else {
                    result = {
                        success: true,
                        text: translatedText,
                        detectedLang: detectedLang,
                        service: 'Google'
                    };
                }
            } else {
                result = { success: false, error: 'Нет результата от Google Translate' };
            }

        } else if (service === 'google-free') {
            // Бесплатный Google Translate (неофициальный API, как в QTranslate)
            // Не требует API ключа, но может быть заблокирован при чрезмерном использовании
            const sl = sourceLang === 'auto' ? 'auto' : sourceLang.toLowerCase();
            const tl = targetLang.toLowerCase();

            // Endpoint который использует сам сайт Google Translate
            const googleFreeUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

            const axiosConfig = {
                method: 'GET',
                url: googleFreeUrl,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000,
                proxy: false
            };

            if (httpsAgent) {
                axiosConfig.httpsAgent = httpsAgent;
            }

            const response = await axios(axiosConfig);

            // Ответ приходит в виде вложенного массива
            // [[["Привет","Hello",null,null,10]],null,"en",...]
            if (response.data && Array.isArray(response.data) && response.data[0]) {
                const translations = response.data[0];
                let translatedText = '';

                // Собираем все части перевода
                for (const part of translations) {
                    if (Array.isArray(part) && part[0]) {
                        translatedText += part[0];
                    }
                }

                if (translatedText) {
                    const detectedLang = response.data[2]; // Определённый язык
                    result = {
                        success: true,
                        text: translatedText,
                        detectedLang: detectedLang,
                        service: 'Google (Free)'
                    };
                } else {
                    result = { success: false, error: 'Нет результата от Google Free' };
                }
            } else {
                result = { success: false, error: 'Неверный ответ от Google Free' };
            }

        } else {
            // Неизвестный сервис
            result = { success: false, error: `Неизвестный сервис перевода: ${service}` };
        }

        console.log(`[Translator] Результат: ${result.success ? '✅ ' + result.service : '❌ ' + result.error}`);
        return result;

    } catch (error) {
        console.error('[Translator] Ошибка:', error.message);

        // Обработка специфичных ошибок DeepL
        if (error.response) {
            const status = error.response.status;
            if (status === 403) {
                return { success: false, error: 'Неверный API ключ DeepL' };
            }
            if (status === 456) {
                return { success: false, error: 'Превышен лимит DeepL' };
            }
        }

        return { success: false, error: error.message };
    }
});

// Чтение фото для отправки в письмах
ipcMain.handle('read-photo-file', async (event, { filePath }) => {
    try {
        if (!filePath || !fs.existsSync(filePath)) {
            return { success: false, error: 'Файл не найден' };
        }
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        return { success: true, base64, fileName: path.basename(filePath) };
    } catch (err) {
        console.error('[Photo] Ошибка чтения файла:', err);
        return { success: false, error: err.message };
    }
});

// Экспорт данных через диалог сохранения
ipcMain.handle('save-export-file', async (event, { jsonData, defaultFileName }) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Сохранить экспорт',
            defaultPath: defaultFileName,
            filters: [
                { name: 'JSON файлы', extensions: ['json'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        fs.writeFileSync(result.filePath, jsonData, 'utf8');
        return { success: true, filePath: result.filePath };
    } catch (err) {
        console.error('[Export] Ошибка сохранения:', err);
        return { success: false, error: err.message };
    }
});

// Загрузка фото через внутренний API (multipart/form-data)
ipcMain.handle('upload-photo-internal', async (event, { filePath, hash, uid, botId }) => {
    console.log('[Photo Upload MAIN] === Начало обработки ===');
    console.log('[Photo Upload MAIN] filePath:', filePath);
    console.log('[Photo Upload MAIN] hash:', hash);
    console.log('[Photo Upload MAIN] uid:', uid);
    console.log('[Photo Upload MAIN] botId:', botId);

    try {
        if (!filePath || !fs.existsSync(filePath)) {
            console.log('[Photo Upload MAIN] Файл не найден:', filePath);
            return { success: false, error: 'Файл не найден' };
        }
        console.log('[Photo Upload MAIN] Файл существует');

        // ВАЖНО: WebView использует партицию wv_${botId}, а не ${botId}
        const ses = session.fromPartition(`persist:wv_${botId}`);
        const allCookies = await ses.cookies.get({ url: 'https://ladadate.com' });
        const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log(`[Photo Upload MAIN] Cookies из wv_${botId}:`, allCookies.length, 'шт');

        const FormData = require('form-data');
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        // Создаём FormData
        const formData = new FormData();
        formData.append('hash', hash);
        formData.append('uploadfile', fileBuffer, {
            filename: fileName,
            contentType: 'image/jpeg'
        });

        // Получаем прокси для бота
        let proxyAgent = null;
        if (botId && botProxies[botId]) {
            const proxyUrl = botProxies[botId];
            const { HttpsProxyAgent } = require('https-proxy-agent');
            proxyAgent = new HttpsProxyAgent(proxyUrl);
        }

        const axiosConfig = {
            method: 'POST',
            url: `https://ladadate.com/message-attachment-upload?uid=${uid}`,
            headers: {
                ...formData.getHeaders(),
                'Cookie': cookieString,
                'Origin': 'https://ladadate.com',
                'Referer': 'https://ladadate.com/'
            },
            data: formData,
            timeout: 60000
        };

        if (proxyAgent) {
            axiosConfig.httpsAgent = proxyAgent;
        }

        console.log('[Photo Upload MAIN] Отправляем запрос на:', axiosConfig.url);
        const response = await axios(axiosConfig);
        console.log('[Photo Upload MAIN] Response status:', response.status);
        console.log('[Photo Upload MAIN] Response data:', response.data);

        return { success: true, data: response.data };
    } catch (err) {
        console.error('[Photo Upload MAIN] Ошибка:', err.message);
        if (err.response) {
            console.error('[Photo Upload MAIN] Response status:', err.response.status);
            console.error('[Photo Upload MAIN] Response data:', err.response.data);
        }
        return { success: false, error: err.message };
    }
});

// Отправка письма через внутренний API
ipcMain.handle('send-message-internal', async (event, { uid, body, botId }) => {
    try {
        // ВАЖНО: WebView использует партицию wv_${botId}, а не ${botId}
        const ses = session.fromPartition(`persist:wv_${botId}`);
        const allCookies = await ses.cookies.get({ url: 'https://ladadate.com' });
        const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log(`[Message Send MAIN] Cookies из wv_${botId}:`, allCookies.length, 'шт');

        // Получаем прокси для бота
        let proxyAgent = null;
        if (botId && botProxies[botId]) {
            const proxyUrl = botProxies[botId];
            const { HttpsProxyAgent } = require('https-proxy-agent');
            proxyAgent = new HttpsProxyAgent(proxyUrl);
        }

        const axiosConfig = {
            method: 'POST',
            url: 'https://ladadate.com/message-send',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Cookie': cookieString,
                'Origin': 'https://ladadate.com',
                'Referer': 'https://ladadate.com/',
                'X-Requested-With': 'XMLHttpRequest'
            },
            data: `uid=${encodeURIComponent(uid)}&body=${encodeURIComponent(body)}`,
            timeout: 30000
        };

        if (proxyAgent) {
            axiosConfig.httpsAgent = proxyAgent;
        }

        const response = await axios(axiosConfig);
        console.log('[Message Send MAIN] Response:', response.data);

        return { success: true, data: response.data };
    } catch (err) {
        console.error('[Message Send MAIN] Ошибка:', err.message);
        return { success: false, error: err.message };
    }
});

// Инициализация compose-сессии больше не нужна - WebView делает всё сам
// Оставляем пустой handler для совместимости
ipcMain.handle('init-compose-session', async (event, { recipientId, botId }) => {
    console.log(`[Compose Session] Пропускаем - WebView выполнит всё сам`);
    return { success: true, recipientId };
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
    // Минимальные размеры окна
    const MIN_WIDTH = 1000;
    const MIN_HEIGHT = 700;
    const DEFAULT_WIDTH = 1400;
    const DEFAULT_HEIGHT = 900;

    mainWindow = new BrowserWindow({
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        useContentSize: true,  // Размер контента, не окна (важно для Windows)
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            backgroundThrottling: false // ВАЖНО
        }
    });

    // === ЗАЩИТА РАЗМЕРА ОКНА ДЛЯ WINDOWS ===
    // Принудительно устанавливаем минимальный размер после создания
    mainWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);

    // Отслеживаем последний валидный размер
    let lastValidBounds = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

    // При изменении размера проверяем и сохраняем
    mainWindow.on('resize', () => {
        if (mainWindow.isMaximized() || mainWindow.isMinimized()) return;

        const bounds = mainWindow.getBounds();
        // Если размер валидный - сохраняем
        if (bounds.height >= MIN_HEIGHT && bounds.width >= MIN_WIDTH) {
            lastValidBounds = bounds;
        } else {
            // Если размер невалидный - восстанавливаем
            console.log(`[WindowProtection] Невалидный размер ${bounds.width}x${bounds.height}, восстанавливаю...`);
            mainWindow.setBounds({
                x: bounds.x,
                y: bounds.y,
                width: Math.max(bounds.width, MIN_WIDTH),
                height: Math.max(bounds.height, MIN_HEIGHT)
            });
        }
    });

    // При восстановлении из свёрнутого состояния проверяем размер
    mainWindow.on('restore', () => {
        const bounds = mainWindow.getBounds();
        if (bounds.height < MIN_HEIGHT) {
            console.log(`[WindowProtection] После restore: высота ${bounds.height} < ${MIN_HEIGHT}, восстанавливаю...`);
            mainWindow.setBounds({
                x: bounds.x,
                y: bounds.y,
                width: lastValidBounds.width,
                height: lastValidBounds.height
            });
        }
    });

    // При показе окна (после скрытия) проверяем размер
    mainWindow.on('show', () => {
        const bounds = mainWindow.getBounds();
        if (bounds.height < MIN_HEIGHT) {
            console.log(`[WindowProtection] После show: восстанавливаю размер...`);
            mainWindow.setBounds(lastValidBounds);
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

            const translateItems = params.selectionText ? [
                { type: 'separator' },
                {
                    label: '🌐 Перевести',
                    click: () => {
                        mainWindow.webContents.send('translate-selection', {
                            text: params.selectionText,
                            x: params.x,
                            y: params.y,
                            mode: 'show' // показать popup
                        });
                    }
                },
                {
                    label: '🔄 Заменить переводом',
                    click: () => {
                        mainWindow.webContents.send('translate-selection', {
                            text: params.selectionText,
                            x: params.x,
                            y: params.y,
                            mode: 'replace' // заменить текст
                        });
                    }
                }
            ] : [];

            const contextMenu = Menu.buildFromTemplate([
                ...transcriptionItems,
                { type: 'separator' },
                { label: 'Вырезать', role: 'cut' },
                { label: 'Копировать', role: 'copy' },
                { label: 'Вставить', role: 'paste' },
                ...translateItems,
                { type: 'separator' },
                { label: 'Выделить всё', role: 'selectAll' }
            ]);
            contextMenu.popup();
        } else {
            // Обычное контекстное меню для не-editable элементов
            const translateItems = params.selectionText ? [
                { type: 'separator' },
                {
                    label: '🌐 Перевести',
                    click: () => {
                        mainWindow.webContents.send('translate-selection', {
                            text: params.selectionText,
                            x: params.x,
                            y: params.y,
                            mode: 'show'
                        });
                    }
                }
            ] : [];

            const contextMenu = Menu.buildFromTemplate([
                { label: 'Копировать', role: 'copy' },
                ...translateItems,
                { label: 'Выделить всё', role: 'selectAll' }
            ]);
            contextMenu.popup();
        }
    });

    require('events').EventEmitter.defaultMaxListeners = 100;

    // === СОХРАНЕНИЕ СЕССИИ ПРИ ЗАКРЫТИИ ===
    let isQuitting = false;

    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault(); // Предотвращаем закрытие
            console.log('[App] Сохранение сессии перед закрытием...');

            // Отправляем команду renderer сохранить сессию
            mainWindow.webContents.send('save-session-before-quit');

            // Таймаут на случай если renderer не ответит
            setTimeout(() => {
                if (!isQuitting) {
                    console.log('[App] Таймаут сохранения, закрываем принудительно');
                    isQuitting = true;
                    mainWindow.close();
                }
            }, 3000);
        }
    });

    // Обработчик ответа от renderer что сессия сохранена
    ipcMain.once('session-saved', () => {
        console.log('[App] Сессия сохранена, закрываем приложение');
        isQuitting = true;
        mainWindow.close();
    });
}

app.whenReady().then(async () => {
    // =====================================================
    // === ОЧИСТКА КЭША WEBVIEW ПРИ ЗАПУСКЕ ===
    // =====================================================
    // Очищаем кэш всех WebView партиций для экономии места
    // Cookies НЕ затрагиваются - авторизация сохраняется
    try {
        const partitionsPath = path.join(app.getPath('userData'), 'Partitions');
        if (fs.existsSync(partitionsPath)) {
            const partitions = fs.readdirSync(partitionsPath);
            let cleanedCount = 0;

            for (const name of partitions) {
                // Очищаем только WebView партиции (wv_)
                if (name.startsWith('wv_')) {
                    try {
                        const ses = session.fromPartition(`persist:${name}`);
                        await ses.clearCache();
                        cleanedCount++;
                    } catch (e) {
                        console.warn(`[Cache Cleanup] Не удалось очистить ${name}:`, e.message);
                    }
                }
            }

            if (cleanedCount > 0) {
                console.log(`[Cache Cleanup] ✅ Очищен кэш ${cleanedCount} WebView сессий`);
            }
        }
    } catch (e) {
        console.warn('[Cache Cleanup] Ошибка очистки кэша:', e.message);
    }

    createWindow();
    initAutoUpdater(); // Проверка обновлений при запуске

    // =====================================================
    // === ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: POWERMONITOR СОБЫТИЯ ===
    // =====================================================
    // Основная защита размера окна реализована в createWindow()
    // Здесь только дополнительные проверки на системные события

    const MIN_HEIGHT = 700;

    function forceRestoreWindowSize() {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
            const bounds = mainWindow.getBounds();
            if (bounds.height < MIN_HEIGHT) {
                console.log(`[PowerMonitor] Принудительное восстановление: ${bounds.height} -> ${MIN_HEIGHT}`);
                mainWindow.setBounds({
                    x: bounds.x,
                    y: bounds.y,
                    width: Math.max(bounds.width, 1000),
                    height: MIN_HEIGHT
                });
            }
        }
    }

    // Пробуждение системы из сна
    powerMonitor.on('resume', () => {
        console.log('[PowerMonitor] Система проснулась');
        setTimeout(forceRestoreWindowSize, 500);
        setTimeout(forceRestoreWindowSize, 1500); // Повторная проверка
    });

    // Разблокировка экрана
    powerMonitor.on('unlock-screen', () => {
        console.log('[PowerMonitor] Экран разблокирован');
        setTimeout(forceRestoreWindowSize, 500);
    });

    // Изменение метрик дисплея (DPI, разрешение)
    screen.on('display-metrics-changed', (event, display, changedMetrics) => {
        console.log('[Screen] Метрики дисплея изменились:', changedMetrics);
        setTimeout(forceRestoreWindowSize, 300);
        setTimeout(forceRestoreWindowSize, 1000); // Повторная проверка
    });

    // =====================================================
    // === ГЛОБАЛЬНЫЙ ПЕРЕВОДЧИК (работает везде в системе) ===
    // =====================================================
    initGlobalTranslator();
});

// Глобальное окно переводчика
let globalTranslatorWindow = null;

// Симуляция Ctrl+C для копирования выделенного текста
function simulateCtrlC() {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            // Windows: используем PowerShell для симуляции Ctrl+C
            exec('powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"', (err) => {
                if (err) console.error('[GlobalTranslator] Ctrl+C simulation error:', err);
                setTimeout(resolve, 150); // Даём время для копирования
            });
        } else if (process.platform === 'linux') {
            // Linux: используем xdotool
            exec('xdotool key ctrl+c', (err) => {
                if (err) console.error('[GlobalTranslator] Ctrl+C simulation error:', err);
                setTimeout(resolve, 150);
            });
        } else if (process.platform === 'darwin') {
            // macOS: используем osascript
            exec('osascript -e \'tell application "System Events" to keystroke "c" using command down\'', (err) => {
                if (err) console.error('[GlobalTranslator] Ctrl+C simulation error:', err);
                setTimeout(resolve, 150);
            });
        } else {
            resolve();
        }
    });
}

// Создание окна глобального переводчика
function createGlobalTranslatorWindow(translatedText, originalText, theme) {
    // Закрываем существующее окно
    if (globalTranslatorWindow && !globalTranslatorWindow.isDestroyed()) {
        globalTranslatorWindow.close();
    }

    // Получаем позицию курсора
    const cursorPos = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPos);

    // Создаём окно
    globalTranslatorWindow = new BrowserWindow({
        width: 400,
        height: 250,
        x: Math.min(cursorPos.x, display.workArea.x + display.workArea.width - 420),
        y: Math.min(cursorPos.y + 10, display.workArea.y + display.workArea.height - 270),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Генерируем HTML с учётом темы
    const styles = getGlobalTranslatorStyles(theme);
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Arial, sans-serif;
                background: transparent;
                overflow: hidden;
            }
            .popup {
                background: ${styles.bg};
                border-radius: 10px;
                box-shadow: ${styles.shadow};
                border: ${styles.border};
                overflow: hidden;
                animation: fadeIn 0.2s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .header {
                background: ${styles.headerBg};
                padding: 10px 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid ${styles.headerBorder};
                cursor: move;
                -webkit-app-region: drag;
            }
            .header span {
                color: white;
                font-weight: 600;
                font-size: 13px;
            }
            .close-btn {
                background: none;
                border: none;
                color: ${styles.closeColor};
                font-size: 20px;
                cursor: pointer;
                padding: 0 5px;
                -webkit-app-region: no-drag;
            }
            .close-btn:hover { opacity: 0.8; }
            .content {
                padding: 15px;
                color: ${styles.contentColor};
                font-size: 14px;
                line-height: 1.5;
                max-height: 150px;
                overflow-y: auto;
            }
            .footer {
                padding: 10px 15px;
                background: ${styles.footerBg};
                border-top: 1px solid ${styles.footerBorder};
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            .btn {
                padding: 6px 12px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 12px;
                color: white;
                transition: opacity 0.2s;
            }
            .btn:hover { opacity: 0.9; }
            .btn-copy { background: ${styles.copyBtnBg}; }
            .btn-replace { background: ${styles.replaceBtnBg}; }
        </style>
    </head>
    <body>
        <div class="popup">
            <div class="header">
                <span>🌐 Перевод</span>
                <button class="close-btn" onclick="window.close()">×</button>
            </div>
            <div class="content">${escapeHtmlForGlobal(translatedText)}</div>
            <div class="footer">
                <button class="btn btn-copy" onclick="copyText()">📋 Копировать</button>
            </div>
        </div>
        <script>
            const translatedText = ${JSON.stringify(translatedText)};
            function copyText() {
                navigator.clipboard.writeText(translatedText).then(() => {
                    document.querySelector('.btn-copy').textContent = '✓ Скопировано';
                    setTimeout(() => window.close(), 500);
                });
            }
            // Закрытие по Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') window.close();
            });
            // Закрытие по клику вне окна
            window.addEventListener('blur', () => {
                setTimeout(() => window.close(), 100);
            });
        </script>
    </body>
    </html>
    `;

    globalTranslatorWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    globalTranslatorWindow.once('ready-to-show', () => {
        globalTranslatorWindow.show();
    });

    globalTranslatorWindow.on('closed', () => {
        globalTranslatorWindow = null;
    });
}

// Стили для глобального переводчика по теме
function getGlobalTranslatorStyles(theme) {
    const themes = {
        light: {
            bg: '#ffffff',
            headerBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            headerBorder: '#667eea',
            contentColor: '#333',
            footerBg: '#f8f9fa',
            footerBorder: '#eee',
            shadow: '0 8px 32px rgba(0,0,0,0.3)',
            border: 'none',
            copyBtnBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
            closeColor: 'rgba(255,255,255,0.8)'
        },
        dark: {
            bg: '#161616',
            headerBg: 'linear-gradient(90deg, #0d0d0d 0%, #1a1a1a 100%)',
            headerBorder: '#00ff88',
            contentColor: '#f0f0f0',
            footerBg: '#0d0d0d',
            footerBorder: '#333',
            shadow: '0 8px 32px rgba(0,255,136,0.3)',
            border: '1px solid #00ff88',
            copyBtnBg: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
            closeColor: '#00ff88'
        },
        ladadate: {
            bg: '#1a1025',
            headerBg: 'linear-gradient(90deg, #2d1f3d 0%, #3d2850 100%)',
            headerBorder: '#ec4899',
            contentColor: '#f0d0f0',
            footerBg: '#2d1f3d',
            footerBorder: '#4a3660',
            shadow: '0 8px 32px rgba(236,72,153,0.4)',
            border: '1px solid #ec4899',
            copyBtnBg: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            closeColor: '#ec4899'
        },
        novabot: {
            bg: '#0a1929',
            headerBg: 'linear-gradient(90deg, #0d2137 0%, #1a3a5f 100%)',
            headerBorder: '#2196f3',
            contentColor: '#b0d4f1',
            footerBg: '#0d2137',
            footerBorder: '#1e3a5f',
            shadow: '0 8px 32px rgba(33,150,243,0.4)',
            border: '1px solid #2196f3',
            copyBtnBg: 'linear-gradient(135deg, #2196f3 0%, #1565c0 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
            closeColor: '#2196f3'
        }
    };
    return themes[theme] || themes.light;
}

function escapeHtmlForGlobal(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Обработка глобального перевода
async function handleGlobalTranslate() {
    console.log('[GlobalTranslator] Горячая клавиша нажата');

    // Симулируем Ctrl+C для копирования выделенного текста
    const originalClipboard = clipboard.readText();
    await simulateCtrlC();

    // Читаем скопированный текст
    const selectedText = clipboard.readText();

    // Восстанавливаем оригинальный буфер обмена
    if (originalClipboard !== selectedText) {
        setTimeout(() => clipboard.writeText(originalClipboard), 500);
    }

    if (!selectedText || !selectedText.trim() || selectedText === originalClipboard) {
        console.log('[GlobalTranslator] Нет выделенного текста');
        return;
    }

    console.log('[GlobalTranslator] Текст для перевода:', selectedText.substring(0, 50));

    // Получаем настройки из mainWindow
    let settings = { theme: 'light', translatorEnabled: true };
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            settings = await mainWindow.webContents.executeJavaScript(`
                ({
                    theme: globalSettings.theme || 'light',
                    translatorEnabled: globalSettings.translatorEnabled !== false,
                    translateFrom: globalSettings.translateFrom || 'auto',
                    translateTo: globalSettings.translateTo || 'RU'
                })
            `);
        }
    } catch (e) { /* use defaults */ }

    if (!settings.translatorEnabled) {
        console.log('[GlobalTranslator] Переводчик выключен в настройках');
        return;
    }

    // Выполняем перевод через renderer
    try {
        const result = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                if (typeof translateText !== 'function') {
                    return { success: false, error: 'Переводчик не загружен' };
                }

                const text = ${JSON.stringify(selectedText.trim())};
                const sourceLang = globalSettings.translateFrom || 'auto';
                let targetLang;

                if (sourceLang === 'auto') {
                    targetLang = getAutoTargetLang(text, globalSettings.translateTo || 'RU');
                } else {
                    targetLang = globalSettings.translateTo || 'RU';
                }

                const result = await translateText(text, targetLang, sourceLang);
                return result;
            })()
        `);

        if (result.success && !result.sameLanguage) {
            createGlobalTranslatorWindow(result.text, selectedText, settings.theme);
        } else if (result.sameLanguage) {
            console.log('[GlobalTranslator] Текст уже на целевом языке');
        } else {
            console.error('[GlobalTranslator] Ошибка перевода:', result.error);
        }
    } catch (err) {
        console.error('[GlobalTranslator] Error:', err);
    }
}

// Инициализация глобального переводчика
function initGlobalTranslator() {
    // Регистрируем глобальную горячую клавишу Ctrl+Alt+Q
    const hotkey = 'CommandOrControl+Alt+Q';

    try {
        const registered = globalShortcut.register(hotkey, handleGlobalTranslate);
        if (registered) {
            console.log(`[GlobalTranslator] ✅ Глобальная горячая клавиша ${hotkey} зарегистрирована`);
        } else {
            console.error(`[GlobalTranslator] ❌ Не удалось зарегистрировать ${hotkey}`);
        }
    } catch (err) {
        console.error('[GlobalTranslator] Ошибка регистрации горячей клавиши:', err);
    }
}

// Освобождаем горячие клавиши при закрытии
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    console.log('[GlobalTranslator] Глобальные горячие клавиши освобождены');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// === Response Windows - открытие сайта в отдельном окне ===
const responseWindows = new Map();

ipcMain.handle('open-response-window', async (event, data) => {
    try {
    const { windowId, botId, partnerId, partnerName, type, url, login, pass, allowNotifications } = data;

    // Если окно уже открыто - фокусируем
    if (responseWindows.has(windowId)) {
        const existingWin = responseWindows.get(windowId);
        if (!existingWin.isDestroyed()) {
            existingWin.focus();
            return { success: true, focused: true };
        }
    }

    // Используем ОТДЕЛЬНУЮ сессию для ResponseWindow (без прокси)
    // persist:rw_ - Response Window, отдельная от API (persist:botId) и WebView (persist:wv_botId)
    const ses = session.fromPartition(`persist:rw_${botId}`);

    // Убираем прокси для этой сессии (прямое подключение)
    try {
        await ses.setProxy({ proxyRules: '' });
    } catch (e) {
        console.warn('[ResponseWindow] Не удалось отключить прокси:', e.message);
    }

    // Копируем cookies из WebView сессии (там авторизация)
    try {
        const webviewSes = session.fromPartition(`persist:wv_${botId}`);
        const cookies = await webviewSes.cookies.get({ domain: 'ladadate.com' });

        for (const cookie of cookies) {
            try {
                await ses.cookies.set({
                    url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    expirationDate: cookie.expirationDate
                });
            } catch (e) {
                // Игнорируем ошибки отдельных cookies
            }
        }
        console.log(`[ResponseWindow] Скопировано ${cookies.length} cookies из WebView`);
    } catch (cookieErr) {
        console.warn(`[ResponseWindow] Не удалось скопировать cookies:`, cookieErr.message);
    }

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
            preload: path.join(__dirname, 'preload-response.js'),
            zoomFactor: 0.8 // Масштаб 80% для большего контента
        }
    });

    // Устанавливаем масштаб после загрузки + блокировка уведомлений + кнопка перевода
    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(0.8);

        // Блокируем уведомления от сайта если настройка выключена
        if (!allowNotifications) {
            win.webContents.executeJavaScript(`
                // Блокируем Notification API
                if (!window.__notificationsBlocked) {
                    window.__notificationsBlocked = true;
                    window.Notification = function() {
                        console.log('[Lababot] Notification заблокирован настройками');
                        return { close: function() {} };
                    };
                    window.Notification.permission = 'denied';
                    window.Notification.requestPermission = function() {
                        return Promise.resolve('denied');
                    };
                    console.log('[Lababot] 🔕 Уведомления от сайта заблокированы');
                }
            `).catch(() => {});
        }

        // Инжектируем плавающую кнопку перевода
        injectTranslateButton(win);
    });

    // Повторное инжектирование при навигации внутри страницы
    win.webContents.on('did-navigate-in-page', () => {
        setTimeout(() => injectTranslateButton(win), 300);
    });

    // Сохраняем тип окна для AI
    win.windowType = type;

    win.setMenuBarVisibility(false);

    // Блокируем звук
    win.webContents.setAudioMuted(true);

    // Контекстное меню с AI (с подменю шаблонов)
    win.webContents.on('context-menu', async (e, params) => {
        // Получаем шаблоны из renderer process
        let templates = [];
        const isChat = win.windowType === 'chat';
        const promptType = isChat ? 'chatPrompt' : 'replyPrompt';

        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                templates = await mainWindow.webContents.executeJavaScript(`
                    (function() {
                        return promptTemplates && promptTemplates['${promptType}'] ? promptTemplates['${promptType}'] : [];
                    })()
                `);
            }
        } catch (err) {
            console.log('[Context Menu] Не удалось получить шаблоны:', err.message);
        }

        // Строим подменю для AI
        const aiSubmenu = [
            {
                label: 'По умолчанию',
                click: () => generateAIForResponseWindowWithTemplate(win, null)
            }
        ];

        if (templates && templates.length > 0) {
            aiSubmenu.push({ type: 'separator' });
            templates.forEach(tpl => {
                aiSubmenu.push({
                    label: tpl.name,
                    click: () => generateAIForResponseWindowWithTemplate(win, tpl.id)
                });
            });
        } else {
            aiSubmenu.push({
                label: 'Нет шаблонов',
                enabled: false
            });
        }

        // Перевод убран из контекстного меню - используется плавающая кнопка

        const contextMenu = Menu.buildFromTemplate([
            {
                label: '✨ AI Ответ',
                submenu: aiSubmenu
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
            console.log(`[ResponseWindow] Требуется авто-логин, целевой URL: ${url}`);

            // Ждём навигации после логина и редиректим на оригинальный URL
            const navigationHandler = (event, navUrl) => {
                // Если ушли со страницы логина - редиректим на целевой URL
                if (!navUrl.includes('/login') && !navUrl.includes('/sign-in')) {
                    console.log(`[ResponseWindow] Авто-логин успешен, редирект на: ${url}`);
                    // Убираем слушатель чтобы не зациклиться
                    win.webContents.removeListener('did-navigate', navigationHandler);
                    // Небольшая задержка для завершения авторизации
                    setTimeout(() => {
                        if (!win.isDestroyed()) {
                            win.loadURL(url);
                        }
                    }, 500);
                }
            };
            win.webContents.on('did-navigate', navigationHandler);

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
            null;
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

        // AI кнопка на сайте отключена - используйте правый клик для AI
        // win.webContents.on('did-finish-load', () => {
        //     injectAIButton(win);
        // });
        // win.webContents.on('did-navigate-in-page', () => {
        //     setTimeout(() => injectAIButton(win), 500);
        // });

        return { success: true };
    } catch (err) {
        console.error('[ResponseWindow] Error loading URL:', err);
        return { success: false, error: String(err.message || err) };
    }
    } catch (outerErr) {
        console.error('[ResponseWindow] Unexpected error:', outerErr);
        return { success: false, error: String(outerErr.message || outerErr) };
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

// === Горячие клавиши перевода для Response Windows ===

// Функция инъекции горячих клавиш перевода (как в основном боте)
function injectTranslateButton(win) {
    if (win.isDestroyed()) return;

    // Получаем настройки переводчика из главного окна
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
            (function() {
                if (typeof globalSettings === 'undefined' || !globalSettings.translatorEnabled) {
                    return null;
                }
                return {
                    hotkeyTranslate: globalSettings.hotkeyTranslate || 'Shift+Q',
                    hotkeyReplace: globalSettings.hotkeyReplace || 'Shift+S',
                    hotkeyReplaceLang: globalSettings.hotkeyReplaceLang || 'Ctrl+Shift+S'
                };
            })()
        `).then(settings => {
            if (!settings) {
                console.log('[InjectTranslate] Переводчик выключен в настройках');
                return;
            }

            const { hotkeyTranslate, hotkeyReplace, hotkeyReplaceLang } = settings;
            console.log('[InjectTranslate] Hotkeys:', hotkeyTranslate, hotkeyReplace, hotkeyReplaceLang);

            // Инжектируем скрипт с горячими клавишами
            win.webContents.executeJavaScript(`
                (function() {
                    if (window.__translateHotkeysInit) return;
                    window.__translateHotkeysInit = true;

                    const HOTKEY_TRANSLATE = '${hotkeyTranslate}';
                    const HOTKEY_REPLACE = '${hotkeyReplace}';
                    const HOTKEY_REPLACE_LANG = '${hotkeyReplaceLang}';

                    console.log('[TranslateHotkeys] Инициализация горячих клавиш:', HOTKEY_TRANSLATE, HOTKEY_REPLACE, HOTKEY_REPLACE_LANG);

                    // Сохранённый контекст выделения для замены
                    let savedSelectionContext = null;

                    // Получить комбинацию клавиш из события
                    function getKeyCombo(e) {
                        const parts = [];
                        if (e.ctrlKey) parts.push('Ctrl');
                        if (e.shiftKey) parts.push('Shift');
                        if (e.altKey) parts.push('Alt');
                        let key = e.key.toUpperCase();
                        if (key === ' ') key = 'Space';
                        if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
                            parts.push(key);
                        }
                        return parts.join('+');
                    }

                    // Получить выделенный текст
                    function getSelectedText() {
                        const activeEl = document.activeElement;
                        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                            const start = activeEl.selectionStart;
                            const end = activeEl.selectionEnd;
                            if (start !== end) {
                                return activeEl.value.substring(start, end).trim();
                            }
                        }
                        const selection = window.getSelection();
                        return selection ? selection.toString().trim() : '';
                    }

                    // Сохранить контекст выделения
                    function saveSelectionContext() {
                        const activeEl = document.activeElement;
                        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                            const start = activeEl.selectionStart;
                            const end = activeEl.selectionEnd;
                            if (start !== end) {
                                return { type: 'input', element: activeEl, start, end };
                            }
                        }
                        if (activeEl && activeEl.isContentEditable) {
                            const selection = window.getSelection();
                            if (selection.rangeCount > 0) {
                                return { type: 'contenteditable', element: activeEl, range: selection.getRangeAt(0).cloneRange() };
                            }
                        }
                        return null;
                    }

                    // Заменить текст используя сохранённый контекст
                    function replaceWithContext(ctx, newText) {
                        if (!ctx) return false;
                        try {
                            if (ctx.type === 'input') {
                                const el = ctx.element;
                                const value = el.value;
                                el.value = value.substring(0, ctx.start) + newText + value.substring(ctx.end);
                                el.selectionStart = el.selectionEnd = ctx.start + newText.length;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.focus();
                                return true;
                            }
                            if (ctx.type === 'contenteditable') {
                                ctx.element.focus();
                                const selection = window.getSelection();
                                selection.removeAllRanges();
                                selection.addRange(ctx.range);
                                document.execCommand('insertText', false, newText);
                                return true;
                            }
                        } catch (err) {
                            console.error('[TranslateHotkeys] Replace error:', err);
                        }
                        return false;
                    }

                    // Обработчик горячих клавиш
                    document.addEventListener('keydown', async (e) => {
                        const combo = getKeyCombo(e);
                        const text = getSelectedText();

                        // Shift+Q - показать перевод
                        if (combo === HOTKEY_TRANSLATE && text) {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[TranslateHotkeys] Translate:', text.substring(0, 30));

                            if (window.lababotAI && window.lababotAI.translate) {
                                const selection = window.getSelection();
                                let x = window.innerWidth / 2, y = window.innerHeight / 3;
                                if (selection.rangeCount > 0) {
                                    const rect = selection.getRangeAt(0).getBoundingClientRect();
                                    if (rect.width > 0) { x = rect.left; y = rect.bottom + 10; }
                                }
                                await window.lababotAI.translate(text, x, y);
                            }
                        }

                        // Shift+S - заменить переводом
                        else if (combo === HOTKEY_REPLACE && text) {
                            e.preventDefault();
                            e.stopPropagation();
                            const ctx = saveSelectionContext();
                            if (!ctx) {
                                console.log('[TranslateHotkeys] Нет редактируемого контекста');
                                return;
                            }
                            console.log('[TranslateHotkeys] Replace:', text.substring(0, 30));

                            if (window.lababotAI && window.lababotAI.translateAndReplace) {
                                const result = await window.lababotAI.translateAndReplace(text);
                                if (result && result.success && result.text) {
                                    replaceWithContext(ctx, result.text);
                                }
                            }
                        }

                        // Ctrl+Shift+S - заменить с выбором языка (показываем popup)
                        else if (combo === HOTKEY_REPLACE_LANG && text) {
                            e.preventDefault();
                            e.stopPropagation();
                            savedSelectionContext = saveSelectionContext();
                            if (!savedSelectionContext) {
                                console.log('[TranslateHotkeys] Нет редактируемого контекста');
                                return;
                            }
                            console.log('[TranslateHotkeys] Replace with lang choice:', text.substring(0, 30));
                            showLanguagePicker(text);
                        }
                    });

                    // Popup выбора языка
                    function showLanguagePicker(textToTranslate) {
                        const existing = document.getElementById('laba-lang-picker');
                        if (existing) existing.remove();

                        const languages = [
                            { code: 'EN', name: '🇬🇧 English' },
                            { code: 'RU', name: '🇷🇺 Русский' },
                            { code: 'DE', name: '🇩🇪 Deutsch' },
                            { code: 'FR', name: '🇫🇷 Français' },
                            { code: 'ES', name: '🇪🇸 Español' },
                            { code: 'IT', name: '🇮🇹 Italiano' },
                            { code: 'PT', name: '🇵🇹 Português' },
                            { code: 'PL', name: '🇵🇱 Polski' },
                            { code: 'UK', name: '🇺🇦 Українська' },
                            { code: 'ZH', name: '🇨🇳 中文' },
                            { code: 'JA', name: '🇯🇵 日本語' },
                            { code: 'KO', name: '🇰🇷 한국어' },
                            { code: 'TR', name: '🇹🇷 Türkçe' },
                            { code: 'AR', name: '🇸🇦 العربية' },
                            { code: 'NL', name: '🇳🇱 Nederlands' },
                            { code: 'SV', name: '🇸🇪 Svenska' }
                        ];

                        const popup = document.createElement('div');
                        popup.id = 'laba-lang-picker';
                        popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:white;padding:15px;border-radius:12px;box-shadow:0 4px 25px rgba(0,0,0,0.3);font-family:Arial,sans-serif;';
                        popup.innerHTML = '<div style="font-weight:600;margin-bottom:12px;color:#667eea;">🌐 Выберите язык</div>' +
                            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">' +
                            languages.map(l => '<button data-lang="' + l.code + '" style="padding:10px;border:1px solid #ddd;border-radius:8px;background:white;cursor:pointer;font-size:13px;transition:all 0.15s;">' + l.name + '</button>').join('') +
                            '</div>';

                        document.body.appendChild(popup);

                        popup.querySelectorAll('button').forEach(btn => {
                            btn.onmouseenter = () => { btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'; btn.style.color = 'white'; };
                            btn.onmouseleave = () => { btn.style.background = 'white'; btn.style.color = 'black'; };
                            btn.onclick = async () => {
                                const lang = btn.dataset.lang;
                                popup.remove();

                                if (window.lababotAI) {
                                    // Переводим на выбранный язык
                                    const result = await window.lababotAI.translateToLang(textToTranslate, lang);
                                    if (result && result.success && result.text && savedSelectionContext) {
                                        replaceWithContext(savedSelectionContext, result.text);
                                    }
                                }
                            };
                        });

                        // Закрытие по клику вне
                        setTimeout(() => {
                            document.addEventListener('mousedown', function close(e) {
                                if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('mousedown', close); }
                            });
                        }, 100);

                        // Закрытие по Escape
                        document.addEventListener('keydown', function esc(e) {
                            if (e.key === 'Escape') { popup.remove(); document.removeEventListener('keydown', esc); }
                        });
                    }

                    console.log('[TranslateHotkeys] Горячие клавиши перевода готовы');
                })();
            `).catch(err => {
                console.log('[InjectTranslate] Error:', err.message);
            });
        }).catch(() => {});
    }
}

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

// IPC: Перевод текста из Response Window (плавающая кнопка)
ipcMain.handle('response-window-translate', async (event, { text, x, y }) => {
    console.log('[ResponseWindow Translate] Запрос:', text?.substring(0, 30));

    if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
    }

    try {
        // Выполняем перевод через renderer (там есть translateText функция)
        const result = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                if (typeof translateText !== 'function') {
                    return { success: false, error: 'Переводчик не загружен' };
                }

                // Проверяем включён ли переводчик
                if (!globalSettings || !globalSettings.translatorEnabled) {
                    return { success: false, error: 'Переводчик выключен в настройках' };
                }

                const text = ${JSON.stringify(text)};
                const sourceLang = globalSettings.translateFrom || 'auto';
                let targetLang;

                if (sourceLang === 'auto') {
                    targetLang = getAutoTargetLang(text, globalSettings.translateTo || 'RU');
                } else {
                    targetLang = globalSettings.translateTo || 'RU';
                }

                const result = await translateText(text, targetLang, sourceLang);
                return result;
            })()
        `);

        // Если перевод успешен - показываем popup в Response Window
        if (result.success && !result.sameLanguage) {
            // Получаем настройки из mainWindow
            let isSticky = true; // default
            let currentTheme = 'light'; // default
            try {
                const settings = await mainWindow.webContents.executeJavaScript(`
                    ({
                        sticky: globalSettings.translatePopupSticky !== false,
                        theme: globalSettings.theme || 'light'
                    })
                `);
                isSticky = settings.sticky;
                currentTheme = settings.theme;
            } catch (e) { /* use defaults */ }

            // Находим окно, которое отправило запрос
            const senderWindow = BrowserWindow.fromWebContents(event.sender);
            if (senderWindow && !senderWindow.isDestroyed()) {
                // Отправляем результат обратно для показа popup
                senderWindow.webContents.send('show-translation-popup', {
                    text: result.text,
                    originalText: text,
                    x: x,
                    y: y,
                    sticky: isSticky,
                    theme: currentTheme
                });
            }
        }

        return result;
    } catch (err) {
        console.error('[ResponseWindow Translate] Error:', err);
        return { success: false, error: err.message };
    }
});

// IPC: Перевод и замена текста из Response Window (ПКМ на плавающей кнопке)
ipcMain.handle('response-window-translate-replace', async (event, { text }) => {
    console.log('[ResponseWindow TranslateReplace] Запрос:', text?.substring(0, 30));

    if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
    }

    try {
        // Выполняем перевод через renderer
        const result = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                if (typeof translateText !== 'function') {
                    return { success: false, error: 'Переводчик не загружен' };
                }

                if (!globalSettings || !globalSettings.translatorEnabled) {
                    return { success: false, error: 'Переводчик выключен в настройках' };
                }

                const text = ${JSON.stringify(text)};
                const sourceLang = globalSettings.translateFrom || 'auto';
                let targetLang;

                if (sourceLang === 'auto') {
                    // Для замены используем translateReplace (по умолчанию EN)
                    targetLang = getAutoTargetLang(text, globalSettings.translateReplace || 'EN');
                } else {
                    targetLang = globalSettings.translateReplace || 'EN';
                }

                const result = await translateText(text, targetLang, sourceLang);
                return result;
            })()
        `);

        // Возвращаем результат - замена делается локально в инжектированном скрипте
        return result;
    } catch (err) {
        console.error('[ResponseWindow TranslateReplace] Error:', err);
        return { success: false, error: err.message };
    }
});

// IPC: Перевод на конкретный язык (для Ctrl+Shift+S)
ipcMain.handle('response-window-translate-to-lang', async (event, { text, targetLang }) => {
    console.log('[ResponseWindow TranslateToLang] Запрос:', text?.substring(0, 30), '→', targetLang);

    if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
    }

    try {
        // Выполняем перевод через renderer
        const result = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                if (typeof translateText !== 'function') {
                    return { success: false, error: 'Переводчик не загружен' };
                }

                if (!globalSettings || !globalSettings.translatorEnabled) {
                    return { success: false, error: 'Переводчик выключен в настройках' };
                }

                const text = ${JSON.stringify(text)};
                const targetLang = ${JSON.stringify(targetLang)};
                const sourceLang = globalSettings.translateFrom || 'auto';

                const result = await translateText(text, targetLang, sourceLang);
                return result;
            })()
        `);

        return result;
    } catch (err) {
        console.error('[ResponseWindow TranslateToLang] Error:', err);
        return { success: false, error: err.message };
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

// Функция генерации AI ответа с конкретным шаблоном для Response Window
async function generateAIForResponseWindowWithTemplate(win, templateId) {
    if (win.isDestroyed()) return;

    const isChat = win.windowType === 'chat';
    const promptType = isChat ? 'chatPrompt' : 'replyPrompt';

    try {
        // Показываем индикатор загрузки
        await win.webContents.executeJavaScript(`
            (function() {
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
        const historyData = await win.webContents.executeJavaScript(`
            (function() {
                let history = '';
                let lastPartnerMessageLength = 0;

                const messageSelectors = ['.message-text', '.chat-message', '.message-content', '.msg-text', '[class*="message"]'];
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
                    history = allMessages.slice(-25).join('\\n---\\n');
                    if (allMessages.length >= 1) {
                        lastPartnerMessageLength = allMessages[allMessages.length - 1].length;
                    }
                } else {
                    const mainArea = document.querySelector('main, .chat-body, .messages, .content, [class*="chat"]');
                    if (mainArea) {
                        history = mainArea.innerText?.slice(-5000) || '';
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

        if (!mainWindow || mainWindow.isDestroyed()) {
            throw new Error('Main window not available');
        }

        // Генерируем ответ с учётом templateId
        const aiResult = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                const apiKey = typeof globalSettings !== 'undefined' ? globalSettings.apiKey : null;
                if (!apiKey) {
                    return { success: false, error: 'API ключ OpenAI не указан в настройках' };
                }

                const isChat = ${isChat};
                const history = ${JSON.stringify(historyResult || '')};
                const lastMsgLength = ${lastMsgLength};
                const templateId = ${templateId ? JSON.stringify(templateId) : 'null'};
                const promptType = '${promptType}';

                // Получаем промпт из шаблона или настроек
                let userPrompt = '';
                if (templateId) {
                    const templates = promptTemplates && promptTemplates[promptType] ? promptTemplates[promptType] : [];
                    const template = templates.find(t => t.id == templateId);
                    if (template) {
                        userPrompt = template.text || '';
                    }
                }
                // Если templateId = null (По умолчанию), не используем пользовательский промпт

                // Инструкция по длине ответа
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
                    systemPrompt = userPrompt + '\\n\\n' + lengthInstruction + ' Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.';
                } else {
                    systemPrompt = isChat
                        ? 'Ты помощник оператора на сайте знакомств. Пиши ответы в чат от лица девушки, естественно и игриво. Отвечай на последнее сообщение мужчины. ' + lengthInstruction + ' Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.'
                        : 'Ты помощник оператора на сайте знакомств. Пиши ответы на письма от лица девушки, тепло и романтично. Отвечай на последнее сообщение мужчины. ' + lengthInstruction + ' Пиши ТОЛЬКО текст ответа, без пояснений и кавычек.';
                }

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
                        return { success: true, text: response.data.choices[0].message.content.trim() };
                    } else {
                        return { success: false, error: 'Пустой ответ от AI' };
                    }
                } catch (err) {
                    console.error('[AI] Error:', err);
                    return { success: false, error: err.response?.data?.error?.message || err.message };
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
                    const selectors = ['input[placeholder*="message" i]', 'input[placeholder*="Write" i]', 'textarea[placeholder*="message" i]', 'textarea', 'input[type="text"]'];

                    let inputEl = null;
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.offsetParent !== null) {
                            inputEl = el;
                            break;
                        }
                    }

                    if (inputEl) {
                        const proto = inputEl.tagName === 'TEXTAREA'
                            ? window.HTMLTextAreaElement.prototype
                            : window.HTMLInputElement.prototype;
                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                        nativeSetter.call(inputEl, text);
                        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                        inputEl.focus();
                        return { success: true };
                    } else {
                        navigator.clipboard.writeText(text);
                        alert('Текст скопирован в буфер обмена (поле ввода не найдено):\\n\\n' + text);
                        return { success: false, copied: true };
                    }
                })()
            `);
        } else {
            await win.webContents.executeJavaScript(`
                alert('Ошибка AI: ${(aiResult.error || 'Неизвестная ошибка').replace(/'/g, "\\'")}');
            `);
        }

    } catch (err) {
        console.error('[AI Context Menu] Error:', err);
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

    // Используем ОТДЕЛЬНУЮ сессию для VideoChat (без прокси)
    // persist:vc_ - Video Chat, отдельная от API (persist:botId) и WebView (persist:wv_botId)
    const ses = session.fromPartition(`persist:vc_${botId}`);

    // Убираем прокси для этой сессии (прямое подключение)
    try {
        await ses.setProxy({ proxyRules: '' });
    } catch (e) {
        console.warn('[VideoChat] Не удалось отключить прокси:', e.message);
    }

    // Копируем cookies из WebView сессии (там авторизация)
    try {
        const webviewSes = session.fromPartition(`persist:wv_${botId}`);
        const cookies = await webviewSes.cookies.get({ domain: 'ladadate.com' });

        for (const cookie of cookies) {
            try {
                await ses.cookies.set({
                    url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    expirationDate: cookie.expirationDate
                });
            } catch (e) {
                // Игнорируем ошибки отдельных cookies
            }
        }
        console.log(`[VideoChat] Скопировано ${cookies.length} cookies из WebView`);
    } catch (cookieErr) {
        console.warn(`[VideoChat] Не удалось скопировать cookies:`, cookieErr.message);
    }

    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        title: `Видеочат - ${displayId}`,
        webPreferences: {
            session: ses, // ИСПРАВЛЕНО: использовать session вместо partition
            nodeIntegration: false,
            contextIsolation: true,
            zoomFactor: 1.0 // Фиксированный масштаб 100%
        }
    });

    win.setMenuBarVisibility(false);

    // Сбрасываем сохранённый zoom level для этой сессии
    win.webContents.setZoomLevel(0);
    win.webContents.setZoomFactor(1.0);

    // Устанавливаем масштаб после загрузки и при каждой навигации
    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomLevel(0);
        win.webContents.setZoomFactor(1.0);
    });

    win.webContents.on('did-navigate', () => {
        win.webContents.setZoomLevel(0);
        win.webContents.setZoomFactor(1.0);
    });

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
        console.log(`[VideoChat] Загружаем страницу для ${displayId}...`);
        await win.loadURL('https://ladadate.com/chat#');
        console.log(`[VideoChat] Страница загружена для ${displayId}`);

        // Проверяем на редирект на логин
        const currentUrl = win.webContents.getURL();
        console.log(`[VideoChat] Текущий URL: ${currentUrl}`);
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