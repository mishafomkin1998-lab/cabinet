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
        this.mailTimeout = null;
        this.mailStats = { sent: 0, errors: 0, waiting: 0 };
        this.mailHistory = { sent: [], errors: [], waiting: [] };
        this.mailSettings = { target: 'online', speed: 'smart', blacklist: [], photoOnly: false, auto: false };
        this.photoName = null;
        this.mailStartTime = null; // Время начала работы Mail
        this.mailTimerInterval = null; // Интервал обновления таймера Mail

        this.isChatRunning = false;
        this.chatTimeout = null;
        this.chatStats = { sent: 0, errors: 0, waiting: 0 };
        this.chatHistory = { sent: [], errors: [], waiting: [] };
        this.chatSettings = { target: 'payers', speed: 'smart', blacklist: [], rotationHours: 3, cyclic: false, currentInviteIndex: 0, rotationStartTime: 0 };
        this.chatStartTime = null; // Время начала работы Chat
        this.chatTimerInterval = null; // Интервал обновления таймера Chat 
        
        this.vipList = []; 
        this.vipStatus = {}; 
        
        this.unreadChatSessions = []; 
        this.keepAliveTimer = null; 
        this.lababotHeartbeatTimer = null; // Таймер для heartbeat на Lababot сервер
        this.tabColorState = 0;
        this.selectedBlacklistId = null;
        
        this.isMonitoring = false;
        this.lastChatSessions = [];
        this.lastMailId = 0;
        this.myBirthday = null;

        // === Очередь повторов для неотправленных сообщений ===
        this.mailRetryQueue = []; // { user, retryCount, failedAt }
        this.chatRetryQueue = [];
        this.mailContactedUsers = new Set(); // ID пользователей которым уже отправили в этой сессии
        this.chatContactedUsers = new Set();
        this.maxRetries = 3; // Максимум попыток
        this.retryCooldownMs = 60000; // 1 минута между попытками

        // === ДОБАВЛЕНО: Отслеживание диалогов для полной спецификации ===
        this.conversations = {}; // Структура: { recipientId: { firstMessageTime, lastMessageTime, messageCount } }
        this.translatorId = globalSettings.translatorId || null; // ID переводчика из глобальных настроек

        // === ВАЖНОЕ ДОБАВЛЕНИЕ: Создаем WebView для поддержания онлайн ===
        if (this.token) {
            this.startKeepAlive();
            this.startMonitoring();
            this.getProfileData();
            this.createWebview();
            
            // Запускаем heartbeat на сервер Lababot
            this.startLababotHeartbeat();
        }
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
    loadFromServerData(serverData) {
        if (!serverData) return;

        // Загружаем шаблоны
        if (serverData.templatesMail && serverData.templatesMail.length > 0) {
            if (!botTemplates[this.login]) botTemplates[this.login] = { mail: [], chat: [] };
            botTemplates[this.login].mail = serverData.templatesMail;
        }
        if (serverData.templatesChat && serverData.templatesChat.length > 0) {
            if (!botTemplates[this.login]) botTemplates[this.login] = { mail: [], chat: [] };
            botTemplates[this.login].chat = serverData.templatesChat;
        }

        // Загружаем blacklist
        if (serverData.blacklistMail && serverData.blacklistMail.length > 0) {
            this.mailSettings.blacklist = serverData.blacklistMail;
        }
        if (serverData.blacklistChat && serverData.blacklistChat.length > 0) {
            this.chatSettings.blacklist = serverData.blacklistChat;
        }

        // Загружаем статистику
        this.mailStats.sent = serverData.statsMailSent || 0;
        this.mailStats.errors = serverData.statsMailErrors || 0;
        this.chatStats.sent = serverData.statsChatSent || 0;
        this.chatStats.errors = serverData.statsChatErrors || 0;

        console.log(`📥 Данные загружены для ${this.displayId}:`, {
            mailTemplates: botTemplates[this.login]?.mail?.length || 0,
            chatTemplates: botTemplates[this.login]?.chat?.length || 0,
            mailBlacklist: this.mailSettings.blacklist.length,
            chatBlacklist: this.chatSettings.blacklist.length,
            mailStats: this.mailStats,
            chatStats: this.chatStats
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
        const webview = document.createElement('webview');
        webview.id = `webview-${this.id}`;
        webview.src = "https://ladadate.com/login";
        webview.partition = `persist:${this.id}`;
        webview.useragent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

        webview.addEventListener('dom-ready', () => {
            // 0. Отключаем звук в WebView (чтобы не дублировался со звуком бота)
            muteWebview();

            // 1. Внедрение скрипта "Анти-сон" (Keep-Alive)
            webview.executeJavaScript(KEEP_ALIVE_SCRIPT);
            
            // 2. Скрипт авто-входа (если токен есть, все равно создаем сессию)
            const script = `
                setTimeout(() => {
                    const emailInput = document.querySelector('input[name="login"]');
                    const passInput = document.querySelector('input[name="password"]');
                    const btn = document.querySelector('button[type="submit"]');

                    if(emailInput && passInput) {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        
                        nativeInputValueSetter.call(emailInput, "${this.login}");
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                        emailInput.dispatchEvent(new Event('change', { bubbles: true }));

                        nativeInputValueSetter.call(passInput, "${this.pass}");
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
    }

    // Heartbeat на сервер Lababot
    startLababotHeartbeat() {
        // Отправляем первый heartbeat
        setTimeout(() => sendHeartbeatToLababot(this.id, this.displayId, this.token ? 'online' : 'offline'), 1000);
        
        // Потом каждые 30 секунд
        this.lababotHeartbeatTimer = setInterval(() => {
            sendHeartbeatToLababot(this.id, this.displayId, this.token ? 'online' : 'offline');
        }, 30000);
    }

    log(text) {
        const box = document.getElementById(`log-${this.id}`);
        const modePrefix = globalMode === 'chat' ? '[CHAT]' : '[MAIL]';
        if(box) box.innerHTML = `<div><span style="opacity:0.6">${new Date().toLocaleTimeString()}</span> <b>${modePrefix}</b> ${text}</div>` + box.innerHTML;
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
        // Отправляем последний heartbeat оффлайн
        sendHeartbeatToLababot(this.id, this.displayId, 'offline');
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
        } catch(e) { }
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

            if (this.webview) {
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

            // Set для отслеживания partnerId, уведомлённых в этом цикле через ChatRequests
            const notifiedPartnersThisCycle = new Set();

            // === ОБРАБОТКА ChatRequests (новые запросы на чат) ===
            for (const request of chatRequests) {
                const requestId = request.MessageId;
                const partnerId = request.AccountId || "Unknown";
                const partnerName = request.Name || "Неизвестный";
                const messageBody = request.Body || "";
                const isRead = request.IsRead;

                // Уведомляем только о непрочитанных запросах, которые ещё не уведомляли
                if (!isRead && requestId && !this.chatRequestNotified[requestId]) {
                    this.chatRequestNotified[requestId] = now;
                    notifiedPartnersThisCycle.add(partnerId); // Запоминаем partnerId

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
                        type: 'chat'
                    });

                    // Уведомление в логгер + звук
                    console.log(`[Lababot] 🆕 НОВЫЙ ЧАТ! От ${partnerName} (${partnerId}): "${truncatedBody}"`);
                    Logger.add(
                        `🆕 Новый чат от <b>${partnerName}</b>: "${truncatedBody}"`,
                        'chat-request',
                        this.id,
                        { partnerId, partnerName, messageBody: truncatedBody }
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
        try {
            const res = await makeApiRequest(this, 'GET', '/api/messages');
            const msgs = res.data.Messages || [];
            
            if (msgs.length > 0) {
                const newestMsg = msgs[0];
                const newMessages = msgs.filter(m => m.MessageId > this.lastMailId);
                
                newMessages.reverse().forEach(msg => {
                    // Отправляем входящее сообщение на сервер статистики
                    sendIncomingMessageToLababot({
                        botId: this.id,
                        profileId: this.displayId,
                        manId: msg.User.AccountId,
                        manName: msg.User.Name,
                        messageId: msg.MessageId,
                        type: 'letter'
                    });

                    if (!msg.IsReplied) {
                        Logger.add(
                            `💌 Входящее письмо от <b>${msg.User.Name || `ID ${msg.User.AccountId}`}</b> (Ждет ответа)`,
                            'mail',
                            this.id,
                            { partnerId: msg.User.AccountId, partnerName: msg.User.Name, messageId: msg.MessageId }
                        );
                        // playSound('message') убран - Logger.add уже воспроизводит звук для type='mail'
                    }
                });

                if (newestMsg.MessageId > this.lastMailId) {
                    this.lastMailId = newestMsg.MessageId;
                }
            }
        } catch(e) {}
        finally {
            const nextRun = Math.floor(Math.random() * (75000 - 45000 + 1)) + 45000;
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
        } catch (e) {}
    }

    async startMail(text) {
        if(!this.token) return;

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
        this.startMailTimer();
        this.updateUI();
        this.log(`🚀 MAIL Started`);
        this.scheduleNextMail(text, 0);
    }

    stopMail() {
        this.isMailRunning = false;
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
            let nextDelay = 15000;
            if (this.mailSettings.speed === 'smart') nextDelay = Math.floor(Math.random() * (120000 - 15000 + 1)) + 15000;
            else nextDelay = parseInt(this.mailSettings.speed) * 1000;
            this.mailStats.waiting = Math.floor(300000 / nextDelay);
            this.updateUI();
            this.scheduleNextMail(text, nextDelay);
        }, delay);
    }

    async processMailUser(msgTemplate) {
        let user = null;
        let msgBody = '';
        let isRetryAttempt = false;
        let currentRetryItem = null;
        try {
            const target = this.mailSettings.target;
            let users = [];

            if (target === 'custom-ids') {
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
                        this.log(`⚠️ Переход на ${newTarget}`);
                        this.mailSettings.target = newTarget;
                        this.mailContactedUsers.clear();
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
                const messagesRes = await makeApiRequest(this, 'GET', '/api/messages');
                const unrepliedMsgs = (messagesRes.data.Messages || []).filter(m => !m.IsReplied);

                if (unrepliedMsgs.length > 0) {
                    const msg = unrepliedMsgs[Math.floor(Math.random() * unrepliedMsgs.length)];
                    users.push({
                        AccountId: msg.User.AccountId,
                        Name: msg.User.Name,
                        City: msg.User.City,
                        Age: msg.User.Age,
                        Country: msg.User.Country,
                        ProfilePhoto: msg.User.ProfilePhoto,
                        messageToReply: msg.MessageId
                    });
                }
            } else {
                let apiPath = `/api/users/${target}`;
                const usersRes = await makeApiRequest(this, 'GET', apiPath);
                users = usersRes.data.Users || [];
                if (target === 'online') {
                    this.log(`📊 Online users: ${users.length}`);
                    this.lastOnlineCount = users.length; // Сохраняем для глобального счётчика
                    console.log(`🔍 DEBUG Online API response:`, JSON.stringify(usersRes.data, null, 2));
                    if (users.length > 0) {
                        console.log(`🔍 DEBUG First online user:`, JSON.stringify(users[0], null, 2));
                    }
                }
            }

            // Фильтруем: убираем тех кому уже отправили и кто в ЧС
            users = users.filter(u =>
                !this.mailContactedUsers.has(u.AccountId.toString()) &&
                !this.mailSettings.blacklist.includes(u.AccountId.toString()) &&
                (!this.mailSettings.photoOnly || u.ProfilePhoto)
            );

            // Если новых пользователей нет - пробуем очередь повторов
            if (users.length === 0) {
                const now = Date.now();
                const readyForRetry = this.mailRetryQueue.filter(item =>
                    now - item.failedAt >= this.retryCooldownMs &&
                    item.retryCount < this.maxRetries
                );

                if (readyForRetry.length > 0) {
                    currentRetryItem = readyForRetry[Math.floor(Math.random() * readyForRetry.length)];
                    user = currentRetryItem.user;
                    currentRetryItem.retryCount++;
                    currentRetryItem.failedAt = now;
                    isRetryAttempt = true;
                    this.log(`🔄 Повтор для ${user.Name} (попытка ${currentRetryItem.retryCount}/${this.maxRetries})`);
                } else if (this.mailRetryQueue.some(item => item.retryCount < this.maxRetries)) {
                    // Есть пользователи в очереди, но cooldown ещё не прошёл
                    this.log(`⏳ Ожидание cooldown для повторов...`);
                    return;
                } else {
                    // Проверяем auto режим
                    if(this.mailSettings.auto && target !== 'online') {
                        // Используем getNextActiveStatus для пропуска отключенных статусов
                        const newTarget = getNextActiveStatus(target);
                        this.log(`⚠️ Нет пользователей (${target}). Переход на ${newTarget}`);
                        this.mailSettings.target = newTarget;
                        // Очищаем contacted при смене категории
                        this.mailContactedUsers.clear();
                        this.mailRetryQueue = [];
                        if(activeTabId === this.id) document.getElementById(`target-select-${this.id}`).value = newTarget;
                        return this.processMailUser(msgTemplate);
                    } else {
                        this.log(`⏳ Нет пользователей для отправки. Ожидание...`);
                        return;
                    }
                }
            } else {
                user = users[Math.floor(Math.random() * users.length)];
            }

            msgBody = this.replaceMacros(msgTemplate, user);
            const checkRes = await makeApiRequest(this, 'GET', `/api/messages/check-send/${user.AccountId}`);

            // DEBUG: Log check-send response for online users
            if (target === 'online') {
                console.log(`🔍 DEBUG check-send for ${user.AccountId}:`, JSON.stringify(checkRes.data, null, 2));
            }

            if (checkRes.data.CheckId) {
                const payload = { 
                    CheckId: checkRes.data.CheckId, 
                    RecipientAccountId: user.AccountId, 
                    Body: msgBody, 
                    ReplyForMessageId: user.messageToReply || null, 
                    AttachmentName: this.photoName, AttachmentHash: null, AttachmentFile: null 
                };
                
                // 1. Отправляем на Ladadate
                await makeApiRequest(this, 'POST', '/api/messages/send', payload);

                // 2. Отслеживаем диалог и получаем метаданные
                const convData = this.trackConversation(user.AccountId);
                const convId = this.getConvId(user.AccountId);

                // 3. Отправляем полную статистику на НАШ сервер Lababot
                // DEBUG: Проверка флага usedAi перед отправкой
                console.log(`🔍 DEBUG Mail: this.usedAi = ${this.usedAi}, this.id = ${this.id}`);

                const lababotResult = await sendMessageToLababot({
                    botId: this.id,
                    accountDisplayId: this.displayId,
                    recipientId: user.AccountId,
                    type: 'outgoing', // Письмо = $1.5
                    textContent: msgBody,
                    status: 'success',
                    responseTime: convData.responseTime,
                    isFirst: convData.isFirst,
                    isLast: false, // Письма обычно не имеют явного "последнего"
                    convId: convId,
                    mediaUrl: this.photoName ? `attached_photo_${this.photoName}` : null,
                    fileName: this.photoName || null,
                    translatorId: this.translatorId,
                    errorReason: null,
                    usedAi: this.usedAi || false
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
                this.mailHistory.sent.push(`${user.AccountId} (${user.Name})`);
                this.log(`✅ Письмо отправлено: ${user.Name}`);

                // Добавляем в "отправленные" и убираем из очереди повторов
                this.mailContactedUsers.add(user.AccountId.toString());

                // Отмечаем Custom ID как отправленный (если это custom-ids режим)
                if (this.mailSettings.target === 'custom-ids') {
                    markCustomIdSent(this.id, user.AccountId.toString());
                }

                if (isRetryAttempt) {
                    this.mailRetryQueue = this.mailRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                }
            } else {
                // Нет CheckId - считаем как ошибку
                const errorReason = checkRes.data?.Message || checkRes.data?.Error || 'нет CheckId';
                this.incrementStat('mail', 'errors');
                this.mailHistory.errors.push(`${user.AccountId}: ${errorReason}`);
                this.log(`❌ Ошибка: не могу отправить письмо ${user.Name} (${user.AccountId}): ${errorReason}`);

                // Добавляем в очередь повторов (если не retry или retry ещё не исчерпан)
                if (!isRetryAttempt) {
                    this.mailRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                } else if (currentRetryItem && currentRetryItem.retryCount >= this.maxRetries) {
                    this.mailRetryQueue = this.mailRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                    this.log(`🚫 Отказ от ${user.Name} после ${this.maxRetries} попыток`);
                }

                // Отправляем ошибку на сервер (с защитой от падения)
                try {
                    await sendErrorToLababot(
                        this.id,
                        this.displayId,
                        'mail_no_checkid',
                        errorReason
                    );
                } catch (err) { console.error('sendErrorToLababot failed:', err); }

                // Также через message_sent API с status='failed'
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
        } catch (e) {
            if(e.message === "Network Error" || !e.response) {
                this.log(`📡 Ошибка сети. Повторная попытка...`);
            } else if (e.response && e.response.status === 403) {
                // 403 = пользователь заблокирован или ограничение - СЧИТАЕМ КАК ОШИБКУ
                const errorReason = e.response?.data?.Error || e.response?.data?.Message || 'Доступ запрещён (403)';
                this.incrementStat('mail', 'errors');
                this.mailHistory.errors.push(`${user?.AccountId || 'unknown'}: ${errorReason}`);
                this.log(`❌ Ошибка: ${user?.Name || user?.AccountId || 'unknown'} - ${errorReason}`);

                // Добавляем в очередь повторов
                if (user && user.AccountId) {
                    if (!isRetryAttempt) {
                        this.mailRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                    } else if (currentRetryItem && currentRetryItem.retryCount >= this.maxRetries) {
                        this.mailRetryQueue = this.mailRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                        this.log(`🚫 Отказ от ${user.Name} после ${this.maxRetries} попыток`);
                    }
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
                this.mailHistory.errors.push(e.message);

                // Добавляем в очередь повторов
                if (user && user.AccountId) {
                    if (!isRetryAttempt) {
                        this.mailRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                    } else if (currentRetryItem && currentRetryItem.retryCount >= this.maxRetries) {
                        this.mailRetryQueue = this.mailRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                        this.log(`🚫 Отказ от ${user.Name} после ${this.maxRetries} попыток`);
                    }
                }

                // Отправляем ошибку на наш сервер через старый API (с защитой от падения)
                try {
                    await sendErrorToLababot(
                        this.id,
                        this.displayId,
                        'mail_send_error',
                        e.response?.data?.Error || e.message
                    );
                } catch (err) { console.error('sendErrorToLababot failed:', err); }

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
                            errorReason: e.response?.data?.Error || e.message,
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

        if (this.chatSettings.rotationStartTime === 0) this.chatSettings.rotationStartTime = Date.now();
        this.isChatRunning = true;
        this.chatStartTime = Date.now();
        this.startChatTimer();
        this.updateUI();
        this.log(`🚀 CHAT Started`);
        this.scheduleNextChat(fullText, 0);
        saveSession();
    }

    stopChat() {
        this.isChatRunning = false;
        clearTimeout(this.chatTimeout);
        this.stopChatTimer();
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
            let nextDelay = 15000;
            if (this.chatSettings.speed === 'smart') nextDelay = Math.floor(Math.random() * (120000 - 15000 + 1)) + 15000;
            else nextDelay = parseInt(this.chatSettings.speed) * 1000;
            this.chatStats.waiting = Math.floor(300000 / nextDelay);
            this.updateUI();
            this.scheduleNextChat(fullText, nextDelay);
        }, delay);
    }
    async processChatUser(fullText) {
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
                    this.log("⏹ Все инвайты отправлены. Остановка."); 
                    this.stopChat(); 
                    return; 
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
        let isRetryAttempt = false;
        let currentRetryItem = null;

        try {
            const target = this.chatSettings.target;
            let apiPath = '/api/users/online';
            if (target === 'payers') apiPath = '/api/users/payers';

            const usersRes = await makeApiRequest(this, 'GET', apiPath);
            let users = usersRes.data.Users || [];

            // Фильтруем: убираем тех кому уже отправили и кто в ЧС
            users = users.filter(u =>
                !this.chatContactedUsers.has(u.AccountId.toString()) &&
                !this.chatSettings.blacklist.includes(u.AccountId.toString())
            );

            // Если новых пользователей нет - пробуем очередь повторов
            if (users.length === 0) {
                const now = Date.now();
                const readyForRetry = this.chatRetryQueue.filter(item =>
                    now - item.failedAt >= this.retryCooldownMs &&
                    item.retryCount < this.maxRetries
                );

                if (readyForRetry.length > 0) {
                    currentRetryItem = readyForRetry[Math.floor(Math.random() * readyForRetry.length)];
                    user = currentRetryItem.user;
                    currentRetryItem.retryCount++;
                    currentRetryItem.failedAt = now;
                    isRetryAttempt = true;
                    this.log(`🔄 Повтор чата для ${user.Name} (попытка ${currentRetryItem.retryCount}/${this.maxRetries})`);
                } else if (this.chatRetryQueue.some(item => item.retryCount < this.maxRetries)) {
                    this.log(`⏳ Ожидание cooldown для повторов...`);
                    return;
                } else {
                    this.log(`💬 Нет пользователей в категории ${target}.`);
                    return;
                }
            } else {
                user = users[Math.floor(Math.random() * users.length)];
            }

            let msgBody = this.replaceMacros(currentMsgTemplate, user);
            
            try {
                // 1. Пытаемся отправить через чат API
                const payload = { recipientId: user.AccountId, body: msgBody };
                await makeApiRequest(this, 'POST', '/chat-send', payload);

                // 2. Отслеживаем диалог и получаем метаданные
                const convData = this.trackConversation(user.AccountId);
                const convId = this.getConvId(user.AccountId);
                const isLast = this.isLastMessageInRotation();

                // 3. Отправляем полную статистику на НАШ сервер Lababot
                // DEBUG: Проверка флага usedAi перед отправкой
                console.log(`🔍 DEBUG Chat: this.usedAi = ${this.usedAi}, this.id = ${this.id}`);

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
                this.chatHistory.sent.push(`${user.AccountId} (${user.Name})`);
                this.log(`💬 Сообщение чата отправлено: ${user.Name}`);

                // Добавляем в "отправленные" и убираем из очереди повторов
                this.chatContactedUsers.add(user.AccountId.toString());
                if (isRetryAttempt) {
                    this.chatRetryQueue = this.chatRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                }

            } catch (chatErr) {
                // Fallback: пытаемся отправить как письмо
                try {
                    const checkRes = await makeApiRequest(this, 'GET', `/api/messages/check-send/${user.AccountId}`);
                    if (checkRes.data.CheckId) {
                        const mailPayload = { 
                            CheckId: checkRes.data.CheckId, 
                            RecipientAccountId: user.AccountId, 
                            Body: msgBody, 
                            ReplyForMessageId: null, 
                            AttachmentName: null, 
                            AttachmentHash: null, 
                            AttachmentFile: null 
                        };
                        await makeApiRequest(this, 'POST', '/api/messages/send', mailPayload);

                        // Отслеживаем диалог и получаем метаданные (fallback)
                        const convData = this.trackConversation(user.AccountId);
                        const convId = this.getConvId(user.AccountId);

                        // Отправляем полную статистику на НАШ сервер Lababot (как письмо fallback)
                        const lababotResult = await sendMessageToLababot({
                            botId: this.id,
                            accountDisplayId: this.displayId,
                            recipientId: user.AccountId,
                            type: 'outgoing', // Fallback как письмо = $1.5
                            textContent: msgBody,
                            status: 'success',
                            responseTime: convData.responseTime,
                            isFirst: convData.isFirst,
                            isLast: false,
                            convId: convId,
                            mediaUrl: null,
                            fileName: null,
                            translatorId: this.translatorId,
                            errorReason: null,
                            usedAi: this.usedAi || false
                        });

                        if (!lababotResult.success) {
                            console.warn(`⚠️ Не удалось отправить статистику на Lababot (fallback): ${lababotResult.error}`);
                        }
                        
                        this.incrementStat('chat', 'sent');
                        this.chatHistory.sent.push(`${user.AccountId} (${user.Name})`);
                        this.log(`💬 Сообщение отправлено через письмо (fallback): ${user.Name}`);

                        // Добавляем в "отправленные" и убираем из очереди повторов
                        this.chatContactedUsers.add(user.AccountId.toString());
                        if (isRetryAttempt) {
                            this.chatRetryQueue = this.chatRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                        }
                    } else {
                        // Нет CheckId в fallback - СЧИТАЕМ КАК ОШИБКУ
                        const errorReason = checkRes.data?.Message || checkRes.data?.Error || 'нет CheckId (fallback)';
                        this.incrementStat('chat', 'errors');
                        this.chatHistory.errors.push(`${user.AccountId}: ${errorReason}`);
                        this.log(`❌ Ошибка: не могу отправить чат ${user.Name} (${user.AccountId}): ${errorReason}`);

                        // Добавляем в очередь повторов
                        if (!isRetryAttempt) {
                            this.chatRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                        } else if (currentRetryItem && currentRetryItem.retryCount >= this.maxRetries) {
                            this.chatRetryQueue = this.chatRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                            this.log(`🚫 Отказ от ${user.Name} после ${this.maxRetries} попыток`);
                        }

                        // Отправляем ошибку на сервер
                        await sendErrorToLababot(
                            this.id,
                            this.displayId,
                            'chat_no_checkid',
                            errorReason
                        );

                        // Также через message_sent API с status='failed'
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
                } catch(fallbackErr) {
                    if(fallbackErr.message === "Network Error" || !fallbackErr.response) {
                        this.log(`📡 Ошибка сети при отправке чата. Повтор...`);
                    } else {
                        // СЧИТАЕМ КАК ОШИБКУ
                        const errorReason = fallbackErr.response?.data?.Error || fallbackErr.message;
                        this.incrementStat('chat', 'errors');
                        this.chatHistory.errors.push(`${user.AccountId}: ${errorReason}`);
                        this.log(`❌ Ошибка API чата: ${errorReason}`);

                        // Добавляем в очередь повторов
                        if (user && user.AccountId) {
                            if (!isRetryAttempt) {
                                this.chatRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                            } else if (currentRetryItem && currentRetryItem.retryCount >= this.maxRetries) {
                                this.chatRetryQueue = this.chatRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                                this.log(`🚫 Отказ от ${user.Name} после ${this.maxRetries} попыток`);
                            }
                        }

                        // Отправляем ошибку на наш сервер через старый API
                        await sendErrorToLababot(
                            this.id,
                            this.displayId,
                            'chat_send_error',
                            fallbackErr.response?.data?.Error || fallbackErr.message
                        );

                        // НОВОЕ: Отправляем также через message_sent API с status='failed'
                        if (user && user.AccountId) {
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
                                errorReason: fallbackErr.response?.data?.Error || fallbackErr.message
                            });
                        }
                    }
                }
            }
        } catch (e) {
            if(e.message === "Network Error" || !e.response) {
                this.log(`📡 Ошибка сети. Повтор...`);
            } else {
                this.incrementStat('chat', 'errors');
                this.chatHistory.errors.push(e.message);

                // Добавляем в очередь повторов
                if (user && user.AccountId) {
                    if (!isRetryAttempt) {
                        this.chatRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                    } else if (currentRetryItem && currentRetryItem.retryCount >= this.maxRetries) {
                        this.chatRetryQueue = this.chatRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                        this.log(`🚫 Отказ от ${user.Name} после ${this.maxRetries} попыток`);
                    }
                }
                
                // Отправляем ошибку на наш сервер
                await sendErrorToLababot(
                    this.id,
                    this.displayId,
                    'chat_process_error',
                    e.response?.data?.Error || e.message
                );
            }
        }
        this.updateUI();
    }

    replaceMacros(text, user) {
        if(!text) return "";
        let res = text;
        res = res.replace(/{city}/gi, user.City || "your city").replace(/{name}/gi, user.Name || "dear").replace(/{age}/gi, user.Age || "").replace(/{country}/gi, user.Country || "your country");
        return res;
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
        const dot = document.querySelector(`#tab-${this.id} .status-dot`);
        if(btn) {
            if(running) {
                const timerStr = this.formatElapsedTime(startTime);
                btn.innerHTML = `<i class="fa fa-stop"></i> ${timerStr}`;
                btn.classList.replace('btn-primary', 'btn-danger');
                if(dot) dot.style.boxShadow = "0 0 8px #28a745";
            } else {
                btn.innerHTML = `<i class="fa fa-paper-plane"></i> Старт`;
                btn.classList.replace('btn-danger', 'btn-primary');
                if(dot) dot.style.boxShadow = "none";
            }
        }
        const s = document.getElementById(`stat-sent-${this.id}`);
        const e = document.getElementById(`stat-err-${this.id}`);
        const w = document.getElementById(`stat-wait-${this.id}`);
        if(s) s.innerText = stats.sent;
        if(e) e.innerText = stats.errors;
        if(w) w.innerText = "Ожидают: " + stats.waiting;
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
