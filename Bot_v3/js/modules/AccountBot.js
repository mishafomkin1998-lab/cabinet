class AccountBot {
    constructor(id, login, pass, displayId, token) {
        this.id = id; 
        this.login = login; 
        this.pass = pass; 
        this.displayId = displayId; 
        this.token = token;
        
        this.lastTplMail = null; 
        this.lastTplChat = null;
        this.isMailRunning = false;
        this.isMailWaiting = false; // true когда рассылка ждёт пользователей
        this.mailTimeout = null;
        this.mailStats = { sent: 0, errors: 0, waiting: 0 };
        this.mailHistory = { sent: [], errors: [], waiting: [] };
        this.mailSettings = { target: 'online', speed: 'smart', blacklist: [], photoOnly: false, auto: false };
        this.photoPath = null;  // Путь к файлу фото
        this.photoName = null;  // Имя файла для отображения
        this.mailStartTime = null; // Время начала работы Mail
        this.mailTimerInterval = null; // Интервал обновления таймера Mail

        this.isChatRunning = false;
        this.isChatWaiting = false; // true когда рассылка ждёт пользователей
        this.chatTimeout = null;
        this.chatStats = { sent: 0, errors: 0, waiting: 0 };
        this.chatHistory = { sent: [], errors: [], waiting: [] };
        this.chatSettings = {
            target: 'online',
            speed: 'smart',
            blacklist: [],
            rotationHours: 3,
            cyclic: false,
            currentInviteIndex: 0,
            rotationStartTime: 0,
            // === Автоответы на входящие чаты ===
            autoReplyEnabled: false,
            autoReplies: [] // [{ text: "...", delay: 60 }, ...]
        };
        this.chatStartTime = null; // Время начала работы Chat
        this.chatTimerInterval = null; // Интервал обновления таймера Chat

        // === Очередь автоответов ===
        this.autoReplyQueue = {}; // { recipientId: { currentIndex: 0, timerId: null, partnerName: "..." } } 
        
        this.vipList = []; 
        this.vipStatus = {}; 
        
        this.unreadChatSessions = []; 
        this.keepAliveTimer = null; 
        this.lababotHeartbeatTimer = null; // Таймер для heartbeat на Lababot сервер
        this.tabColorState = 0;
        this.selectedBlacklistId = null;

        this.isMonitoring = false;
        this.webviewReady = false; // Флаг: WebView загружен и dom-ready сработал
        this.lastChatSessions = [];
        this.lastMailId = 0;
        this.isFirstMailCheck = true; // Флаг первой проверки почты (для уведомлений при входе)
        this.myBirthday = null;

        // === Списки игнорирующих пользователей (сохраняются навсегда, раздельно для Mail и Chat) ===
        this.ignoredUsersMail = []; // ID пользователей, которые заигнорили в письмах
        this.ignoredUsersChat = []; // ID пользователей, которые заигнорили в чатах

        // === Счётчик сетевых ошибок для exponential backoff ===
        this.networkErrorCount = 0;

        // === Отслеживание статистики по статусу (для логирования при авто-переключении) ===
        this.statusStartTime = null;      // Время переключения на текущий статус
        this.statusStartSent = 0;         // Sent на момент переключения
        this.statusStartErrors = 0;       // Errors на момент переключения

        // ПРИМЕЧАНИЕ: Фильтрация теперь проверяет mailHistory.sent, mailHistory.errors,
        // chatHistory.sent, chatHistory.errors, blacklist и ignoredUsers напрямую.
        // Это защищает от спама - если пользователь есть в ЛЮБОМ списке, ему не отправляется.

        // === ДОБАВЛЕНО: Отслеживание диалогов для полной спецификации ===
        this.conversations = {}; // Структура: { recipientId: { firstMessageTime, lastMessageTime, messageCount } }
        this.translatorId = globalSettings.translatorId || null; // ID переводчика из глобальных настроек

        // === Отслеживание времени входящих писем для расчёта responseTime ===
        // Структура: { recipientId: timestamp } — время ПЕРВОГО неотвеченного письма от мужчины
        this.incomingTimes = {};

        // === Статус разрешения рассылки (управляется с сервера) ===
        this.mailingEnabled = true; // По умолчанию разрешено, сервер может отключить

        // === ВАЖНОЕ ДОБАВЛЕНИЕ: Запуск функций после авторизации ===
        // ВАЖНО: createWebview() НЕ вызывается здесь!
        // WebView создаётся ПОСЛЕ настройки прокси в performLogin()
        if (this.token) {
            this.startKeepAlive();
            // ВАЖНО: startMonitoring() НЕ вызывается здесь!
            // Вызывается ПОСЛЕ загрузки данных с сервера в performLogin/loadServerDataForAllBots
            // Иначе входящие письма добавятся в blacklist, который потом перезапишется сервером
            this.getProfileData();
            // this.createWebview() - вызывается из performLogin() после setWebviewProxy()

            // Запускаем heartbeat на сервер Lababot
            this.startLababotHeartbeat();
        }
    }

    // === ПРОВЕРКА ИСТОРИИ (защита от спама) ===

    /**
     * Извлекает ID пользователя из строки истории
     * Форматы: "12345 (Frank)" или "12345: error message"
     * @param {string} entry - строка из истории
     * @returns {string|null} - ID или null если не найден
     */
    extractIdFromHistoryEntry(entry) {
        if (!entry || typeof entry !== 'string') return null;

        // Формат "12345 (Name)" - ID до пробела
        const matchParens = entry.match(/^(\d+)\s*\(/);
        if (matchParens) return matchParens[1];

        // Формат "12345: error" - ID до двоеточия
        const matchColon = entry.match(/^(\d+):/);
        if (matchColon) return matchColon[1];

        // Формат просто "12345" - только цифры
        const matchDigits = entry.match(/^(\d+)$/);
        if (matchDigits) return matchDigits[1];

        return null;
    }

    /**
     * Проверяет, есть ли пользователь в массиве истории
     * @param {string|number} userId - ID пользователя
     * @param {Array} historyArray - массив истории (sent или errors)
     * @returns {boolean}
     */
    isUserInHistory(userId, historyArray) {
        if (!historyArray || !Array.isArray(historyArray)) return false;
        const userIdStr = userId.toString();

        return historyArray.some(entry => {
            const entryId = this.extractIdFromHistoryEntry(entry);
            return entryId === userIdStr;
        });
    }

    /**
     * Проверяет, можно ли отправить сообщение пользователю (Mail)
     * Проверяет ВСЕ списки: sent, errors, blacklist, ignored
     * @param {string|number} userId - ID пользователя
     * @returns {boolean} - true если можно отправить
     */
    canSendMailTo(userId) {
        const userIdStr = userId.toString();

        // Проверяем "Отправленные"
        if (this.isUserInHistory(userIdStr, this.mailHistory.sent)) {
            return false;
        }

        // Проверяем "Ошибки"
        if (this.isUserInHistory(userIdStr, this.mailHistory.errors)) {
            return false;
        }

        // Проверяем "Чёрный список"
        if (this.mailSettings.blacklist.includes(userIdStr)) {
            return false;
        }

        // Проверяем "Игнор"
        if (this.ignoredUsersMail.includes(userIdStr)) {
            return false;
        }

        return true;
    }

    /**
     * Проверяет, можно ли отправить сообщение пользователю (Chat)
     * Проверяет ВСЕ списки: sent, errors, blacklist, ignored
     * @param {string|number} userId - ID пользователя
     * @returns {boolean} - true если можно отправить
     */
    canSendChatTo(userId) {
        const userIdStr = userId.toString();

        // Проверяем "Отправленные"
        if (this.isUserInHistory(userIdStr, this.chatHistory.sent)) {
            return false;
        }

        // Проверяем "Ошибки"
        if (this.isUserInHistory(userIdStr, this.chatHistory.errors)) {
            return false;
        }

        // Проверяем "Чёрный список"
        if (this.chatSettings.blacklist.includes(userIdStr)) {
            return false;
        }

        // Проверяем "Игнор"
        if (this.ignoredUsersChat.includes(userIdStr)) {
            return false;
        }

        return true;
    }

    // === ЗАГРУЗКА ДАННЫХ С СЕРВЕРА ===

    // Обновление статистики с отправкой на сервер (debounced)
    incrementStat(type, field) {
        // type: 'mail' или 'chat'
        // field: 'sent' или 'errors'
        const stats = type === 'mail' ? this.mailStats : this.chatStats;
        stats[field]++;
        this.updateUI();

        // Debounced сохранение на сервер
        this.scheduleStatsSync();
    }

    // Планирование синхронизации статистики (debounce 2 сек)
    scheduleStatsSync() {
        if (this.statsSyncTimer) clearTimeout(this.statsSyncTimer);
        this.statsSyncTimer = setTimeout(() => {
            this.syncStatsToServer();
        }, 2000);
    }

    // Синхронизация статистики на сервер
    async syncStatsToServer() {
        try {
            const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(this.displayId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    statsMailSent: this.mailStats.sent,
                    statsMailErrors: this.mailStats.errors,
                    statsChatSent: this.chatStats.sent,
                    statsChatErrors: this.chatStats.errors
                })
            });
            console.log(`📊 Статистика синхронизирована для ${this.displayId}`);
        } catch (error) {
            console.error(`❌ Ошибка синхронизации статистики:`, error);
        }
    }

    // Метод для загрузки данных с сервера (шаблоны, blacklist, статистика)
    // С умной синхронизацией: если локальные данные богаче - отправляем на сервер
    async loadFromServerData(serverData) {
        if (!serverData) return;

        const localTemplates = botTemplates[this.login] || { mail: [], chat: [] };
        const serverMailTplCount = serverData.templatesMail?.length || 0;
        const serverChatTplCount = serverData.templatesChat?.length || 0;
        const localMailTplCount = localTemplates.mail?.length || 0;
        const localChatTplCount = localTemplates.chat?.length || 0;

        // === ШАБЛОНЫ: Умная синхронизация ===
        // Если сервер пуст, а локально есть данные - отправляем на сервер
        if (serverMailTplCount === 0 && localMailTplCount > 0) {
            console.log(`🔄 [Sync] Сервер пуст, отправляем ${localMailTplCount} Mail шаблонов на сервер...`);
            const success = await saveTemplatesToServer(this.displayId, 'mail', localTemplates.mail);
            if (success) {
                showToast(`Шаблоны Mail (${localMailTplCount}) синхронизированы с сервером`, 'success');
            }
        } else if (serverMailTplCount > 0) {
            // Сервер имеет данные - загружаем их
            if (!botTemplates[this.login]) botTemplates[this.login] = { mail: [], chat: [] };
            botTemplates[this.login].mail = serverData.templatesMail;
        }

        if (serverChatTplCount === 0 && localChatTplCount > 0) {
            console.log(`🔄 [Sync] Сервер пуст, отправляем ${localChatTplCount} Chat шаблонов на сервер...`);
            const success = await saveTemplatesToServer(this.displayId, 'chat', localTemplates.chat);
            if (success) {
                showToast(`Шаблоны Chat (${localChatTplCount}) синхронизированы с сервером`, 'success');
            }
        } else if (serverChatTplCount > 0) {
            if (!botTemplates[this.login]) botTemplates[this.login] = { mail: [], chat: [] };
            botTemplates[this.login].chat = serverData.templatesChat;
        }

        // === BLACKLIST: Умная синхронизация ===
        const serverMailBlCount = serverData.blacklistMail?.length || 0;
        const serverChatBlCount = serverData.blacklistChat?.length || 0;
        const localMailBlCount = this.mailSettings.blacklist?.length || 0;
        const localChatBlCount = this.chatSettings.blacklist?.length || 0;

        if (serverMailBlCount === 0 && localMailBlCount > 0) {
            console.log(`🔄 [Sync] Сервер пуст, отправляем ${localMailBlCount} ЧС Mail на сервер...`);
            await saveBlacklistToServer(this.displayId, 'mail', this.mailSettings.blacklist);
        } else if (serverMailBlCount > 0) {
            this.mailSettings.blacklist = serverData.blacklistMail;
        }

        if (serverChatBlCount === 0 && localChatBlCount > 0) {
            console.log(`🔄 [Sync] Сервер пуст, отправляем ${localChatBlCount} ЧС Chat на сервер...`);
            await saveBlacklistToServer(this.displayId, 'chat', this.chatSettings.blacklist);
        } else if (serverChatBlCount > 0) {
            this.chatSettings.blacklist = serverData.blacklistChat;
        }

        // Загружаем статистику (сервер всегда приоритет)
        this.mailStats.sent = serverData.statsMailSent || 0;
        this.mailStats.errors = serverData.statsMailErrors || 0;
        this.chatStats.sent = serverData.statsChatSent || 0;
        this.chatStats.errors = serverData.statsChatErrors || 0;

        // Загружаем автоответы
        if (serverData.autoReplies && Array.isArray(serverData.autoReplies)) {
            this.chatSettings.autoReplies = serverData.autoReplies;
        }
        if (serverData.autoReplyEnabled !== undefined) {
            this.chatSettings.autoReplyEnabled = serverData.autoReplyEnabled;
        }

        console.log(`📥 Данные синхронизированы для ${this.displayId}:`, {
            mailTemplates: botTemplates[this.login]?.mail?.length || 0,
            chatTemplates: botTemplates[this.login]?.chat?.length || 0,
            mailBlacklist: this.mailSettings.blacklist.length,
            chatBlacklist: this.chatSettings.blacklist.length,
            mailStats: this.mailStats,
            chatStats: this.chatStats,
            autoReplies: this.chatSettings.autoReplies.length,
            autoReplyEnabled: this.chatSettings.autoReplyEnabled
        });
    }

    // === МЕТОДЫ ДЛЯ ОТСЛЕЖИВАНИЯ ДИАЛОГОВ (полная спецификация) ===

    // Инициализация или обновление диалога с получателем
    trackConversation(recipientId) {
        if (!this.conversations[recipientId]) {
            // Первое сообщение в диалоге
            this.conversations[recipientId] = {
                firstMessageTime: Date.now(),
                lastMessageTime: Date.now(),
                messageCount: 1
            };
            return { isFirst: true, responseTime: null };
        } else {
            // Последующее сообщение
            const conv = this.conversations[recipientId];
            const responseTimeMs = Date.now() - conv.lastMessageTime;
            conv.lastMessageTime = Date.now();
            conv.messageCount++;

            return {
                isFirst: false,
                responseTime: millisecondsToInterval(responseTimeMs)
            };
        }
    }

    // Получить conversation ID для получателя
    getConvId(recipientId) {
        return generateConvId(this.id, recipientId);
    }

    // Очистка старых данных (старше 24 часов) для экономии памяти
    cleanupConversations() {
        const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 часа
        const NOTIFY_MAX_AGE_MS = 60 * 60 * 1000; // 1 час для notify times
        const now = Date.now();
        let cleaned = 0;

        // 1. Очистка старых диалогов
        for (const recipientId in this.conversations) {
            if (now - this.conversations[recipientId].lastMessageTime > MAX_AGE_MS) {
                delete this.conversations[recipientId];
                cleaned++;
            }
        }

        // 2. Очистка chatNotifyTimes (записи старше 1 часа)
        if (this.chatNotifyTimes) {
            for (const sessionId in this.chatNotifyTimes) {
                if (now - this.chatNotifyTimes[sessionId] > NOTIFY_MAX_AGE_MS) {
                    delete this.chatNotifyTimes[sessionId];
                    cleaned++;
                }
            }
        }

        // 3. Очистка activeChatSoundTimes (записи старше 1 часа)
        if (this.activeChatSoundTimes) {
            for (const sessionId in this.activeChatSoundTimes) {
                if (now - this.activeChatSoundTimes[sessionId] > NOTIFY_MAX_AGE_MS) {
                    delete this.activeChatSoundTimes[sessionId];
                    cleaned++;
                }
            }
        }

        // 4. Очистка chatRequestNotified (записи старше 1 часа)
        if (this.chatRequestNotified) {
            for (const odId in this.chatRequestNotified) {
                if (now - this.chatRequestNotified[odId] > NOTIFY_MAX_AGE_MS) {
                    delete this.chatRequestNotified[odId];
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            console.log(`[${this.id}] 🧹 Очищено ${cleaned} старых записей из памяти`);
        }
    }

    // Проверить, является ли это последним сообщением (для rotationHours в chat режиме)
    isLastMessageInRotation() {
        if (globalMode !== 'chat') return false;

        const { rotationHours, currentInviteIndex, rotationStartTime } = this.chatSettings;
        if (!rotationStartTime) return false;

        const elapsedMs = Date.now() - rotationStartTime;
        const rotationMs = rotationHours * 60 * 60 * 1000;

        // Если прошло время ротации, это может быть последнее сообщение
        return elapsedMs >= rotationMs;
    }

    // === ВАЖНОЕ ДОБАВЛЕНИЕ: Метод для создания скрытого WebView ===
    createWebview() {
        // ВАЖНО: WebView работает БЕЗ прокси (прямое соединение)
        // Причина: Decodo HTTP прокси не поддерживает CONNECT туннели с аутентификацией через Electron
        // API запросы идут через прокси (HttpsProxyAgent), а WebView только для поддержания сессии
        console.log(`[WebView] 🔧 Создание WebView для ${this.id} (без прокси)...`);

        const webview = document.createElement('webview');
        webview.id = `webview-${this.id}`;
        // Используем отдельную сессию БЕЗ прокси для каждого WebView
        // Название отличается от bot partition чтобы прокси не применялся
        webview.partition = `persist:wv_${this.id}`;
        webview.useragent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        webview.src = "https://ladadate.com/login";

        console.log(`[WebView] 📦 Partition: persist:wv_${this.id} (без прокси), src: ${webview.src}`);

        // Функция для отключения звука и внедрения скрипта блокировки Audio
        const muteWebview = () => {
            if (webview.setAudioMuted) {
                webview.setAudioMuted(true);
                console.log(`[WebView ${this.id}] 🔇 Звук отключен`);
            }
            // Дополнительно: блокируем Audio API внутри страницы
            webview.executeJavaScript(`
                // Блокируем воспроизведение звука на странице
                if (!window.__audioMuted) {
                    window.__audioMuted = true;
                    const originalPlay = Audio.prototype.play;
                    Audio.prototype.play = function() {
                        console.log('[Lababot] Audio.play() заблокирован');
                        return Promise.resolve();
                    };
                    // Блокируем HTMLMediaElement (video/audio теги)
                    const origMediaPlay = HTMLMediaElement.prototype.play;
                    HTMLMediaElement.prototype.play = function() {
                        console.log('[Lababot] MediaElement.play() заблокирован');
                        return Promise.resolve();
                    };
                    console.log('[Lababot] 🔇 Audio API заблокирован');
                }
            `).catch(() => {});
        };

        // Отключаем звук при каждой загрузке страницы
        webview.addEventListener('did-finish-load', muteWebview);

        // DEBUG: Отслеживаем ошибки загрузки WebView
        webview.addEventListener('did-fail-load', (event) => {
            console.error(`[WebView ${this.id}] ❌ did-fail-load:`, {
                errorCode: event.errorCode,
                errorDescription: event.errorDescription,
                validatedURL: event.validatedURL
            });
        });

        webview.addEventListener('did-start-loading', () => {
            console.log(`[WebView ${this.id}] 🔄 did-start-loading...`);
        });

        webview.addEventListener('did-stop-loading', () => {
            console.log(`[WebView ${this.id}] ⏹️ did-stop-loading`);
        });

        webview.addEventListener('console-message', (e) => {
            if (e.level >= 2) { // warnings and errors only
                console.log(`[WebView ${this.id} console] ${e.message}`);
            }
        });

        // Отслеживаем навигацию - устанавливаем webviewReady только когда ушли со страницы логина
        webview.addEventListener('did-navigate', (e) => {
            const url = e.url;
            console.log(`[WebView ${this.id}] 🔀 did-navigate: ${url}`);

            // Если ушли со страницы логина - WebView авторизован
            if (!url.includes('/login') && !url.includes('/sign-in')) {
                if (!this.webviewReady) {
                    this.webviewReady = true;
                    console.log(`[WebView ${this.id}] ✅ WebView АВТОРИЗОВАН (ушли с login)`);

                    // ОПТИМИЗАЦИЯ: Переходим на лёгкую страницу для экономии памяти
                    // Не переходим если это уже ignore-list или compose (отправка фото)
                    if (!url.includes('/ignore-list') && !url.includes('/message-compose')) {
                        setTimeout(() => {
                            console.log(`[WebView ${this.id}] 🔄 Переход на /ignore-list для экономии памяти`);
                            webview.src = 'https://ladadate.com/ignore-list';
                        }, 1000);
                    }
                }
            } else {
                // Вернулись на login - сбрасываем флаг
                if (this.webviewReady) {
                    console.log(`[WebView ${this.id}] ⚠️ Сессия истекла (вернулись на login)`);
                    this.webviewReady = false;
                }
            }
        });

        // Fallback: если за 20 секунд не авторизовались, логируем предупреждение
        setTimeout(() => {
            if (!this.webviewReady) {
                console.warn(`[WebView ${this.id}] ⚠️ WebView не авторизовался за 20 секунд`);
            }
        }, 20000);

        webview.addEventListener('dom-ready', () => {
            // НЕ устанавливаем webviewReady здесь - ждём завершения авторизации
            console.log(`[WebView ${this.id}] 📄 dom-ready (ожидаем авторизацию)`);

            // 0. Отключаем звук в WebView (чтобы не дублировался со звуком бота)
            muteWebview();

            // 1. Внедрение скрипта "Анти-сон" (Keep-Alive)
            webview.executeJavaScript(KEEP_ALIVE_SCRIPT);
            
            // 2. Скрипт авто-входа (если токен есть, все равно создаем сессию)
            // БЕЗОПАСНОСТЬ: Экранируем логин и пароль для предотвращения XSS
            const safeLogin = JSON.stringify(this.login).slice(1, -1); // убираем кавычки JSON
            const safePass = JSON.stringify(this.pass).slice(1, -1);

            const script = `
                setTimeout(() => {
                    const emailInput = document.querySelector('input[name="login"]');
                    const passInput = document.querySelector('input[name="password"]');
                    const btn = document.querySelector('button[type="submit"]');

                    if(emailInput && passInput) {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

                        nativeInputValueSetter.call(emailInput, "${safeLogin}");
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                        emailInput.dispatchEvent(new Event('change', { bubbles: true }));

                        nativeInputValueSetter.call(passInput, "${safePass}");
                        passInput.dispatchEvent(new Event('input', { bubbles: true }));
                        passInput.dispatchEvent(new Event('change', { bubbles: true }));

                        console.log("Bot: Данные введены. Попытка нажать войти...");
                        if(btn) setTimeout(() => btn.click(), 500);
                    }
                }, 2000);
            `;
            webview.executeJavaScript(script);
        });

        // ВАЖНО: Добавляем webview в скрытый контейнер
        document.getElementById('browsers-container').appendChild(webview);
        this.webview = webview;
        console.log(`[WebView] ✅ WebView добавлен в DOM и начал загрузку`);

        // ОПТИМИЗАЦИЯ: Блокируем загрузку изображений для экономии RAM
        ipcRenderer.invoke('optimize-webview-session', { botId: this.id })
            .then(result => {
                if (result.success) {
                    console.log(`[WebView ${this.id}] 🎯 Оптимизация RAM включена`);
                }
            })
            .catch(err => console.warn(`[WebView ${this.id}] Оптимизация не удалась:`, err.message));

        // DEBUG: Проверяем IP через WebView через 10 секунд после загрузки
        setTimeout(async () => {
            if (!this.webviewReady) {
                console.log(`[WebView ${this.id}] ⚠️ WebView ещё не готов для проверки IP`);
                return;
            }
            try {
                const ip = await webview.executeJavaScript(`
                    (async () => {
                        try {
                            const res = await fetch('https://api.ipify.org?format=json');
                            const data = await res.json();
                            return data.ip;
                        } catch(e) {
                            return 'error: ' + e.message;
                        }
                    })()
                `);
                console.log(`[WebView ${this.id}] 🌐 IP через WebView: ${ip}`);
            } catch(e) {
                console.log(`[WebView ${this.id}] ⚠️ Не удалось проверить IP: ${e.message}`);
            }
        }, 10000);
    }

    // Heartbeat на сервер Lababot
    // DEPRECATED: Теперь используется batch sync (один запрос для всех анкет)
    // См. api.js -> syncAllBotsWithServer()
    startLababotHeartbeat() {
        // Индивидуальные heartbeat отключены - используется batch sync
        // который запускается глобально в init.js -> startBatchSync()
        console.log(`📡 Анкета ${this.displayId} добавлена в batch sync`);

        // Очищаем старый таймер если был
        if (this.lababotHeartbeatTimer) {
            clearInterval(this.lababotHeartbeatTimer);
            this.lababotHeartbeatTimer = null;
        }
    }

    log(text, type = null) {
        const box = document.getElementById(`log-${this.id}`);
        let modePrefix;
        if (type) {
            modePrefix = `[${type.toUpperCase()}]`;
        } else {
            // Авто-определение типа по содержимому сообщения
            // Это критично для корректного отображения при параллельной работе Mail и Chat
            const textLower = text.toLowerCase();
            if (textLower.includes('чат') || textLower.includes('chat') || text.includes('💬')) {
                modePrefix = '[CHAT]';
            } else if (textLower.includes('письм') || textLower.includes('mail') || text.includes('📧') || text.includes('📬')) {
                modePrefix = '[MAIL]';
            } else {
                // Для нейтральных сообщений - показываем текущий глобальный режим
                modePrefix = globalMode === 'chat' ? '[CHAT]' : '[MAIL]';
            }
        }
        if(box) box.innerHTML = `<div class="log-entry"><span style="opacity:0.6">${new Date().toLocaleTimeString()}</span> <b>${modePrefix}</b> ${text}</div>` + box.innerHTML;
    }

    // Добавление записи в history с лимитом (предотвращение утечки памяти)
    addToHistory(mode, category, value) {
        const HISTORY_MAX_SIZE = 500;
        const history = mode === 'mail' ? this.mailHistory : this.chatHistory;

        if (history[category]) {
            history[category].push(value);
            // Удаляем старые записи если превышен лимит
            if (history[category].length > HISTORY_MAX_SIZE) {
                history[category] = history[category].slice(-HISTORY_MAX_SIZE);
            }
        }
    }

    startMonitoring() {
        this.isMonitoring = true;
        this.checkChatSync(); 
        this.checkNewMails(); 
        this.checkVipStatus(); 
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        // Останавливаем все таймеры
        if (this.lababotHeartbeatTimer) {
            clearInterval(this.lababotHeartbeatTimer);
            this.lababotHeartbeatTimer = null;
        }
        // Отправляем последний heartbeat оффлайн (без обработки команд)
        sendHeartbeatToLababot(this.id, this.displayId, 'offline', true);
    }

    async checkVipStatus() {
        if (!this.token || !this.isMonitoring) return;
        
        const vipsToCheck = this.vipList;
        
        for (const vipId of vipsToCheck) {
            try {
                const res = await makeApiRequest(this, 'GET', `/api/messages/check-send/${vipId}`);
                const isOnline = !!res.data.CheckId;
                
                const oldStatus = this.vipStatus[vipId] || 'offline'; 
                const status = isOnline ? 'online' : 'offline';
                let userName = `ID ${vipId}`;
                
                if (status === 'online' && oldStatus !== 'online') {
                    Logger.add(`👑 VIP Клиент ID ${vipId} теперь ONLINE!`, 'vip-online', this.id, { partnerId: vipId, partnerName: userName });
                }
                this.vipStatus[vipId] = status;
            } catch(e) { 
                this.vipStatus[vipId] = 'offline';
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        
        const nextRun = Math.floor(Math.random() * (75000 - 45000 + 1)) + 45000;
        if (this.isMonitoring) setTimeout(() => this.checkVipStatus(), nextRun);
    }

    async getProfileData() {
        try {
            const res = await makeApiRequest(this, 'GET', '/my-profile-preview');
            const html = res.data;
            const regex = /Birthday<\/div>[\s\S]*?<div[^>]*>\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})\s*<\/div>/i;
            const match = html.match(regex);
            if(match && match[1]) {
                this.myBirthday = match[1];
                this.checkBirthdayComing();
            }
        } catch(e) { console.error(`[Bot ${this.displayId}] getProfileData error:`, e.message); }
    }
    
    checkBirthdayComing() {
        if(!this.myBirthday) return;
        const bDate = new Date(this.myBirthday);
        const today = new Date();
        const bDayThisYear = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
        const diff = (bDayThisYear - today) / (1000 * 60 * 60 * 24);
        if (diff > 0 && diff <= 3) Logger.add(`День рождения через ${Math.ceil(diff)}д!`, 'bday', this.id);
    }

    async checkChatSync() {
        if (!this.token || !this.isMonitoring) {
            return;
        }
        try {
            // Используем WebView для запроса (там есть session cookies)
            let data = null;

            // ВАЖНО: Проверяем что WebView существует И готов (dom-ready сработал)
            if (this.webview && this.webviewReady) {
                try {
                    const result = await this.webview.executeJavaScript(`
                        (async () => {
                            try {
                                const res = await fetch('https://ladadate.com/chat-sync', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({}),
                                    credentials: 'include'
                                });
                                const text = await res.text();
                                try {
                                    return { success: true, data: JSON.parse(text) };
                                } catch {
                                    return { success: false, error: 'Not JSON', html: text.substring(0, 200) };
                                }
                            } catch (e) {
                                return { success: false, error: e.message };
                            }
                        })()
                    `);

                    if (result.success) {
                        data = result.data;
                        console.log(`[Lababot] ✅ chat-sync через WebView: OK`);
                    } else {
                        console.log(`[Lababot] ❌ chat-sync через WebView:`, result.error, result.html || '');
                    }
                } catch (e) {
                    console.log(`[Lababot] ⚠️ WebView executeJavaScript error:`, e.message);
                }
            }

            // Fallback на axios если webview не работает
            if (!data) {
                const res = await makeApiRequest(this, 'POST', '/chat-sync', {});
                if (typeof res?.data === 'object') {
                    data = res.data;
                }
            }

            if (!data) return;

            const currentSessions = data.ChatSessions || [];
            const chatRequests = data.ChatRequests || [];
            const now = Date.now();
            const NOTIFY_COOLDOWN = 30000; // 30 секунд между уведомлениями для одной сессии
            const ACTIVE_CHAT_SOUND_INTERVAL = 15000; // 15 секунд - повторный звук для активного чата

            // DEBUG: Логируем всегда
            console.log(`[Lababot] 📡 checkChatSync: ${currentSessions.length} сессий, ${chatRequests.length} запросов`);
            if (currentSessions.length > 0) {
                currentSessions.forEach(s => {
                    console.log(`  [SESSION] ${s.Name} (${s.AccountId}): IsMessage=${s.IsMessage}`);
                });
            }
            if (chatRequests.length > 0) {
                chatRequests.forEach(r => {
                    console.log(`  [REQUEST] ${r.Name} (${r.AccountId}): IsRead=${r.IsRead}, MsgId=${r.MessageId}`);
                });
            }

            // Инициализируем объекты для хранения времени уведомлений
            if (!this.chatNotifyTimes) this.chatNotifyTimes = {};
            if (!this.chatRequestNotified) this.chatRequestNotified = {}; // Для отслеживания уведомлённых ChatRequests
            if (!this.activeChatSoundTimes) this.activeChatSoundTimes = {}; // Для повторного звука активных чатов

            // === Флаг первого sync - добавляем в ЧС, но без уведомлений ===
            const isFirstSync = !this.firstChatSyncDone;
            if (isFirstSync) {
                this.firstChatSyncDone = true;
                console.log(`[Lababot] 📋 Первый sync: обрабатываем ${chatRequests.length} запросов (добавим в ЧС, без уведомлений)`);
            }

            // Set для отслеживания partnerId, уведомлённых в этом цикле через ChatRequests
            const notifiedPartnersThisCycle = new Set();

            // === ОБРАБОТКА ChatRequests (новые запросы на чат) ===
            for (const request of chatRequests) {
                const requestId = request.MessageId;
                const partnerId = request.AccountId || "Unknown";
                const partnerName = request.Name || "Неизвестный";
                const messageBody = request.Body || "";
                const isRead = request.IsRead;

                // Пропускаем уже обработанные
                if (this.chatRequestNotified[requestId]) continue;

                // Помечаем как обработанный
                this.chatRequestNotified[requestId] = now;

                // === ВСЕГДА ДОБАВЛЯЕМ В ЧС ЧАТА (с лимитом) ===
                const partnerIdStr = partnerId.toString();
                if (!this.chatSettings.blacklist.includes(partnerIdStr)) {
                    // Проверяем лимит blacklist
                    if (this.chatSettings.blacklist.length >= BLACKLIST_MAX_SIZE) {
                        // Удаляем старые записи (первые 100)
                        this.chatSettings.blacklist.splice(0, 100);
                        console.log(`[Lababot] ⚠️ Blacklist Chat достиг лимита ${BLACKLIST_MAX_SIZE}, удалены старые записи`);
                    }
                    this.chatSettings.blacklist.push(partnerIdStr);
                    saveBlacklistToServer(this.displayId, 'chat', this.chatSettings.blacklist);
                    console.log(`[Lababot] ✅ ${partnerName} (${partnerId}) добавлен в ЧС чата${isFirstSync ? ' (первый sync)' : ''}`);

                    // Обновляем UI blacklist если эта вкладка активна и режим Chat
                    if (activeTabId === this.id && globalMode === 'chat') {
                        renderBlacklist(this.id);
                    }
                }

                // При первом sync - только добавляем в ЧС, без уведомлений и автоответов
                if (isFirstSync) continue;

                // === Дальше только для НОВЫХ запросов (не первый sync) ===
                if (!isRead) {
                    notifiedPartnersThisCycle.add(partnerId);

                    // Обрезаем текст сообщения до 50 символов
                    const truncatedBody = messageBody.length > 50
                        ? messageBody.substring(0, 50) + '...'
                        : messageBody;

                    // Отправляем на сервер статистики
                    sendIncomingMessageToLababot({
                        botId: this.id,
                        profileId: this.displayId,
                        manId: partnerId,
                        manName: partnerName,
                        messageId: requestId,
                        type: 'chat',
                        messageText: truncatedBody
                    });

                    // === ТРИГГЕР АВТООТВЕТА ===
                    // Запускаем цепочку автоответов если включено
                    this.scheduleAutoReply(partnerId, partnerName);

                    // Получаем аватарку мужчины (разные возможные поля)
                    const avatarUrl = request.Avatar || request.Photo ||
                        `https://ladadate.com/photo/${partnerId}/1.jpg`;

                    // Уведомление в логгер + звук
                    console.log(`[Lababot] 🆕 НОВЫЙ ЧАТ! От ${partnerName} (${partnerId}): "${truncatedBody}"`);
                    Logger.add(
                        `🆕 Новый чат от <b>${partnerName}</b>: "${truncatedBody}"`,
                        'chat-request',
                        this.id,
                        { partnerId, partnerName, messageBody: truncatedBody, avatarUrl: avatarUrl }
                    );
                }
            }

            // Очищаем старые записи chatRequestNotified (старше 5 минут)
            for (const msgId in this.chatRequestNotified) {
                if (now - this.chatRequestNotified[msgId] > 300000) {
                    delete this.chatRequestNotified[msgId];
                }
            }

            // === ОБРАБОТКА ChatSessions (активные чаты) ===
            for (const session of currentSessions) {
                // Используем AccountId как идентификатор сессии (API LadaDate)
                const sessionId = session.AccountId || session.Id || session.ChatId;
                // IsMessage = true означает есть непрочитанное сообщение
                const hasUnread = session.IsMessage === true || (session.UnreadMessageCount || 0) > 0;
                const partnerId = session.AccountId || session.TargetUserId || session.PartnerId || "Unknown";
                const partnerName = session.Name || "Неизвестный";
                const chatMinutes = session.ChatMinutes || 0;

                // Пропускаем если уже уведомили через ChatRequests в этом цикле
                if (notifiedPartnersThisCycle.has(partnerId)) {
                    continue;
                }

                if (hasUnread && sessionId) {
                    const lastNotify = this.chatNotifyTimes[sessionId] || 0;
                    const lastSound = this.activeChatSoundTimes[sessionId] || 0;

                    // Первое уведомление (полное - в логгер)
                    if (now - lastNotify >= NOTIFY_COOLDOWN) {
                        this.chatNotifyTimes[sessionId] = now;
                        this.activeChatSoundTimes[sessionId] = now;

                        // Отправляем входящее сообщение чата на сервер статистики
                        sendIncomingMessageToLababot({
                            botId: this.id,
                            profileId: this.displayId,
                            manId: partnerId,
                            manName: partnerName,
                            messageId: `chat_${sessionId}_${now}`,
                            type: 'chat'
                        });

                        // Уведомление в логгер + звук
                        console.log(`[Lababot] 💬 УВЕДОМЛЕНИЕ! Сообщение от ${partnerName} (${partnerId}), мин: ${chatMinutes}`);
                        Logger.add(
                            `💬 Сообщение в чате с <b>${partnerName}</b> (${chatMinutes} мин)`,
                            'chat',
                            this.id,
                            { partnerId, partnerName }
                        );
                    }
                    // Повторный звук для активного чата (без записи в логгер)
                    else if (now - lastSound >= ACTIVE_CHAT_SOUND_INTERVAL) {
                        this.activeChatSoundTimes[sessionId] = now;
                        console.log(`[Lababot] 🔔 Повторный звук! Активный чат с ${partnerName}, ждёт ответа`);
                        playSound('chat');
                    }
                } else if (!hasUnread && sessionId) {
                    // Если нет непрочитанных - сбрасываем таймеры для этой сессии
                    delete this.chatNotifyTimes[sessionId];
                    delete this.activeChatSoundTimes[sessionId];
                }
            }
        } catch(e) {
            console.error('[Lababot] checkChatSync error:', e);
        }
        finally {
             const nextRun = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
             if(this.isMonitoring) setTimeout(() => this.checkChatSync(), nextRun);
        }
    }

    async checkNewMails() {
        if (!this.token || !this.isMonitoring) return;
        const isFirstCheck = this.isFirstMailCheck;
        this.isFirstMailCheck = false; // Сбрасываем флаг

        try {
            // Получаем письма за последние 6 дней (для уведомлений)
            const sixDaysAgo = new Date();
            sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
            const startDate = sixDaysAgo.toISOString().split('.')[0]; // формат: 2025-01-01T00:00:00

            const res = await makeApiRequest(this, 'GET', `/api/messages?startDate=${startDate}`);
            const msgs = res.data.Messages || [];

            if (msgs.length > 0) {
                // === СНАЧАЛА: Добавляем в ЧС ВСЕХ отправителей за последние 2 дня (сегодня + вчера) ===
                const twoDaysAgo = new Date();
                twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                twoDaysAgo.setHours(0, 0, 0, 0); // Начало позавчерашнего дня

                const recentMsgs = msgs.filter(m => new Date(m.DatePost) >= twoDaysAgo);
                let blacklistUpdated = false;

                recentMsgs.forEach(msg => {
                    const partnerId = msg.User.AccountId;
                    const partnerIdStr = partnerId.toString();
                    if (!this.mailSettings.blacklist.includes(partnerIdStr)) {
                        if (this.mailSettings.blacklist.length >= BLACKLIST_MAX_SIZE) {
                            this.mailSettings.blacklist.splice(0, 100);
                            console.log(`[Lababot] ⚠️ Blacklist Mail достиг лимита ${BLACKLIST_MAX_SIZE}, удалены старые записи`);
                        }
                        this.mailSettings.blacklist.push(partnerIdStr);
                        blacklistUpdated = true;
                        const partnerName = msg.User.Name || `ID ${partnerId}`;
                        console.log(`[Lababot] ✅ ${partnerName} (${partnerId}) добавлен в ЧС писем (за 2 дня)`);
                    }
                });

                // Сохраняем ЧС один раз если были изменения
                if (blacklistUpdated) {
                    saveBlacklistToServer(this.displayId, 'mail', this.mailSettings.blacklist);
                    if (activeTabId === this.id && globalMode === 'mail') {
                        renderBlacklist(this.id);
                    }
                }

                // === ПРОВЕРКА ОТВЕТОВ ЧЕРЕЗ САЙТ ===
                // Если письмо отвечено (IsReplied=true) и у нас есть время входящего —
                // значит переводчик ответил через сайт, а не через бота
                msgs.forEach(msg => {
                    const manIdStr = msg.User.AccountId.toString();

                    if (msg.IsReplied && this.incomingTimes[manIdStr]) {
                        // Вычисляем время ответа (приблизительно, погрешность до 35 сек)
                        const incomingTime = this.incomingTimes[manIdStr];
                        const responseTimeMs = Date.now() - incomingTime;
                        const responseMinutes = Math.round(responseTimeMs / 60000);

                        console.log(`[Lababot] 🌐 Обнаружен ответ через САЙТ: ${msg.User.Name} — время ответа ~${responseMinutes} мин`);

                        // Отправляем статистику на сервер
                        sendMessageToLababot({
                            botId: this.id,
                            accountDisplayId: this.displayId,
                            recipientId: msg.User.AccountId,
                            type: 'outgoing',
                            textContent: '[Ответ через сайт]',
                            status: 'success',
                            responseTime: millisecondsToInterval(responseTimeMs),
                            isFirst: false,
                            isLast: false,
                            convId: null,
                            mediaUrl: null,
                            fileName: null,
                            translatorId: this.translatorId,
                            errorReason: null,
                            usedAi: false,
                            isReply: true
                        });

                        // Очищаем — ответ учтён
                        delete this.incomingTimes[manIdStr];
                    }
                });

                // === ЗАТЕМ: Уведомления для неотвеченных ===
                const newMessages = isFirstCheck
                    ? msgs.filter(m => !m.IsReplied) // Первый запуск: только неотвеченные
                    : msgs.filter(m => m.MessageId > this.lastMailId); // Потом: только новые

                newMessages.reverse().forEach(msg => {
                    const partnerId = msg.User.AccountId;
                    const partnerName = msg.User.Name || `ID ${partnerId}`;

                    // Отправляем входящее сообщение на сервер статистики
                    const mailText = msg.Text || msg.Body || msg.Preview || null;
                    sendIncomingMessageToLababot({
                        botId: this.id,
                        profileId: this.displayId,
                        manId: partnerId,
                        manName: partnerName,
                        messageId: msg.MessageId,
                        type: 'letter',
                        messageText: mailText
                    });

                    // === Сохраняем время ПЕРВОГО неотвеченного письма для расчёта responseTime ===
                    // Если уже есть запись — не обновляем (считаем от первого письма)
                    const partnerIdStr = partnerId.toString();
                    if (!this.incomingTimes[partnerIdStr]) {
                        // Используем DatePost из API если есть, иначе текущее время
                        this.incomingTimes[partnerIdStr] = msg.DatePost
                            ? new Date(msg.DatePost).getTime()
                            : Date.now();
                        console.log(`[Lababot] ⏱️ Записано время входящего от ${partnerName}: ${new Date(this.incomingTimes[partnerIdStr]).toLocaleTimeString()}`);
                    }

                    // Уведомление для неотвеченных писем
                    const avatarUrl = msg.User.Avatar || msg.User.Photo ||
                        (msg.User.Photos && msg.User.Photos[0]) ||
                        `https://ladadate.com/photo/${partnerId}/1.jpg`;

                    // При первом запуске добавляем в Logger БЕЗ звука (звук один раз в конце)
                    if (isFirstCheck) {
                        // Добавляем запись напрямую без Logger.add чтобы избежать дедупликации
                        const logItem = {
                            id: Date.now() + newMessages.indexOf(msg),
                            text: `💌 Входящее письмо от <b>${partnerName}</b> (Ждет ответа)`,
                            type: 'mail',
                            botId: this.id,
                            data: { partnerId, partnerName, messageId: msg.MessageId, avatarUrl },
                            time: new Date()
                        };
                        Logger.logs.unshift(logItem);
                    } else {
                        // Обычный режим - через Logger.add
                        Logger.add(
                            `💌 Входящее письмо от <b>${partnerName}</b> (Ждет ответа)`,
                            'mail',
                            this.id,
                            { partnerId, partnerName, messageId: msg.MessageId, avatarUrl }
                        );
                    }
                });

                // При первом запуске: рендерим логгер БЕЗ звука (звук только для новых во время работы)
                if (isFirstCheck && newMessages.length > 0) {
                    Logger.render(); // Отрисовываем добавленные записи
                    // Звук НЕ воспроизводим при первом входе

                    console.log(`[Bot ${this.displayId}] 📬 При входе найдено ${newMessages.length} неотвеченных писем (без звука)`);

                    // Мигание кнопки логгера
                    const col = document.getElementById('logger-column');
                    if (!col.classList.contains('show')) {
                        document.getElementById('btn-logger-main').classList.add('blinking');
                    }
                }

                // Обновляем lastMailId на МАКСИМАЛЬНЫЙ ID из всех писем
                const maxMessageId = Math.max(...msgs.map(m => m.MessageId));
                if (maxMessageId > this.lastMailId) {
                    this.lastMailId = maxMessageId;
                }
            }
        } catch(e) { console.error(`[Bot ${this.displayId}] checkNewMails error:`, e.message); }
        finally {
            // Интервал 20-35 сек (безопасно для 50+ анкет)
            const nextRun = Math.floor(Math.random() * (35000 - 20000 + 1)) + 20000;
            if(this.isMonitoring) setTimeout(() => this.checkNewMails(), nextRun);
        }
    }

    startKeepAlive() {
        this.doActivity();
        if(this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => { this.doActivity(); }, 60000);
    }

    async doActivity() {
        if(!this.token) return;
        try {
            await makeApiRequest(this, 'POST', '/chat-sync', {});
            const res = await makeApiRequest(this, 'GET', '/api/users/online');
            if(res.data.Users) {
                // Сохраняем для глобального счётчика
                this.lastOnlineCount = res.data.Users.length;
            }

            // Очистка памяти: раз в час чистим старые диалоги
            if (!this.lastCleanupTime || Date.now() - this.lastCleanupTime > 60 * 60 * 1000) {
                this.cleanupConversations();
                this.lastCleanupTime = Date.now();
            }
        } catch (e) { /* Тихая ошибка - doActivity вызывается часто, не спамим в консоль */ }
    }

    async startMail(text) {
        if(!this.token) return;

        // КРИТИЧНО: Защита от запуска Mail в режиме Chat
        if (globalMode === 'chat') {
            console.error(`[SECURITY] Попытка запустить Mail в режиме Chat! Заблокировано.`);
            this.log(`⛔ Ошибка: нельзя запустить письма в режиме чата`);
            return;
        }

        // Проверяем статус бот-машины (управляется с сервера)
        if (!controlStatus.botEnabled) {
            this.log(`🔴 Запуск заблокирован - бот отключен администратором`);
            return;
        }

        // Проверяем разрешение рассылки для этой анкеты (управляется с сервера)
        if (!this.mailingEnabled) {
            this.log(`⛔ Запуск заблокирован - рассылка отключена администратором`);
            return;
        }

        // Проверяем статус профиля на сервере
        const profileStatus = await checkProfileStatus(this.displayId);

        // Проверяем, есть ли анкета в системе
        if (!profileStatus.allowed || !profileStatus.exists) {
            this.log(`⛔ Анкета не найдена в системе личного кабинета`);
            alert(`Анкета ${this.displayId} не добавлена в личный кабинет. Добавьте её в систему для работы.`);
            return;
        }

        // Проверяем, приостановлена ли анкета
        if (profileStatus.paused) {
            this.log(`⛔ Рассылка заблокирована - анкета приостановлена в личном кабинете`);
            alert(`Анкета ${this.displayId} приостановлена в личном кабинете. Рассылка невозможна.`);
            return;
        }

        // Проверяем оплату анкеты
        const paymentStatus = await checkProfilePaymentStatus(this.displayId);

        // Если ошибка сервера - блокируем с понятным сообщением
        if (paymentStatus.serverError) {
            this.log(`⛔ Рассылка заблокирована - не удалось проверить оплату`);
            alert(`Не удалось проверить статус оплаты анкеты.\n\nПроверьте подключение к интернету и попробуйте снова.`);
            return;
        }

        if (!paymentStatus.isPaid && !paymentStatus.isFree) {
            this.log(`⛔ Рассылка заблокирована - анкета не оплачена`);

            // Показываем диалог с возможностью активации trial
            const dialogResult = await showPaymentDialog(this.displayId, paymentStatus.canTrial);

            if (dialogResult.action === 'trial_activated') {
                // Trial активирован - запускаем рассылку
                this.log(`✅ Trial активирован, запускаем рассылку`);
            } else {
                // Отмена или ошибка
                return;
            }
        }

        this.isMailRunning = true;
        this.mailStartTime = Date.now();
        this.initStatusTracking(); // Инициализируем отслеживание статуса
        this.startMailTimer();
        this.updateUI();
        this.log(`🚀 MAIL Started (v${APP_VERSION})`);
        this.scheduleNextMail(text, 0);
    }

    stopMail() {
        this.isMailRunning = false;
        this.isMailWaiting = false;
        clearTimeout(this.mailTimeout);
        this.stopMailTimer();
        this.log("⏹ MAIL Stopped");
        this.updateUI();
    }

    startMailTimer() {
        if (this.mailTimerInterval) clearInterval(this.mailTimerInterval);
        this.mailTimerInterval = setInterval(() => this.updateUI(), 1000);
    }

    stopMailTimer() {
        if (this.mailTimerInterval) {
            clearInterval(this.mailTimerInterval);
            this.mailTimerInterval = null;
        }
        this.mailStartTime = null;
    }

    scheduleNextMail(text, delay) {
        if (!this.isMailRunning) return;
        this.mailTimeout = setTimeout(async () => {
            if (!this.isMailRunning) return;
            await this.processMailUser(text);

            // Проверяем условия автоочистки ошибок
            if (checkAutoClearConditions(this, 'mail')) {
                performAutoClear('mail');
            }

            // Проверяем условия автоочистки отправленных
            if (checkAutoClearSentConditions(this, 'mail')) {
                performAutoClearSent('mail');
            }

            // Определяем задержку
            let nextDelay;
            if (this.mailSettings.speed === 'smart') {
                nextDelay = Math.floor(Math.random() * (120000 - 15000 + 1)) + 15000;
            } else {
                nextDelay = parseInt(this.mailSettings.speed) * 1000;
            }

            this.mailStats.waiting = Math.floor(300000 / nextDelay);
            this.updateUI();
            this.scheduleNextMail(text, nextDelay);
        }, delay);
    }

    // === Получение количества пользователей в статусе (для логирования) ===
    async getStatusUserCount(status) {
        try {
            if (status === 'shared-online') {
                return SharedPool.size;
            }

            if (status === 'online') {
                const res = await makeApiRequest(this, 'GET', '/api/users/online');
                return (res.data.Users || []).length;
            }

            if (status === 'inbox') {
                const res = await makeApiRequest(this, 'GET', '/api/messages?startDate=2020-01-01T00:00:00');
                const msgs = res.data.Messages || [];
                // Фильтруем уникальных пользователей
                const uniqueIds = new Set(msgs.map(m => m.User.AccountId));
                return uniqueIds.size;
            }

            if (status === 'custom-ids') {
                const remaining = (this.mailSettings.customIds || []).filter(id =>
                    !this.mailSettings.sentCustomIds?.includes(id)
                );
                return remaining.length;
            }

            // Для остальных статусов (payers, favorites, my-favorites)
            const apiPath = `/api/users/${status}`;
            const res = await makeApiRequest(this, 'GET', apiPath);
            return (res.data.Users || []).length;
        } catch (e) {
            console.warn(`[getStatusUserCount] Ошибка для ${status}:`, e.message);
            return '?';
        }
    }

    // === Инициализация отслеживания статуса (вызывается при старте и переключении) ===
    initStatusTracking() {
        this.statusStartTime = Date.now();
        this.statusStartSent = this.mailStats.sent;
        this.statusStartErrors = this.mailStats.errors;
    }

    // === Получение статистики по текущему статусу ===
    getStatusStats() {
        const sentOnStatus = this.mailStats.sent - this.statusStartSent;
        const errorsOnStatus = this.mailStats.errors - this.statusStartErrors;

        let timeOnStatus = '';
        if (this.statusStartTime) {
            const elapsed = Math.floor((Date.now() - this.statusStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            timeOnStatus = mins > 0 ? `${mins}м ${secs}с` : `${secs}с`;
        }

        return { sentOnStatus, errorsOnStatus, timeOnStatus };
    }

    async processMailUser(msgTemplate) {
        let user = null;
        let msgBody = '';
        let fromHotQueue = false; // Флаг: взят из горячей очереди
        this.isMailWaiting = true; // По умолчанию ждём пока не найдём пользователя
        this.updateUI();
        try {
            const target = this.mailSettings.target;
            let users = [];

            // ============ ONLINE SMART: Приоритет горячей очереди ============
            if (target === 'online-smart') {
                // Сначала пробуем взять из горячей очереди
                const hotUser = getFromHotQueue(this.id, this);
                if (hotUser) {
                    this.log(`🔥 Из горячей очереди: ${hotUser.name} (${hotUser.manId})`);
                    users.push({
                        AccountId: hotUser.manId,
                        Name: hotUser.name,
                        City: '',
                        Age: '',
                        Country: ''
                    });
                    fromHotQueue = true;
                } else {
                    // Горячая очередь пуста - берём из обычного online
                    const usersRes = await makeApiRequest(this, 'GET', '/api/users/online');
                    users = usersRes.data.Users || [];
                    this.lastOnlineCount = users.length;
                    console.log(`[Mail online-smart] API вернул ${users.length} пользователей (горячая очередь пуста)`);
                }
            } else if (target === 'custom-ids') {
                // Рассылка по конкретным ID из списка
                const nextId = getNextCustomId(this.id);
                if (nextId) {
                    this.log(`📋 Custom ID: отправка на ID ${nextId}`);
                    users.push({
                        AccountId: parseInt(nextId),
                        Name: '',
                        City: '',
                        Age: '',
                        Country: ''
                    });
                } else {
                    this.log(`✅ Custom IDs: все ID из списка обработаны`);
                    if (this.mailSettings.auto) {
                        const newTarget = getNextActiveStatus('payers');

                        // Получаем статистику по custom-ids и количество в новом статусе
                        const statusStats = this.getStatusStats();
                        const newCount = await this.getStatusUserCount(newTarget);

                        const statsInfo = statusStats.sentOnStatus > 0 || statusStats.errorsOnStatus > 0
                            ? ` | custom-ids: ✉️${statusStats.sentOnStatus} ❌${statusStats.errorsOnStatus} (${statusStats.timeOnStatus})`
                            : '';
                        this.log(`🔄 Авто → ${newTarget.toUpperCase()} (${newCount} чел.)${statsInfo}`);

                        this.initStatusTracking();

                        this.mailSettings.target = newTarget;
                        // Списки НЕ очищаем - пользователь сам решает когда очистить
                        if(activeTabId === this.id) {
                            document.getElementById(`target-select-${this.id}`).value = newTarget;
                            toggleCustomIdsField(this.id);
                        }
                        return this.processMailUser(msgTemplate);
                    } else {
                        this.log(`⏹️ Рассылка остановлена (все Custom IDs обработаны)`);
                        this.stopMail();
                        return;
                    }
                }
            } else if (target === 'inbox') {
                // Запрашиваем сообщения за весь период (startDate с 2020 года)
                const messagesRes = await makeApiRequest(this, 'GET', '/api/messages?startDate=2020-01-01T00:00:00');
                const allMsgs = messagesRes.data.Messages || [];

                // Диагностика: логируем что вернул API
                console.log(`[Mail inbox] API вернул ${allMsgs.length} сообщений`);

                // Собираем УНИКАЛЬНЫХ отправителей (один человек мог писать несколько раз)
                const uniqueSenders = new Map();
                allMsgs.forEach(msg => {
                    if (!uniqueSenders.has(msg.User.AccountId)) {
                        uniqueSenders.set(msg.User.AccountId, {
                            AccountId: msg.User.AccountId,
                            Name: msg.User.Name,
                            City: msg.User.City,
                            Age: msg.User.Age,
                            Country: msg.User.Country,
                            ProfilePhoto: msg.User.ProfilePhoto,
                            messageToReply: msg.MessageId // Последнее сообщение для ответа
                        });
                    }
                });

                users = Array.from(uniqueSenders.values());
                console.log(`[Mail inbox] Уникальных отправителей: ${users.length}`);
            } else if (target === 'shared-online') {
                // Берём из общего пула SharedPool (собирается со всех анкет)
                users = SharedPool.getAll();
                console.log(`[Mail shared-online] SharedPool содержит ${users.length} пользователей`);
            } else {
                let apiPath = `/api/users/${target}`;
                const usersRes = await makeApiRequest(this, 'GET', apiPath);
                users = usersRes.data.Users || [];

                // Диагностика: логируем что вернул API
                console.log(`[Mail ${target}] API вернул ${users.length} пользователей`);

                if (target === 'online') {
                    this.lastOnlineCount = users.length; // Сохраняем для глобального счётчика
                }
            }

            // Диагностика: сколько до фильтрации
            const beforeFilter = users.length;

            // Фильтруем: убираем тех кто в Отправленных, Ошибках, ЧС или Игноре
            // Используем canSendMailTo() для проверки ВСЕХ списков
            users = users.filter(u =>
                this.canSendMailTo(u.AccountId) &&
                (!this.mailSettings.photoOnly || u.ProfilePhoto)
            );

            // Диагностика: сколько после фильтрации
            console.log(`[Mail ${target}] После фильтрации: ${users.length} из ${beforeFilter}`);

            // Custom IDs: если ID отфильтрован - пропускаем и берём следующий
            if (target === 'custom-ids' && beforeFilter > 0 && users.length === 0) {
                // ID был отфильтрован (уже в errors/sent/blacklist) - помечаем как обработанный
                const skippedId = getNextCustomId(this.id);
                if (skippedId) {
                    markCustomIdSent(this.id, skippedId);
                    console.log(`[Custom IDs] ID ${skippedId} отфильтрован, переходим к следующему`);
                    return this.processMailUser(msgTemplate); // Рекурсивно берём следующий
                }
            }

            // Если новых пользователей нет
            if (users.length === 0) {
                if (target === 'online' || target === 'shared-online' || target === 'online-smart') {
                    // На online/shared-online/online-smart остаёмся ВСЕГДА и ждём новых пользователей
                    this.log(`⏳ Нет онлайн пользователей. Ожидание...`);
                    return;
                } else {
                    // Для других статусов - переключаемся на следующий (если auto)
                    if (this.mailSettings.auto) {
                        const newTarget = getNextActiveStatus(target);

                        // Получаем статистику по текущему статусу
                        const statusStats = this.getStatusStats();
                        const newCount = await this.getStatusUserCount(newTarget);

                        // Формируем информативный лог
                        const statsInfo = statusStats.sentOnStatus > 0 || statusStats.errorsOnStatus > 0
                            ? ` | ${target}: ✉️${statusStats.sentOnStatus} ❌${statusStats.errorsOnStatus} (${statusStats.timeOnStatus})`
                            : '';
                        this.log(`🔄 Авто → ${newTarget.toUpperCase()} (${newCount} чел.)${statsInfo}`);

                        // Сбрасываем отслеживание для нового статуса
                        this.initStatusTracking();

                        this.mailSettings.target = newTarget;
                        // Списки НЕ очищаем - пользователь сам решает когда очистить
                        if(activeTabId === this.id) document.getElementById(`target-select-${this.id}`).value = newTarget;
                        return this.processMailUser(msgTemplate);
                    } else {
                        this.log(`⏳ Нет пользователей для отправки. Ожидание...`);
                        return;
                    }
                }
            }

            user = users[Math.floor(Math.random() * users.length)];
            this.isMailWaiting = false; // Нашли пользователя - активно отправляем
            this.updateUI();

            // Загружаем полный профиль для расширенных макросов
            try {
                const fullProfile = await fetchUserProfile(this, user.AccountId, user.Country);
                if (fullProfile) {
                    user = { ...user, ...fullProfile };
                    console.log(`[Profile] ✅ Данные профиля загружены: Occupation=${user.Occupation}, Marital=${user.MaritalStatus}`);
                }
            } catch (profileErr) {
                console.warn(`⚠️ Не удалось загрузить профиль ${user.AccountId}:`, profileErr.message);
            }

            msgBody = this.replaceMacros(msgTemplate, user);

            // ============ ОТПРАВКА ПИСЬМА ============
            // Если есть фото — используем внутренний API через WebView
            if (this.photoPath) {
                console.log(`[Photo WebView] Отправка с фото через WebView`);

                // Проверяем что WebView существует
                if (!this.webview) {
                    throw new Error('WebView не инициализирован');
                }

                // ШАГ 1: Читаем фото как base64
                const fileResult = await ipcRenderer.invoke('read-photo-file', { filePath: this.photoPath });
                if (!fileResult.success) {
                    throw new Error(`Файл не найден: ${this.photoPath}`);
                }

                // Вычисляем MD5 хеш
                const binaryString = atob(fileResult.base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const photoHash = calculateMD5(bytes.buffer);

                console.log(`[Photo WebView] hash=${photoHash}, file=${fileResult.fileName}`);

                // ШАГ 2: Проверяем готовность WebView
                if (!this.webviewReady) {
                    throw new Error('WebView не готов (ожидание авторизации)');
                }

                // ШАГ 3: Переводим WebView на compose страницу
                const composeUrl = `https://ladadate.com/message-compose/${user.AccountId}`;
                console.log(`[Photo WebView] Переход на ${composeUrl}`);

                this.webview.src = composeUrl;

                // Ждём навигации на URL с UUID (сервер редиректит с /885167 на /30e4a06-xxxx)
                const currentUrl = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Timeout loading compose page')), 15000);
                    let lastUrl = '';

                    const checkUrl = (url) => {
                        lastUrl = url;
                        // Проверяем что URL содержит UUID (не просто числовой ID)
                        const uidMatch = url.match(/message-compose\/([a-f0-9-]{20,})/i);
                        if (uidMatch) {
                            clearTimeout(timeout);
                            cleanup();
                            resolve(url);
                            return true;
                        }
                        return false;
                    };

                    const onNavigate = (e) => {
                        console.log(`[Photo WebView] did-navigate: ${e.url}`);
                        checkUrl(e.url);
                    };

                    const onFinishLoad = () => {
                        const url = this.webview.getURL();
                        console.log(`[Photo WebView] did-finish-load, URL: ${url}`);
                        // Даём 2 секунды на редирект если URL ещё не UUID
                        if (!checkUrl(url)) {
                            setTimeout(() => {
                                const finalUrl = this.webview.getURL();
                                if (!checkUrl(finalUrl)) {
                                    // Всё равно продолжаем с тем что есть
                                    clearTimeout(timeout);
                                    cleanup();
                                    resolve(finalUrl);
                                }
                            }, 2000);
                        }
                    };

                    const onFailLoad = (e) => {
                        clearTimeout(timeout);
                        cleanup();
                        reject(new Error(`Failed to load: ${e.errorDescription}`));
                    };

                    const cleanup = () => {
                        this.webview.removeEventListener('did-navigate', onNavigate);
                        this.webview.removeEventListener('did-finish-load', onFinishLoad);
                        this.webview.removeEventListener('did-fail-load', onFailLoad);
                    };

                    this.webview.addEventListener('did-navigate', onNavigate);
                    this.webview.addEventListener('did-finish-load', onFinishLoad);
                    this.webview.addEventListener('did-fail-load', onFailLoad);
                });

                console.log(`[Photo WebView] Финальный URL: ${currentUrl}`);

                if (!currentUrl.includes('/message-compose/')) {
                    // WebView не авторизован - пробуем переавторизоваться
                    console.log(`[Photo WebView] ⚠️ Редирект! Пробуем переавторизоваться...`);

                    // Возвращаем WebView на логин
                    this.webview.src = 'https://ladadate.com/login';
                    this.webviewReady = false;

                    throw new Error(`WebView не авторизован. Перезапустите рассылку через 10 сек.`);
                }

                console.log(`[Photo WebView] Страница compose загружена, выполняем отправку...`);

                // ШАГ 4: Извлекаем uid из URL compose-страницы
                // URL: https://ladadate.com/message-compose/d04626e-xxxx-xxxx
                const composeUid = currentUrl.split('/message-compose/')[1]?.split('?')[0] || '';
                console.log(`[Photo WebView] Извлечён uid из URL: ${composeUid}`);

                if (!composeUid) {
                    throw new Error('Не удалось извлечь uid из URL compose страницы');
                }

                // ШАГ 5: Выполняем upload и send через JS в WebView
                const jsCode = `
                    (async () => {
                        try {
                            const base64 = '${fileResult.base64}';
                            const fileName = '${fileResult.fileName}';
                            const msgBody = ${JSON.stringify(msgBody)};
                            const hash = '${photoHash}';
                            let uid = '${composeUid}';

                            // Проверяем что UID - это UUID, а не числовой ID пользователя
                            const isUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uid);

                            if (!isUuid) {
                                console.log('[WebView JS] URL содержит ID пользователя (' + uid + '), ищем compose UID...');

                                // Ждём 1 секунду для инициализации React/Vue
                                await new Promise(r => setTimeout(r, 1000));

                                let foundUid = null;

                                // Способ 1: ищем UUID формат в HTML страницы
                                const html = document.documentElement.innerHTML;
                                const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
                                const uuids = html.match(uuidRegex);
                                if (uuids && uuids.length > 0) {
                                    // Берём первый уникальный UUID
                                    foundUid = uuids[0];
                                    console.log('[WebView JS] Found UUIDs on page:', uuids.length, 'using:', foundUid);
                                }

                                // Способ 2: ищем в React/Next state
                                if (!foundUid) {
                                    const nextData = document.getElementById('__NEXT_DATA__');
                                    if (nextData) {
                                        try {
                                            const data = JSON.parse(nextData.textContent);
                                            console.log('[WebView JS] __NEXT_DATA__ found, searching...');
                                            const dataStr = JSON.stringify(data);
                                            const match = dataStr.match(uuidRegex);
                                            if (match) {
                                                foundUid = match[0];
                                                console.log('[WebView JS] UID from __NEXT_DATA__:', foundUid);
                                            }
                                        } catch(e) {}
                                    }
                                }

                                // Способ 3: ищем в window объектах
                                if (!foundUid) {
                                    for (const key of Object.keys(window)) {
                                        try {
                                            const val = window[key];
                                            if (val && typeof val === 'object') {
                                                const str = JSON.stringify(val).substring(0, 5000);
                                                const match = str.match(uuidRegex);
                                                if (match) {
                                                    foundUid = match[0];
                                                    console.log('[WebView JS] UID from window.' + key + ':', foundUid);
                                                    break;
                                                }
                                            }
                                        } catch(e) {}
                                    }
                                }

                                if (foundUid) {
                                    uid = foundUid;
                                } else {
                                    // Выводим отладочную информацию
                                    console.log('[WebView DEBUG] No UUID found on page');
                                    console.log('[WebView DEBUG] Page title:', document.title);
                                    console.log('[WebView DEBUG] Scripts count:', document.querySelectorAll('script').length);
                                    console.log('[WebView DEBUG] Body length:', document.body.innerHTML.length);

                                    // Пробуем найти любые длинные hex строки
                                    const hexMatches = html.match(/[a-f0-9]{20,}/gi);
                                    console.log('[WebView DEBUG] Long hex strings:', hexMatches?.slice(0, 5));

                                    return { success: false, step: 'uid', error: 'Compose UID не найден на странице' };
                                }
                            }

                            console.log('[WebView JS] Using UID:', uid);

                            // Конвертируем base64 в Blob
                            const byteCharacters = atob(base64);
                            const byteNumbers = new Array(byteCharacters.length);
                            for (let i = 0; i < byteCharacters.length; i++) {
                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                            }
                            const byteArray = new Uint8Array(byteNumbers);
                            const blob = new Blob([byteArray], {type: 'image/jpeg'});

                            // Upload фото
                            const formData = new FormData();
                            formData.append('hash', hash);
                            formData.append('uploadfile', blob, fileName);

                            console.log('[WebView JS] Uploading photo...');
                            const uploadRes = await fetch('/message-attachment-upload?uid=' + uid, {
                                method: 'POST',
                                body: formData
                            });
                            const uploadData = await uploadRes.json();
                            console.log('[WebView JS] Upload response:', uploadData);

                            if (uploadData.IsSuccess === false) {
                                // Возвращаем полный текст ошибки (как в REST API)
                                return { success: false, step: 'upload', error: uploadData.Error || uploadData.Message || uploadData.Reason || JSON.stringify(uploadData) };
                            }

                            // Отправляем письмо
                            console.log('[WebView JS] Sending message...');
                            const sendRes = await fetch('/message-send', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'X-Requested-With': 'XMLHttpRequest'
                                },
                                body: 'uid=' + encodeURIComponent(uid) + '&body=' + encodeURIComponent(msgBody)
                            });
                            const sendData = await sendRes.json();
                            console.log('[WebView JS] Send response:', sendData);

                            if (sendData.IsSuccess === false) {
                                // Возвращаем полный текст ошибки (как в REST API)
                                return { success: false, step: 'send', error: sendData.Error || sendData.Message || sendData.Reason || JSON.stringify(sendData) };
                            }

                            return { success: true, data: sendData };
                        } catch (err) {
                            return { success: false, step: 'exception', error: err.message };
                        }
                    })()
                `;

                const result = await this.webview.executeJavaScript(jsCode);
                console.log(`[Photo WebView] Результат:`, result);

                if (!result.success) {
                    throw new Error(`Ошибка на шаге ${result.step}: ${result.error}`);
                }

                console.log(`[Photo WebView] Письмо с фото отправлено!`);

                // ОПТИМИЗАЦИЯ: Возвращаем WebView на лёгкую страницу
                setTimeout(() => {
                    if (this.webview && this.webviewReady) {
                        console.log(`[WebView ${this.id}] 🔄 Возврат на /ignore-list после отправки фото`);
                        this.webview.src = 'https://ladadate.com/ignore-list';
                    }
                }, 500);

            } else {
                // ============ БЕЗ ФОТО: публичный API (Bearer token) ============
                const checkRes = await makeApiRequest(this, 'GET', `/api/messages/check-send/${user.AccountId}`);

                if (!checkRes.data.CheckId) {
                    throw new Error('Не удалось получить CheckId');
                }

                // Формируем payload (без вложений)
                const payload = {
                    CheckId: checkRes.data.CheckId,
                    RecipientAccountId: user.AccountId,
                    Body: msgBody,
                    ReplyForMessageId: user.messageToReply || null
                };

                // Отправляем на Ladadate
                await makeApiRequest(this, 'POST', '/api/messages/send', payload);
            }

            // Отслеживаем диалог и получаем метаданные
            const convData = this.trackConversation(user.AccountId);
            const convId = this.getConvId(user.AccountId);

            // === Определяем: это ОТВЕТ или РАССЫЛКА? ===
            const isReply = this.mailSettings.target === 'inbox';
            const recipientIdStr = user.AccountId.toString();
            let actualResponseTime = null;

            if (isReply && this.incomingTimes[recipientIdStr]) {
                // Это ответ на входящее письмо — вычисляем реальное время ответа
                const incomingTime = this.incomingTimes[recipientIdStr];
                const responseTimeMs = Date.now() - incomingTime;
                actualResponseTime = millisecondsToInterval(responseTimeMs);

                // Очищаем время входящего — ответ отправлен
                delete this.incomingTimes[recipientIdStr];

                const responseMinutes = Math.round(responseTimeMs / 60000);
                console.log(`[Lababot] ⏱️ Ответ на письмо: ${user.Name} — время ответа: ${responseMinutes} мин`);
            } else if (!isReply) {
                // Это массовая рассылка — responseTime = null
                actualResponseTime = null;
            }

            // Отправляем полную статистику на НАШ сервер Lababot
            const lababotResult = await sendMessageToLababot({
                botId: this.id,
                accountDisplayId: this.displayId,
                recipientId: user.AccountId,
                type: 'outgoing',
                textContent: msgBody,
                templateText: msgTemplate,  // Оригинальный шаблон (до подстановки макросов)
                status: 'success',
                responseTime: actualResponseTime,
                isFirst: convData.isFirst,
                isLast: false,
                convId: convId,
                mediaUrl: this.photoName ? `attached_photo_${this.photoName}` : null,
                fileName: this.photoName || null,
                translatorId: this.translatorId,
                errorReason: null,
                usedAi: this.usedAi || false,
                isReply: isReply  // Флаг: это ответ на входящее или рассылка
            });

            if (!lababotResult.success) {
                console.warn(`⚠️ Не удалось отправить статистику на Lababot: ${lababotResult.error}`);
            }

            // Сбрасываем флаг AI после отправки
            if (this.usedAi) {
                console.log(`🤖 Сообщение с AI отправлено, сбрасываем флаг`);
                this.usedAi = false;
            }

            this.incrementStat('mail', 'sent');
            this.addToHistory('mail', 'sent', `${user.AccountId} (${user.Name})`);
            this.log(`✅ Письмо отправлено: ${user.Name} (${user.AccountId})`);
            this.networkErrorCount = 0;

            // Отмечаем Custom ID как отправленный (если это custom-ids режим)
            if (this.mailSettings.target === 'custom-ids') {
                markCustomIdSent(this.id, user.AccountId.toString());
            }

            // ============ ONLINE SMART: Добавляем в горячую очередь ============
            // Добавляем для ВСЕХ режимов (не только online-smart), чтобы другие анкеты
            // с online-smart могли подхватить "горячего" мужчину
            if (this.mailSettings.target === 'online-smart' ||
                this.mailSettings.target === 'online' ||
                this.mailSettings.target === 'shared-online') {
                addToHotQueue(user.AccountId, user.Name, this.id);

                // Обновляем статистику горячей очереди
                if (fromHotQueue) {
                    this.mailStats.hotQueueSent = (this.mailStats.hotQueueSent || 0) + 1;
                }
            }

        } catch (e) {
            if(e.message === "Network Error" || !e.response) {
                // Exponential backoff при сетевых ошибках
                this.networkErrorCount++;
                const backoffDelay = Math.min(5000 * Math.pow(2, this.networkErrorCount - 1), 60000); // max 60 сек
                this.log(`📡 Ошибка сети (#${this.networkErrorCount}). Повтор через ${Math.round(backoffDelay/1000)}с...`);
                await new Promise(r => setTimeout(r, backoffDelay));
            } else if (e.response && e.response.status === 403) {
                // 403 = пользователь заблокирован или ограничение - СЧИТАЕМ КАК ОШИБКУ
                const errorReason = extractApiError(e.response, 'Доступ запрещён');
                this.incrementStat('mail', 'errors');
                this.addToHistory('mail', 'errors', `${user?.AccountId || 'unknown'}: ${errorReason}`);
                this.log(`❌ Ошибка: ${user?.Name || 'unknown'} (${user?.AccountId || '?'}) - ${errorReason}`);

                // Проверяем игнор-лист, блокировку или несоответствие возрасту
                const isIgnored = errorReason.toLowerCase().includes('ignore') ||
                                  errorReason.toLowerCase().includes('игнор') ||
                                  errorReason.toLowerCase().includes('block') ||
                                  errorReason.toLowerCase().includes('заблокир') ||
                                  errorReason.toLowerCase().includes('criteria of age') ||
                                  errorReason.toLowerCase().includes('do not match');

                // Добавляем в игнор-лист если это блокировка/игнор
                if (user && user.AccountId && isIgnored) {
                    if (!this.ignoredUsersMail.includes(user.AccountId)) {
                        this.ignoredUsersMail.push(user.AccountId);
                        this.log(`⛔ ${user.Name} добавлен в игнор-лист писем (навсегда)`);
                        saveIgnoredUsersToStorage(this.displayId, 'mail', this.ignoredUsersMail);
                    }
                }

                // Отмечаем Custom ID как обработанный даже при ошибке (чтобы перейти к следующему)
                if (this.mailSettings.target === 'custom-ids' && user && user.AccountId) {
                    markCustomIdSent(this.id, user.AccountId.toString());
                }

                // ============ ONLINE SMART: Проверка глобального лимита ============
                // Если ошибка "hourly incoming message limit" - обрабатываем глобально (ТОЛЬКО для online-smart!)
                if (this.mailSettings.target === 'online-smart' && user && user.AccountId && errorReason.includes(LIMIT_ERROR_TEXT)) {
                    handleGlobalLimit(user.AccountId, user.Name, this.id);
                }

                // Отправляем ошибку на сервер (с защитой от падения)
                try {
                    await sendErrorToLababot(
                        this.id,
                        this.displayId,
                        'mail_403_error',
                        errorReason
                    );
                } catch (err) { console.error('sendErrorToLababot failed:', err); }

                // Также через message_sent API с status='failed'
                if (user && user.AccountId) {
                    try {
                        const convData = this.trackConversation(user.AccountId);
                        const convId = this.getConvId(user.AccountId);
                        await sendMessageToLababot({
                            botId: this.id,
                            accountDisplayId: this.displayId,
                            recipientId: user.AccountId,
                            type: 'outgoing',
                            textContent: msgBody || '',
                            status: 'failed',
                            responseTime: convData.responseTime,
                            isFirst: convData.isFirst,
                            isLast: false,
                            convId: convId,
                            mediaUrl: null,
                            fileName: null,
                            translatorId: this.translatorId,
                            errorReason: errorReason,
                            usedAi: false
                        });
                    } catch (err) { console.error('sendMessageToLababot failed:', err); }
                }
            } else {
                this.incrementStat('mail', 'errors');
                this.addToHistory('mail', 'errors', e.message);

                // Отправляем ошибку на наш сервер через старый API (с защитой от падения)
                try {
                    await sendErrorToLababot(
                        this.id,
                        this.displayId,
                        'mail_send_error',
                        e.response?.data?.Error || e.message
                    );
                } catch (err) { console.error('sendErrorToLababot failed:', err); }

                // Отмечаем Custom ID как обработанный даже при ошибке (чтобы перейти к следующему)
                if (this.mailSettings.target === 'custom-ids' && user && user.AccountId) {
                    markCustomIdSent(this.id, user.AccountId.toString());
                }

                // НОВОЕ: Отправляем также через message_sent API с status='failed'
                // (если есть информация о получателе)
                if (user && user.AccountId) {
                    try {
                        const convData = this.trackConversation(user.AccountId);
                        const convId = this.getConvId(user.AccountId);

                        await sendMessageToLababot({
                            botId: this.id,
                            accountDisplayId: this.displayId,
                            recipientId: user.AccountId,
                            type: 'outgoing',
                            textContent: msgBody || '',
                            status: 'failed',
                            responseTime: convData.responseTime,
                            isFirst: convData.isFirst,
                            isLast: false,
                            convId: convId,
                            mediaUrl: this.photoName ? `attached_photo_${this.photoName}` : null,
                            fileName: this.photoName || null,
                            translatorId: this.translatorId,
                            errorReason: e.response ? extractApiError(e.response, e.message) : e.message,
                            usedAi: false
                        });
                    } catch (err) { console.error('sendMessageToLababot failed:', err); }
                }
            }
        }
        this.updateUI();
    }

    async startChat(fullText) {
        if(!this.token) return;

        // КРИТИЧНО: Защита от запуска Chat в режиме Mail
        if (globalMode === 'mail') {
            console.error(`[SECURITY] Попытка запустить Chat в режиме Mail! Заблокировано.`);
            this.log(`⛔ Ошибка: нельзя запустить чат в режиме писем`);
            return;
        }

        // Проверяем статус бот-машины (управляется с сервера)
        if (!controlStatus.botEnabled) {
            this.log(`🔴 Запуск заблокирован - бот отключен администратором`);
            return;
        }

        // Проверяем разрешение рассылки для этой анкеты (управляется с сервера)
        if (!this.mailingEnabled) {
            this.log(`⛔ Запуск заблокирован - рассылка отключена администратором`);
            return;
        }

        // Проверяем статус профиля на сервере
        const profileStatus = await checkProfileStatus(this.displayId);

        // Проверяем, есть ли анкета в системе
        if (!profileStatus.allowed || !profileStatus.exists) {
            this.log(`⛔ Анкета не найдена в системе личного кабинета`);
            alert(`Анкета ${this.displayId} не добавлена в личный кабинет. Добавьте её в систему для работы.`);
            return;
        }

        // Проверяем, приостановлена ли анкета
        if (profileStatus.paused) {
            this.log(`⛔ Чат заблокирован - анкета приостановлена в личном кабинете`);
            alert(`Анкета ${this.displayId} приостановлена в личном кабинете. Чат невозможен.`);
            return;
        }

        // Проверяем оплату анкеты
        const paymentStatus = await checkProfilePaymentStatus(this.displayId);

        // Если ошибка сервера - блокируем с понятным сообщением
        if (paymentStatus.serverError) {
            this.log(`⛔ Чат заблокирован - не удалось проверить оплату`);
            alert(`Не удалось проверить статус оплаты анкеты.\n\nПроверьте подключение к интернету и попробуйте снова.`);
            return;
        }

        if (!paymentStatus.isPaid && !paymentStatus.isFree) {
            this.log(`⛔ Чат заблокирован - анкета не оплачена`);

            // Показываем диалог с возможностью активации trial
            const dialogResult = await showPaymentDialog(this.displayId, paymentStatus.canTrial);

            if (dialogResult.action === 'trial_activated') {
                // Trial активирован - запускаем чат
                this.log(`✅ Trial активирован, запускаем чат`);
            } else {
                // Отмена или ошибка
                return;
            }
        }

        // === ИСПРАВЛЕНИЕ: Валидация индекса инвайта при старте ===
        const invites = fullText.split(/\n\s*__\s*\n/);
        if (this.chatSettings.currentInviteIndex >= invites.length) {
            // Индекс вышел за пределы - сбрасываем на 0
            console.log(`[Chat] currentInviteIndex (${this.chatSettings.currentInviteIndex}) >= invites.length (${invites.length}), сброс на 0`);
            this.chatSettings.currentInviteIndex = 0;
            this.chatSettings.rotationStartTime = Date.now(); // Сбрасываем таймер ротации
        }

        if (this.chatSettings.rotationStartTime === 0) this.chatSettings.rotationStartTime = Date.now();
        this.isChatRunning = true;
        this.chatStartTime = Date.now();
        this.startChatTimer();
        this.updateUI();
        this.log(`🚀 CHAT Started (v${APP_VERSION})`);
        this.scheduleNextChat(fullText, 0);
        saveSession();
    }

    stopChat() {
        this.isChatRunning = false;
        this.isChatWaiting = false;
        clearTimeout(this.chatTimeout);
        this.stopChatTimer();
        // Отменяем все автоответы при остановке
        this.cancelAllAutoReplies();
        this.log("⏹ CHAT Stopped");
        this.updateUI();
    }

    startChatTimer() {
        if (this.chatTimerInterval) clearInterval(this.chatTimerInterval);
        this.chatTimerInterval = setInterval(() => this.updateUI(), 1000);
    }

    stopChatTimer() {
        if (this.chatTimerInterval) {
            clearInterval(this.chatTimerInterval);
            this.chatTimerInterval = null;
        }
        this.chatStartTime = null;
    }

    scheduleNextChat(fullText, delay) {
        if (!this.isChatRunning) return;
        this.chatTimeout = setTimeout(async () => {
            if (!this.isChatRunning) return;
            await this.processChatUser(fullText);

            // Проверяем условия автоочистки ошибок
            if (checkAutoClearConditions(this, 'chat')) {
                performAutoClear('chat');
            }

            // Проверяем условия автоочистки отправленных
            if (checkAutoClearSentConditions(this, 'chat')) {
                performAutoClearSent('chat');
            }

            // Определяем задержку
            let nextDelay;
            if (this.chatSettings.speed === 'smart') {
                nextDelay = Math.floor(Math.random() * (120000 - 15000 + 1)) + 15000;
            } else {
                nextDelay = parseInt(this.chatSettings.speed) * 1000;
            }

            this.chatStats.waiting = Math.floor(300000 / nextDelay);
            this.updateUI();
            this.scheduleNextChat(fullText, nextDelay);
        }, delay);
    }
    async processChatUser(fullText) {
        this.isChatWaiting = true; // По умолчанию ждём пока не найдём пользователя
        this.updateUI();

        const invites = fullText.split(/\n\s*__\s*\n/);
        if (invites.length === 0) return;

        const durationMs = this.chatSettings.rotationHours * 3600 * 1000;
        const elapsed = Date.now() - this.chatSettings.rotationStartTime;
        
        if (elapsed > durationMs) {
            this.chatSettings.currentInviteIndex++;
            this.chatSettings.rotationStartTime = Date.now();
            if (this.chatSettings.currentInviteIndex >= invites.length) {
                if (this.chatSettings.cyclic) {
                    this.chatSettings.currentInviteIndex = 0;
                    this.log("🔄 Цикл перезапущен");
                } else {
                    // === ИСПРАВЛЕНИЕ: Не останавливаем, а остаёмся на последнем инвайте ===
                    // Продолжаем ждать новых пользователей с последним инвайтом
                    this.chatSettings.currentInviteIndex = invites.length - 1;
                    this.log("📌 Все инвайты использованы. Продолжаем с последним.");
                }
            } else {
                this.log(`⏩ Переключено на инвайт #${this.chatSettings.currentInviteIndex + 1}`);
            }
            saveSession();
            this.updateUI();
        }
        
        if (this.chatSettings.currentInviteIndex >= invites.length) {
            this.chatSettings.currentInviteIndex = 0;
        }
        
        const currentMsgTemplate = invites[this.chatSettings.currentInviteIndex];

        let user = null;

        try {
            const target = this.chatSettings.target;
            let apiPath = '/api/users/online';
            if (target === 'payers') apiPath = '/api/users/payers';

            const usersRes = await makeApiRequest(this, 'GET', apiPath);
            let users = usersRes.data.Users || [];

            // Диагностика: логируем что вернул API
            console.log(`[Chat ${target}] API вернул ${users.length} пользователей`);

            // Диагностика: сколько до фильтрации
            const beforeFilter = users.length;

            // Фильтруем: убираем тех кто в Отправленных, Ошибках, ЧС или Игноре
            // Используем canSendChatTo() для проверки ВСЕХ списков
            users = users.filter(u => this.canSendChatTo(u.AccountId));

            // Диагностика: сколько после фильтрации
            console.log(`[Chat ${target}] После фильтрации: ${users.length} из ${beforeFilter}`);

            // Если новых пользователей нет - просто ждём
            if (users.length === 0) {
                this.log(`⏳ Нет пользователей для чата (${target}). Ожидание...`);
                return;
            }

            user = users[Math.floor(Math.random() * users.length)];
            this.isChatWaiting = false; // Нашли пользователя - активно отправляем
            this.updateUI();

            // Загружаем полный профиль для расширенных макросов
            try {
                const fullProfile = await fetchUserProfile(this, user.AccountId, user.Country);
                if (fullProfile) {
                    user = { ...user, ...fullProfile };
                    console.log(`[Profile Chat] ✅ Данные профиля загружены`);
                }
            } catch (profileErr) {
                console.warn(`⚠️ Не удалось загрузить профиль ${user.AccountId}:`, profileErr.message);
            }

            let msgBody = this.replaceMacros(currentMsgTemplate, user);

            // === ОТПРАВКА ЧАТА ЧЕРЕЗ WEBVIEW (требуются session cookies) ===
            let sendSuccess = false;
            let sendError = null;

            // 1. Пытаемся отправить через WebView (правильный способ)
            if (this.webview && this.webviewReady) {
                try {
                    // Блокируем звук перед отправкой
                    if (this.webview.setAudioMuted) {
                        this.webview.setAudioMuted(true);
                    }

                    console.log(`[Chat] Отправка через WebView chat-send для ${user.Name}...`);
                    const result = await this.webview.executeJavaScript(`
                        (async () => {
                            // Блокируем Audio API
                            if (!window.__audioMuted) {
                                window.__audioMuted = true;
                                Audio.prototype.play = function() { return Promise.resolve(); };
                                HTMLMediaElement.prototype.play = function() { return Promise.resolve(); };
                            }
                            try {
                                const res = await fetch('https://ladadate.com/chat-send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: ${user.AccountId}, body: ${JSON.stringify(msgBody)} }),
                                    credentials: 'include'
                                });
                                if (!res.ok) {
                                    return { success: false, error: 'HTTP ' + res.status, status: res.status };
                                }
                                const text = await res.text();
                                console.log('[Chat WebView] chat-send response:', text);
                                try {
                                    const json = JSON.parse(text);
                                    if (json.IsSuccess === false) {
                                        return { success: false, error: json.Error || 'API error', data: json };
                                    }
                                    return { success: true, data: json };
                                } catch {
                                    return { success: true, data: text };
                                }
                            } catch (e) {
                                return { success: false, error: e.message };
                            }
                        })()
                    `);

                    console.log(`[Chat] WebView chat-send result:`, result);
                    if (result.success) {
                        sendSuccess = true;
                        console.log(`[Chat] ✅ Чат отправлен через WebView!`);
                    } else {
                        sendError = result.error || 'WebView error';
                        console.log(`[Chat] ❌ WebView chat-send ошибка:`, sendError);
                    }
                } catch (e) {
                    sendError = e.message;
                    console.log(`[Chat] ⚠️ WebView executeJavaScript error:`, e.message);
                }
            } else {
                sendError = 'WebView не готов';
                console.log(`[Chat] ⚠️ WebView не готов (webview: ${!!this.webview}, ready: ${this.webviewReady})`);
            }

            // 2. Fallback: пробуем через API (без cookies, может не работать)
            if (!sendSuccess) {
                console.log(`[Chat] Fallback: отправка через /chat-send API...`);
                try {
                    const payload = { recipientId: user.AccountId, body: msgBody };
                    await makeApiRequest(this, 'POST', '/chat-send', payload);
                    sendSuccess = true;
                    sendError = null;
                    console.log(`[Chat] ✅ Чат отправлен через API fallback!`);
                } catch (apiErr) {
                    sendError = apiErr.response ? extractApiError(apiErr.response, apiErr.message) : apiErr.message;
                    console.log(`[Chat] ❌ API fallback не сработал:`, sendError);
                }
            }

            // 3. Обрабатываем результат
            if (sendSuccess) {
                // УСПЕХ - отправляем статистику
                const convData = this.trackConversation(user.AccountId);
                const convId = this.getConvId(user.AccountId);
                const isLast = this.isLastMessageInRotation();

                const lababotResult = await sendMessageToLababot({
                    botId: this.id,
                    accountDisplayId: this.displayId,
                    recipientId: user.AccountId,
                    type: 'chat_msg', // Чат сообщение = $0.15
                    textContent: msgBody,
                    status: 'success',
                    responseTime: convData.responseTime,
                    isFirst: convData.isFirst,
                    isLast: isLast,
                    convId: convId,
                    mediaUrl: null,
                    fileName: null,
                    translatorId: this.translatorId,
                    errorReason: null,
                    usedAi: this.usedAi || false
                });

                if (!lababotResult.success) {
                    console.warn(`⚠️ Не удалось отправить статистику чата на Lababot: ${lababotResult.error}`);
                }

                // Сбрасываем флаг AI после отправки
                if (this.usedAi) {
                    console.log(`🤖 Чат с AI отправлен, сбрасываем флаг`);
                    this.usedAi = false;
                }

                this.incrementStat('chat', 'sent');
                this.addToHistory('chat', 'sent', `${user.AccountId} (${user.Name})`);
                this.log(`💬 Сообщение чата отправлено: ${user.Name} (${user.AccountId})`);
                this.networkErrorCount = 0; // Сброс счётчика при успехе

                // Данные уже добавлены в chatHistory.sent - фильтрация проверяет этот список

            } else {
                // ОШИБКА - только фиксируем ошибку, НЕ отправляем как письмо!
                const errorReason = sendError || 'Неизвестная ошибка чата';

                this.incrementStat('chat', 'errors');
                this.addToHistory('chat', 'errors', `${user.AccountId}: ${errorReason}`);
                this.log(`❌ Ошибка чата ${user.Name} (${user.AccountId}): ${errorReason}`);

                // Проверяем игнор-лист, блокировку или несоответствие возрасту
                const isIgnored = errorReason.toLowerCase().includes('ignore') ||
                                  errorReason.toLowerCase().includes('игнор') ||
                                  errorReason.toLowerCase().includes('block') ||
                                  errorReason.toLowerCase().includes('заблокир') ||
                                  errorReason.toLowerCase().includes('criteria of age') ||
                                  errorReason.toLowerCase().includes('do not match');

                // Добавляем в игнор-лист если это блокировка/игнор
                if (isIgnored && !this.ignoredUsersChat.includes(user.AccountId)) {
                    this.ignoredUsersChat.push(user.AccountId);
                    this.log(`⛔ ${user.Name} добавлен в игнор-лист чатов (навсегда)`);
                    saveIgnoredUsersToStorage(this.displayId, 'chat', this.ignoredUsersChat);
                }

                // Отправляем ошибку на сервер
                await sendErrorToLababot(
                    this.id,
                    this.displayId,
                    'chat_send_error',
                    errorReason
                );

                // Отправляем статистику с status='failed'
                const convData = this.trackConversation(user.AccountId);
                const convId = this.getConvId(user.AccountId);
                await sendMessageToLababot({
                    botId: this.id,
                    accountDisplayId: this.displayId,
                    recipientId: user.AccountId,
                    type: 'chat_msg',
                    textContent: msgBody || '',
                    status: 'failed',
                    responseTime: convData.responseTime,
                    isFirst: convData.isFirst,
                    isLast: false,
                    convId: convId,
                    mediaUrl: null,
                    fileName: null,
                    translatorId: this.translatorId,
                    errorReason: errorReason,
                    usedAi: false
                });
            }
        } catch (e) {
            if(e.message === "Network Error" || !e.response) {
                // Exponential backoff при сетевых ошибках
                this.networkErrorCount++;
                const backoffDelay = Math.min(5000 * Math.pow(2, this.networkErrorCount - 1), 60000); // max 60 сек
                this.log(`📡 Ошибка сети (#${this.networkErrorCount}). Повтор через ${Math.round(backoffDelay/1000)}с...`);
                await new Promise(r => setTimeout(r, backoffDelay));
            } else {
                const errorReason = e.response ? extractApiError(e.response, e.message) : e.message;
                this.incrementStat('chat', 'errors');
                this.addToHistory('chat', 'errors', errorReason);

                // Проверяем игнор-лист, блокировку или несоответствие возрасту
                const isIgnored = errorReason.toLowerCase().includes('ignore') ||
                                  errorReason.toLowerCase().includes('игнор') ||
                                  errorReason.toLowerCase().includes('block') ||
                                  errorReason.toLowerCase().includes('заблокир') ||
                                  errorReason.toLowerCase().includes('criteria of age') ||
                                  errorReason.toLowerCase().includes('do not match');

                // Добавляем в игнор-лист если это блокировка/игнор
                if (user && user.AccountId && isIgnored) {
                    if (!this.ignoredUsersChat.includes(user.AccountId)) {
                        this.ignoredUsersChat.push(user.AccountId);
                        this.log(`⛔ ${user.Name} добавлен в игнор-лист чатов (навсегда)`);
                        saveIgnoredUsersToStorage(this.displayId, 'chat', this.ignoredUsersChat);
                    }
                }

                // Отправляем ошибку на наш сервер
                await sendErrorToLababot(
                    this.id,
                    this.displayId,
                    'chat_process_error',
                    errorReason
                );
            }
        }
        this.updateUI();
    }

    replaceMacros(text, user) {
        if(!text) return "";
        let res = text;

        // Хелпер для получения значения из нескольких возможных полей
        const getField = (...keys) => {
            for (const key of keys) {
                if (user[key] !== undefined && user[key] !== null && user[key] !== '') {
                    return user[key];
                }
            }
            return '';
        };

        // Форматирование даты из ISO в читаемый формат
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
            } catch {
                return dateStr;
            }
        };

        // Базовые макросы
        res = res.replace(/{name}/gi, getField('Name', 'FirstName', 'name') || "dear");
        res = res.replace(/{age}/gi, getField('Age', 'age') || "");
        res = res.replace(/{city}/gi, getField('City', 'CityName', 'city') || "your city");
        res = res.replace(/{country}/gi, getField('Country', 'CountryName', 'country') || "your country");

        // Расширенные макросы - пробуем разные варианты имён полей из API
        res = res.replace(/{occupation}/gi, getField('Occupation', 'Job', 'occupation', 'job'));
        res = res.replace(/{job}/gi, getField('Occupation', 'Job', 'occupation', 'job'));
        res = res.replace(/{marital}/gi, getField('MaritalStatus', 'FamilyStatus', 'Marital', 'maritalStatus'));
        res = res.replace(/{children}/gi, getField('Children', 'Kids', 'children', 'kids'));
        res = res.replace(/{wantchildren}/gi, getField('WantChildren', 'WantKids', 'wantChildren'));
        res = res.replace(/{height}/gi, getField('Height', 'height'));
        res = res.replace(/{weight}/gi, getField('Weight', 'weight'));
        res = res.replace(/{hair}/gi, getField('HairColor', 'Hair', 'hairColor', 'hair'));
        res = res.replace(/{eye}/gi, getField('EyesColor', 'EyeColor', 'Eyes', 'eyes', 'eyeColor'));
        res = res.replace(/{eyes}/gi, getField('EyesColor', 'EyeColor', 'Eyes', 'eyes', 'eyeColor'));
        res = res.replace(/{body}/gi, getField('BodyType', 'Body', 'bodyType'));
        res = res.replace(/{zodiac}/gi, getField('Zodiac', 'ZodiacSign', 'zodiac'));
        res = res.replace(/{birthday}/gi, formatDate(getField('Birthday', 'BirthDate', 'DateOfBirth', 'birthDate')));
        res = res.replace(/{religion}/gi, getField('Religion', 'religion'));
        res = res.replace(/{ethnicity}/gi, getField('Ethnicity', 'ethnicity'));
        res = res.replace(/{education}/gi, getField('Education', 'education'));
        res = res.replace(/{smoking}/gi, getField('Smoke', 'Smoking', 'smoke', 'smoking'));
        res = res.replace(/{smoke}/gi, getField('Smoke', 'Smoking', 'smoke', 'smoking'));
        res = res.replace(/{alcohol}/gi, getField('Drink', 'Drinking', 'Alcohol', 'drink', 'alcohol'));
        res = res.replace(/{drink}/gi, getField('Drink', 'Drinking', 'Alcohol', 'drink', 'alcohol'));
        res = res.replace(/{english}/gi, getField('EnglishLevel', 'English', 'englishLevel'));
        res = res.replace(/{languages}/gi, getField('Languages', 'Language', 'languages'));
        res = res.replace(/{hobby}/gi, getField('Hobby', 'Hobbies', 'Interests', 'hobby', 'interests'));
        res = res.replace(/{interests}/gi, getField('Hobby', 'Hobbies', 'Interests', 'hobby', 'interests'));
        res = res.replace(/{about}/gi, getField('AboutMe', 'About', 'Description', 'aboutMe'));
        res = res.replace(/{lookingfor}/gi, getField('AboutPartner', 'LookingFor', 'lookingFor'));

        // === ФИНАЛЬНАЯ ОЧИСТКА ОТ HTML ENTITIES ===
        // Убираем &nbsp; и другие entities которые могут остаться в данных профиля
        res = res
            .replace(/&nbsp;/gi, ' ')           // HTML entity &nbsp;
            .replace(/&#160;/gi, ' ')           // Числовой код &nbsp;
            .replace(/&#xa0;/gi, ' ')           // Hex код &nbsp;
            .replace(/\u00A0/g, ' ')            // Unicode non-breaking space
            .replace(/&amp;/gi, '&')            // &amp; -> &
            .replace(/&lt;/gi, '<')             // &lt; -> <
            .replace(/&gt;/gi, '>')             // &gt; -> >
            .replace(/&quot;/gi, '"')           // &quot; -> "
            .replace(/&#39;/gi, "'")            // &#39; -> '
            .replace(/&apos;/gi, "'")           // &apos; -> '
            .replace(/&mdash;/gi, '—')          // &mdash; -> —
            .replace(/&ndash;/gi, '–')          // &ndash; -> –
            .replace(/&hellip;/gi, '...')       // &hellip; -> ...
            .replace(/&#\d+;/g, '')             // Остальные числовые entities - удаляем
            .replace(/\s{2,}/g, ' ')            // Множественные пробелы -> один
            .trim();

        return res;
    }

    // === АВТООТВЕТЫ НА ВХОДЯЩИЕ ЧАТЫ ===

    // Запустить цепочку автоответов для нового чата
    scheduleAutoReply(recipientId, partnerName) {
        console.log(`[AutoReply] Проверка условий для ${partnerName} (${recipientId}):`);
        console.log(`  - autoReplyEnabled: ${this.chatSettings.autoReplyEnabled}`);
        console.log(`  - isChatRunning: ${this.isChatRunning}`);
        console.log(`  - autoReplies.length: ${this.chatSettings.autoReplies.length}`);
        console.log(`  - уже в очереди: ${!!this.autoReplyQueue[recipientId]}`);

        // Проверяем условия
        if (!this.chatSettings.autoReplyEnabled) {
            console.log(`[AutoReply] ❌ Автоответы выключены`);
            return;
        }
        if (!this.isChatRunning) {
            console.log(`[AutoReply] ❌ Рассылка Chat не запущена`);
            return;
        }
        if (this.chatSettings.autoReplies.length === 0) {
            console.log(`[AutoReply] ❌ Нет автоответов в списке`);
            return;
        }
        if (this.autoReplyQueue[recipientId]) {
            console.log(`[AutoReply] ❌ Уже в очереди`);
            return;
        }

        // НЕ проверяем ЧС - пользователь уже добавлен в ЧС, но автоответы должны отправиться

        const firstReply = this.chatSettings.autoReplies[0];
        if (!firstReply) return;

        console.log(`[AutoReply] ✅ Запуск цепочки для ${partnerName} (${recipientId}), первый ответ через ${firstReply.delay} сек`);
        this.log(`🤖 Автоответ: ${partnerName} через ${firstReply.delay} сек`);

        // Создаём запись в очереди
        this.autoReplyQueue[recipientId] = {
            currentIndex: 0,
            partnerName: partnerName,
            timerId: setTimeout(() => {
                this.sendAutoReply(recipientId);
            }, firstReply.delay * 1000)
        };
    }

    // Отправить автоответ
    async sendAutoReply(recipientId) {
        console.log(`[AutoReply] 🚀 sendAutoReply вызван для ${recipientId}`);

        const queueItem = this.autoReplyQueue[recipientId];
        if (!queueItem) {
            console.log(`[AutoReply] ❌ Нет записи в очереди для ${recipientId}`);
            return;
        }

        const autoReplies = this.chatSettings.autoReplies;
        const currentIndex = queueItem.currentIndex;
        console.log(`[AutoReply] Отправка автоответа #${currentIndex + 1} для ${queueItem.partnerName}`);

        if (currentIndex >= autoReplies.length) {
            // Все автоответы отправлены
            this.finishAutoReplyChain(recipientId, queueItem.partnerName);
            return;
        }

        const reply = autoReplies[currentIndex];
        const partnerName = queueItem.partnerName;

        console.log(`[AutoReply] Текст: "${reply.text.substring(0, 50)}..."`);

        try {
            // Подготавливаем текст с макросами
            const msgBody = this.replaceMacros(reply.text, {
                Name: partnerName,
                City: '',
                Age: '',
                Country: ''
            });

            // ВАЖНО: Используем WebView для отправки чата (как в MiniChat)
            // Это нужно потому что /chat-send требует session cookies из WebView
            let sendSuccess = false;

            if (this.webview) {
                try {
                    // Блокируем звук перед отправкой
                    if (this.webview.setAudioMuted) {
                        this.webview.setAudioMuted(true);
                    }

                    console.log(`[AutoReply] Отправка через WebView chat-send...`);
                    const result = await this.webview.executeJavaScript(`
                        (async () => {
                            // Блокируем Audio API
                            if (!window.__audioMuted) {
                                window.__audioMuted = true;
                                Audio.prototype.play = function() { return Promise.resolve(); };
                                HTMLMediaElement.prototype.play = function() { return Promise.resolve(); };
                            }
                            try {
                                const res = await fetch('https://ladadate.com/chat-send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: ${recipientId}, body: ${JSON.stringify(msgBody)} }),
                                    credentials: 'include'
                                });
                                if (!res.ok) {
                                    return { success: false, error: 'HTTP ' + res.status, status: res.status };
                                }
                                const text = await res.text();
                                console.log('[AutoReply WebView] chat-send response:', text);
                                try {
                                    const json = JSON.parse(text);
                                    if (json.IsSuccess === false) {
                                        return { success: false, error: json.Error || 'API error', data: json };
                                    }
                                    return { success: true, data: json };
                                } catch {
                                    return { success: true, data: text };
                                }
                            } catch (e) {
                                return { success: false, error: e.message };
                            }
                        })()
                    `);

                    console.log(`[AutoReply] WebView chat-send result:`, result);
                    if (result.success) {
                        sendSuccess = true;
                        console.log(`[AutoReply] ✅ Чат отправлен через WebView!`);
                    } else {
                        console.log(`[AutoReply] ❌ WebView chat-send ошибка:`, result.error);
                    }
                } catch (e) {
                    console.log(`[AutoReply] ⚠️ WebView executeJavaScript error:`, e.message);
                }
            }

            // Если через WebView не получилось - пробуем через API (fallback)
            if (!sendSuccess) {
                console.log(`[AutoReply] Fallback: отправка через /chat-send API...`);
                try {
                    const payload = { recipientId: parseInt(recipientId), body: msgBody };
                    await makeApiRequest(this, 'POST', '/chat-send', payload);
                    sendSuccess = true;
                    console.log(`[AutoReply] ✅ Чат отправлен через API fallback!`);
                } catch (apiErr) {
                    console.log(`[AutoReply] ❌ API fallback не сработал:`, apiErr.message);
                }
            }

            if (sendSuccess) {
                // Отслеживаем статистику
                const convData = this.trackConversation(recipientId);
                const convId = this.getConvId(recipientId);

                await sendMessageToLababot({
                    botId: this.id,
                    accountDisplayId: this.displayId,
                    recipientId: recipientId,
                    type: 'chat_msg',
                    textContent: msgBody,
                    status: 'success',
                    responseTime: convData.responseTime,
                    isFirst: convData.isFirst,
                    isLast: currentIndex === autoReplies.length - 1,
                    convId: convId,
                    mediaUrl: null,
                    fileName: null,
                    translatorId: this.translatorId,
                    errorReason: null,
                    usedAi: false
                });

                this.incrementStat('chat', 'sent');
                this.log(`🤖 Автоответ #${currentIndex + 1} (чат) отправлен: ${partnerName}`);
                console.log(`[AutoReply] Автоответ #${currentIndex + 1} отправлен для ${partnerName}`);
                this.networkErrorCount = 0; // Сброс счётчика при успехе

                // Планируем следующий автоответ
                const nextIndex = currentIndex + 1;
                if (nextIndex < autoReplies.length) {
                    const nextReply = autoReplies[nextIndex];
                    queueItem.currentIndex = nextIndex;
                    queueItem.timerId = setTimeout(() => {
                        this.sendAutoReply(recipientId);
                    }, nextReply.delay * 1000);

                    this.log(`🤖 Следующий автоответ через ${nextReply.delay} сек`);
                } else {
                    // Это был последний автоответ
                    this.finishAutoReplyChain(recipientId, partnerName);
                }
            } else {
                // Чат не удалось отправить - пробуем как письмо (последний fallback)
                console.log(`[AutoReply] Последний fallback: отправка как письмо...`);
                throw new Error('Chat send failed, trying letter fallback');
            }

        } catch (error) {
            console.error(`[AutoReply] Ошибка отправки чата для ${recipientId}:`, error);

            // Fallback: отправляем как письмо
            try {
                const msgBody = this.replaceMacros(reply.text, { Name: partnerName, City: '', Age: '', Country: '' });
                console.log(`[AutoReply] Получаем CheckId для письма...`);
                const checkRes = await makeApiRequest(this, 'GET', `/api/messages/check-send/${recipientId}`);

                if (checkRes.data.CheckId) {
                    console.log(`[AutoReply] CheckId получен: ${checkRes.data.CheckId}`);
                    const mailPayload = {
                        CheckId: checkRes.data.CheckId,
                        RecipientAccountId: parseInt(recipientId),
                        Body: msgBody,
                        ReplyForMessageId: null,
                        AttachmentName: null,
                        AttachmentHash: null,
                        AttachmentFile: null
                    };
                    await makeApiRequest(this, 'POST', '/api/messages/send', mailPayload);

                    // Отслеживаем статистику (как письмо)
                    const convData = this.trackConversation(recipientId);
                    const convId = this.getConvId(recipientId);

                    await sendMessageToLababot({
                        botId: this.id,
                        accountDisplayId: this.displayId,
                        recipientId: recipientId,
                        type: 'outgoing', // письмо
                        textContent: msgBody,
                        status: 'success',
                        responseTime: convData.responseTime,
                        isFirst: convData.isFirst,
                        isLast: currentIndex === autoReplies.length - 1,
                        convId: convId,
                        mediaUrl: null,
                        fileName: null,
                        translatorId: this.translatorId,
                        errorReason: null,
                        usedAi: false
                    });

                    this.incrementStat('mail', 'sent');
                    this.log(`🤖 Автоответ #${currentIndex + 1} (письмо) отправлен: ${partnerName}`);

                    // Планируем следующий
                    const nextIndex = currentIndex + 1;
                    if (nextIndex < autoReplies.length) {
                        const nextReply = autoReplies[nextIndex];
                        queueItem.currentIndex = nextIndex;
                        queueItem.timerId = setTimeout(() => {
                            this.sendAutoReply(recipientId);
                        }, nextReply.delay * 1000);
                    } else {
                        this.finishAutoReplyChain(recipientId, partnerName);
                    }
                } else {
                    throw new Error('No CheckId for letter fallback');
                }
            } catch (fallbackErr) {
                console.error(`[AutoReply] Fallback письмо тоже не сработал:`, fallbackErr);
                this.log(`🤖 Ошибка автоответа: ${partnerName}`);
                this.incrementStat('chat', 'errors');
                // Удаляем из очереди при критической ошибке
                delete this.autoReplyQueue[recipientId];
            }
        }
    }

    // Завершить цепочку автоответов
    finishAutoReplyChain(recipientId, partnerName) {
        // Удаляем из очереди
        if (this.autoReplyQueue[recipientId]) {
            clearTimeout(this.autoReplyQueue[recipientId].timerId);
            delete this.autoReplyQueue[recipientId];
        }

        // В ЧС уже добавлен при получении сообщения, просто логируем завершение
        this.log(`🤖 Автоответы завершены для ${partnerName}`);
        console.log(`[AutoReply] Цепочка завершена для ${partnerName}`);
    }

    // Отменить автоответы для пользователя
    cancelAutoReply(recipientId) {
        if (this.autoReplyQueue[recipientId]) {
            clearTimeout(this.autoReplyQueue[recipientId].timerId);
            delete this.autoReplyQueue[recipientId];
            console.log(`[AutoReply] Цепочка отменена для ${recipientId}`);
        }
    }

    // Отменить все автоответы
    cancelAllAutoReplies() {
        for (const recipientId in this.autoReplyQueue) {
            clearTimeout(this.autoReplyQueue[recipientId].timerId);
        }
        this.autoReplyQueue = {};
        console.log(`[AutoReply] Все цепочки отменены`);
    }

    formatElapsedTime(startTime) {
        if (!startTime) return '';
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    updateUI() {
        const isChat = globalMode === 'chat';
        const running = isChat ? this.isChatRunning : this.isMailRunning;
        const startTime = isChat ? this.chatStartTime : this.mailStartTime;
        const stats = isChat ? this.chatStats : this.mailStats;
        const btn = document.getElementById(`btn-start-${this.id}`);

        // Обновляем точки статуса внутри вкладки
        const mailDot = document.querySelector(`#tab-${this.id} .mail-dot`);
        const chatDot = document.querySelector(`#tab-${this.id} .chat-dot`);

        if (mailDot) {
            mailDot.classList.remove('active', 'waiting');
            if (this.isMailRunning) {
                mailDot.classList.add(this.isMailWaiting ? 'waiting' : 'active');
            }
        }

        if (chatDot) {
            chatDot.classList.remove('active', 'waiting');
            if (this.isChatRunning) {
                chatDot.classList.add(this.isChatWaiting ? 'waiting' : 'active');
            }
        }

        if(btn) {
            if(running) {
                const timerStr = this.formatElapsedTime(startTime);
                btn.innerHTML = `<i class="fa fa-stop"></i> ${timerStr}`;
                btn.classList.replace('btn-primary', 'btn-danger');
            } else {
                btn.innerHTML = `<i class="fa fa-paper-plane"></i> Старт`;
                btn.classList.replace('btn-danger', 'btn-primary');
            }
        }
        const s = document.getElementById(`stat-sent-${this.id}`);
        const e = document.getElementById(`stat-err-${this.id}`);
        const w = document.getElementById(`stat-wait-${this.id}`);
        const ig = document.getElementById(`stat-ignored-${this.id}`);
        const hq = document.getElementById(`stat-hotqueue-${this.id}`);
        if(s) s.innerText = stats.sent;
        if(e) e.innerText = stats.errors;
        if(w) w.innerText = "Ожидают: " + stats.waiting;
        // Показываем статистику горячей очереди (только для Mail)
        if(hq) {
            const hotQueueSent = this.mailStats.hotQueueSent || 0;
            hq.innerText = hotQueueSent > 0 ? `🔥${hotQueueSent}` : '';
        }
        // Показываем счетчик игнора в зависимости от режима
        const ignoredList = isChat ? this.ignoredUsersChat : this.ignoredUsersMail;
        if(ig) ig.innerText = "Игнор: " + (ignoredList ? ignoredList.length : 0);
        const activeBox = document.getElementById(`active-invite-${this.id}`);
        if(activeBox) {
            if (isChat) {
                activeBox.classList.add('show');
                const fullText = document.getElementById(`msg-${this.id}`).value;
                const invites = fullText.split(/\n\s*__\s*\n/);
                const idx = this.chatSettings.currentInviteIndex;
                const safeIdx = (idx < invites.length) ? idx : 0;
                const txt = invites[safeIdx] || "(Нет текста)";
                activeBox.innerHTML = `<div class="invite-status-label">Сейчас отправляется (Инвайт ${safeIdx+1}/${invites.length})</div>${txt.replace(/\n/g, '<br>')}`;
            } else activeBox.classList.remove('show');
        }
    }
}
