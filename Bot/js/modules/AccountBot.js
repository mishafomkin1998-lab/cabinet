/**
 * AccountBot.js - Класс бота
 * Ядро бота - управление анкетой, отправка сообщений, мониторинг
 */

// ============================================================================
// КЛАСС ACCOUNTBOT
// ============================================================================

class AccountBot {
    constructor(id, login, pass, displayId, token) {
        // Идентификаторы
        this.id = id;                  // 'bot_1234567890'
        this.login = login;            // email
        this.pass = pass;              // пароль
        this.displayId = displayId;    // ID анкеты (напр. "12345")
        this.token = token;            // Bearer token для API

        // Настройки Mail режима
        this.mailSettings = {
            target: 'online',          // 'online', 'favorites', 'my-favorites', 'inbox', 'payers'
            speed: 'smart',            // 'smart', '15', '30' (секунды)
            blacklist: [],
            photoOnly: false,
            auto: false                // Автопереключение категорий
        };

        // Настройки Chat режима
        this.chatSettings = {
            target: 'payers',
            speed: 'smart',
            blacklist: [],
            rotationHours: 3,          // Смена инвайта каждые N часов
            cyclic: false,             // Циклическая ротация
            currentInviteIndex: 0,
            rotationStartTime: 0
        };

        // Статистика
        this.mailStats = { sent: 0, errors: 0, waiting: 0 };
        this.chatStats = { sent: 0, errors: 0, waiting: 0 };
        this.mailHistory = { sent: [], errors: [], waiting: [] };
        this.chatHistory = { sent: [], errors: [], waiting: [] };

        // Состояние
        this.isMailRunning = false;
        this.isChatRunning = false;
        this.isMonitoring = false;
        this.mailStartTime = null;
        this.chatStartTime = null;

        // Таймеры
        this.mailTimeout = null;
        this.chatTimeout = null;
        this.mailTimerInterval = null;
        this.chatTimerInterval = null;
        this.keepAliveTimer = null;
        this.lababotHeartbeatTimer = null;

        // Отслеживание отправленных
        this.mailContactedUsers = new Set();
        this.chatContactedUsers = new Set();
        this.mailRetryQueue = [];
        this.chatRetryQueue = [];
        this.maxRetries = 3;
        this.retryCooldownMs = 60000;

        // Отслеживание диалогов
        this.conversations = {};

        // VIP и Blacklist
        this.vipList = [];
        this.vipStatus = {};
        this.selectedBlacklistId = null;

        // Уведомления (cooldown)
        this.chatNotifyTimes = {};
        this.chatRequestNotified = {};
        this.activeChatSoundTimes = {};

        // Шаблоны
        this.lastTplMail = null;
        this.lastTplChat = null;

        // Прочее
        this.webview = null;
        this.photoName = null;
        this.myBirthday = null;
        this.tabColorState = 0;
        this.usedAi = false;
        this.translatorId = null;
        this.proxyPosition = null;
        this.lastMailId = 0;

        // Инициализация
        this.createWebview();
        this.startKeepAlive();
        this.startMonitoring();
        this.startLababotHeartbeat();
        this.getProfileData();
    }

    // ========================================================================
    // WEBVIEW И СЕССИЯ
    // ========================================================================

    createWebview() {
        const webview = document.createElement('webview');
        webview.id = `webview-${this.id}`;
        webview.src = "https://ladadate.com/login";
        webview.partition = `persist:${this.id}`;
        webview.useragent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        // Функция для отключения звука
        const muteWebview = () => {
            if (webview.setAudioMuted) {
                webview.setAudioMuted(true);
            }
            webview.executeJavaScript(`
                if (!window.__audioMuted) {
                    window.__audioMuted = true;
                    Audio.prototype.play = function() { return Promise.resolve(); };
                    HTMLMediaElement.prototype.play = function() { return Promise.resolve(); };
                }
            `).catch(() => {});
        };

        webview.addEventListener('did-finish-load', muteWebview);

        webview.addEventListener('dom-ready', () => {
            muteWebview();
            webview.executeJavaScript(KEEP_ALIVE_SCRIPT);

            // Автологин
            const script = `
                setTimeout(() => {
                    const emailInput = document.querySelector('input[name="login"]');
                    const passInput = document.querySelector('input[name="password"]');
                    const btn = document.querySelector('button[type="submit"]');
                    if(emailInput && passInput) {
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        setter.call(emailInput, "${this.login}");
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                        setter.call(passInput, "${this.pass}");
                        passInput.dispatchEvent(new Event('input', { bubbles: true }));
                        if(btn) setTimeout(() => btn.click(), 500);
                    }
                }, 2000);
            `;
            webview.executeJavaScript(script);
        });

        document.getElementById('browsers-container').appendChild(webview);
        this.webview = webview;
    }

    // ========================================================================
    // HEARTBEAT И KEEP-ALIVE
    // ========================================================================

    startLababotHeartbeat() {
        setTimeout(() => sendHeartbeatToLababot(this.id, this.displayId, this.token ? 'online' : 'offline'), 1000);
        this.lababotHeartbeatTimer = setInterval(() => {
            sendHeartbeatToLababot(this.id, this.displayId, this.token ? 'online' : 'offline');
        }, 30000);
    }

    startKeepAlive() {
        this.doActivity();
        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => { this.doActivity(); }, 60000);
    }

    async doActivity() {
        if (!this.token) return;
        try {
            await makeApiRequest(this, 'POST', '/chat-sync', {});
            const res = await makeApiRequest(this, 'GET', '/api/users/online');
            if (res.data.Users) {
                const el = document.getElementById(`online-${this.id}`);
                if (el) el.innerText = res.data.Users.length;
            }
        } catch (e) {}
    }

    // ========================================================================
    // МОНИТОРИНГ
    // ========================================================================

    startMonitoring() {
        this.isMonitoring = true;
        this.checkChatSync();
        this.checkNewMails();
        this.checkVipStatus();
    }

    stopMonitoring() {
        this.isMonitoring = false;
        if (this.lababotHeartbeatTimer) {
            clearInterval(this.lababotHeartbeatTimer);
            this.lababotHeartbeatTimer = null;
        }
        sendHeartbeatToLababot(this.id, this.displayId, 'offline');
    }

    async checkVipStatus() {
        if (!this.token || !this.isMonitoring) return;

        for (const vipId of this.vipList) {
            try {
                const res = await makeApiRequest(this, 'GET', `/api/messages/check-send/${vipId}`);
                const isOnline = !!res.data.CheckId;
                const oldStatus = this.vipStatus[vipId] || 'offline';
                const status = isOnline ? 'online' : 'offline';

                if (status === 'online' && oldStatus !== 'online') {
                    Logger.add(`VIP Клиент ID ${vipId} теперь ONLINE!`, 'vip-online', this.id, { partnerId: vipId });
                }
                this.vipStatus[vipId] = status;
            } catch (e) {
                this.vipStatus[vipId] = 'offline';
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        const nextRun = Math.floor(Math.random() * (75000 - 45000 + 1)) + 45000;
        if (this.isMonitoring) setTimeout(() => this.checkVipStatus(), nextRun);
    }

    async checkChatSync() {
        if (!this.token || !this.isMonitoring) return;

        try {
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
                                try { return { success: true, data: JSON.parse(text) }; }
                                catch { return { success: false, error: 'Not JSON' }; }
                            } catch (e) { return { success: false, error: e.message }; }
                        })()
                    `);
                    if (result.success) data = result.data;
                } catch (e) {}
            }

            if (!data) {
                const res = await makeApiRequest(this, 'POST', '/chat-sync', {});
                if (typeof res?.data === 'object') data = res.data;
            }

            if (!data) return;

            const currentSessions = data.ChatSessions || [];
            const chatRequests = data.ChatRequests || [];
            const now = Date.now();
            const NOTIFY_COOLDOWN = 30000;
            const ACTIVE_CHAT_SOUND_INTERVAL = 15000;

            if (!this.chatNotifyTimes) this.chatNotifyTimes = {};
            if (!this.chatRequestNotified) this.chatRequestNotified = {};
            if (!this.activeChatSoundTimes) this.activeChatSoundTimes = {};

            const notifiedPartnersThisCycle = new Set();

            // Обработка ChatRequests
            for (const request of chatRequests) {
                const requestId = request.MessageId;
                const partnerId = request.AccountId || "Unknown";
                const partnerName = request.Name || "Неизвестный";
                const messageBody = request.Body || "";
                const isRead = request.IsRead;

                if (!isRead && requestId && !this.chatRequestNotified[requestId]) {
                    this.chatRequestNotified[requestId] = now;
                    notifiedPartnersThisCycle.add(partnerId);

                    const truncatedBody = messageBody.length > 50 ? messageBody.substring(0, 50) + '...' : messageBody;

                    sendIncomingMessageToLababot({
                        botId: this.id,
                        profileId: this.displayId,
                        manId: partnerId,
                        manName: partnerName,
                        messageId: requestId,
                        type: 'chat'
                    });

                    Logger.add(`Новый чат от <b>${partnerName}</b>: "${truncatedBody}"`, 'chat-request', this.id, { partnerId, partnerName, messageBody: truncatedBody });
                }
            }

            // Очистка старых записей
            for (const msgId in this.chatRequestNotified) {
                if (now - this.chatRequestNotified[msgId] > 300000) {
                    delete this.chatRequestNotified[msgId];
                }
            }

            // Обработка ChatSessions
            for (const session of currentSessions) {
                const sessionId = session.AccountId || session.Id || session.ChatId;
                const hasUnread = session.IsMessage === true || (session.UnreadMessageCount || 0) > 0;
                const partnerId = session.AccountId || session.TargetUserId || session.PartnerId || "Unknown";
                const partnerName = session.Name || "Неизвестный";
                const chatMinutes = session.ChatMinutes || 0;

                if (notifiedPartnersThisCycle.has(partnerId)) continue;

                if (hasUnread && sessionId) {
                    const lastNotify = this.chatNotifyTimes[sessionId] || 0;
                    const lastSound = this.activeChatSoundTimes[sessionId] || 0;

                    if (now - lastNotify >= NOTIFY_COOLDOWN) {
                        this.chatNotifyTimes[sessionId] = now;
                        this.activeChatSoundTimes[sessionId] = now;

                        sendIncomingMessageToLababot({
                            botId: this.id,
                            profileId: this.displayId,
                            manId: partnerId,
                            manName: partnerName,
                            messageId: `chat_${sessionId}_${now}`,
                            type: 'chat'
                        });

                        Logger.add(`Сообщение в чате с <b>${partnerName}</b> (${chatMinutes} мин)`, 'chat', this.id, { partnerId, partnerName });
                    } else if (now - lastSound >= ACTIVE_CHAT_SOUND_INTERVAL) {
                        this.activeChatSoundTimes[sessionId] = now;
                        playSound('chat');
                    }
                } else if (!hasUnread && sessionId) {
                    delete this.chatNotifyTimes[sessionId];
                    delete this.activeChatSoundTimes[sessionId];
                }
            }
        } catch (e) {
            console.error('[Lababot] checkChatSync error:', e);
        } finally {
            const nextRun = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
            if (this.isMonitoring) setTimeout(() => this.checkChatSync(), nextRun);
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
                    sendIncomingMessageToLababot({
                        botId: this.id,
                        profileId: this.displayId,
                        manId: msg.User.AccountId,
                        manName: msg.User.Name,
                        messageId: msg.MessageId,
                        type: 'letter'
                    });

                    if (!msg.IsReplied) {
                        Logger.add(`Входящее письмо от <b>${msg.User.Name || `ID ${msg.User.AccountId}`}</b> (Ждет ответа)`, 'mail', this.id, { partnerId: msg.User.AccountId, partnerName: msg.User.Name, messageId: msg.MessageId });
                    }
                });

                if (newestMsg.MessageId > this.lastMailId) {
                    this.lastMailId = newestMsg.MessageId;
                }
            }
        } catch (e) {}
        finally {
            const nextRun = Math.floor(Math.random() * (75000 - 45000 + 1)) + 45000;
            if (this.isMonitoring) setTimeout(() => this.checkNewMails(), nextRun);
        }
    }

    async getProfileData() {
        try {
            const res = await makeApiRequest(this, 'GET', '/my-profile-preview');
            const html = res.data;
            const regex = /Birthday<\/div>[\s\S]*?<div[^>]*>\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})\s*<\/div>/i;
            const match = html.match(regex);
            if (match && match[1]) {
                this.myBirthday = match[1];
                this.checkBirthdayComing();
            }
        } catch (e) {}
    }

    checkBirthdayComing() {
        if (!this.myBirthday) return;
        const bDate = new Date(this.myBirthday);
        const today = new Date();
        const bDayThisYear = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
        const diff = (bDayThisYear - today) / (1000 * 60 * 60 * 24);
        if (diff > 0 && diff <= 3) {
            Logger.add(`День рождения через ${Math.ceil(diff)}д!`, 'bday', this.id);
        }
    }

    // ========================================================================
    // ОТСЛЕЖИВАНИЕ ДИАЛОГОВ
    // ========================================================================

    trackConversation(recipientId) {
        if (!this.conversations[recipientId]) {
            this.conversations[recipientId] = {
                firstMessageTime: Date.now(),
                lastMessageTime: Date.now(),
                messageCount: 1
            };
            return { isFirst: true, responseTime: null };
        } else {
            const conv = this.conversations[recipientId];
            const responseTimeMs = Date.now() - conv.lastMessageTime;
            conv.lastMessageTime = Date.now();
            conv.messageCount++;
            return { isFirst: false, responseTime: millisecondsToInterval(responseTimeMs) };
        }
    }

    getConvId(recipientId) {
        return generateConvId(this.id, recipientId);
    }

    isLastMessageInRotation() {
        if (globalMode !== 'chat') return false;
        const { rotationHours, rotationStartTime } = this.chatSettings;
        if (!rotationStartTime) return false;
        const elapsedMs = Date.now() - rotationStartTime;
        const rotationMs = rotationHours * 60 * 60 * 1000;
        return elapsedMs >= rotationMs;
    }

    // ========================================================================
    // MAIL РЕЖИМ
    // ========================================================================

    async startMail(text) {
        if (!this.token) return;

        const profileStatus = await checkProfileStatus(this.displayId);
        if (!profileStatus.allowed || !profileStatus.exists) {
            this.log(`Анкета не найдена в системе личного кабинета`);
            alert(`Анкета ${this.displayId} не добавлена в личный кабинет.`);
            return;
        }
        if (profileStatus.paused) {
            this.log(`Рассылка заблокирована - анкета приостановлена`);
            alert(`Анкета ${this.displayId} приостановлена в личном кабинете.`);
            return;
        }

        const paymentStatus = await checkProfilePaymentStatus(this.displayId);
        if (!paymentStatus.isPaid && !paymentStatus.isFree) {
            this.log(`Рассылка заблокирована - анкета не оплачена`);
            const dialogResult = await showPaymentDialog(this.displayId, paymentStatus.canTrial);
            if (dialogResult.action !== 'trial_activated') return;
            this.log(`Trial активирован, запускаем рассылку`);
        }

        this.isMailRunning = true;
        this.mailStartTime = Date.now();
        this.startMailTimer();
        this.updateUI();
        this.log(`MAIL Started`);
        this.scheduleNextMail(text, 0);
    }

    stopMail() {
        this.isMailRunning = false;
        clearTimeout(this.mailTimeout);
        this.stopMailTimer();
        this.log("MAIL Stopped");
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

    async processMailUser(msgTemplate) {
        let user = null;
        let msgBody = '';
        let isRetryAttempt = false;
        let currentRetryItem = null;

        try {
            const target = this.mailSettings.target;
            let users = [];

            if (target === 'inbox') {
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
            }

            users = users.filter(u =>
                !this.mailContactedUsers.has(u.AccountId.toString()) &&
                !this.mailSettings.blacklist.includes(u.AccountId.toString()) &&
                (!this.mailSettings.photoOnly || u.ProfilePhoto)
            );

            if (users.length === 0) {
                const now = Date.now();
                const readyForRetry = this.mailRetryQueue.filter(item =>
                    now - item.failedAt >= this.retryCooldownMs && item.retryCount < this.maxRetries
                );

                if (readyForRetry.length > 0) {
                    currentRetryItem = readyForRetry[Math.floor(Math.random() * readyForRetry.length)];
                    user = currentRetryItem.user;
                    currentRetryItem.retryCount++;
                    currentRetryItem.failedAt = now;
                    isRetryAttempt = true;
                    this.log(`Повтор для ${user.Name} (попытка ${currentRetryItem.retryCount}/${this.maxRetries})`);
                } else if (this.mailRetryQueue.some(item => item.retryCount < this.maxRetries)) {
                    this.log(`Ожидание cooldown для повторов...`);
                    return;
                } else {
                    if (this.mailSettings.auto && target !== 'online') {
                        let newTarget = 'online';
                        if (target === 'payers') newTarget = 'my-favorites';
                        else if (target === 'my-favorites') newTarget = 'favorites';
                        else if (target === 'favorites') newTarget = 'inbox';
                        else if (target === 'inbox') newTarget = 'online';
                        this.log(`Нет пользователей (${target}). Переход на ${newTarget}`);
                        this.mailSettings.target = newTarget;
                        this.mailContactedUsers.clear();
                        this.mailRetryQueue = [];
                        const sel = document.getElementById(`target-select-${this.id}`);
                        if (activeTabId === this.id && sel) sel.value = newTarget;
                        return this.processMailUser(msgTemplate);
                    } else {
                        this.log(`Нет пользователей для отправки. Ожидание...`);
                        return;
                    }
                }
            } else {
                user = users[Math.floor(Math.random() * users.length)];
            }

            msgBody = this.replaceMacros(msgTemplate, user);
            const checkRes = await makeApiRequest(this, 'GET', `/api/messages/check-send/${user.AccountId}`);

            if (checkRes.data.CheckId) {
                const payload = {
                    CheckId: checkRes.data.CheckId,
                    RecipientAccountId: user.AccountId,
                    Body: msgBody,
                    ReplyForMessageId: user.messageToReply || null,
                    AttachmentName: this.photoName,
                    AttachmentHash: null,
                    AttachmentFile: null
                };

                await makeApiRequest(this, 'POST', '/api/messages/send', payload);

                const convData = this.trackConversation(user.AccountId);
                const convId = this.getConvId(user.AccountId);

                await sendMessageToLababot({
                    botId: this.id,
                    accountDisplayId: this.displayId,
                    recipientId: user.AccountId,
                    type: 'outgoing',
                    textContent: msgBody,
                    status: 'success',
                    responseTime: convData.responseTime,
                    isFirst: convData.isFirst,
                    isLast: false,
                    convId: convId,
                    mediaUrl: this.photoName ? `attached_photo_${this.photoName}` : null,
                    fileName: this.photoName || null,
                    translatorId: this.translatorId || globalSettings.translatorId,
                    errorReason: null,
                    usedAi: this.usedAi || false
                });

                if (this.usedAi) this.usedAi = false;

                this.incrementStat('mail', 'sent');
                this.mailHistory.sent.push(`${user.AccountId} (${user.Name})`);
                this.log(`Письмо отправлено: ${user.Name}`);

                this.mailContactedUsers.add(user.AccountId.toString());
                if (isRetryAttempt) {
                    this.mailRetryQueue = this.mailRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                }
            } else {
                const errorReason = checkRes.data?.Message || checkRes.data?.Error || 'нет CheckId';
                this.incrementStat('mail', 'errors');
                this.mailHistory.errors.push(`${user.AccountId}: ${errorReason}`);
                this.log(`Ошибка: не могу отправить письмо ${user.Name} (${user.AccountId}): ${errorReason}`);

                if (!isRetryAttempt) {
                    this.mailRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                } else if (currentRetryItem && currentRetryItem.retryCount >= this.maxRetries) {
                    this.mailRetryQueue = this.mailRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                    this.log(`Отказ от ${user.Name} после ${this.maxRetries} попыток`);
                }

                try {
                    await sendErrorToLababot(this.id, this.displayId, 'mail_no_checkid', errorReason);
                } catch (err) {}
            }
        } catch (e) {
            if (e.message === "Network Error" || !e.response) {
                this.log(`Ошибка сети. Повторная попытка...`);
            } else {
                const errorReason = e.response?.data?.Error || e.message;
                this.incrementStat('mail', 'errors');
                this.mailHistory.errors.push(errorReason);

                if (user && user.AccountId && !isRetryAttempt) {
                    this.mailRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                }

                try {
                    await sendErrorToLababot(this.id, this.displayId, 'mail_send_error', errorReason);
                } catch (err) {}
            }
        }
        this.updateUI();
    }

    // ========================================================================
    // CHAT РЕЖИМ
    // ========================================================================

    async startChat(fullText) {
        if (!this.token) return;

        const profileStatus = await checkProfileStatus(this.displayId);
        if (!profileStatus.allowed || !profileStatus.exists) {
            this.log(`Анкета не найдена в системе личного кабинета`);
            alert(`Анкета ${this.displayId} не добавлена в личный кабинет.`);
            return;
        }
        if (profileStatus.paused) {
            this.log(`Чат заблокирован - анкета приостановлена`);
            alert(`Анкета ${this.displayId} приостановлена в личном кабинете.`);
            return;
        }

        const paymentStatus = await checkProfilePaymentStatus(this.displayId);
        if (!paymentStatus.isPaid && !paymentStatus.isFree) {
            this.log(`Чат заблокирован - анкета не оплачена`);
            const dialogResult = await showPaymentDialog(this.displayId, paymentStatus.canTrial);
            if (dialogResult.action !== 'trial_activated') return;
            this.log(`Trial активирован, запускаем чат`);
        }

        if (this.chatSettings.rotationStartTime === 0) this.chatSettings.rotationStartTime = Date.now();
        this.isChatRunning = true;
        this.chatStartTime = Date.now();
        this.startChatTimer();
        this.updateUI();
        this.log(`CHAT Started`);
        this.scheduleNextChat(fullText, 0);
        saveSession();
    }

    stopChat() {
        this.isChatRunning = false;
        clearTimeout(this.chatTimeout);
        this.stopChatTimer();
        this.log("CHAT Stopped");
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
                    this.log("Цикл перезапущен");
                } else {
                    this.log("Все инвайты отправлены. Остановка.");
                    this.stopChat();
                    return;
                }
            } else {
                this.log(`Переключено на инвайт #${this.chatSettings.currentInviteIndex + 1}`);
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

            users = users.filter(u =>
                !this.chatContactedUsers.has(u.AccountId.toString()) &&
                !this.chatSettings.blacklist.includes(u.AccountId.toString())
            );

            if (users.length === 0) {
                const now = Date.now();
                const readyForRetry = this.chatRetryQueue.filter(item =>
                    now - item.failedAt >= this.retryCooldownMs && item.retryCount < this.maxRetries
                );

                if (readyForRetry.length > 0) {
                    currentRetryItem = readyForRetry[Math.floor(Math.random() * readyForRetry.length)];
                    user = currentRetryItem.user;
                    currentRetryItem.retryCount++;
                    currentRetryItem.failedAt = now;
                    isRetryAttempt = true;
                    this.log(`Повтор чата для ${user.Name} (попытка ${currentRetryItem.retryCount}/${this.maxRetries})`);
                } else if (this.chatRetryQueue.some(item => item.retryCount < this.maxRetries)) {
                    this.log(`Ожидание cooldown для повторов...`);
                    return;
                } else {
                    this.log(`Нет пользователей в категории ${target}.`);
                    return;
                }
            } else {
                user = users[Math.floor(Math.random() * users.length)];
            }

            let msgBody = this.replaceMacros(currentMsgTemplate, user);

            try {
                const payload = { recipientId: user.AccountId, body: msgBody };
                await makeApiRequest(this, 'POST', '/chat-send', payload);

                const convData = this.trackConversation(user.AccountId);
                const convId = this.getConvId(user.AccountId);
                const isLast = this.isLastMessageInRotation();

                await sendMessageToLababot({
                    botId: this.id,
                    accountDisplayId: this.displayId,
                    recipientId: user.AccountId,
                    type: 'chat_msg',
                    textContent: msgBody,
                    status: 'success',
                    responseTime: convData.responseTime,
                    isFirst: convData.isFirst,
                    isLast: isLast,
                    convId: convId,
                    mediaUrl: null,
                    fileName: null,
                    translatorId: this.translatorId || globalSettings.translatorId,
                    errorReason: null,
                    usedAi: this.usedAi || false
                });

                if (this.usedAi) this.usedAi = false;

                this.incrementStat('chat', 'sent');
                this.chatHistory.sent.push(`${user.AccountId} (${user.Name})`);
                this.log(`Сообщение чата отправлено: ${user.Name}`);

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

                        const convData = this.trackConversation(user.AccountId);
                        const convId = this.getConvId(user.AccountId);

                        await sendMessageToLababot({
                            botId: this.id,
                            accountDisplayId: this.displayId,
                            recipientId: user.AccountId,
                            type: 'outgoing',
                            textContent: msgBody,
                            status: 'success',
                            responseTime: convData.responseTime,
                            isFirst: convData.isFirst,
                            isLast: false,
                            convId: convId,
                            mediaUrl: null,
                            fileName: null,
                            translatorId: this.translatorId || globalSettings.translatorId,
                            errorReason: null,
                            usedAi: this.usedAi || false
                        });

                        this.incrementStat('chat', 'sent');
                        this.chatHistory.sent.push(`${user.AccountId} (${user.Name})`);
                        this.log(`Сообщение отправлено через письмо (fallback): ${user.Name}`);

                        this.chatContactedUsers.add(user.AccountId.toString());
                        if (isRetryAttempt) {
                            this.chatRetryQueue = this.chatRetryQueue.filter(item => item.user.AccountId !== user.AccountId);
                        }
                    } else {
                        const errorReason = checkRes.data?.Message || checkRes.data?.Error || 'нет CheckId (fallback)';
                        this.incrementStat('chat', 'errors');
                        this.chatHistory.errors.push(`${user.AccountId}: ${errorReason}`);
                        this.log(`Ошибка: не могу отправить чат ${user.Name}: ${errorReason}`);

                        if (!isRetryAttempt) {
                            this.chatRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                        }
                    }
                } catch (fallbackErr) {
                    if (fallbackErr.message === "Network Error" || !fallbackErr.response) {
                        this.log(`Ошибка сети при отправке чата. Повтор...`);
                    } else {
                        const errorReason = fallbackErr.response?.data?.Error || fallbackErr.message;
                        this.incrementStat('chat', 'errors');
                        this.chatHistory.errors.push(`${user.AccountId}: ${errorReason}`);
                        this.log(`Ошибка API чата: ${errorReason}`);

                        if (user && user.AccountId && !isRetryAttempt) {
                            this.chatRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                        }
                    }
                }
            }
        } catch (e) {
            if (e.message === "Network Error" || !e.response) {
                this.log(`Ошибка сети. Повтор...`);
            } else {
                this.incrementStat('chat', 'errors');
                this.chatHistory.errors.push(e.message);

                if (user && user.AccountId && !isRetryAttempt) {
                    this.chatRetryQueue.push({ user, retryCount: 0, failedAt: Date.now() });
                }
            }
        }
        this.updateUI();
    }

    // ========================================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ========================================================================

    replaceMacros(text, user) {
        if (!text) return "";
        let res = text;
        res = res.replace(/{city}/gi, user.City || "your city")
                 .replace(/{name}/gi, user.Name || "dear")
                 .replace(/{age}/gi, user.Age || "")
                 .replace(/{country}/gi, user.Country || "your country");
        return res;
    }

    incrementStat(mode, type) {
        if (mode === 'mail') {
            this.mailStats[type]++;
        } else {
            this.chatStats[type]++;
        }
    }

    log(text) {
        const box = document.getElementById(`log-${this.id}`);
        const modePrefix = globalMode === 'chat' ? '[CHAT]' : '[MAIL]';
        if (box) {
            box.innerHTML = `<div><span style="opacity:0.6">${new Date().toLocaleTimeString()}</span> <b>${modePrefix}</b> ${text}</div>` + box.innerHTML;
        }
    }

    updateUI() {
        const isChat = globalMode === 'chat';
        const running = isChat ? this.isChatRunning : this.isMailRunning;
        const startTime = isChat ? this.chatStartTime : this.mailStartTime;
        const stats = isChat ? this.chatStats : this.mailStats;

        const btn = document.getElementById(`btn-start-${this.id}`);
        const dot = document.querySelector(`#tab-${this.id} .status-dot`);

        if (btn) {
            if (running) {
                const timerStr = formatElapsedTime(startTime);
                btn.innerHTML = `<i class="fa fa-stop"></i> ${timerStr}`;
                btn.classList.replace('btn-primary', 'btn-danger');
                if (dot) dot.style.boxShadow = "0 0 8px #28a745";
            } else {
                btn.innerHTML = `<i class="fa fa-paper-plane"></i> Старт`;
                btn.classList.replace('btn-danger', 'btn-primary');
                if (dot) dot.style.boxShadow = "none";
            }
        }

        const s = document.getElementById(`stat-sent-${this.id}`);
        const e = document.getElementById(`stat-err-${this.id}`);
        const w = document.getElementById(`stat-wait-${this.id}`);
        if (s) s.innerText = stats.sent;
        if (e) e.innerText = stats.errors;
        if (w) w.innerText = "Ожидают: " + stats.waiting;

        const activeBox = document.getElementById(`active-invite-${this.id}`);
        if (activeBox) {
            if (isChat) {
                activeBox.classList.add('show');
                const fullText = document.getElementById(`msg-${this.id}`)?.value || '';
                const invites = fullText.split(/\n\s*__\s*\n/);
                const idx = this.chatSettings.currentInviteIndex;
                const safeIdx = (idx < invites.length) ? idx : 0;
                const txt = invites[safeIdx] || "(Нет текста)";
                activeBox.innerHTML = `<div class="invite-status-label">Сейчас отправляется (Инвайт ${safeIdx + 1}/${invites.length})</div>${txt.replace(/\n/g, '<br>')}`;
            } else {
                activeBox.classList.remove('show');
            }
        }
    }

    // ========================================================================
    // ЗАГРУЗКА ДАННЫХ С СЕРВЕРА
    // ========================================================================

    loadFromServerData(data) {
        if (!data) return;

        // Загружаем шаблоны
        if (data.mail_templates) {
            getBotTemplates(this.login).mail = data.mail_templates;
        }
        if (data.chat_templates) {
            getBotTemplates(this.login).chat = data.chat_templates;
        }

        // Загружаем blacklist
        if (data.mail_blacklist) {
            this.mailSettings.blacklist = data.mail_blacklist;
        }
        if (data.chat_blacklist) {
            this.chatSettings.blacklist = data.chat_blacklist;
        }

        // Загружаем статистику
        if (data.stats) {
            if (data.stats.mail) {
                this.mailStats = { ...this.mailStats, ...data.stats.mail };
            }
            if (data.stats.chat) {
                this.chatStats = { ...this.chatStats, ...data.stats.chat };
            }
        }

        console.log(`[Lababot] Данные загружены с сервера для ${this.displayId}`);
    }
}

console.log('[Lababot] AccountBot.js loaded');
