        let axios;
        try { axios = require('axios'); } catch(e) { axios = window.axios; }

        const audioFiles = {
            online: new Audio('Sound/Online.mp3'),
            message: new Audio('Sound/Message.mp3'),
            chat: new Audio('Sound/Chat.mp3')
        };
        Object.values(audioFiles).forEach(a => a.load());

        function playSound(type) {
            if(!globalSettings.soundsEnabled) return;
            try {
                if(type === 'online') audioFiles.online.play().catch(()=>{});
                else if(type === 'message') audioFiles.message.play().catch(()=>{});
                else if (type === 'chat') audioFiles.chat.play().catch(()=>{});
            } catch(e) { console.warn("Audio play error", e); }
        }

        let bots = {};
        let botTemplates = JSON.parse(localStorage.getItem('botTemplates')) || {};
        let accountPreferences = JSON.parse(localStorage.getItem('accountPreferences')) || {};
        
        let defaultSettings = {
            lang: 'ru', theme: 'light', proxy: '', proxyURL: '', proxyAI: '',
            hotkeys: true, myPrompt: '', apiKey: '',
            soundsEnabled: true, confirmTabClose: true, extendedFeatures: true,
            skipDeleteConfirm: false, // Не спрашивать об удалении шаблона
            translatorId: null, // ID переводчика для статистики
            aiReplyPrompt: '', // Промпт для AI ответов на письма
            // Прокси для анкет по позициям (1-10, 11-20, 21-30, 31-40, 41-50, 51-60)
            proxy1: '', proxy2: '', proxy3: '', proxy4: '', proxy5: '', proxy6: '',
            // Отключенные статусы (пропускаются в авто-режиме)
            disabledStatuses: []
        };
        
        let globalSettings = JSON.parse(localStorage.getItem('globalSettings')) || defaultSettings;
        globalSettings = { ...defaultSettings, ...globalSettings };

        // ============= FOCUS DEBUG (для отладки бага с потерей фокуса) =============
        window._focusLog = [];
        window._focusLogEnabled = true; // Поставить false чтобы отключить

        window.addEventListener('blur', () => {
            if (!window._focusLogEnabled) return;
            window._focusLog.push({
                time: new Date().toISOString(),
                event: 'WINDOW_BLUR',
                activeElement: document.activeElement?.tagName + '#' + (document.activeElement?.id || document.activeElement?.className?.split(' ')[0] || '')
            });
            localStorage.setItem('_focusLog', JSON.stringify(window._focusLog.slice(-100)));
            console.warn('[FOCUS DEBUG] Window BLUR, activeElement:', document.activeElement);
        });

        document.addEventListener('focusout', (e) => {
            if (!window._focusLogEnabled) return;
            window._focusLog.push({
                time: new Date().toISOString(),
                event: 'FOCUS_OUT',
                from: e.target?.tagName + '#' + (e.target?.id || ''),
                to: e.relatedTarget?.tagName + '#' + (e.relatedTarget?.id || '')
            });
        });

        // Мониторинг webview после их создания
        setTimeout(() => {
            document.querySelectorAll('webview').forEach((wv, i) => {
                wv.addEventListener('did-focus', () => {
                    if (!window._focusLogEnabled) return;
                    window._focusLog.push({
                        time: new Date().toISOString(),
                        event: 'WEBVIEW_FOCUS',
                        index: i,
                        webviewId: wv.id || 'no-id'
                    });
                    localStorage.setItem('_focusLog', JSON.stringify(window._focusLog.slice(-100)));
                    console.error('[FOCUS DEBUG] 🔴 WebView', i, 'получил фокус!');
                });
            });
            console.log('[FOCUS DEBUG] Мониторинг webview установлен для', document.querySelectorAll('webview').length, 'элементов');
        }, 10000);

        console.log('[FOCUS DEBUG] ✅ Логирование фокуса активно. После бага выполни: JSON.parse(localStorage.getItem("_focusLog"))');
        // ============= END FOCUS DEBUG =============

        // ============= MACHINE ID (уникальный ID программы-бота) =============
        // Генерируется один раз при первом запуске и сохраняется в localStorage
        function getMachineId() {
            let machineId = localStorage.getItem('machineId');
            if (!machineId) {
                // Генерируем уникальный ID для этой установки программы
                machineId = 'machine_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
                localStorage.setItem('machineId', machineId);
                console.log(`🆔 Сгенерирован новый machineId: ${machineId}`);
            }
            return machineId;
        }
        const MACHINE_ID = getMachineId();
        console.log(`🤖 Программа запущена с machineId: ${MACHINE_ID}`);

        let globalMode = 'mail';
        let activeTabId = null;

        // Статус управления с сервера (panic mode, разрешение рассылки)
        let controlStatus = {
            panicMode: false,
            stopSpam: false,
            botEnabled: true, // Статус бот-машины (MACHINE_ID) - может быть выключен админом
            mailingEnabled: true,
            lastCheck: null
        };

        let currentModalBotId = null;
        let editingTemplateIndex = null;
        let editingBotId = null;
        let currentStatsType = null;
        let isShiftPressed = false; // Глобальное отслеживание Shift для bulk-действий
        let shiftWasPressed = false; // Сохраняет состояние Shift при mousedown (для select/checkbox)

        let minichatBotId = null;
        let minichatPartnerId = null;
        let minichatLastMessageId = 0;
        let minichatType = 'mail'; // 'mail' или 'chat'

        // ============= API ДЛЯ ОТПРАВКИ ДАННЫХ НА LABABOT SERVER =============
        const LABABOT_SERVER = 'http://188.137.253.169:3000';

        // Вспомогательные функции для работы с данными

        // Генерация уникального conversation ID для диалога
        function generateConvId(botId, recipientId) {
            return `conv_${botId}_${recipientId}`;
        }

        // Конвертация миллисекунд в формат PostgreSQL INTERVAL (HH:MM:SS)
        function millisecondsToInterval(ms) {
            if (!ms || ms <= 0) return null;

            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        // 1. Функция отправки сообщения на Lababot сервер (ПОЛНАЯ СПЕЦИФИКАЦИЯ)
        // ВАЖНО: botId теперь это MACHINE_ID (ID программы), accountDisplayId - ID анкеты
        async function sendMessageToLababot(params) {
            // Параметры: botId (игнорируется, используется MACHINE_ID), accountDisplayId, recipientId, type, textContent, status,
            // responseTime, errorReason, isFirst, isLast, convId, mediaUrl, fileName, translatorId, usedAi, aiSessionId

            const {
                botId,  // Оставляем для совместимости, но используем MACHINE_ID
                accountDisplayId,
                recipientId,
                type,
                textContent = '',
                status = 'success',
                responseTime = null,
                errorReason = null,
                isFirst = false,
                isLast = false,
                convId = null,
                mediaUrl = null,
                fileName = null,
                translatorId = null,
                usedAi = false,
                aiSessionId = null
            } = params;

            console.log(`📤 Отправляю сообщение на Lababot сервер: программа=${MACHINE_ID}, анкета=${accountDisplayId}, получатель=${recipientId}, тип=${type}`);

            try {
                const payload = {
                    botId: MACHINE_ID,  // ID программы-бота (один на всю программу)
                    accountDisplayId: accountDisplayId,
                    recipientId: String(recipientId),
                    type: type, // 'outgoing' (письмо $1.5) или 'chat_msg' (чат $0.15)
                    length: textContent.length || 0,
                    isFirst: isFirst,
                    isLast: isLast,
                    convId: convId,
                    responseTime: responseTime, // Формат PostgreSQL INTERVAL: "00:05:30"
                    status: status, // 'success', 'failed', 'pending'
                    textContent: textContent || '',
                    mediaUrl: mediaUrl,
                    fileName: fileName,
                    translatorId: translatorId,
                    errorReason: errorReason,
                    usedAi: usedAi, // Флаг использования ИИ генерации
                    aiSessionId: aiSessionId // ID сессии AI генерации для трекинга массовых рассылок
                };

                console.log('📦 Payload:', JSON.stringify(payload, null, 2));

                const response = await fetch(`${LABABOT_SERVER}/api/message_sent`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                console.log(`✅ Ответ от Lababot сервера:`, data);

                if (data.status === 'ok' || data.status === 'ignored') {
                    return { success: true, data: data };
                } else {
                    console.warn(`⚠️ Lababot сервер вернул:`, data);
                    return { success: false, error: data.error || 'Unknown error' };
                }
            } catch (error) {
                console.error(`❌ Ошибка отправки на Lababot сервер:`, error);
                return { success: false, error: error.message };
            }
        }

        // 2. Функция отправки входящего сообщения от мужчины
        // ВАЖНО: botId теперь это MACHINE_ID (ID программы)
        async function sendIncomingMessageToLababot(params) {
            const { botId, profileId, manId, manName, messageId, type = 'letter', messageText } = params;

            try {
                const response = await fetch(`${LABABOT_SERVER}/api/incoming_message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        botId: MACHINE_ID,  // ID программы-бота
                        profileId: profileId,
                        manId: String(manId),
                        manName: manName || null,
                        messageId: String(messageId),
                        type: type,
                        timestamp: new Date().toISOString(),
                        messageText: messageText || null
                    })
                });

                const data = await response.json();
                if (data.isFirstFromMan) {
                    console.log(`📨 Новый уникальный мужчина: ${manName || manId} → ${profileId}`);
                }
                return { success: true, data: data };
            } catch (error) {
                console.error(`❌ Ошибка отправки входящего на Lababot:`, error);
                return { success: false, error: error.message };
            }
        }

        // 3. Функция отправки heartbeat
        // ВАЖНО: botId теперь это MACHINE_ID (ID программы), а не ID анкеты!
        async function sendHeartbeatToLababot(botId, displayId, status = 'online') {
            console.log(`❤️ Отправляю heartbeat для анкеты ${displayId} (программа: ${MACHINE_ID})`);

            try {
                const response = await fetch(`${LABABOT_SERVER}/api/heartbeat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        botId: MACHINE_ID,  // ID программы-бота (один на всю программу)
                        accountDisplayId: displayId,  // ID анкеты
                        status: status,
                        timestamp: new Date().toISOString(),
                        ip: '127.0.0.1',
                        systemInfo: {
                            version: '10.0',
                            platform: navigator.platform
                        }
                    })
                });

                const data = await response.json();
                console.log(`✅ Heartbeat отправлен:`, data);

                // После heartbeat проверяем статус управления (panic mode)
                checkControlStatus();

                // Обрабатываем команды для конкретной анкеты
                if (data.commands) {
                    // Проверяем статус бот-машины (botEnabled) - влияет на ВСЕ анкеты
                    const wasBotEnabled = controlStatus.botEnabled !== false;
                    controlStatus.botEnabled = data.commands.botEnabled !== false;

                    // Если бот-машина была отключена - останавливаем ВСЕ рассылки
                    if (wasBotEnabled && !controlStatus.botEnabled) {
                        console.log(`🔴 Бот-машина отключена администратором! Останавливаю все рассылки...`);
                        stopAllMailingOnBotDisabled();
                    } else if (!wasBotEnabled && controlStatus.botEnabled) {
                        console.log(`🟢 Бот-машина включена администратором`);
                        showToast('Бот включен - можно запускать рассылки', 'success');
                    }

                    // Ищем бота по displayId для обновления mailingEnabled (per-profile)
                    for (const bid in bots) {
                        const bot = bots[bid];
                        if (bot && bot.displayId === displayId) {
                            // Обновляем статус mailingEnabled для этой анкеты
                            const wasEnabled = bot.mailingEnabled !== false;
                            bot.mailingEnabled = data.commands.mailingEnabled !== false;

                            // Если рассылка была отключена с сервера - останавливаем
                            if (wasEnabled && !bot.mailingEnabled) {
                                console.log(`⛔ Рассылка для ${displayId} отключена с сервера`);
                                if (bot.isMailRunning) {
                                    bot.stopMail();
                                    console.log(`⛔ Mail остановлен для ${displayId}`);
                                }
                                if (bot.isChatRunning) {
                                    bot.stopChat();
                                    console.log(`⛔ Chat остановлен для ${displayId}`);
                                }
                                showToast(`Анкета ${displayId}: рассылка отключена администратором`, 'warning');
                            } else if (!wasEnabled && bot.mailingEnabled) {
                                console.log(`✅ Рассылка для ${displayId} включена с сервера`);
                                showToast(`Анкета ${displayId}: рассылка разрешена`, 'success');
                            }
                            break;
                        }
                    }
                }

                return data;
            } catch (error) {
                console.error(`❌ Ошибка heartbeat:`, error);
                return null;
            }
        }

        // 3.1 Функция проверки статуса управления (panic mode, stopSpam)
        async function checkControlStatus() {
            try {
                const response = await fetch(`${LABABOT_SERVER}/api/bots/control/panic-status`);
                const data = await response.json();

                if (data.success) {
                    const wasPanic = controlStatus.panicMode;
                    const wasStopSpam = controlStatus.stopSpam;

                    controlStatus.panicMode = data.panicMode === true;
                    controlStatus.stopSpam = data.stopSpam === true;
                    controlStatus.lastCheck = new Date();

                    // Если включился panic mode - остановить все рассылки (критичный)
                    if (!wasPanic && controlStatus.panicMode) {
                        console.log('🚨 PANIC MODE АКТИВИРОВАН! Останавливаю все рассылки...');
                        stopAllMailingOnPanic();
                    } else if (wasPanic && !controlStatus.panicMode) {
                        console.log('✅ Panic Mode отключен');
                    }

                    // Если включился stopSpam - остановить все рассылки (мягкий, можно перезапустить)
                    if (!wasStopSpam && controlStatus.stopSpam) {
                        console.log('⛔ STOP SPAM АКТИВИРОВАН! Останавливаю все рассылки...');
                        stopAllMailingOnStopSpam();
                    } else if (wasStopSpam && !controlStatus.stopSpam) {
                        console.log('✅ Stop Spam отключен - можно запускать рассылки');
                        showToast('Stop Spam отключен - можно запускать рассылки', 'success');
                    }
                }

                return controlStatus;
            } catch (error) {
                console.error('❌ Ошибка проверки статуса управления:', error);
                return controlStatus;
            }
        }

        // 3.2 Функция остановки всех рассылок при panic mode (критичный - блокирует запуск)
        function stopAllMailingOnPanic() {
            for (const botId in bots) {
                const bot = bots[botId];
                if (bot) {
                    if (bot.isMailRunning) {
                        bot.stopMail();
                        console.log(`⛔ Остановлена Mail рассылка для ${bot.displayId}`);
                    }
                    if (bot.isChatRunning) {
                        bot.stopChat();
                        console.log(`⛔ Остановлена Chat рассылка для ${bot.displayId}`);
                    }
                }
            }
            showToast('🚨 Panic Mode: все рассылки остановлены!', 'error');
        }

        // 3.3 Функция остановки всех рассылок при stopSpam (мягкий - можно перезапустить)
        function stopAllMailingOnStopSpam() {
            for (const botId in bots) {
                const bot = bots[botId];
                if (bot) {
                    if (bot.isMailRunning) {
                        bot.stopMail();
                        console.log(`⛔ Остановлена Mail рассылка для ${bot.displayId}`);
                    }
                    if (bot.isChatRunning) {
                        bot.stopChat();
                        console.log(`⛔ Остановлена Chat рассылка для ${bot.displayId}`);
                    }
                }
            }
            showToast('⛔ Stop Spam: все рассылки остановлены администратором', 'warning');
        }

        // 3.4 Функция остановки всех рассылок при отключении бот-машины (блокирует запуск)
        function stopAllMailingOnBotDisabled() {
            for (const botId in bots) {
                const bot = bots[botId];
                if (bot) {
                    if (bot.isMailRunning) {
                        bot.stopMail();
                        console.log(`🔴 Mail остановлен для ${bot.displayId} (бот отключен)`);
                    }
                    if (bot.isChatRunning) {
                        bot.stopChat();
                        console.log(`🔴 Chat остановлен для ${bot.displayId} (бот отключен)`);
                    }
                }
            }
            showToast('🔴 Бот отключен администратором! Все рассылки остановлены.', 'error');
        }

        // 4. Функция отправки ошибки
        // ВАЖНО: botId теперь это MACHINE_ID (ID программы)
        async function sendErrorToLababot(botId, accountDisplayId, errorType, errorMessage) {
            console.log(`⚠️ Отправляю ошибку на Lababot сервер: ${errorType}`);

            try {
                const response = await fetch(`${LABABOT_SERVER}/api/error`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        botId: MACHINE_ID,  // ID программы-бота
                        accountDisplayId: accountDisplayId,
                        endpoint: 'bot_send_message',
                        errorType: errorType,
                        message: errorMessage.substring(0, 200) || 'Unknown error',
                        rawData: null,
                        userId: null
                    })
                });

                const data = await response.json();
                console.log(`✅ Ошибка отправлена на сервер:`, data);
                return data;
            } catch (error) {
                console.error(`❌ Ошибка отправки ошибки:`, error);
                return null;
            }
        }

        // 4. Функция отправки activity ping (трекинг активности оператора)
        // ВАЖНО: Отправляет пинг только когда переводчик РЕАЛЬНО работает (клики, печать).
        // Автоматические действия бота НЕ должны вызывать эту функцию!
        async function sendActivityPingToLababot(botId, profileId) {
            try {
                // Получаем ID переводчика из настроек
                const translatorId = globalSettings.translatorId;

                if (!translatorId) {
                    console.warn('⚠️ Переводчик не настроен в Settings. Пинг не отправлен.');
                    return null;
                }

                // Отправляем на правильный endpoint который пишет в user_activity
                const response = await fetch(`${LABABOT_SERVER}/api/stats/activity-ping`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: translatorId
                    })
                });
                return await response.json();
            } catch (error) {
                console.error(`❌ Ошибка activity ping:`, error);
                return null;
            }
        }

        // ============= СИСТЕМА ТРЕКИНГА АКТИВНОСТИ ОПЕРАТОРА =============
        const activityTracker = {
            lastActivityTime: 0,
            lastPingTime: 0,
            pingInterval: 30000, // Отправлять ping каждые 30 секунд
            inactivityTimeout: 120000, // 2 минуты без активности = не работает
            isTracking: false,

            // Регистрация активности (клик или печать)
            recordActivity() {
                this.lastActivityTime = Date.now();

                // Если давно не отправляли ping и есть активный бот - отправляем
                const now = Date.now();
                if (now - this.lastPingTime >= this.pingInterval) {
                    this.sendPingForActiveBot();
                }
            },

            // Отправить ping для активного бота
            sendPingForActiveBot() {
                const activeBot = this.getActiveBot();
                if (activeBot && activeBot.displayId) {
                    this.lastPingTime = Date.now();
                    sendActivityPingToLababot(activeBot.id, activeBot.displayId);
                }
            },

            // Получить активного бота (текущий выбранный таб)
            getActiveBot() {
                if (typeof selectedBotId !== 'undefined' && selectedBotId && typeof bots !== 'undefined') {
                    return bots[selectedBotId];
                }
                return null;
            },

            // Запуск трекинга
            startTracking() {
                if (this.isTracking) return;
                this.isTracking = true;

                // Слушаем клики
                document.addEventListener('mousedown', () => this.recordActivity(), true);

                // Слушаем печать
                document.addEventListener('keydown', () => this.recordActivity(), true);

                console.log('%c[Lababot] Activity tracking started', 'color: green; font-weight: bold');
            }
        };

        // Запускаем трекинг активности
        activityTracker.startTracking();

        // ============= API ДЛЯ РАБОТЫ С ДАННЫМИ БОТА (шаблоны, blacklist, статистика) =============

        // Загрузка данных бота с сервера
        async function loadBotDataFromServer(profileId) {
            try {
                console.log(`🔄 Загрузка данных с сервера для ${profileId}...`);
                const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}`);
                const result = await response.json();
                console.log(`📦 Ответ сервера для ${profileId}:`, JSON.stringify(result, null, 2));
                if (result.success) {
                    console.log(`📥 Данные бота загружены для ${profileId}:`, result.data);
                    return result.data;
                }
                console.warn(`⚠️ Сервер вернул success=false для ${profileId}`);
                return null;
            } catch (error) {
                console.error(`❌ Ошибка загрузки данных бота:`, error);
                return null;
            }
        }

        // Сохранение шаблонов на сервер
        async function saveTemplatesToServer(profileId, type, templates) {
            try {
                const body = type === 'chat'
                    ? { templatesChat: templates }
                    : { templatesMail: templates };

                const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                console.log(`💾 Шаблоны ${type} сохранены для ${profileId}`);
                return result.success;
            } catch (error) {
                console.error(`❌ Ошибка сохранения шаблонов:`, error);
                return false;
            }
        }

        // Сохранение blacklist на сервер
        async function saveBlacklistToServer(profileId, type, blacklist) {
            try {
                const body = type === 'chat'
                    ? { blacklistChat: blacklist }
                    : { blacklistMail: blacklist };

                const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                console.log(`📝 Blacklist ${type} сохранён для ${profileId}, ответ:`, result);
                return result.success;
            } catch (error) {
                console.error(`❌ Ошибка сохранения blacklist:`, error);
                return false;
            }
        }

        // Увеличение счётчика статистики на сервере
        async function incrementStatsOnServer(profileId, type, field, amount = 1) {
            try {
                const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}/increment-stats`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, field, amount })
                });
                const result = await response.json();
                return result.success;
            } catch (error) {
                console.error(`❌ Ошибка обновления статистики:`, error);
                return false;
            }
        }

        // Сброс статистики на сервере
        async function resetStatsOnServer(profileId, type) {
            try {
                const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(profileId)}/reset-stats`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type })
                });
                const result = await response.json();
                console.log(`🔄 Статистика ${type} сброшена для ${profileId}`);
                return result.success;
            } catch (error) {
                console.error(`❌ Ошибка сброса статистики:`, error);
                return false;
            }
        }

        // Debounce для автосохранения (3 секунды)
        const saveDebounceTimers = {};
        function debounceSaveTemplate(profileId, type, templates, delay = 3000) {
            const key = `${profileId}_${type}`;
            if (saveDebounceTimers[key]) {
                clearTimeout(saveDebounceTimers[key]);
            }
            saveDebounceTimers[key] = setTimeout(() => {
                saveTemplatesToServer(profileId, type, templates);
            }, delay);
        }

        // 5. Функция проверки статуса профиля (paused и allowed)
        async function checkProfileStatus(profileId) {
            try {
                const response = await fetch(`${LABABOT_SERVER}/api/profiles/${encodeURIComponent(profileId)}/status`);
                const data = await response.json();
                return {
                    paused: data.paused === true,
                    exists: data.exists === true,
                    allowed: data.allowed === true,
                    reason: data.reason || null
                };
            } catch (error) {
                console.error(`❌ Ошибка проверки статуса профиля:`, error);
                // При ошибке разрешаем работу чтобы не блокировать
                return { paused: false, exists: true, allowed: true };
            }
        }

        // Обратная совместимость
        async function checkProfilePaused(profileId) {
            const status = await checkProfileStatus(profileId);
            return status.paused;
        }

        // 6. Функция проверки оплаты профиля
        async function checkProfilePaymentStatus(profileId) {
            try {
                const response = await fetch(`${LABABOT_SERVER}/api/billing/profile-status/${encodeURIComponent(profileId)}`);
                const data = await response.json();
                return {
                    isPaid: data.isPaid === true,
                    isFree: data.isFree === true, // "мой админ" - бесплатно
                    isTrial: data.isTrial === true,
                    trialUsed: data.trialUsed === true,
                    canTrial: !data.trialUsed && !data.isPaid, // Можно активировать trial
                    daysLeft: data.daysLeft || 0,
                    reason: data.reason || 'unknown'
                };
            } catch (error) {
                console.error(`❌ Ошибка проверки оплаты профиля:`, error);
                // При ошибке разрешаем работу
                return { isPaid: true, isFree: false, isTrial: false, trialUsed: false, canTrial: false, daysLeft: 999 };
            }
        }

        // 7. Функция активации тестового периода
        async function activateTrialPeriod(profileId) {
            try {
                const response = await fetch(`${LABABOT_SERVER}/api/bots/activate-trial`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileId: profileId })
                });
                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`❌ Ошибка активации trial:`, error);
                return { success: false, error: error.message };
            }
        }

        // 8. Функция показа диалога оплаты/trial
        function showPaymentDialog(profileId, canTrial) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

                const dialog = document.createElement('div');
                dialog.style.cssText = 'background:white;border-radius:8px;padding:20px;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);';

                let html = `
                    <h3 style="margin:0 0 15px 0;font-size:16px;">ladabot</h3>
                    <p style="margin:0 0 10px 0;">Анкета ${profileId} не оплачена.${canTrial ? '' : ' Тестовый период истёк.'}</p>
                    <p style="margin:0 0 20px 0;color:#666;font-size:14px;">Обратитесь за пополнением в телеграм к пользователю @S_Shevil</p>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                `;

                if (canTrial) {
                    html += `<button id="trialBtn" style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;">Получить 2 тестовых дня</button>`;
                }
                html += `<button id="cancelBtn" style="padding:8px 16px;background:#f0f0f0;border:1px solid #ccc;border-radius:4px;cursor:pointer;">OK</button>`;
                html += '</div>';

                dialog.innerHTML = html;
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                dialog.querySelector('#cancelBtn').onclick = () => {
                    document.body.removeChild(overlay);
                    resolve({ action: 'cancel' });
                };

                if (canTrial) {
                    dialog.querySelector('#trialBtn').onclick = async () => {
                        const btn = dialog.querySelector('#trialBtn');
                        btn.disabled = true;
                        btn.textContent = 'Активация...';

                        const result = await activateTrialPeriod(profileId);
                        document.body.removeChild(overlay);

                        if (result.success) {
                            alert('✅ Тестовый период активирован на 2 дня!');
                            resolve({ action: 'trial_activated' });
                        } else {
                            alert('❌ Ошибка: ' + (result.message || result.error || 'Не удалось активировать'));
                            resolve({ action: 'error', error: result.error });
                        }
                    };
                }
            });
        }

        // === КРИТИЧЕСКИ ВАЖНО: Скрипт "Анти-сон" ===
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
            // Меняем иконку для красоты (опционально, можно оставить только поворот)
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
                if(!this.logs.length) { container.innerHTML = '<div class="text-center text-muted small mt-5">Событий пока нет...</div>'; return; }

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

            responseWindows[windowId] = {
                botId,
                partnerId,
                partnerName,
                type,
                element: win
            };

            document.querySelectorAll('.response-window').forEach(w => w.classList.remove('focused'));
            win.classList.add('focused');

            loadResponseWindowHistory(windowId);

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
        
        async function openMiniChat(botId, partnerId, partnerName, type = 'mail') {
            minichatBotId = botId;
            minichatPartnerId = partnerId;
            minichatLastMessageId = 0;
            minichatType = type; // 'mail' или 'chat'

            selectTab(botId);

            document.getElementById('minichat-partner-id').innerText = partnerId;
            document.getElementById('minichat-partner-name').innerText = partnerName;
            document.getElementById('minichat-bot-display-id').innerText = bots[botId].displayId;
            document.getElementById('minichat-history').innerHTML = '<div class="text-center text-muted small mt-5"><i class="fa fa-spinner fa-spin"></i> Загрузка истории...</div>';
            document.getElementById('minichat-input').value = '';

            // Обновляем заголовок модального окна в зависимости от типа
            const modalTitle = document.querySelector('#minichat-modal .modal-header span');
            if (modalTitle) {
                modalTitle.innerHTML = type === 'chat'
                    ? '💬 Чат с <span id="minichat-partner-name">' + partnerName + '</span>'
                    : '💌 Переписка с <span id="minichat-partner-name">' + partnerName + '</span>';
            }

            openModal('minichat-modal');

            if (type === 'chat') {
                await loadMiniChatHistoryForChat();
            } else {
                await loadMiniChatHistory();
            }
        }

        async function loadMiniChatHistory() {
            if (!minichatBotId || !minichatPartnerId) return;

            const bot = bots[minichatBotId];
            if (!bot) return;

            const chatHistoryEl = document.getElementById('minichat-history');
            
            try {
                const res = await makeApiRequest(bot, 'GET', `/api/messages?fromAccountId=${minichatPartnerId}`);
                const msgs = res.data.Messages || [];
                
                chatHistoryEl.innerHTML = '';
                
                msgs.sort((a, b) => new Date(a.DatePost) - new Date(b.DatePost));
                
                let lastId = 0;

                for (const msg of msgs) {
                    const detailRes = await makeApiRequest(bot, 'GET', `/api/messages/${msg.MessageId}`);
                    const detailedMsg = detailRes.data;
                    
                    if (!detailedMsg.Body) continue;
                    
                    const isMyMessage = detailedMsg.User.AccountId !== minichatPartnerId; 
                    const msgDiv = document.createElement('div');
                    msgDiv.className = `chat-msg ${isMyMessage ? 'me' : 'partner'}`;

                    const timeStr = new Date(detailedMsg.DatePost).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    
                    msgDiv.innerHTML = `<div class="msg-bubble">${detailedMsg.Body}</div><div class="msg-time">${timeStr}</div>`;
                    
                    chatHistoryEl.appendChild(msgDiv);
                    lastId = detailedMsg.MessageId;
                }
                
                if (msgs.length === 0) chatHistoryEl.innerHTML = '<div class="text-center text-muted small mt-5">История пуста.</div>';

                minichatLastMessageId = lastId;
                chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight; 
                
            } catch (e) {
                 chatHistoryEl.innerHTML = '<div class="text-center text-danger small mt-5">Ошибка загрузки истории.</div>';
                 console.error("MiniChat history error:", e);
            }
        }

        // Загрузка истории ЧАТА (не писем)
        async function loadMiniChatHistoryForChat() {
            if (!minichatBotId || !minichatPartnerId) return;

            const bot = bots[minichatBotId];
            if (!bot) return;

            console.log(`[MiniChat] 📥 Загрузка истории чата:`, {
                botId: bot.id,
                profileId: bot.displayId,
                partnerId: minichatPartnerId,
                hasWebView: !!bot.webview
            });

            const chatHistoryEl = document.getElementById('minichat-history');

            try {
                // Используем WebView для запроса (там есть session cookies)
                let data = null;

                if (bot.webview) {
                    try {
                        const result = await bot.webview.executeJavaScript(`
                            (async () => {
                                try {
                                    const res = await fetch('https://ladadate.com/chat-messages', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: ${minichatPartnerId} }),
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
                            console.log(`[MiniChat] ✅ chat-messages через WebView: OK`, data);
                            // Диагностика: показываем структуру первого сообщения
                            if (data.Messages && data.Messages.length > 0) {
                                console.log(`[MiniChat] 📋 Пример сообщения:`, JSON.stringify(data.Messages[0], null, 2));
                            }
                        } else {
                            console.log(`[MiniChat] ❌ chat-messages через WebView:`, result.error, result.html || '');
                        }
                    } catch (e) {
                        console.log(`[MiniChat] ⚠️ WebView executeJavaScript error:`, e.message);
                    }
                }

                // Fallback на axios если WebView не работает
                if (!data) {
                    console.log(`[MiniChat] 📥 Загрузка через axios (fallback):`, { partnerId: minichatPartnerId });
                    const res = await makeApiRequest(bot, 'POST', '/chat-messages', { id: minichatPartnerId });
                    data = res.data;
                    console.log(`[MiniChat] 📥 axios chat-messages result:`, { success: data?.IsSuccess, messagesCount: data?.Messages?.length });
                }

                if (!data || !data.IsSuccess) {
                    console.log(`[MiniChat] ❌ Не удалось загрузить чат:`, { data });
                    chatHistoryEl.innerHTML = '<div class="text-center text-danger small mt-5">Ошибка загрузки чата.</div>';
                    return;
                }

                const msgs = data.Messages || [];
                console.log(`[MiniChat] ✅ Загружено сообщений:`, msgs.length);

                chatHistoryEl.innerHTML = '';

                // Сообщения приходят в обратном порядке (новые сверху), сортируем по дате
                msgs.sort((a, b) => new Date(a.Date) - new Date(b.Date));

                for (const msg of msgs) {
                    if (!msg.Body) continue;

                    // IsMyMessage: false = сообщение от мужчины, true = наше сообщение
                    const isMyMessage = msg.IsMyMessage === true;
                    const msgDiv = document.createElement('div');
                    msgDiv.className = `chat-msg ${isMyMessage ? 'me' : 'partner'}`;

                    const timeStr = new Date(msg.Date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    msgDiv.innerHTML = `<div class="msg-bubble">${msg.Body}</div><div class="msg-time">${timeStr}</div>`;

                    chatHistoryEl.appendChild(msgDiv);
                }

                if (msgs.length === 0) {
                    chatHistoryEl.innerHTML = '<div class="text-center text-muted small mt-5">История чата пуста.</div>';
                }

                chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

            } catch (e) {
                chatHistoryEl.innerHTML = '<div class="text-center text-danger small mt-5">Ошибка загрузки истории чата.</div>';
                console.error("MiniChat (chat) history error:", e);
            }
        }

        // AI генерация ответа на входящее сообщение
        async function generateMiniChatAIReply() {
            const promptInput = document.getElementById('minichat-ai-prompt');
            const messageInput = document.getElementById('minichat-input');
            const btn = document.getElementById('minichat-ai-btn');
            const chatHistoryEl = document.getElementById('minichat-history');
            const userPrompt = promptInput.value.trim();

            // Проверяем наличие API ключа
            if (!globalSettings.apiKey) {
                alert('Добавьте OpenAI API Key в настройках (вкладка AI функции)');
                return;
            }

            const originalBtnHtml = btn.innerHTML;

            // Проверяем разрешение AI для этой анкеты
            const bot = bots[minichatBotId];
            if (bot && bot.displayId) {
                btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
                btn.disabled = true;

                const aiStatus = await checkProfileAIEnabled(bot.displayId);
                if (!aiStatus.enabled) {
                    btn.innerHTML = originalBtnHtml;
                    btn.disabled = false;
                    const reason = aiStatus.reason === 'disabled_by_admin'
                        ? 'AI отключен администратором для этой анкеты'
                        : aiStatus.reason === 'no_translator'
                        ? 'Анкете не назначен переводчик'
                        : 'AI недоступен для этой анкеты';
                    alert(`⚠️ ${reason}`);
                    return;
                }
            }

            // Получаем последние сообщения из истории чата
            const partnerMessages = chatHistoryEl.querySelectorAll('.chat-msg.partner .msg-bubble');
            const myMessages = chatHistoryEl.querySelectorAll('.chat-msg.me .msg-bubble');

            if (partnerMessages.length === 0) {
                alert('Нет входящих сообщений для ответа');
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
                return;
            }

            // Собираем последние 5 сообщений для контекста
            const allMsgs = chatHistoryEl.querySelectorAll('.chat-msg');
            const contextMessages = [];
            const lastMessages = Array.from(allMsgs).slice(-5);

            for (const msg of lastMessages) {
                const isMe = msg.classList.contains('me');
                const bubble = msg.querySelector('.msg-bubble');
                if (bubble) {
                    contextMessages.push({
                        role: isMe ? 'assistant' : 'user',
                        content: bubble.textContent
                    });
                }
            }

            // Последнее сообщение партнёра
            const lastPartnerMsg = partnerMessages[partnerMessages.length - 1].textContent;

            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
            btn.disabled = true;

            try {
                const isChat = minichatType === 'chat';
                const partnerName = document.getElementById('minichat-partner-name').textContent;

                // Используем кастомный промпт из настроек если есть, иначе дефолтный
                const basePrompt = globalSettings.aiReplyPrompt || '';
                let styleInstruction = userPrompt
                    ? `Reply style: ${userPrompt}.`
                    : basePrompt
                    ? `Additional instructions: ${basePrompt}`
                    : 'Reply in a warm, friendly and engaging manner.';

                const systemPrompt = isChat
                    ? `You are helping write a chat reply on a dating site. Write in English. Keep it short (1-2 sentences). Be conversational and engaging. ${styleInstruction} Do not use emojis. Reply directly without any introduction like "Here's a reply".`
                    : `You are helping write a letter reply on a dating site. Write in English. Keep it medium length (2-4 sentences). Be warm and personal. ${styleInstruction} Do not use emojis. Reply directly without any introduction like "Here's a reply".`;

                const config = {
                    headers: {
                        'Authorization': `Bearer ${globalSettings.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                };

                if (globalSettings.proxyAI) {
                    const proxyConfig = parseProxyUrl(globalSettings.proxyAI);
                    if (proxyConfig) config.proxy = proxyConfig;
                }

                // Формируем сообщения для API
                const apiMessages = [
                    { role: 'system', content: systemPrompt },
                    ...contextMessages,
                    { role: 'user', content: `[Last message from ${partnerName}]: "${lastPartnerMsg}"\n\nWrite a reply to this message.` }
                ];

                const response = await axios.post(OPENAI_API_ENDPOINT, {
                    model: 'gpt-3.5-turbo',
                    messages: apiMessages,
                    temperature: 0.8,
                    max_tokens: 200
                }, config);

                const generatedReply = response.data.choices[0].message.content.trim();

                // Вставляем ответ в поле ввода (НЕ отправляем!)
                messageInput.value = generatedReply;
                messageInput.focus();

                // Очищаем промпт после успешной генерации
                promptInput.value = '';

            } catch (error) {
                console.error('AI Reply generation error:', error);
                const errorMsg = error.response?.data?.error?.message || error.message || 'Неизвестная ошибка';
                alert(`Ошибка генерации: ${errorMsg}`);
            } finally {
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
            }
        }

        async function sendMiniChatMessage() {
            if (!minichatBotId || !minichatPartnerId) return;

            const bot = bots[minichatBotId];
            const inputEl = document.getElementById('minichat-input');
            const message = inputEl.value.trim();

            if (!message || !bot) return;

            console.log(`[MiniChat] 🚀 Начало отправки ${minichatType === 'chat' ? 'чата' : 'письма'}:`, {
                botId: bot.id,
                profileId: bot.displayId,
                partnerId: minichatPartnerId,
                type: minichatType,
                messageLength: message.length,
                hasWebView: !!bot.webview
            });

            inputEl.value = 'Отправка...';
            inputEl.disabled = true;

            try {
                if (minichatType === 'chat') {
                    // Отправка через чат API (используем WebView для session cookies)
                    let sendSuccess = false;

                    if (bot.webview) {
                        try {
                            const result = await bot.webview.executeJavaScript(`
                                (async () => {
                                    try {
                                        const res = await fetch('https://ladadate.com/chat-send', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: ${minichatPartnerId}, body: ${JSON.stringify(message)} }),
                                            credentials: 'include'
                                        });
                                        // Проверяем HTTP статус
                                        if (!res.ok) {
                                            return { success: false, error: 'HTTP ' + res.status, status: res.status };
                                        }
                                        const text = await res.text();
                                        console.log('[MiniChat WebView] chat-send response:', text);
                                        try {
                                            const json = JSON.parse(text);
                                            // Проверяем успех в ответе API
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

                            console.log(`[MiniChat] 📤 chat-send result:`, result);
                            if (result.success) {
                                sendSuccess = true;
                                console.log(`[MiniChat] ✅ chat-send через WebView: OK`);
                            } else {
                                console.log(`[MiniChat] ❌ chat-send через WebView:`, result.error, result.data || '');
                            }
                        } catch (e) {
                            console.log(`[MiniChat] ⚠️ WebView chat-send error:`, e.message);
                        }
                    }

                    // Fallback на axios если WebView не работает
                    if (!sendSuccess) {
                        console.log(`[MiniChat] 📤 Отправка чата через axios (fallback):`, { botId: bot.displayId, partnerId: minichatPartnerId });
                        const payload = { id: minichatPartnerId, body: message };
                        const response = await makeApiRequest(bot, 'POST', '/chat-send', payload);
                        console.log(`[MiniChat] ✅ chat-send через axios:`, response.data);
                    }
                } else {
                    // Отправка через почтовый API
                    console.log(`[MiniChat] 📤 Проверка возможности отправки письма для partnerId:`, minichatPartnerId);
                    const checkRes = await makeApiRequest(bot, 'GET', `/api/messages/check-send/${minichatPartnerId}`);
                    console.log(`[MiniChat] 📋 CheckId получен:`, checkRes.data.CheckId);
                    if (!checkRes.data.CheckId) throw new Error("Check send failed - нет CheckId");

                    const payload = {
                        CheckId: checkRes.data.CheckId,
                        RecipientAccountId: minichatPartnerId,
                        Body: message,
                        ReplyForMessageId: minichatLastMessageId || null,
                        AttachmentName: null, AttachmentHash: null, AttachmentFile: null
                    };

                    console.log(`[MiniChat] 📤 Отправка письма:`, { botId: bot.displayId, payload });
                    const response = await makeApiRequest(bot, 'POST', '/api/messages/send', payload);
                    console.log(`[MiniChat] ✅ Письмо отправлено:`, response.data);
                }

                console.log(`[MiniChat] ✅ Сообщение успешно отправлено!`, { type: minichatType, partnerId: minichatPartnerId });

                const chatHistoryEl = document.getElementById('minichat-history');
                const msgDiv = document.createElement('div');
                msgDiv.className = `chat-msg me`;
                const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                msgDiv.innerHTML = `<div class="msg-bubble">${message}</div><div class="msg-time">${timeStr}</div>`;
                chatHistoryEl.appendChild(msgDiv);
                chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

                inputEl.value = '';

            } catch (e) {
                console.error(`[MiniChat] ❌ Ошибка отправки ${minichatType}:`, {
                    error: e.message,
                    response: e.response?.data,
                    status: e.response?.status,
                    botId: bot.displayId,
                    partnerId: minichatPartnerId
                });
                alert(`Ошибка отправки ${minichatType === 'chat' ? 'чата' : 'письма'}. См. консоль.`);
                inputEl.value = message;
            } finally {
                inputEl.disabled = false;
            }
        }

        const loggerWin = document.getElementById('logger-window');
        const loggerHead = document.getElementById('logger-header');
        const resizeHandle = document.getElementById('logger-resize-handle');
        
        let isDragging = false, dragOffset = {x:0, y:0};
        loggerHead.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragOffset.x = e.clientX - loggerWin.offsetLeft;
            dragOffset.y = e.clientY - loggerWin.offsetTop;
            e.preventDefault();
        });
        
        let isResizing = false;
        let startW = 0, startH = 0, startX = 0, startY = 0;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startW = parseInt(document.defaultView.getComputedStyle(loggerWin).width, 10);
            startH = parseInt(document.defaultView.getComputedStyle(loggerWin).height, 10);
            e.stopPropagation();
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if(isDragging) {
                loggerWin.style.left = (e.clientX - dragOffset.x) + 'px';
                loggerWin.style.top = (e.clientY - dragOffset.y) + 'px';
            }
            if(isResizing) {
                const newWidth = startW + (startX - e.clientX);
                const newHeight = startH + (e.clientY - startY);
                if(newWidth > 200 && newWidth < 1200) {
                    loggerWin.style.width = newWidth + 'px';
                    loggerWin.style.left = (e.clientX - newWidth) + 'px'; 
                }
                if(newHeight > 200 && newHeight < 1000) {
                    loggerWin.style.height = newHeight + 'px';
                }
            }
        });
        document.addEventListener('mouseup', () => { isDragging = false; isResizing = false; });

        function toggleLogger() {
            loggerWin.classList.toggle('show');
            if(loggerWin.classList.contains('show')) {
                document.getElementById('btn-logger-main').classList.remove('blinking');
            }
        }

        const forbiddenWords = [
            "Fuck", "Shit", "Ass", "Bitch", "Damn", "Hell", "Dick", "Cunt", "Pussy", 
            "Cock", "Tits", "Bastard", "Motherfucker", "Asshole", "Son of a bitch", 
            "Goddammit", "Piss", "Crap", "Fart", "Wanker"
        ];

        function parseProxyUrl(proxyUrlString) {
            if (!proxyUrlString) return null;
            try {
                const url = new URL(proxyUrlString);
                const proxyConfig = {
                    host: url.hostname,
                    port: url.port,
                    protocol: url.protocol.replace(':', '')
                };
                if (url.username && url.password) {
                    proxyConfig.auth = { username: url.username, password: url.password };
                }
                return proxyConfig;
            } catch (e) { return null; }
        }

        // Парсинг простого формата ip:port
        function parseSimpleProxy(proxyString) {
            if (!proxyString) return null;
            const trimmed = proxyString.trim();
            if (!trimmed) return null;

            const parts = trimmed.split(':');
            if (parts.length !== 2) return null;

            const [host, portStr] = parts;
            const port = parseInt(portStr);

            // Проверка валидности
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (!ipRegex.test(host) || isNaN(port) || port < 1 || port > 65535) {
                return null;
            }

            return {
                host: host,
                port: port,
                protocol: 'http'
            };
        }

        // ============= ПРОКСИ ДЛЯ WEBVIEW =============
        // Получить прокси для анкеты по её номеру (порядку добавления)
        // proxy1 → анкеты 1-10, proxy2 → анкеты 11-20, и т.д.
        function getProxyForAccountNumber(accountNumber) {
            if (!accountNumber || accountNumber < 1) return null;
            const proxyIndex = Math.ceil(accountNumber / 10);
            if (proxyIndex > 6) return null;
            const proxyKey = `proxy${proxyIndex}`;
            const proxyValue = globalSettings[proxyKey];
            if (!proxyValue || proxyValue.trim() === '') return null;
            return proxyValue.trim();
        }

        // Получить номер анкеты по её botId
        function getAccountNumber(botId) {
            const botIds = Object.keys(bots);
            const index = botIds.indexOf(botId);
            return index >= 0 ? index + 1 : null;
        }

        // Установить прокси для webview сессии бота
        async function setWebviewProxy(botId) {
            console.log(`%c[Proxy DEBUG] setWebviewProxy вызван для botId: ${botId}`, 'color: blue; font-weight: bold');

            const accountNumber = getAccountNumber(botId);
            console.log(`[Proxy DEBUG] Номер анкеты: ${accountNumber}`);

            const proxyString = getProxyForAccountNumber(accountNumber);
            console.log(`[Proxy DEBUG] Прокси строка: "${proxyString}"`);

            // Дополнительная отладка - выводим все прокси из globalSettings
            console.log(`[Proxy DEBUG] globalSettings.proxy1: "${globalSettings.proxy1}"`);
            console.log(`[Proxy DEBUG] globalSettings.proxy2: "${globalSettings.proxy2}"`);
            console.log(`[Proxy DEBUG] globalSettings.proxy3: "${globalSettings.proxy3}"`);

            try {
                // 1. Устанавливаем прокси для webview сессии бота
                console.log(`[Proxy DEBUG] Вызываю IPC set-session-proxy для ${botId}...`);
                const result = await ipcRenderer.invoke('set-session-proxy', { botId, proxyString });
                console.log(`[Proxy DEBUG] Результат IPC set-session-proxy:`, result);

                if (result.success) {
                    console.log(`%c[Proxy] Бот ${botId} (анкета #${accountNumber}): ${proxyString || 'без прокси'}`, 'color: green; font-weight: bold');
                } else {
                    console.error(`[Proxy] Ошибка для ${botId}:`, result.error);
                }

                // 2. Устанавливаем прокси для default session (для axios запросов)
                // Используем прокси первой анкеты для всех axios запросов
                if (accountNumber === 1 && proxyString) {
                    try {
                        console.log(`[Proxy DEBUG] Вызываю IPC set-default-session-proxy...`);
                        const defaultResult = await ipcRenderer.invoke('set-default-session-proxy', { proxyString });
                        console.log(`[Proxy DEBUG] Результат IPC set-default-session-proxy:`, defaultResult);

                        if (defaultResult.success) {
                            console.log(`%c[Proxy Default] Установлен глобальный прокси: ${proxyString}`, 'color: green; font-weight: bold');
                        } else {
                            console.error(`[Proxy Default] Ошибка:`, defaultResult.error);
                        }
                    } catch (e) {
                        console.error('[Proxy Default] IPC ошибка:', e);
                    }
                } else {
                    console.log(`[Proxy DEBUG] Пропуск default session (accountNumber=${accountNumber}, proxyString="${proxyString}")`);
                }

                return result;
            } catch (err) {
                console.error(`[Proxy] IPC ошибка для ${botId}:`, err);
                return { success: false, error: err.message };
            }
        }

        const LADADATE_BASE_URL = 'https://ladadate.com';
        const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
        
        // --- ОБНОВЛЕНИЕ 2: НОВАЯ ЛОГИКА Drag and Drop (Сортировка вместо плавания) ---
        let draggingTabEl = null;

        function startTabDrag(e, tabEl) {
            if (e.target.closest('.tab-close')) return; // Не перетаскивать, если клик на крестик
            
            draggingTabEl = tabEl;
            draggingTabEl.classList.add('dragging');
            
            document.addEventListener('mousemove', handleTabMove);
            document.addEventListener('mouseup', stopTabDrag);
        }

        function handleTabMove(e) {
            if (!draggingTabEl) return;
            e.preventDefault();

            const tabsContainer = document.getElementById('tabs-bar');
            const allTabs = Array.from(tabsContainer.children);
            
            // Находим элемент, над которым сейчас курсор
            const targetTab = allTabs.find(tab => {
                if (tab === draggingTabEl) return false;
                const rect = tab.getBoundingClientRect();
                return (e.clientX > rect.left && e.clientX < rect.right &&
                        e.clientY > rect.top && e.clientY < rect.bottom);
            });

            if (targetTab) {
                // Определяем индекс текущего и целевого элемента
                const currentIndex = allTabs.indexOf(draggingTabEl);
                const targetIndex = allTabs.indexOf(targetTab);

                // Меняем местами в DOM (браузер сам анимирует сдвиг)
                if (currentIndex < targetIndex) {
                    tabsContainer.insertBefore(draggingTabEl, targetTab.nextSibling);
                } else {
                    tabsContainer.insertBefore(draggingTabEl, targetTab);
                }
            }
        }

        function stopTabDrag() {
            if (draggingTabEl) {
                draggingTabEl.classList.remove('dragging');
                draggingTabEl = null;
                
                // Пересохраняем порядок ботов
                const newOrderIds = Array.from(document.querySelectorAll('.tab-item')).map(t => t.id.replace('tab-', ''));
                const newBots = {};
                newOrderIds.forEach(id => {
                    if(bots[id]) newBots[id] = bots[id];
                });
                bots = newBots; 
                saveSession();
            }
            document.removeEventListener('mousemove', handleTabMove);
            document.removeEventListener('mouseup', stopTabDrag);
        }

        window.onload = async function() {
            restoreSession();
            loadGlobalSettingsUI();
            toggleExtendedFeatures();
            initHotkeys();
            initTooltips();
            initFocusProtection(); // НОВОЕ: Защита от потери фокуса
            initTranscriptionContextMenu(); // Контекстное меню с переменными транскрипции
            updateDisabledStatusesUI(); // Отображаем отключенные статусы
            startGlobalMenOnlineUpdater(); // Запускаем обновление "Мужчины онлайн"

            // Глобальное отслеживание Shift для bulk-действий
            document.addEventListener('keydown', (e) => { if (e.key === 'Shift') isShiftPressed = true; });
            document.addEventListener('keyup', (e) => { if (e.key === 'Shift') isShiftPressed = false; });
            window.addEventListener('blur', () => { isShiftPressed = false; }); // Сброс при потере фокуса

            document.addEventListener('click', (e) => {
                if(!e.target.closest('.ai-container')) {
                    document.querySelectorAll('.ai-options').forEach(el => el.classList.remove('show'));
                }
            });

            window.onclick = function(e) {
                if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
                if(!e.target.classList.contains('vars-item') && !e.target.classList.contains('form-control')) {
                    document.querySelectorAll('.vars-dropdown').forEach(d=>d.style.display='none');
                }
            };
        };

        function setGlobalTarget(targetType) {
            Object.values(bots).forEach(bot => {
                if(globalMode === 'mail') bot.mailSettings.target = targetType;
                else bot.chatSettings.target = targetType;
                if(activeTabId === bot.id) {
                    const sel = document.getElementById(`target-select-${bot.id}`);
                    if(sel) sel.value = targetType;
                }
            });
            saveSession();
            alert(`Всем анкетам установлен статус: ${targetType.toUpperCase()}`);
        }

        // ============= ОТКЛЮЧЕНИЕ СТАТУСОВ (ПКМ) =============
        // Переключение статуса вкл/выкл по правому клику
        function toggleStatusDisabled(status, event) {
            event.preventDefault(); // Отменяем контекстное меню

            if (!globalSettings.disabledStatuses) {
                globalSettings.disabledStatuses = [];
            }

            const idx = globalSettings.disabledStatuses.indexOf(status);
            if (idx === -1) {
                // Добавляем в отключенные
                globalSettings.disabledStatuses.push(status);
                console.log(`🚫 Статус "${status}" отключен (пропускается в авто-режиме)`);
            } else {
                // Убираем из отключенных
                globalSettings.disabledStatuses.splice(idx, 1);
                console.log(`✅ Статус "${status}" включен`);
            }

            // Сохраняем и обновляем UI
            localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
            updateDisabledStatusesUI();
        }

        // Обновление визуального отображения отключенных статусов
        function updateDisabledStatusesUI() {
            const buttons = document.querySelectorAll('.btn-status-circle[data-status]');
            buttons.forEach(btn => {
                const status = btn.getAttribute('data-status');
                if (globalSettings.disabledStatuses && globalSettings.disabledStatuses.includes(status)) {
                    btn.classList.add('status-disabled');
                } else {
                    btn.classList.remove('status-disabled');
                }
            });
        }

        // Получить следующий активный статус (пропуская отключенные)
        function getNextActiveStatus(currentStatus) {
            const statusOrder = ['payers', 'my-favorites', 'favorites', 'inbox', 'online'];
            const currentIdx = statusOrder.indexOf(currentStatus);

            // Ищем следующий не отключенный статус
            for (let i = currentIdx + 1; i < statusOrder.length; i++) {
                const nextStatus = statusOrder[i];
                if (!globalSettings.disabledStatuses || !globalSettings.disabledStatuses.includes(nextStatus)) {
                    return nextStatus;
                }
            }

            // Если все следующие отключены, возвращаем online (он всегда доступен как fallback)
            return 'online';
        }

        // ============= CUSTOM IDS (Рассылка по конкретным ID) =============

        // Показать/скрыть поле ввода Custom IDs
        function toggleCustomIdsField(botId) {
            const select = document.getElementById(`target-select-${botId}`);
            const field = document.getElementById(`custom-ids-field-${botId}`);
            if (select && field) {
                field.style.display = select.value === 'custom-ids' ? 'block' : 'none';
                if (select.value === 'custom-ids') {
                    // Загружаем сохранённые ID
                    const bot = bots[botId];
                    if (bot && bot.customIdsList) {
                        document.getElementById(`custom-ids-input-${botId}`).value = bot.customIdsList.join(', ');
                        updateCustomIdsRemaining(botId);
                    }
                }
            }
        }

        // Сохранить Custom IDs для бота
        function saveCustomIds(botId) {
            const input = document.getElementById(`custom-ids-input-${botId}`);
            if (!input) return;

            const bot = bots[botId];
            if (!bot) return;

            // Парсим ID из текста (через запятую, пробел или перенос строки)
            const ids = parseCustomIds(input.value);
            bot.customIdsList = ids;
            bot.customIdsSent = bot.customIdsSent || []; // ID которым уже отправили

            // Сохраняем в accountPreferences
            if (!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
            accountPreferences[bot.login].customIds = ids;
            localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));

            updateCustomIdsRemaining(botId);
            console.log(`💾 Custom IDs сохранены для ${botId}: ${ids.length} ID`);
        }

        // Парсинг ID из строки (поддержка запятых, пробелов, переносов)
        function parseCustomIds(text) {
            if (!text) return [];
            // Разбиваем по запятым, пробелам и переносам строк
            return text.split(/[\s,\n]+/)
                .map(id => id.trim())
                .filter(id => id && /^\d+$/.test(id)); // Только числовые ID
        }

        // Обновить счётчик оставшихся ID
        function updateCustomIdsRemaining(botId) {
            const bot = bots[botId];
            if (!bot) return;

            const total = (bot.customIdsList || []).length;
            const sent = (bot.customIdsSent || []).length;
            const remaining = total - sent;

            const el = document.getElementById(`custom-ids-remaining-${botId}`);
            if (el) el.textContent = remaining;
        }

        // Получить следующий ID из списка Custom IDs
        function getNextCustomId(botId) {
            const bot = bots[botId];
            if (!bot || !bot.customIdsList) return null;

            bot.customIdsSent = bot.customIdsSent || [];

            // Ищем первый ID который ещё не отправлен
            for (const id of bot.customIdsList) {
                if (!bot.customIdsSent.includes(id)) {
                    return id;
                }
            }
            return null; // Все ID отправлены
        }

        // Отметить ID как отправленный
        function markCustomIdSent(botId, id) {
            const bot = bots[botId];
            if (!bot) return;

            bot.customIdsSent = bot.customIdsSent || [];
            if (!bot.customIdsSent.includes(id)) {
                bot.customIdsSent.push(id);
            }
            updateCustomIdsRemaining(botId);
        }

        // Сбросить отправленные Custom IDs (начать заново)
        function resetCustomIdsSent(botId) {
            const bot = bots[botId];
            if (!bot) return;
            bot.customIdsSent = [];
            updateCustomIdsRemaining(botId);
            console.log(`🔄 Custom IDs сброшены для ${botId}`);
        }

        // ============= МУЖЧИНЫ ОНЛАЙН (ГЛОБАЛЬНО) =============
        let globalMenOnlineInterval = null;

        function updateGlobalMenOnline() {
            const botIds = Object.keys(bots);
            if (botIds.length === 0) {
                document.getElementById('global-men-count').textContent = '0';
                return;
            }

            // Берём случайную анкету
            const randomBotId = botIds[Math.floor(Math.random() * botIds.length)];
            const bot = bots[randomBotId];

            if (bot && bot.lastOnlineCount !== undefined) {
                document.getElementById('global-men-count').textContent = bot.lastOnlineCount || '0';
            }
        }

        function startGlobalMenOnlineUpdater() {
            updateGlobalMenOnline();
            if (globalMenOnlineInterval) clearInterval(globalMenOnlineInterval);
            globalMenOnlineInterval = setInterval(updateGlobalMenOnline, 30000); // Каждые 30 сек
        }

        async function makeApiRequest(bot, method, path, data = null, isRetry = false) {
            let endpoint = `${LADADATE_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
            let config = {
                method: method,
                url: endpoint,
                headers: { 'Content-Type': 'application/json' },
                data: data,
                withCredentials: true // Для сохранения и отправки cookies (нужно для /chat-* эндпоинтов)
            };
            if (bot && bot.token) config.headers.Authorization = `Bearer ${bot.token}`;

            // Определяем прокси для запроса
            let proxyConfig = null;

            // 1. Сначала пробуем прокси по позиции бота (ip:port)
            if (bot && bot.id) {
                const positionProxy = getProxyForBot(bot.id);
                if (positionProxy) {
                    proxyConfig = parseSimpleProxy(positionProxy);
                    if (proxyConfig) {
                        console.log(`🌐 Прокси для ${bot.displayId || bot.id}: ${positionProxy}`);
                    }
                }
            }

            // 2. Если нет прокси по позиции, используем общий proxyURL (http://user:pass@ip:port)
            if (!proxyConfig && globalSettings.proxyURL) {
                proxyConfig = parseProxyUrl(globalSettings.proxyURL);
            }

            // 3. Применяем прокси если он есть (без прокси тоже работает)
            if (proxyConfig) {
                config.proxy = proxyConfig;
            }

            try {
                return await axios(config);
            } catch (error) {
                if (error.response && error.response.status === 401 && bot && !isRetry) {
                    console.log(`[Auto-Relogin] Token expired for ${bot.displayId}. Attempting silent relogin...`);
                    try {
                        const loginRes = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: bot.login, Password: bot.pass });

                        if (loginRes.data.Token) {
                            console.log(`[Auto-Relogin] Success for ${bot.displayId}! Retrying original request...`);
                            bot.token = loginRes.data.Token;
                            return await makeApiRequest(bot, method, path, data, true);
                        }
                    } catch (loginErr) {
                        console.error(`[Auto-Relogin] Failed for ${bot.displayId}`, loginErr);
                    }
                }
                throw error;
            }
        }
        
        function toggleAI(botId) {
            const opts = document.getElementById(`ai-options-${botId}`);
            const wasShown = opts.classList.contains('show');
            document.querySelectorAll('.ai-options').forEach(el => el.classList.remove('show'));
            if(!wasShown) opts.classList.add('show');
        }

        // Проверка AI статуса для анкеты (по флагу ai_enabled у переводчика)
        async function checkProfileAIEnabled(profileId) {
            try {
                const response = await fetch(`${LABABOT_SERVER}/api/profiles/${encodeURIComponent(profileId)}/ai-status`);
                const data = await response.json();
                return {
                    enabled: data.aiEnabled === true,
                    reason: data.reason,
                    translatorName: data.translatorName
                };
            } catch (error) {
                console.error(`❌ Ошибка проверки AI статуса:`, error);
                // При ошибке разрешаем использование AI (чтобы не блокировать работу)
                return { enabled: true, reason: 'error' };
            }
        }

        async function handleAIAction(botId, action, event) {
            // Shift + клик = генерация для всех анкет
            if (event && event.shiftKey) {
                document.getElementById(`ai-options-${botId}`).classList.remove('show');
                await generateAIForAll(action);
                return;
            }

            document.getElementById(`ai-options-${botId}`).classList.remove('show');
            const btn = document.querySelector(`#ai-options-${botId}`).parentElement.querySelector('.btn-ai-main');
            const originalHtml = btn.innerHTML;

            // Проверяем, включен ли AI для этой анкеты
            const bot = bots[botId];
            if (bot && bot.displayId) {
                btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Проверка...`;
                const aiStatus = await checkProfileAIEnabled(bot.displayId);
                if (!aiStatus.enabled) {
                    btn.innerHTML = originalHtml;
                    const reason = aiStatus.reason === 'disabled_by_admin'
                        ? 'AI отключен администратором для этой анкеты'
                        : aiStatus.reason === 'no_translator'
                        ? 'Анкете не назначен переводчик'
                        : 'AI недоступен для этой анкеты';
                    alert(`⚠️ ${reason}`);
                    return;
                }
            }

            if(!globalSettings.apiKey) return alert("Пожалуйста, введите OpenAI API Key в настройках!");

            const txtArea = document.getElementById(`msg-${botId}`);
            const currentText = txtArea.value;

            let prompt = "";
            let systemRole = "You are a helpful dating assistant. Write engaging, short, and natural texts for dating sites.";

            if(action === 'myprompt') {
                if(!globalSettings.myPrompt) return alert("Заполните 'My Prompt' в настройках!");
                prompt = `${globalSettings.myPrompt}. \n\nOriginal text: "${currentText}"`;
            } else if (action === 'improve') {
                if(!currentText) return alert("Напишите хоть что-то, чтобы я мог улучшить!");
                prompt = `Rewrite the following text to be more engaging, grammatically correct, and flirtatious. Keep it natural. Text: "${currentText}"`;
            } else if (action === 'generate') {
                prompt = "Write a creative and engaging opening message for a dating site to start a conversation with a man. Keep it short and intriguing.";
            }

            btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Loading...`;
            let config = { headers: { 'Authorization': `Bearer ${globalSettings.apiKey}`, 'Content-Type': 'application/json' } };
            if (globalSettings.proxyAI) {
                 const proxyConfig = parseProxyUrl(globalSettings.proxyAI);
                 if (proxyConfig) config.proxy = proxyConfig;
            }

            try {
                const response = await axios.post(OPENAI_API_ENDPOINT, {
                    model: "gpt-3.5-turbo",
                    messages: [ { role: "system", content: systemRole }, { role: "user", content: prompt } ]
                }, config);

                if(response.data && response.data.choices && response.data.choices.length > 0) {
                    const result = response.data.choices[0].message.content.replace(/^"|"$/g, '');
                    txtArea.value = result;
                    // DEBUG: Проверка botId и bots
                    console.log(`🔍 DEBUG AI: botId = ${botId}, bots[botId] exists = ${!!bots[botId]}`);
                    // Устанавливаем флаг на объекте bot чтобы передать при отправке
                    if (bots[botId]) {
                        bots[botId].usedAi = true;
                        console.log(`🤖 AI генерация для бота ${botId} - флаг usedAi установлен`);
                    } else {
                        console.error(`❌ Бот ${botId} не найден в bots!`);
                    }
                    validateInput(txtArea);
                }
            } catch (e) {
                console.error(e);
                alert("Ошибка AI. Проверьте ключ или прокси.");
            } finally {
                btn.innerHTML = originalHtml;
            }
        }

        // Генерация AI текста для ВСЕХ анкет (параллельно, разные тексты)
        async function generateAIForAll(action) {
            if(!globalSettings.apiKey) return alert("Пожалуйста, введите OpenAI API Key в настройках!");

            const botIds = Object.keys(bots);
            if (botIds.length === 0) return;

            const actionLabel = action === 'improve' ? 'Improve' : action === 'generate' ? 'Generate' : 'My Prompt';
            showBulkNotification(`AI ${actionLabel} запущен для всех...`, botIds.length);

            let config = { headers: { 'Authorization': `Bearer ${globalSettings.apiKey}`, 'Content-Type': 'application/json' } };
            if (globalSettings.proxyAI) {
                const proxyConfig = parseProxyUrl(globalSettings.proxyAI);
                if (proxyConfig) config.proxy = proxyConfig;
            }

            const systemRole = "You are a helpful dating assistant. Write engaging, short, and natural texts for dating sites.";
            let successCount = 0;

            // Генерируем для каждой анкеты последовательно чтобы не перегрузить API
            for (const botId of botIds) {
                const bot = bots[botId];
                const txtArea = document.getElementById(`msg-${botId}`);
                if (!txtArea) continue;

                const currentText = txtArea.value;
                let prompt = "";

                if(action === 'myprompt') {
                    if(!globalSettings.myPrompt) continue;
                    prompt = `${globalSettings.myPrompt}. \n\nOriginal text: "${currentText}"`;
                } else if (action === 'improve') {
                    if(!currentText) continue;
                    prompt = `Rewrite the following text to be more engaging, grammatically correct, and flirtatious. Keep it natural. Text: "${currentText}"`;
                } else if (action === 'generate') {
                    // Каждый раз генерируем уникальный текст
                    prompt = "Write a creative and engaging opening message for a dating site to start a conversation with a man. Keep it short and intriguing. Be unique and creative.";
                }

                if (!prompt) continue;

                try {
                    const response = await axios.post(OPENAI_API_ENDPOINT, {
                        model: "gpt-3.5-turbo",
                        messages: [ { role: "system", content: systemRole }, { role: "user", content: prompt } ],
                        temperature: 0.9 // Больше разнообразия
                    }, config);

                    if(response.data && response.data.choices && response.data.choices.length > 0) {
                        const result = response.data.choices[0].message.content.replace(/^"|"$/g, '');
                        txtArea.value = result;
                        if (bot) {
                            bot.usedAi = true;
                            // Генерируем НОВЫЙ session ID при каждой AI генерации
                            // Это позволяет отличать разные сессии рассылки
                            bot.aiSessionId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                            console.log(`🆔 Сгенерирован новый AI Session ID: ${bot.aiSessionId}`);
                        }
                        validateInput(txtArea);
                        successCount++;
                    }
                } catch (e) {
                    console.error(`AI error for bot ${botId}:`, e);
                }

                // Небольшая задержка между запросами
                await new Promise(r => setTimeout(r, 300));
            }

            showBulkNotification(`AI ${actionLabel} выполнен`, successCount);
        }

        function validateInput(textarea) {
            let val = textarea.value;
            let original = val;
            let errorMsg = null;
            for (let word of forbiddenWords) {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                if (regex.test(val)) { val = val.replace(regex, ''); errorMsg = "Запрещено использовать ругательство"; }
            }
            if (/\d{6,}/.test(val)) { val = val.replace(/\d{6,}/g, ''); errorMsg = "Запрещено вставлять ID"; }
            const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|ru|ua|io)\b)/gi;
            if (linkRegex.test(val)) { val = val.replace(linkRegex, ''); errorMsg = "Запрещено вставлять ссылки"; }
            if (val !== original) { textarea.value = val; if (errorMsg) showToast(errorMsg); }
        }

        function showToast(text) {
            const t = document.getElementById('error-toast');
            document.getElementById('error-toast-text').innerText = text;
            t.classList.add('show');
            if(t.hideTimer) clearTimeout(t.hideTimer);
            t.hideTimer = setTimeout(() => { t.classList.remove('show'); }, 3000);
        }

        function initTooltips() {
            let tooltipTimeout;
            const popup = document.getElementById('tooltip-popup');
            document.addEventListener('mouseover', function(e) {
                const target = e.target.closest('[data-tip]');
                if (!target) return;
                const text = target.getAttribute('data-tip');
                tooltipTimeout = setTimeout(() => {
                    popup.innerText = text;
                    const rect = target.getBoundingClientRect();
                    popup.style.top = (rect.bottom + 5) + 'px';
                    popup.style.left = (rect.left + (rect.width/2) - (popup.offsetWidth/2)) + 'px';
                    if(parseInt(popup.style.left) < 5) popup.style.left = '5px';
                    popup.classList.add('show');
                }, 500);
            });
            document.addEventListener('mouseout', function(e) {
                if (e.target.closest('[data-tip]')) { clearTimeout(tooltipTimeout); popup.classList.remove('show'); }
            });
            document.addEventListener('mousedown', function() { clearTimeout(tooltipTimeout); popup.classList.remove('show'); });
        }

        function loadGlobalSettingsUI() {
            document.getElementById('set-lang').value = globalSettings.lang;
            document.getElementById('set-theme').value = globalSettings.theme;
            document.getElementById('set-proxy').value = globalSettings.proxy;
            document.getElementById('set-proxy-url').value = globalSettings.proxyURL || '';
            document.getElementById('set-proxy-ai').value = globalSettings.proxyAI || '';
            document.getElementById('set-hotkeys').checked = globalSettings.hotkeys;
            document.getElementById('set-apikey').value = globalSettings.apiKey || '';
            document.getElementById('set-prompt').value = globalSettings.myPrompt || '';
            document.getElementById('set-ai-reply-prompt').value = globalSettings.aiReplyPrompt || '';
            document.getElementById('set-sounds').checked = globalSettings.soundsEnabled;
            document.getElementById('set-confirm-close').checked = globalSettings.confirmTabClose;
            document.getElementById('set-extended').checked = globalSettings.extendedFeatures;
            document.getElementById('set-skip-delete-confirm').checked = globalSettings.skipDeleteConfirm;
            document.getElementById('set-translator-id').value = globalSettings.translatorId || '';
            applyTheme(globalSettings.theme);
        }

        function applyTheme(theme) {
            // Убираем все классы тем
            document.body.classList.remove('theme-dark', 'theme-ladadate');

            // Применяем выбранную тему
            if (theme === 'dark') {
                document.body.classList.add('theme-dark');
            } else if (theme === 'ladadate') {
                document.body.classList.add('theme-ladadate');
            }
            // light - без класса, используются стандартные стили
        }

        function saveGlobalSettings() {
            globalSettings.lang = document.getElementById('set-lang').value;
            globalSettings.theme = document.getElementById('set-theme').value;
            globalSettings.proxy = document.getElementById('set-proxy').value;
            globalSettings.proxyURL = document.getElementById('set-proxy-url').value.trim();
            globalSettings.proxyAI = document.getElementById('set-proxy-ai').value.trim();
            globalSettings.hotkeys = document.getElementById('set-hotkeys').checked;
            globalSettings.apiKey = document.getElementById('set-apikey').value;
            globalSettings.myPrompt = document.getElementById('set-prompt').value;
            globalSettings.aiReplyPrompt = document.getElementById('set-ai-reply-prompt').value;
            globalSettings.soundsEnabled = document.getElementById('set-sounds').checked;
            globalSettings.confirmTabClose = document.getElementById('set-confirm-close').checked;
            globalSettings.extendedFeatures = document.getElementById('set-extended').checked;
            globalSettings.skipDeleteConfirm = document.getElementById('set-skip-delete-confirm').checked;

            // Сохраняем Translator ID
            const translatorIdValue = document.getElementById('set-translator-id').value.trim();
            globalSettings.translatorId = translatorIdValue ? parseInt(translatorIdValue) : null;

            // Сохраняем прокси для анкет (1-6)
            for (let i = 1; i <= 6; i++) {
                const proxyInput = document.getElementById(`set-proxy-${i}`);
                if (proxyInput) {
                    globalSettings[`proxy${i}`] = proxyInput.value.trim();
                }
            }

            localStorage.setItem('globalSettings', JSON.stringify(globalSettings));

            // Применяем тему
            applyTheme(globalSettings.theme);

            // Обновляем translatorId для всех существующих ботов
            Object.values(bots).forEach(bot => {
                bot.translatorId = globalSettings.translatorId;
            });
        }

        function openGlobalSettings() {
            // Загружаем значения в форму
            document.getElementById('set-lang').value = globalSettings.lang;
            document.getElementById('set-theme').value = globalSettings.theme;
            document.getElementById('set-proxy').value = globalSettings.proxy;
            document.getElementById('set-proxy-url').value = globalSettings.proxyURL || '';
            document.getElementById('set-proxy-ai').value = globalSettings.proxyAI || '';
            document.getElementById('set-hotkeys').checked = globalSettings.hotkeys;
            document.getElementById('set-apikey').value = globalSettings.apiKey || '';
            document.getElementById('set-prompt').value = globalSettings.myPrompt || '';
            document.getElementById('set-ai-reply-prompt').value = globalSettings.aiReplyPrompt || '';
            document.getElementById('set-sounds').checked = globalSettings.soundsEnabled;
            document.getElementById('set-confirm-close').checked = globalSettings.confirmTabClose;
            document.getElementById('set-extended').checked = globalSettings.extendedFeatures;
            document.getElementById('set-translator-id').value = globalSettings.translatorId || '';

            // Загружаем прокси для анкет (1-6)
            for (let i = 1; i <= 6; i++) {
                const proxyInput = document.getElementById(`set-proxy-${i}`);
                if (proxyInput) {
                    proxyInput.value = globalSettings[`proxy${i}`] || '';
                }
            }

            // Показываем первую вкладку
            switchSettingsTab('interface');
            openModal('settings-modal');
        }

        // Переключение вкладок в настройках
        function switchSettingsTab(tabName) {
            // Скрываем все панели
            document.querySelectorAll('.settings-panel').forEach(panel => panel.classList.remove('active'));
            // Убираем активный класс со всех вкладок
            document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));

            // Показываем нужную панель
            const panel = document.getElementById(`settings-panel-${tabName}`);
            if (panel) panel.classList.add('active');

            // Активируем нужную вкладку
            const tabs = document.querySelectorAll('.settings-tab');
            tabs.forEach(tab => {
                if (tab.textContent.toLowerCase().includes(tabName.substring(0, 3)) ||
                    tab.onclick.toString().includes(tabName)) {
                    tab.classList.add('active');
                }
            });
            // Более надежный способ - по onclick
            document.querySelectorAll('.settings-tab').forEach(tab => {
                if (tab.getAttribute('onclick') && tab.getAttribute('onclick').includes(`'${tabName}'`)) {
                    tab.classList.add('active');
                }
            });
        }

        // Тест прокси
        async function testProxy(num) {
            const proxyInput = document.getElementById(`set-proxy-${num}`);
            const statusSpan = document.getElementById(`proxy-status-${num}`);
            const proxy = proxyInput.value.trim();

            if (!proxy) {
                statusSpan.innerHTML = '<i class="fa fa-exclamation-circle"></i>';
                statusSpan.className = 'proxy-status error';
                statusSpan.title = 'Введите прокси';
                return;
            }

            statusSpan.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
            statusSpan.className = 'proxy-status testing';
            statusSpan.title = 'Проверка...';

            try {
                // Проверяем прокси через простой запрос
                const [host, port] = proxy.split(':');
                if (!host || !port) {
                    throw new Error('Неверный формат. Используйте ip:port');
                }

                // Простая проверка формата
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                const portNum = parseInt(port);

                if (!ipRegex.test(host) || isNaN(portNum) || portNum < 1 || portNum > 65535) {
                    throw new Error('Неверный IP или порт');
                }

                // Если формат правильный - показываем успех (реальная проверка требует backend)
                statusSpan.innerHTML = '<i class="fa fa-check-circle"></i>';
                statusSpan.className = 'proxy-status success';
                statusSpan.title = `Формат верный: ${host}:${port}`;

            } catch (e) {
                statusSpan.innerHTML = '<i class="fa fa-times-circle"></i>';
                statusSpan.className = 'proxy-status error';
                statusSpan.title = e.message || 'Ошибка';
            }
        }

        // Получить прокси для бота по его позиции
        function getProxyForBot(botId) {
            const botIds = Object.keys(bots);
            const position = botIds.indexOf(botId) + 1; // позиция с 1

            if (position <= 0) return null;

            // Определяем какой прокси использовать
            const proxyIndex = Math.ceil(position / 10); // 1-10 -> 1, 11-20 -> 2, и т.д.

            if (proxyIndex > 6) return null; // У нас только 6 прокси

            const proxy = globalSettings[`proxy${proxyIndex}`];
            return proxy || null;
        }

        // Экспорт/Импорт настроек
        function exportSettings() {
            const data = {
                globalSettings,
                botTemplates,
                accountPreferences
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lababot-settings-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        function importSettings() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        if (data.globalSettings) {
                            globalSettings = { ...defaultSettings, ...data.globalSettings };
                            localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
                        }
                        if (data.botTemplates) {
                            botTemplates = data.botTemplates;
                            localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                        }
                        if (data.accountPreferences) {
                            accountPreferences = data.accountPreferences;
                            localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
                        }
                        alert('Настройки импортированы! Перезагрузите страницу.');
                    } catch (err) {
                        alert('Ошибка импорта: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        function toggleExtendedFeatures() {
            const isEnabled = globalSettings.extendedFeatures;
            document.querySelectorAll('.ai-container').forEach(el => {
                if(isEnabled) el.classList.remove('ai-hidden'); else el.classList.add('ai-hidden');
            });
            const promptContainer = document.getElementById('set-prompt-container');
            if(promptContainer) {
                if(isEnabled) promptContainer.classList.remove('ai-hidden'); else promptContainer.classList.add('ai-hidden');
            }
        }

        function initHotkeys() {
            document.addEventListener('keydown', function(e) {
                if(!globalSettings.hotkeys) return;
                // Ctrl+Tab - следующая вкладка, Ctrl+Shift+Tab - предыдущая вкладка
                if(e.ctrlKey && e.key === 'Tab') {
                    e.preventDefault();
                    e.stopPropagation();
                    switchTabRelative(e.shiftKey ? -1 : 1);
                }
                else if(e.shiftKey && e.key === 'F5') { e.preventDefault(); reloginAllBots(); }
                else if(e.key === 'F5') { e.preventDefault(); if(activeTabId && bots[activeTabId]) bots[activeTabId].doActivity(); }
                // НОВОЕ: Ctrl+Shift+F - "разблокировка" ввода (диагностика и восстановление фокуса)
                else if(e.ctrlKey && e.shiftKey && e.key === 'F') {
                    e.preventDefault();
                    debugFocusIssue();
                }
            }, true); // capture phase для перехвата до браузера
        }

        // НОВАЯ ФУНКЦИЯ: Защита от потери фокуса
        function initFocusProtection() {
            let lastActiveElement = null;

            // Отслеживаем активный элемент
            document.addEventListener('focusin', (e) => {
                if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                    lastActiveElement = e.target;
                }
            });

            // Блокируем webview от получения фокуса
            document.addEventListener('focusin', (e) => {
                if (e.target.tagName === 'WEBVIEW') {
                    e.preventDefault();
                    e.stopPropagation();
                    console.warn('[Focus Protection] WebView попытался получить фокус - заблокировано!');

                    // Возвращаем фокус на последний активный элемент
                    if (lastActiveElement) {
                        setTimeout(() => {
                            lastActiveElement.focus();
                            console.log('[Focus Protection] Фокус возвращен на', lastActiveElement.id || lastActiveElement.className);
                        }, 10);
                    }
                }
            }, true);

            // Периодическая проверка модальных окон (каждую секунду)
            setInterval(() => {
                const modals = document.querySelectorAll('.modal-overlay.show');
                if (modals.length > 0) {
                    console.warn('[Focus Protection] Обнаружены открытые модальные окна:', modals.length);
                }
            }, 1000);

            console.log('%c[Focus Protection] Защита от потери фокуса активирована', 'color: green; font-weight: bold');
            console.log('%cГорячая клавиша для диагностики: Ctrl+Shift+F', 'color: blue');
        }

        // НОВАЯ ФУНКЦИЯ: Диагностика проблем с фокусом
        function debugFocusIssue() {
            console.log('\n========== ДИАГНОСТИКА ФОКУСА ==========');

            const activeEl = document.activeElement;
            console.log('Активный элемент:', activeEl);
            console.log('Тип:', activeEl.tagName);
            console.log('ID:', activeEl.id || '(нет)');
            console.log('Class:', activeEl.className || '(нет)');

            // Проверяем модальные окна
            const openModals = document.querySelectorAll('.modal-overlay.show');
            console.log('Открытых модальных окон:', openModals.length);
            openModals.forEach((modal, idx) => {
                console.log(`  Модальное окно ${idx + 1}:`, modal.id);
            });

            // Проверяем webview элементы
            const webviews = document.querySelectorAll('webview');
            console.log('WebView элементов:', webviews.length);

            // Проверяем z-index перекрытий
            const highZIndex = Array.from(document.querySelectorAll('*'))
                .filter(el => {
                    const zIndex = window.getComputedStyle(el).zIndex;
                    return zIndex !== 'auto' && parseInt(zIndex) > 1000;
                })
                .map(el => ({
                    element: el.tagName + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.split(' ')[0]}` : ''),
                    zIndex: window.getComputedStyle(el).zIndex
                }));

            console.log('Элементы с высоким z-index:', highZIndex);

            // Закрываем все модальные окна
            openModals.forEach(modal => {
                modal.classList.remove('show');
                setTimeout(() => { modal.style.display = 'none'; }, 300);
                console.log('Закрыто модальное окно:', modal.id);
            });

            // Пытаемся вернуть фокус на textarea активной вкладки
            if (activeTabId) {
                const textarea = document.querySelector(`#msg-${activeTabId}`);
                if (textarea) {
                    textarea.focus();
                    console.log('Фокус возвращен на textarea:', textarea.id);

                    // Проверяем что фокус действительно вернулся
                    setTimeout(() => {
                        if (document.activeElement === textarea) {
                            console.log('%c✅ ПРОБЛЕМА РЕШЕНА! Ввод работает.', 'color: green; font-weight: bold');
                        } else {
                            console.error('%c❌ Фокус не вернулся. Проверьте DevTools или перезапустите приложение.', 'color: red; font-weight: bold');
                        }
                    }, 100);
                }
            }

            console.log('========================================\n');
        }
        
        function switchTabRelative(step) {
            const keys = Object.keys(bots);
            if(keys.length < 2) return;
            const currentIdx = keys.indexOf(activeTabId);
            if(currentIdx === -1) return;
            let nextIdx = currentIdx + step;
            if(nextIdx >= keys.length) nextIdx = 0;
            if(nextIdx < 0) nextIdx = keys.length - 1;
            selectTab(keys[nextIdx]);
        }

        function toggleGlobalMode() {
            const btn = document.getElementById('btn-mode-toggle');
            if (globalMode === 'mail') {
                globalMode = 'chat';
                document.body.classList.remove('mode-mail'); document.body.classList.add('mode-chat');
                btn.innerHTML = '<i class="fa fa-comments"></i>'; btn.className = 'btn btn-circle btn-mode-switch active-chat';
            } else {
                globalMode = 'mail';
                document.body.classList.remove('mode-chat'); document.body.classList.add('mode-mail');
                btn.innerHTML = '<i class="fa fa-envelope"></i>'; btn.className = 'btn btn-circle btn-mode-switch active-mail';
            }
            if(activeTabId && bots[activeTabId]) updateInterfaceForMode(activeTabId);
        }

        function updateBotCount() { document.getElementById('global-bot-count').innerText = `Анкет: ${Object.keys(bots).length}`; }
        function openModal(id) { const el=document.getElementById(id); el.style.display='flex'; setTimeout(()=>{el.classList.add('show');},10); }
        function closeModal(id) { const el=document.getElementById(id); el.classList.remove('show'); setTimeout(()=>{el.style.display='none';},300); }

        function checkVarTrigger(textarea, dropdownId) { if(textarea.value.endsWith('{')) document.getElementById(dropdownId).style.display='block'; }
        function applyVar(textareaId, text, dropdownId) {
            const ta = document.getElementById(textareaId);
            ta.value = ta.value.endsWith('{') ? ta.value.slice(0, -1) + text : ta.value + text;
            document.getElementById(dropdownId).style.display='none'; ta.focus();
        }

        // === ПЕРЕМЕННЫЕ ТРАНСКРИПЦИИ (все 10 из API) ===
        const TRANSCRIPTION_VARIABLES = [
            { name: '{name}', desc: 'Имя', example: 'John Doe' },
            { name: '{age}', desc: 'Возраст', example: '38' },
            { name: '{city}', desc: 'Город', example: 'Paris' },
            { name: '{country}', desc: 'Страна', example: 'France' },
            { name: '{countryCode}', desc: 'Код страны', example: 'FR' },
            { name: '{accountId}', desc: 'ID аккаунта', example: '123456' },
            { name: '{birthday}', desc: 'День рождения', example: '1985-01-15' },
            { name: '{ageFrom}', desc: 'Ищет от (возраст)', example: '25' },
            { name: '{ageTo}', desc: 'Ищет до (возраст)', example: '35' },
            { name: '{profilePhoto}', desc: 'URL фото', example: 'https://...' }
        ];

        // Текущий textarea для контекстного меню
        let currentContextMenuTextarea = null;

        // Создание контекстного меню при загрузке
        function createTranscriptionContextMenu() {
            // Удаляем старое меню если есть
            const existingMenu = document.getElementById('transcription-context-menu');
            if (existingMenu) existingMenu.remove();

            // Создаём новое меню
            const menu = document.createElement('div');
            menu.id = 'transcription-context-menu';
            menu.className = 'transcription-context-menu';

            // Заголовок
            const header = document.createElement('div');
            header.className = 'transcription-context-menu-header';
            header.textContent = 'Вставить переменную';
            menu.appendChild(header);

            // Пункты меню
            TRANSCRIPTION_VARIABLES.forEach(v => {
                const item = document.createElement('div');
                item.className = 'transcription-context-menu-item';
                item.innerHTML = `<span class="var-name">${v.name}</span><span class="var-desc">${v.desc}</span>`;
                item.onclick = () => insertTranscriptionVar(v.name);
                menu.appendChild(item);
            });

            document.body.appendChild(menu);

            // Закрытие меню при клике вне него
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target)) {
                    menu.classList.remove('show');
                }
            });

            // Закрытие по Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    menu.classList.remove('show');
                }
            });
        }

        // Показ контекстного меню
        function showTranscriptionContextMenu(e, textarea) {
            e.preventDefault();
            currentContextMenuTextarea = textarea;

            // Если меню ещё не создано - создаём
            let menu = document.getElementById('transcription-context-menu');
            if (!menu) {
                createTranscriptionContextMenu();
                menu = document.getElementById('transcription-context-menu');
            }
            if (!menu) return;

            // Позиционируем меню
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            // Проверяем границы экрана
            menu.classList.add('show');
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (e.clientX - rect.width) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (e.clientY - rect.height) + 'px';
            }
        }

        // Вставка переменной в textarea
        function insertTranscriptionVar(varName) {
            const menu = document.getElementById('transcription-context-menu');
            if (menu) menu.classList.remove('show');

            if (!currentContextMenuTextarea) return;

            const textarea = currentContextMenuTextarea;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;

            // Вставляем переменную в позицию курсора
            textarea.value = text.substring(0, start) + varName + text.substring(end);

            // Устанавливаем курсор после вставленной переменной
            const newPos = start + varName.length;
            textarea.setSelectionRange(newPos, newPos);
            textarea.focus();

            // Триггерим события для автосохранения
            textarea.dispatchEvent(new Event('input', { bubbles: true }));

            // Если есть botId, сохраняем шаблон
            const botIdMatch = textarea.id.match(/msg-(.+)/);
            if (botIdMatch && botIdMatch[1]) {
                autoSaveTemplateText(botIdMatch[1]);
            }
        }

        // Инициализация контекстного меню для всех textarea сообщений
        function initTranscriptionContextMenu() {
            createTranscriptionContextMenu();

            // Добавляем обработчик на document для делегирования событий
            document.addEventListener('contextmenu', (e) => {
                const textarea = e.target.closest('.textarea-msg');
                if (textarea) {
                    showTranscriptionContextMenu(e, textarea);
                }
            });

            console.log('✅ Контекстное меню транскрипции инициализировано');
        }

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
                this.chatSettings = { target: 'online', speed: 'smart', blacklist: [], rotationHours: 3, cyclic: false, currentInviteIndex: 0, rotationStartTime: 0 };
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

                // === Статус разрешения рассылки (управляется с сервера) ===
                this.mailingEnabled = true; // По умолчанию разрешено, сервер может отключить

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
            async createWebview() {
                // ПРОКСИ УСТАНАВЛИВАЕТСЯ СНАРУЖИ после добавления в bots (чтобы getAccountNumber работал)

                const webview = document.createElement('webview');
                webview.id = `webview-${this.id}`;
                webview.src = "https://ladadate.com/login";
                webview.partition = `persist:${this.id}`;
                webview.useragent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                webview.setAttribute('tabindex', '-1'); // Блокируем получение фокуса через Tab

                // ВАЖНО: Отключаем звук СРАЗУ при создании (до загрузки страницы)
                // Это предотвращает шипение/звуки при открытии бота
                webview.addEventListener('did-attach', () => {
                    if (webview.setAudioMuted) {
                        webview.setAudioMuted(true);
                        console.log(`[WebView ${this.id}] 🔇 Звук превентивно отключен при attach`);
                    }
                });

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
                        const partnerIdStr = partnerId.toString();
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
                                type: 'chat',
                                messageText: truncatedBody
                            });

                            // 🔥 АВТОМАТИЧЕСКОЕ ДОБАВЛЕНИЕ В ЧС если мужчина ответил на чат-рассылку
                            if (this.chatContactedUsers.has(partnerIdStr) && !this.chatSettings.blacklist.includes(partnerIdStr)) {
                                this.chatSettings.blacklist.push(partnerIdStr);
                                saveBlacklistToServer(this.login, this.chatSettings.blacklist);
                                Logger.add(
                                    `✅ <b>${partnerName}</b> автоматически добавлен в ЧС (ответил на чат-рассылку)`,
                                    'log',
                                    this.id
                                );
                                console.log(`[Lababot] ✅ ${partnerIdStr} добавлен в ЧС автоматически (чат)`);
                            }

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
                        const partnerIdStr = partnerId.toString();
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

                                // 🔥 АВТОМАТИЧЕСКОЕ ДОБАВЛЕНИЕ В ЧС если мужчина ответил на чат-рассылку
                                if (this.chatContactedUsers.has(partnerIdStr) && !this.chatSettings.blacklist.includes(partnerIdStr)) {
                                    this.chatSettings.blacklist.push(partnerIdStr);
                                    saveBlacklistToServer(this.login, this.chatSettings.blacklist);
                                    Logger.add(
                                        `✅ <b>${partnerName}</b> автоматически добавлен в ЧС (ответил в активном чате)`,
                                        'log',
                                        this.id
                                    );
                                    console.log(`[Lababot] ✅ ${partnerIdStr} добавлен в ЧС автоматически (активный чат)`);
                                }

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
                            const manId = msg.User.AccountId.toString();
                            // Текст берём из msg.Text, msg.Body или msg.Preview если есть
                            const mailText = msg.Text || msg.Body || msg.Preview || null;

                            // Отправляем входящее сообщение на сервер статистики
                            sendIncomingMessageToLababot({
                                botId: this.id,
                                profileId: this.displayId,
                                manId: msg.User.AccountId,
                                manName: msg.User.Name,
                                messageId: msg.MessageId,
                                type: 'letter',
                                messageText: mailText
                            });

                            // 🔥 АВТОМАТИЧЕСКОЕ ДОБАВЛЕНИЕ В ЧС если мужчина ответил на рассылку
                            if (this.mailContactedUsers.has(manId) && !this.mailSettings.blacklist.includes(manId)) {
                                this.mailSettings.blacklist.push(manId);
                                saveBlacklistToServer(this.login, this.mailSettings.blacklist);
                                Logger.add(
                                    `✅ <b>${msg.User.Name || `ID ${manId}`}</b> автоматически добавлен в ЧС (ответил на рассылку)`,
                                    'log',
                                    this.id
                                );
                                console.log(`[Lababot] ✅ ${manId} добавлен в ЧС автоматически`);
                            }

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
                    if(res.data.Users) document.getElementById(`online-${this.id}`).innerText = res.data.Users.length;
                } catch (e) {}
            }

            async startMail(text) {
                if(!this.token) return;

                // Проверяем panic mode с сервера
                if (controlStatus.panicMode) {
                    this.log(`🚨 Запуск заблокирован - активен Panic Mode`);
                    showToast('🚨 Panic Mode активен! Рассылка заблокирована.', 'error');
                    return;
                }

                // Проверяем статус бот-машины (управляется с сервера)
                if (!controlStatus.botEnabled) {
                    this.log(`🔴 Запуск заблокирован - бот отключен администратором`);
                    showToast('🔴 Бот отключен администратором! Рассылка невозможна.', 'error');
                    return;
                }

                // Проверяем разрешение рассылки для этой анкеты (управляется с сервера)
                if (!this.mailingEnabled) {
                    this.log(`⛔ Запуск заблокирован - рассылка отключена администратором`);
                    showToast(`Анкета ${this.displayId}: рассылка отключена администратором`, 'warning');
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
                            // Создаём объект пользователя с минимальными данными
                            // Реальные данные получим при check-send
                            users.push({
                                AccountId: parseInt(nextId),
                                Name: '',
                                City: '',
                                Age: '',
                                Country: ''
                            });
                        } else {
                            this.log(`✅ Custom IDs: все ID из списка обработаны`);
                            // Если включен авто-режим, переключаемся на следующий статус
                            if (this.mailSettings.auto) {
                                const newTarget = getNextActiveStatus('payers'); // Начинаем с начала цикла
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
                            usedAi: this.usedAi || false,
                            aiSessionId: this.aiSessionId || null
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

                // Проверяем panic mode с сервера
                if (controlStatus.panicMode) {
                    this.log(`🚨 Запуск заблокирован - активен Panic Mode`);
                    showToast('🚨 Panic Mode активен! Рассылка заблокирована.', 'error');
                    return;
                }

                // Проверяем статус бот-машины (управляется с сервера)
                if (!controlStatus.botEnabled) {
                    this.log(`🔴 Запуск заблокирован - бот отключен администратором`);
                    showToast('🔴 Бот отключен администратором! Рассылка невозможна.', 'error');
                    return;
                }

                // Проверяем разрешение рассылки для этой анкеты (управляется с сервера)
                if (!this.mailingEnabled) {
                    this.log(`⛔ Запуск заблокирован - рассылка отключена администратором`);
                    showToast(`Анкета ${this.displayId}: рассылка отключена администратором`, 'warning');
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
                            usedAi: this.usedAi || false,
                            aiSessionId: this.aiSessionId || null
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

                // Все 10 переменных транскрипции из API
                res = res.replace(/{name}/gi, user.Name || "dear");
                res = res.replace(/{age}/gi, user.Age || "");
                res = res.replace(/{city}/gi, user.City || "your city");
                res = res.replace(/{country}/gi, user.Country || "your country");
                res = res.replace(/{countryCode}/gi, user.CountryCode || "");
                res = res.replace(/{accountId}/gi, user.AccountId || "");
                res = res.replace(/{birthday}/gi, user.Birthday || "");
                res = res.replace(/{ageFrom}/gi, user.AgeFrom || "");
                res = res.replace(/{ageTo}/gi, user.AgeTo || "");
                res = res.replace(/{profilePhoto}/gi, user.ProfilePhoto || "");

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
        
        function createInterface(bot) {
            const tab = document.createElement('div');
            tab.className = 'tab-item';
            tab.id = `tab-${bot.id}`;
            tab.onclick = () => selectTab(bot.id);
            tab.oncontextmenu = (e) => onTabRightClick(e, bot.id);
            
            // ОБНОВЛЕНИЕ 2: Привязка нового события DragNDrop
            tab.onmousedown = (e) => startTabDrag(e, tab);

            tab.innerHTML = `<div class="status-dot online"></div><span class="tab-id">${bot.displayId}</span><span class="tab-spinner"><i class="fa fa-sync fa-spin"></i></span><span class="tab-close" onclick="closeTab(event, '${bot.id}')"><i class="fa fa-times"></i></span>`;
            document.getElementById('tabs-bar').appendChild(tab);

            const ws = document.createElement('div');
            ws.className = 'workspace';
            ws.id = `ws-${bot.id}`;
            const row = document.createElement('div'); row.className = 'row h-100 g-2';
            
            // Col 1
            const col1 = document.createElement('div'); col1.className='col-3';
            col1.innerHTML = `
                <div class="panel-col">
                    <div class="col-title" id="title-tpl-${bot.id}">Шаблоны Писем</div>
                    <select id="tpl-select-${bot.id}" class="form-select mb-2" onchange="onTemplateSelect('${bot.id}')"><option value="">-- Выберите --</option></select>
                    <div class="d-flex gap-1 mb-2">
                        <button class="btn btn-sm btn-success btn-xs flex-fill" onclick="addTemplateInline('${bot.id}', event)" data-tip="Новый шаблон (Shift=всем)"><i class="fa fa-plus"></i></button>
                        <button class="btn btn-sm btn-secondary btn-xs flex-fill" onclick="openTemplateModal('${bot.id}', true)" data-tip="Редактировать"><i class="fa fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger btn-xs flex-fill" onclick="deleteTemplate('${bot.id}', event)" data-tip="Удалить (Shift=всем)"><i class="fa fa-trash"></i></button>
                        <button class="btn btn-sm btn-outline-danger btn-xs flex-fill hide-in-chat" id="btn-fav-${bot.id}" onclick="toggleTemplateFavorite('${bot.id}')" data-tip="В избранное"><i class="fa fa-heart"></i></button>
                    </div>

                    <!-- Кнопка SHARE MY CAM (только в режиме Chat) -->
                    <button class="btn btn-share-cam w-100 mb-2 hide-in-mail" id="btn-share-cam-${bot.id}" onclick="openVideoChatWindow('${bot.id}')">
                        <i class="fa fa-video-camera"></i> SHARE MY CAM
                    </button>

                    <!-- Секция автоответов (только для Chat режима) -->
                    <div class="auto-reply-section hide-in-mail" id="auto-reply-section-${bot.id}">
                        <div class="auto-reply-header">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="auto-reply-enabled-${bot.id}" onchange="toggleAutoReply('${bot.id}')">
                                <label class="form-check-label" for="auto-reply-enabled-${bot.id}">
                                    <i class="fa fa-robot"></i> Автоответы
                                </label>
                            </div>
                        </div>
                        <div class="auto-reply-list" id="auto-reply-list-${bot.id}"></div>
                        <button class="btn btn-sm btn-outline-success w-100 mt-1" onclick="addAutoReply('${bot.id}')">
                            <i class="fa fa-plus"></i> Добавить автоответ
                        </button>
                    </div>

                    <div class="mt-2 text-center text-primary border-top pt-2"><small>Онлайн: <b id="online-${bot.id}" class="fs-6">...</b></small></div>
                </div>`;
            row.appendChild(col1);

            // Col 2
            const col2 = document.createElement('div'); col2.className='col-4';
            col2.innerHTML = `
                <div class="panel-col">
                    <div class="col-title">
                        <span id="title-text-${bot.id}">Письмо</span>
                        <div class="ai-container ${globalSettings.extendedFeatures ? '' : 'ai-hidden'}">
                            <button class="btn-ai-main" onclick="toggleAI('${bot.id}')"><i class="fa fa-magic"></i> AI</button>
                            <div class="ai-options" id="ai-options-${bot.id}">
                                <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'improve', event)" title="Shift=всем"><i class="fa fa-check"></i> Improve</button>
                                <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'generate', event)" title="Shift=всем"><i class="fa fa-pencil"></i> Generate</button>
                                <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'myprompt', event)" title="Shift=всем"><i class="fa fa-user"></i> My Prompt</button>
                            </div>
                    </div>
                    </div>
                    <div class="relative-box d-flex flex-column flex-grow-1">
                        <textarea id="msg-${bot.id}" class="textarea-msg form-control" disabled placeholder="Текст..." onclick="this.focus()" oninput="bots['${bot.id}'].updateUI(); validateInput(this); autoSaveTemplateText('${bot.id}')" onblur="saveTemplateTextNow('${bot.id}')"></textarea>
                    </div>
                    <div id="active-invite-${bot.id}" class="active-invite-box hide-in-mail"></div>
                    <div class="photo-block hide-in-chat">
                        <div id="preview-box-${bot.id}" class="photo-preview-float"><img id="preview-img-${bot.id}"></div>
                        <label id="photo-label-${bot.id}" class="photo-select-area">
                            <i class="fa fa-camera"></i> <span id="photo-name-${bot.id}" class="photo-name">Прикрепить фото</span>
                            <input type="file" id="photo-input-${bot.id}" hidden onchange="onPhotoSelect('${bot.id}')">
                        </label>
                        <button class="btn-remove-photo" onclick="removePhoto('${bot.id}')"><i class="fa fa-times"></i></button>
                    </div>
                </div>`;
            row.appendChild(col2);

            // Col 3
            const col3 = document.createElement('div'); col3.className='col-3';
            col3.innerHTML = `
                <div class="panel-col">
                    <div class="col-title">Настройки</div>
                    <select id="target-select-${bot.id}" class="form-select form-select-sm mb-1" onchange="updateSettings('${bot.id}'); toggleCustomIdsField('${bot.id}')">
                        <option value="online">Online</option>
                        <option value="favorites">I am a favorite of</option>
                        <option value="my-favorites">My favorite</option>
                        <option value="inbox">Inbox (Unreplied)</option>
                        <option value="payers">Payers</option>
                        <option value="custom-ids">Custom IDs</option>
                    </select>
                    <div id="custom-ids-field-${bot.id}" class="custom-ids-field mb-1" style="display: none;">
                        <textarea id="custom-ids-input-${bot.id}" class="form-control form-control-sm" rows="2" placeholder="ID через запятую, пробел или в столбик" onchange="saveCustomIds('${bot.id}')"></textarea>
                        <small class="text-muted">Осталось: <span id="custom-ids-remaining-${bot.id}">0</span></small>
                    </div>

                    <div class="d-flex align-items-center gap-2 mb-2">
                        <select class="form-select form-select-sm" id="speed-select-${bot.id}" style="width: 100px;" onmousedown="shiftWasPressed=event.shiftKey" onchange="handleSpeedChange('${bot.id}', this.value)" title="Скорость отправки (Shift=всем)">
                            <option value="smart" selected>Smart</option>
                            <option value="15">15s</option>
                            <option value="30">30s</option>
                        </select>
                        <div class="form-check small m-0 hide-in-chat" title="Auto: Payers -> My Favorite -> Favorites -> Inbox -> Online (Shift=всем)">
                            <input class="form-check-input" type="checkbox" id="auto-check-${bot.id}" onmousedown="shiftWasPressed=event.shiftKey" onchange="handleAutoChange('${bot.id}')">
                            <label class="form-check-label text-muted" for="auto-check-${bot.id}">Auto</label>
                        </div>
                        <div class="form-check small m-0 hide-in-chat" title="Отправлять только пользователям с фото">
                            <input class="form-check-input" type="checkbox" id="check-photo-${bot.id}" onchange="updateSettings('${bot.id}')">
                            <label class="form-check-label text-muted" for="check-photo-${bot.id}">Photo</label>
                        </div>
                    </div>

                    <div class="mb-2 hide-in-mail p-2 bg-light border rounded">
                        <label class="form-label small mb-0 text-muted">Следующий инвайт через</label>
                        <select class="form-select form-select-sm mb-1" id="rot-time-${bot.id}" onchange="updateChatRotation('${bot.id}')">
                            <option value="3">3 часа</option>
                            <option value="6">6 часов</option>
                            <option value="12">12 часа</option>
                            <option value="24">24 часа</option>
                        </select>
                        <div class="form-check small">
                            <input class="form-check-input" type="checkbox" id="rot-cyclic-${bot.id}" onchange="updateChatRotation('${bot.id}')">
                            <label class="form-check-label" for="rot-cyclic-${bot.id}">Циклично</label>
                        </div>
                    </div>

                    <button id="btn-start-${bot.id}" class="btn btn-primary w-100 mb-2" onclick="toggleBot('${bot.id}')"><i class="fa fa-paper-plane"></i> Старт</button>
                    
                    <div class="border-top pt-2">
                        <div class="stat-line text-success"><span>Отправлено:</span> <b id="stat-sent-${bot.id}" class="stat-val" onclick="openStatsModal('${bot.id}', 'sent')">0</b></div>
                        <div class="stat-line text-danger"><span>Ошибки:</span> <b id="stat-err-${bot.id}" class="stat-val" onclick="openStatsModal('${bot.id}', 'errors')">0</b></div>
                        <div id="stat-wait-${bot.id}" class="stat-waiting-text">Ожидают: 0</div>
                    </div>
                    <div id="log-${bot.id}" class="action-log mt-2" style="flex-grow: 1;"></div>
                </div>`;
            row.appendChild(col3);

            // Col 4
            const col4 = document.createElement('div'); col4.className='col-2';
            col4.innerHTML = `
                <div class="panel-col">
                    <div class="col-title">Blacklist</div>
                    <div id="bl-list-${bot.id}" class="scroll-list"></div>
                    <button class="btn btn-success w-100 btn-sm" onclick="openBlacklistModal('${bot.id}')" data-tip="Добавить ID">+ Добавить ID</button>
                    <div class="bl-actions">
                        <button class="btn btn-outline-danger btn-sm flex-fill" onclick="removeSelectedBlacklist('${bot.id}')" data-tip="Удалить выбранный"><i class="fa fa-trash"></i></button>
                        <button class="btn btn-vip btn-sm flex-fill" onclick="toggleVipStatus('${bot.id}')" data-tip="VIP Клиент (Отслеживать онлайн)"><i class="fa fa-star"></i></button>
                    </div>
                </div>`;
            row.appendChild(col4);
            ws.appendChild(row);
            document.getElementById('panels-container').appendChild(ws);
            updateInterfaceForMode(bot.id);
            updateBotCount();
            
            toggleExtendedFeatures();
        }

        function getBotTemplates(login) {
             if(!botTemplates[login]) botTemplates[login] = { mail: [], chat: [] };
             return botTemplates[login];
        }

        function updateInterfaceForMode(botId) {
            const isChat = globalMode === 'chat';
            const bot = bots[botId];
            document.getElementById(`title-tpl-${botId}`).innerText = isChat ? "Шаблоны ЧАТА" : "Шаблоны ПИСЕМ";
            document.getElementById(`title-text-${botId}`).innerText = isChat ? "Сообщения (разд. __)" : "Текст письма";
            document.getElementById(`chat-hint`).style.display = isChat ? 'block' : 'none';
            const ws = document.getElementById(`ws-${botId}`);
            const targetSelect = document.getElementById(`target-select-${botId}`);

            if(isChat) {
                ws.querySelectorAll('.hide-in-chat').forEach(el => el.style.display = 'none');
                ws.querySelectorAll('.hide-in-mail').forEach(el => el.style.display = 'block');

                Array.from(targetSelect.options).forEach(opt => {
                    // Скрываем опции недоступные в Chat режиме (включая custom-ids)
                    if (['favorites', 'my-favorites', 'inbox', 'custom-ids'].includes(opt.value)) { opt.style.display = 'none'; }
                    else { opt.style.display = 'block'; }
                });
                targetSelect.value = bot.chatSettings.target;

                // Скрываем поле Custom IDs в Chat режиме
                const customIdsField = document.getElementById(`custom-ids-field-${botId}`);
                if (customIdsField) customIdsField.style.display = 'none';

                document.getElementById(`rot-time-${botId}`).value = bot.chatSettings.rotationHours;
                document.getElementById(`rot-cyclic-${botId}`).checked = bot.chatSettings.cyclic;
            } else {
                ws.querySelectorAll('.hide-in-chat').forEach(el => { if(el.classList.contains('photo-block')) el.style.display = 'flex'; else el.style.display = 'block'; });
                ws.querySelectorAll('.hide-in-chat.d-none').forEach(el => el.style.display = 'none');
                ws.querySelectorAll('.hide-in-mail').forEach(el => el.style.display = 'none');

                Array.from(targetSelect.options).forEach(opt => opt.style.display = 'block');
                targetSelect.value = bot.mailSettings.target;

                // Показываем поле Custom IDs если выбран этот режим
                toggleCustomIdsField(botId);

                document.getElementById(`auto-check-${botId}`).checked = bot.mailSettings.auto;
            }
            
            let lastIdx = isChat ? bot.lastTplChat : bot.lastTplMail;
            if (lastIdx === null || lastIdx === undefined || lastIdx === "") {
                if(accountPreferences[bot.login]) {
                    lastIdx = isChat ? accountPreferences[bot.login].chatTpl : accountPreferences[bot.login].mailTpl;
                    if(lastIdx !== undefined) {
                         if(isChat) bot.lastTplChat = lastIdx; else bot.lastTplMail = lastIdx;
                    }
                }
            }

            updateTemplateDropdown(botId, lastIdx);
            renderBlacklist(botId);
            bot.updateUI();
        }

        function updateSettings(botId, type, val) {
            const isChat = globalMode === 'chat';
            const bot = bots[botId];
            const set = isChat ? bot.chatSettings : bot.mailSettings;
            if (type === 'speed') set.speed = val;
            else {
                set.target = document.getElementById(`target-select-${botId}`).value;
                if(!isChat) {
                    set.photoOnly = document.getElementById(`check-photo-${botId}`).checked;
                    bot.mailSettings.auto = document.getElementById(`auto-check-${botId}`).checked;
                }
            }
            saveSession();
        }

        // Обработчик Auto с поддержкой Shift
        function handleAutoChange(botId) {
            const checkbox = document.getElementById(`auto-check-${botId}`);
            const isChecked = checkbox.checked;

            if (shiftWasPressed) {
                // Shift был зажат при клике - применяем ко всем анкетам
                setAutoForAll(isChecked);
                shiftWasPressed = false; // Сбрасываем
            } else {
                // Обычное поведение - только для этой анкеты
                const bot = bots[botId];
                bot.mailSettings.auto = isChecked;
                saveSession();
            }
        }

        // Установить Auto для ВСЕХ анкет
        function setAutoForAll(isChecked) {
            const botIds = Object.keys(bots);
            let count = 0;

            for (const botId of botIds) {
                const bot = bots[botId];
                bot.mailSettings.auto = isChecked;

                const checkbox = document.getElementById(`auto-check-${botId}`);
                if (checkbox) checkbox.checked = isChecked;
                count++;
            }

            saveSession();
            showBulkNotification(isChecked ? 'Auto включён для всех' : 'Auto выключен для всех', count);
        }

        // Обработчик скорости с поддержкой Shift
        function handleSpeedChange(botId, val) {
            if (shiftWasPressed) {
                // Shift был зажат при клике - применяем ко всем анкетам
                setSpeedForAll(val);
                shiftWasPressed = false; // Сбрасываем
            } else {
                // Обычное поведение
                updateSettings(botId, 'speed', val);
            }
        }

        // Установить скорость для ВСЕХ анкет
        function setSpeedForAll(val) {
            const isChat = globalMode === 'chat';
            const botIds = Object.keys(bots);
            let count = 0;

            for (const botId of botIds) {
                const bot = bots[botId];
                const set = isChat ? bot.chatSettings : bot.mailSettings;
                set.speed = val;

                const selector = document.getElementById(`speed-select-${botId}`);
                if (selector) selector.value = val;
                count++;
            }

            saveSession();
            const speedLabel = val === 'smart' ? 'Smart' : `${val}s`;
            showBulkNotification(`Скорость ${speedLabel} установлена всем`, count);
        }

        function updateChatRotation(botId) {
            const bot = bots[botId];
            bot.chatSettings.rotationHours = parseInt(document.getElementById(`rot-time-${botId}`).value);
            bot.chatSettings.cyclic = document.getElementById(`rot-cyclic-${botId}`).checked;
            saveSession();
        }
        function onTabRightClick(e, botId) {
            e.preventDefault();
            const tab = document.getElementById(`tab-${botId}`);
            const bot = bots[botId];
            bot.tabColorState = (bot.tabColorState + 1) % 4;
            tab.classList.remove('tab-green', 'tab-yellow', 'tab-red');
            if (bot.tabColorState === 1) tab.classList.add('tab-green');
            else if (bot.tabColorState === 2) tab.classList.add('tab-yellow');
            else if (bot.tabColorState === 3) tab.classList.add('tab-red');
        }
        function checkDuplicate(login, displayId) {
            return !!Object.values(bots).find(b => b.login.toLowerCase() === login.toLowerCase() || b.displayId.toLowerCase() === displayId.toLowerCase());
        }
        function renderManagerList() {
            const list = document.getElementById('manager-list'); list.innerHTML = '';
            Object.values(bots).forEach(b => {
                const row = document.createElement('div'); row.className = 'acc-row';
                row.innerHTML = `<div><b>${b.displayId}</b> (${b.login})</div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="editAccount('${b.id}')"><i class="fa fa-pencil"></i></button>
                        <button class="btn btn-outline-danger" onclick="closeTab(event, '${b.id}'); renderManagerList()"><i class="fa fa-trash"></i></button>
                    </div>`;
                list.appendChild(row);
            });
        }
        function exportAccounts() {
            const blob = new Blob([localStorage.getItem('savedBots') || '[]'], {type: 'application/json'});
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'lababot_accounts.json'; a.click(); URL.revokeObjectURL(url);
        }
        async function handleUniversalImport(input) {
            if (!input.files.length) return;
            const file = input.files[0];
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.json')) {
                // JSON - полный импорт
                if (!confirm('Внимание! Импорт JSON перезапишет существующие данные. Продолжить?')) {
                    input.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = async function(e) {
                    try {
                        const data = JSON.parse(e.target.result);

                        if (data.bots && Array.isArray(data.bots)) {
                            for (const botData of data.bots) {
                                if (botData.login && botData.displayId) {
                                    await performLogin(botData.login, botData.pass || 'password', botData.displayId);
                                }
                            }
                        }
                        if (data.templates) {
                            botTemplates = data.templates;
                            localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                        }
                        if (data.accountPreferences) {
                            accountPreferences = data.accountPreferences;
                            localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
                        }
                        if (data.globalSettings) {
                            globalSettings = { ...globalSettings, ...data.globalSettings };
                            localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
                        }

                        alert('Данные успешно импортированы!');
                        renderManagerList();
                    } catch (error) {
                        alert('Ошибка импорта JSON: ' + error.message);
                    }
                    input.value = '';
                };
                reader.readAsText(file);

            } else if (fileName.endsWith('.txt')) {
                // TXT - только анкеты (ID Логин Пароль)
                const reader = new FileReader();
                reader.onload = async function(e) {
                    const lines = e.target.result.split('\n');
                    let count = 0, skipped = 0, errors = 0;

                    for (let line of lines) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 3) {
                            if (checkDuplicate(parts[1], parts[0])) { skipped++; continue; }
                            if (await performLogin(parts[1], parts[2], parts[0])) count++; else errors++;
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }

                    alert(`Импорт TXT: Успешно ${count}, Дубли ${skipped}, Ошибки ${errors}`);
                    input.value = '';
                    renderManagerList();
                };
                reader.readAsText(file);

            } else {
                alert('Неподдерживаемый формат. Используйте .txt или .json');
                input.value = '';
            }
        }
        function editAccount(id) {
            const bot = bots[id];
            if(!bot) return;
            editingBotId = id;
            document.getElementById('add-modal-title').innerHTML = '<i class="fa fa-pencil text-warning"></i> Изменить анкету';
            document.getElementById('newLogin').value = bot.login; document.getElementById('newPass').value = bot.pass; document.getElementById('newId').value = bot.displayId;
            document.getElementById('btnLoginText').innerText = "Сохранить"; document.getElementById('loginError').innerText = "";
        }
        function openAddModal() {
            editingBotId = null;
            document.getElementById('add-modal-title').innerHTML = '<i class="fa fa-plus text-success"></i> Добавить анкету';
            document.getElementById('newLogin').value = ""; document.getElementById('newPass').value = ""; document.getElementById('newId').value = "";
            document.getElementById('btnLoginText').innerText = "Добавить"; document.getElementById('loginError').innerText = "";
            renderManagerList();
            openModal('add-modal');
        }
        function openStatsModal(botId, type) {
            currentModalBotId = botId; currentStatsType = type;
            document.getElementById('stats-title').innerText = (type === 'sent') ? "Отправленные" : "Ошибки";
            renderStatsList(); openModal('stats-modal');
        }
        function renderStatsList() {
            const list = document.getElementById('stats-list-content'); list.innerHTML = '';
            const isChat = globalMode === 'chat';
            const data = isChat ? bots[currentModalBotId].chatHistory[currentStatsType] : bots[currentModalBotId].mailHistory[currentStatsType];
            if(!data.length) list.innerHTML = '<div class="text-center text-muted p-2">Пусто</div>';
            else data.forEach(item => { const d = document.createElement('div'); d.className = 'list-item'; d.innerText = item; list.appendChild(d); });
        }
        function copyStats() { navigator.clipboard.writeText((globalMode==='chat' ? bots[currentModalBotId].chatHistory[currentStatsType] : bots[currentModalBotId].mailHistory[currentStatsType]).join('\n')); }
        function clearStats() { if(confirm("Очистить?")){ const b = bots[currentModalBotId]; if(globalMode==='chat') { b.chatHistory[currentStatsType]=[]; b.chatStats[currentStatsType]=0; } else { b.mailHistory[currentStatsType]=[]; b.mailStats[currentStatsType]=0; } b.updateUI(); renderStatsList(); } }
        
        // Генерация имени шаблона на основе даты
        function generateTemplateName(tpls) {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = String(now.getFullYear()).slice(-2);
            const baseName = `${day}.${month}.${year}`;

            // Проверяем уникальность
            if (!tpls.some(t => t.name === baseName)) {
                return baseName;
            }

            // Добавляем номер если такая дата уже есть
            let num = 2;
            while (tpls.some(t => t.name === `${baseName} (${num})`)) {
                num++;
            }
            return `${baseName} (${num})`;
        }

        // Красивое уведомление для массовых действий
        function showBulkNotification(message, count) {
            const existing = document.getElementById('bulk-notification');
            if (existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = 'bulk-notification';
            notification.innerHTML = `<i class="fa fa-check-circle"></i> ${message} <b>(${count})</b>`;
            notification.style.cssText = `
                position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
                background: linear-gradient(135deg, #28a745, #20c997); color: white;
                padding: 12px 24px; border-radius: 25px; font-size: 14px; font-weight: 500;
                box-shadow: 0 4px 15px rgba(40, 167, 69, 0.4); z-index: 10000;
                animation: bulkNotifIn 0.3s ease-out;
            `;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'bulkNotifOut 0.3s ease-in forwards';
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        }

        // Инлайн добавление нового шаблона (без модалки)
        async function addTemplateInline(botId, event) {
            // Shift + клик = добавить всем анкетам
            if (event && event.shiftKey) {
                await addTemplateToAll();
                return;
            }

            const bot = bots[botId];
            const isChat = globalMode === 'chat';
            const type = isChat ? 'chat' : 'mail';
            const tpls = getBotTemplates(bot.login)[type];

            const newName = generateTemplateName(tpls);
            const newTemplate = { name: newName, text: '', favorite: false };
            tpls.push(newTemplate);

            localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
            await saveTemplatesToServer(bot.displayId, type, tpls);

            const newIdx = tpls.length - 1;
            updateTemplateDropdown(botId, newIdx);

            const textarea = document.getElementById(`msg-${botId}`);
            if (textarea) {
                textarea.value = '';
                textarea.focus();
            }

            console.log(`➕ Создан новый шаблон "${newName}" для ${bot.displayId}`);
        }

        // Добавить шаблон ВСЕМ анкетам
        async function addTemplateToAll() {
            const isChat = globalMode === 'chat';
            const type = isChat ? 'chat' : 'mail';
            const botIds = Object.keys(bots);
            let count = 0;

            for (const botId of botIds) {
                const bot = bots[botId];
                const tpls = getBotTemplates(bot.login)[type];
                const newName = generateTemplateName(tpls);
                const newTemplate = { name: newName, text: '', favorite: false };
                tpls.push(newTemplate);

                localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                await saveTemplatesToServer(bot.displayId, type, tpls);

                const newIdx = tpls.length - 1;
                updateTemplateDropdown(botId, newIdx);
                count++;
            }

            showBulkNotification('Шаблон добавлен всем анкетам', count);
        }

        // Модальное окно теперь только для редактирования (переименования) шаблона
        function openTemplateModal(botId, isEdit) {
            currentModalBotId = botId;
            const bot = bots[botId];
            const isChat = globalMode === 'chat';
            const tpls = getBotTemplates(bot.login)[isChat ? 'chat' : 'mail'];

            // Модалка только для редактирования
            const idx = document.getElementById(`tpl-select-${botId}`).value;
            if(idx === "") return alert("Выберите шаблон для редактирования");

            editingTemplateIndex = idx;
            document.getElementById('tpl-modal-title').innerText = "Редактировать шаблон";
            document.getElementById('tpl-modal-name').value = tpls[idx].name;
            document.getElementById('tpl-modal-text').value = tpls[idx].text;
            openModal('tpl-modal');
        }

        // Генерация текста шаблона с помощью AI
        async function generateTemplateWithAI() {
            const promptInput = document.getElementById('tpl-ai-prompt');
            const textArea = document.getElementById('tpl-modal-text');
            const btn = document.getElementById('tpl-ai-btn');
            const userPrompt = promptInput.value.trim();

            if (!userPrompt) {
                alert('Опишите какой текст нужно сгенерировать');
                promptInput.focus();
                return;
            }

            if (!globalSettings.apiKey) {
                alert('Добавьте OpenAI API Key в настройках (вкладка AI функции)');
                return;
            }

            const originalBtnHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Проверка...';
            btn.disabled = true;

            // Проверяем разрешение AI для активной анкеты
            const bot = activeTabId ? bots[activeTabId] : null;
            if (bot && bot.displayId) {
                const aiStatus = await checkProfileAIEnabled(bot.displayId);
                if (!aiStatus.enabled) {
                    btn.innerHTML = originalBtnHtml;
                    btn.disabled = false;
                    const reason = aiStatus.reason === 'disabled_by_admin'
                        ? 'AI отключен администратором для этой анкеты'
                        : aiStatus.reason === 'no_translator'
                        ? 'Анкете не назначен переводчик'
                        : 'AI недоступен для этой анкеты';
                    alert(`⚠️ ${reason}`);
                    return;
                }
            }

            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Генерация...';

            try {
                const isChat = globalMode === 'chat';
                const systemPrompt = isChat
                    ? `You are an expert at writing romantic chat invitations for a dating site. Write in English. The message should be friendly, intriguing and make the person want to respond. Use {Name} placeholder for recipient's name if appropriate. Keep it short (2-3 sentences). Do not use emojis.`
                    : `You are an expert at writing romantic letters for a dating site. Write in English. The letter should be warm, personal and engaging. Use {Name} placeholder for recipient's name, {City} for their city, {Age} for their age if appropriate. Keep it medium length (3-5 sentences). Do not use emojis.`;

                const config = {
                    headers: {
                        'Authorization': `Bearer ${globalSettings.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                };

                if (globalSettings.proxyAI) {
                    const proxyConfig = parseProxyUrl(globalSettings.proxyAI);
                    if (proxyConfig) config.proxy = proxyConfig;
                }

                const response = await axios.post(OPENAI_API_ENDPOINT, {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Write a ${isChat ? 'chat invitation' : 'letter'} with this style/theme: ${userPrompt}` }
                    ],
                    temperature: 0.8,
                    max_tokens: 300
                }, config);

                const generatedText = response.data.choices[0].message.content.trim();
                textArea.value = generatedText;

                // Очищаем поле промпта после успешной генерации
                promptInput.value = '';

            } catch (error) {
                console.error('AI Generation error:', error);
                const errorMsg = error.response?.data?.error?.message || error.message || 'Неизвестная ошибка';
                alert(`Ошибка генерации: ${errorMsg}`);
            } finally {
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
            }
        }

        // Таймеры для debounce автосохранения текста
        const autoSaveTimers = {};

        // Автосохранение текста шаблона (debounce 3 сек)
        function autoSaveTemplateText(botId) {
            if (autoSaveTimers[botId]) clearTimeout(autoSaveTimers[botId]);
            autoSaveTimers[botId] = setTimeout(() => {
                saveTemplateTextNow(botId);
            }, 3000);
        }

        // Немедленное сохранение текста шаблона (при blur или по таймеру)
        async function saveTemplateTextNow(botId) {
            const bot = bots[botId];
            if (!bot) return;

            const isChat = globalMode === 'chat';
            const type = isChat ? 'chat' : 'mail';
            const sel = document.getElementById(`tpl-select-${botId}`);
            const textarea = document.getElementById(`msg-${botId}`);

            if (!sel || !textarea || sel.value === '') return;

            const idx = parseInt(sel.value);
            const tpls = getBotTemplates(bot.login)[type];

            if (tpls[idx]) {
                // Обновляем текст в шаблоне
                tpls[idx].text = textarea.value;

                // Сохраняем в localStorage
                localStorage.setItem('botTemplates', JSON.stringify(botTemplates));

                // Сохраняем на сервер
                await saveTemplatesToServer(bot.displayId, type, tpls);
                console.log(`💾 Текст шаблона автосохранён для ${bot.displayId}`);
            }
        }

        async function saveTemplateFromModal() {
            const name = document.getElementById('tpl-modal-name').value;
            const text = document.getElementById('tpl-modal-text').value;
            if (!name) return;

            const bot = bots[currentModalBotId];
            const isChat = globalMode === 'chat';
            const type = isChat ? 'chat' : 'mail';

            try {
                // 1. Сохраняем в localStorage
                let tpls = getBotTemplates(bot.login)[type];

                if (editingTemplateIndex !== null) {
                    const fav = tpls[editingTemplateIndex]?.favorite || false;
                    tpls[editingTemplateIndex] = { name, text, favorite: fav };
                } else {
                    tpls.push({ name, text, favorite: false });
                    editingTemplateIndex = tpls.length - 1;
                }

                // 2. Сохраняем в localStorage (для обратной совместимости)
                localStorage.setItem('botTemplates', JSON.stringify(botTemplates));

                // 3. ВАЖНО: Сохраняем на сервер
                await saveTemplatesToServer(bot.displayId, type, tpls);

                updateTemplateDropdown(bot.id, editingTemplateIndex);
                closeModal('tpl-modal');

            } catch (error) {
                console.error('Error saving template:', error);
                alert('Ошибка сохранения шаблона');
            }
        }

        function updateTemplateDropdown(botId, forceSelectIndex = null) {
            const sel=document.getElementById(`tpl-select-${botId}`); if(!sel) return;
            const bot = bots[botId];
            const isChat = globalMode === 'chat';
            const tpls = getBotTemplates(bot.login)[isChat ? 'chat' : 'mail'];

            // Сохраняем текущий текст textarea перед обновлением
            const area = document.getElementById(`msg-${botId}`);
            const currentText = area ? area.value : '';

            // Исправлено: проверяем и на null, и на undefined
            let val = (forceSelectIndex !== null && forceSelectIndex !== undefined) ? forceSelectIndex : sel.value;

            // Приводим к числу если это строка
            if (typeof val === 'string' && val !== '') {
                val = parseInt(val);
            }

            // Если val пустой/null/undefined или выходит за границы массива - выбираем первый шаблон
            if ((val === null || val === "" || val === undefined || isNaN(val) || val >= tpls.length) && tpls.length > 0) {
                val = 0;
            }

            sel.innerHTML='<option value="">-- Выберите --</option>';
            tpls.forEach((t,i)=> sel.innerHTML+=`<option value="${i}">${t.favorite?'❤ ':''}${t.name}</option>`);

            const btnFav = document.getElementById(`btn-fav-${botId}`);
            if(val !== null && val !== "" && val !== undefined && !isNaN(val) && tpls[val]) {
                 sel.value = val;
                 area.disabled=false;
                 area.value=tpls[val].text;
                 if(isChat) bots[botId].lastTplChat = val; else bots[botId].lastTplMail = val;

                 // Сохраняем выбор шаблона
                 if(!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
                 if(isChat) accountPreferences[bot.login].chatTpl = val;
                 else accountPreferences[bot.login].mailTpl = val;
                 localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
                 saveSession();

                 if(btnFav) { if(tpls[val].favorite) { btnFav.classList.add('btn-heart-active','btn-danger'); btnFav.classList.remove('btn-outline-danger'); } else { btnFav.classList.remove('btn-heart-active','btn-danger'); btnFav.classList.add('btn-outline-danger'); } }
                 validateInput(area);
            } else {
                 sel.value="";
                 // НЕ блокируем textarea если в ней есть текст
                 if (currentText && currentText.trim() !== '') {
                     area.disabled = false;
                     area.value = currentText;
                 } else {
                     area.disabled = true;
                     area.value = "";
                 }
                 if(btnFav) btnFav.classList.remove('btn-heart-active');
                 bots[botId].updateUI();
            }
        }

        function onTemplateSelect(botId) {
            const idx = document.getElementById(`tpl-select-${botId}`).value;
            const bot = bots[botId];
            const isChat = globalMode === 'chat';

            if(!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
            if(isChat) accountPreferences[bot.login].chatTpl = idx;
            else accountPreferences[bot.login].mailTpl = idx;
            localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
            
            saveSession();
            updateTemplateDropdown(botId, idx);
        }

        async function toggleTemplateFavorite(botId) {
            const idx = document.getElementById(`tpl-select-${botId}`).value;
            if(idx === "") return;
            const bot = bots[botId];
            const tpls = getBotTemplates(bot.login)['mail'];
            if(tpls[idx]) {
                const wasNotFavorite = !tpls[idx].favorite;
                tpls[idx].favorite = wasNotFavorite;
                localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                updateTemplateDropdown(botId, idx);

                // Синхронизируем с сервером
                try {
                    if (wasNotFavorite) {
                        // Добавляем в избранное на сервере
                        await fetch(`${LABABOT_SERVER}/api/favorite_template`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: bot.displayId,
                                botId: bot.id,
                                templateName: tpls[idx].name,
                                templateText: tpls[idx].text,
                                type: 'mail'
                            })
                        });
                        console.log(`❤️ Шаблон "${tpls[idx].name}" добавлен в избранное на сервере`);
                    } else {
                        // Удаляем из избранного на сервере
                        await fetch(`${LABABOT_SERVER}/api/favorite_template`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: bot.displayId,
                                templateText: tpls[idx].text
                            })
                        });
                        console.log(`💔 Шаблон "${tpls[idx].name}" удалён из избранного на сервере`);
                    }
                } catch(e) {
                    console.error('Ошибка синхронизации избранного:', e);
                }
            }
        }

        async function deleteTemplate(botId, event) {
            // Shift + клик = удалить выбранный шаблон у всех
            if (event && event.shiftKey) {
                await deleteTemplateFromAll();
                return;
            }

            const isChat = globalMode === 'chat';
            const type = isChat ? 'chat' : 'mail';
            const bot = bots[botId];
            let tpls = getBotTemplates(bot.login)[type];
            const idx = document.getElementById(`tpl-select-${botId}`).value;
            if (idx !== "" && (globalSettings.skipDeleteConfirm || confirm("Удалить?"))) {
                const idxNum = parseInt(idx);
                tpls.splice(idxNum, 1);
                localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                await saveTemplatesToServer(bot.displayId, type, tpls);

                // Выбираем предыдущий шаблон (или последний доступный)
                const newIdx = tpls.length > 0 ? Math.min(idxNum, tpls.length - 1) : null;
                updateTemplateDropdown(botId, newIdx);
            }
        }

        // Удалить выбранный шаблон у ВСЕХ анкет
        async function deleteTemplateFromAll() {
            if (!globalSettings.skipDeleteConfirm && !confirm("Удалить выбранный шаблон у ВСЕХ анкет?")) return;

            const isChat = globalMode === 'chat';
            const type = isChat ? 'chat' : 'mail';
            const botIds = Object.keys(bots);
            let count = 0;

            for (const botId of botIds) {
                const bot = bots[botId];
                const tpls = getBotTemplates(bot.login)[type];
                const sel = document.getElementById(`tpl-select-${botId}`);
                const idx = sel ? sel.value : "";

                if (idx !== "" && tpls[idx]) {
                    const idxNum = parseInt(idx);
                    tpls.splice(idxNum, 1);
                    localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                    await saveTemplatesToServer(bot.displayId, type, tpls);

                    // Выбираем предыдущий шаблон (или последний доступный)
                    const newIdx = tpls.length > 0 ? Math.min(idxNum, tpls.length - 1) : null;
                    updateTemplateDropdown(botId, newIdx);
                    count++;
                }
            }

            showBulkNotification('Шаблон удалён у всех анкет', count);
        }

        function openBlacklistModal(botId) { currentModalBotId=botId; document.getElementById('bl-modal-input').value=''; openModal('bl-modal'); }
        async function saveBlacklistID(event) {
            const val = document.getElementById('bl-modal-input').value.trim();
            if (!val) {
                closeModal('bl-modal');
                return;
            }

            // Shift + клик = добавить в ЧС всем анкетам
            if (event && event.shiftKey) {
                await addBlacklistToAll(val);
                closeModal('bl-modal');
                return;
            }

            if(currentModalBotId) {
                const bot = bots[currentModalBotId];
                const isChat = globalMode === 'chat';
                const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;
                if(!list.includes(val)) {
                    list.push(val);
                    renderBlacklist(currentModalBotId);
                    await saveBlacklistToServer(bot.displayId, isChat ? 'chat' : 'mail', list);
                }
            }
            closeModal('bl-modal');
        }

        // Добавить в ЧС для ВСЕХ анкет
        async function addBlacklistToAll(val) {
            const isChat = globalMode === 'chat';
            const type = isChat ? 'chat' : 'mail';
            const botIds = Object.keys(bots);
            let count = 0;

            for (const botId of botIds) {
                const bot = bots[botId];
                const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;

                if (!list.includes(val)) {
                    list.push(val);
                    renderBlacklist(botId);
                    await saveBlacklistToServer(bot.displayId, type, list);
                    count++;
                }
            }

            showBulkNotification(`ID ${val} добавлен в ЧС всех анкет`, count);
        }

        function renderBlacklist(botId) {
            const listEl=document.getElementById(`bl-list-${botId}`); listEl.innerHTML="";
            const bot = bots[botId];
            const data = globalMode === 'chat' ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;
            
            data.forEach(id => {
                const d=document.createElement('div'); 
                d.className='list-item'; 
                d.innerText=id;
                
                if (bot.vipList.includes(id)) {
                    d.classList.add('is-vip');
                    d.innerHTML = `<i class="fa fa-star text-warning me-2"></i> ${id}`;
                }
                
                d.onclick=()=>{
                    listEl.querySelectorAll('.list-item').forEach(i=>i.classList.remove('selected')); 
                    d.classList.add('selected'); 
                    bots[botId].selectedBlacklistId=id;
                };
                listEl.appendChild(d);
            });
        }
        
        async function removeSelectedBlacklist(botId) {
            const bot = bots[botId]; const s = bot.selectedBlacklistId;
            if(s) {
                const isChat = globalMode === 'chat';
                if(isChat) bot.chatSettings.blacklist = bot.chatSettings.blacklist.filter(x=>x!==s);
                else bot.mailSettings.blacklist = bot.mailSettings.blacklist.filter(x=>x!==s);
                bot.vipList = bot.vipList.filter(x=>x!==s);
                bot.selectedBlacklistId = null;
                renderBlacklist(botId);
                // Сохраняем на сервер
                const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;
                await saveBlacklistToServer(bot.displayId, isChat ? 'chat' : 'mail', list);
            }
        }

        function toggleVipStatus(botId) {
            const bot = bots[botId]; const s = bot.selectedBlacklistId;
            if(!s) return alert("Выберите ID из списка");
            
            if(bot.vipList.includes(s)) {
                bot.vipList = bot.vipList.filter(x=>x!==s);
            } else {
                bot.vipList.push(s);
                alert(`ID ${s} отмечен как VIP.\nБот будет уведомлять о его Online/Offline статусе.`);
            }
            saveSession(); 
            renderBlacklist(botId);
        }

        function onPhotoSelect(botId) {
            const fi=document.getElementById(`photo-input-${botId}`);
            if(fi.files.length) {
                bots[botId].photoName=fi.files[0].name; document.getElementById(`photo-name-${botId}`).innerText=fi.files[0].name; document.getElementById(`photo-label-${botId}`).classList.add('file-selected');
                const r=new FileReader(); r.onload=e=>{ document.getElementById(`preview-img-${botId}`).src=e.target.result; document.getElementById(`preview-box-${botId}`).classList.add('has-img'); }; r.readAsDataURL(fi.files[0]);
            }
        }
        function removePhoto(botId) {
            document.getElementById(`photo-input-${botId}`).value=""; document.getElementById(`photo-name-${botId}`).innerText="Прикрепить фото"; document.getElementById(`preview-box-${botId}`).classList.remove('has-img'); document.getElementById(`photo-label-${botId}`).classList.remove('file-selected'); bots[botId].photoName=null;
        }

        async function handleLoginOrUpdate() {
            const l=document.getElementById('newLogin').value.trim(); const p=document.getElementById('newPass').value.trim(); const i=document.getElementById('newId').value.trim()||'ID';
            document.getElementById('loginError').innerText = "";
            if(editingBotId) {
                const bot = bots[editingBotId];
                if(bot) { bot.login = l; bot.pass = p; bot.displayId = i; document.getElementById(`tab-${bot.id}`).innerHTML = `<div class="status-dot online"></div> ${i} <span class="tab-close" onclick="closeTab(event, '${bot.id}')"><i class="fa fa-times"></i></span>`; saveSession(); }
                closeModal('add-modal'); return;
            }
            if(checkDuplicate(l, i)) { document.getElementById('loginError').innerText = "Этот аккаунт уже добавлен"; return; }
            if(await performLogin(l,p,i)) { document.getElementById('newLogin').value=''; document.getElementById('newPass').value=''; closeModal('add-modal'); }
        }

        async function performLogin(login, pass, displayId) {
            const e=document.getElementById('loginError'); const s=document.getElementById('loginSpinner'); if(s) s.style.display='inline-block';
            try {
                const res = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: login, Password: pass });

                // DEBUG: Логируем cookies и headers после логина
                console.log(`[Login] Headers:`, res.headers);
                console.log(`[Login] Set-Cookie:`, res.headers['set-cookie']);
                console.log(`[Login] Current cookies:`, document.cookie);

                if(res.data.Token) {
                    const bid = 'bot_' + Date.now() + Math.floor(Math.random()*1000);
                    const bot = new AccountBot(bid, login, pass, displayId, res.data.Token);
                    bots[bid] = bot; // СНАЧАЛА добавляем в объект bots

                    // ТЕПЕРЬ устанавливаем прокси (после добавления в bots чтобы getAccountNumber работал)
                    await setWebviewProxy(bid);

                    createInterface(bot); selectTab(bid); saveSession();

                    // Загружаем данные с сервера (шаблоны, blacklist, статистику)
                    const serverData = await loadBotDataFromServer(displayId);
                    if (serverData) {
                        bot.loadFromServerData(serverData);
                        bot.updateUI();
                        updateTemplateDropdown(bid);
                        renderBlacklist(bid);
                        console.log(`✅ Данные загружены с сервера для ${displayId}`);
                    }

                    // Отправляем первый heartbeat после создания бота
                    setTimeout(() => sendHeartbeatToLababot(bid, displayId, 'online'), 2000);
                    return true;
                }
            } catch(err) {
                if(e) e.innerText = err.response ? (err.response.data.Error || `Ошибка входа: ${err.response.status}`) : "Ошибка входа. Проверьте Proxy для Ladadate.";
            }
            finally { if(s) s.style.display='none'; }
            return false;
        }

        async function saveSession() { 
            try {
                // Сохраняем порядок вкладок в localStorage
                const currentTabOrder = Array.from(document.querySelectorAll('.tab-item')).map(t => t.id.replace('tab-', ''));
                const localStorageData = currentTabOrder.map(id => {
                    const b = bots[id];
                    if (!b) return null;
                    return {
                        login: b.login,
                        pass: b.pass,
                        displayId: b.displayId,
                        lastTplMail: b.lastTplMail,
                        lastTplChat: b.lastTplChat,
                        chatRotationHours: b.chatSettings.rotationHours,
                        chatCyclic: b.chatSettings.cyclic,
                        chatCurrentIndex: b.chatSettings.currentInviteIndex,
                        chatStartTime: b.chatSettings.rotationStartTime,
                        mailAuto: b.mailSettings.auto,
                        mailTarget: b.mailSettings.target,
                        vipList: b.vipList,
                        customIdsList: b.customIdsList || [],
                        customIdsSent: b.customIdsSent || []
                    };
                }).filter(item => item !== null);
                
                localStorage.setItem('savedBots', JSON.stringify(localStorageData));

            } catch (error) {
                console.error('Error saving session:', error);
                // Падаем обратно на localStorage при ошибке
                const fallbackData = Array.from(document.querySelectorAll('.tab-item')).map(t => {
                    const b = bots[t.id.replace('tab-', '')];
                    return b ? {
                        login: b.login,
                        pass: b.pass,
                        displayId: b.displayId
                    } : null;
                }).filter(Boolean);
                localStorage.setItem('savedBots', JSON.stringify(fallbackData));
            }
        }
        
        async function restoreSession() {
            try {
                // Загружаем из localStorage
                const s = JSON.parse(localStorage.getItem('savedBots') || '[]');
                document.getElementById('restore-status').innerText = s.length ? `Загрузка ${s.length} из кэша...` : "";
                
                for (const a of s) {
                    const ok = await performLogin(a.login, a.pass, a.displayId);
                    if (ok && bots[Object.keys(bots).pop()]) {
                        const botId = Object.keys(bots).pop();
                        const bot = bots[botId];
                        
                        // Восстанавливаем остальные настройки из localStorage
                        bot.lastTplMail = a.lastTplMail;
                        bot.lastTplChat = a.lastTplChat;
                        
                        if (a.chatRotationHours) bot.chatSettings.rotationHours = a.chatRotationHours;
                        if (a.chatCyclic !== undefined) bot.chatSettings.cyclic = a.chatCyclic;
                        if (a.chatCurrentIndex) bot.chatSettings.currentInviteIndex = a.chatCurrentIndex;
                        if (a.chatStartTime) bot.chatSettings.rotationStartTime = a.chatStartTime;
                        if (a.mailAuto !== undefined) bot.mailSettings.auto = a.mailAuto;
                        if (a.mailTarget) bot.mailSettings.target = a.mailTarget;
                        if (a.vipList) bot.vipList = a.vipList;
                        if (a.customIdsList) bot.customIdsList = a.customIdsList;
                        if (a.customIdsSent) bot.customIdsSent = a.customIdsSent;

                        updateInterfaceForMode(bot.id);
                        // Показываем поле Custom IDs если выбран этот режим
                        if (a.mailTarget === 'custom-ids') {
                            toggleCustomIdsField(bot.id);
                        }
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
                
                document.getElementById('restore-status').innerText = "";
                document.getElementById('restore-status').innerText = "";
                document.getElementById('welcome-screen').style.display = Object.keys(bots).length > 0 ? 'none' : 'flex';
                
                // Сохраняем порядок вкладок
                const tempBots = { ...bots };
                bots = {};
                const keys = Array.from(document.querySelectorAll('.tab-item')).map(t => t.id.replace('tab-', ''));
                keys.forEach(id => {
                    if (tempBots[id]) bots[id] = tempBots[id];
                });
                
            } catch (error) {
                console.error('Error restoring session:', error);
                document.getElementById('restore-status').innerText = "Ошибка загрузки. Используется кэш.";
                document.getElementById('welcome-screen').style.display = Object.keys(bots).length > 0 ? 'none' : 'flex';
            }
        }

        function selectTab(id) {
            // ВАЖНО: Сохраняем текст текущей вкладки перед переключением
            if (activeTabId && bots[activeTabId]) {
                saveTemplateTextNow(activeTabId);
            }

            document.querySelectorAll('.tab-item').forEach(t=>t.classList.remove('active'));
            document.querySelectorAll('.workspace').forEach(w=>w.classList.remove('active'));
            // ВАЖНО: Деактивируем/Активируем webview, но они остаются за экраном
            document.querySelectorAll('webview').forEach(wv => wv.classList.remove('active'));

            const t=document.getElementById(`tab-${id}`); const w=document.getElementById(`ws-${id}`);
            const wv=document.getElementById(`webview-${id}`);

            if(t&&w) {
                t.classList.add('active');
                w.classList.add('active');
                activeTabId=id;
                updateInterfaceForMode(id);
            }
            
            if(wv) wv.classList.add('active'); // Активируем процесс (попадает под стили position: fixed)
            
            document.getElementById('welcome-screen').style.display = 'none';
        }
        
        function closeTab(e, id) {
            e.stopPropagation();
            if(globalSettings.confirmTabClose && !confirm(`Закрыть вкладку ${bots[id].displayId}?`)) return;
            
            if(bots[id]) { 
                bots[id].stopMail(); bots[id].stopChat(); 
                bots[id].stopMonitoring();
                clearInterval(bots[id].keepAliveTimer); 
                clearInterval(bots[id].heartbeatInterval); // Останавливаем heartbeat
                
                // === ВАЖНОЕ ДОБАВЛЕНИЕ: Удаляем webview ===
                const wv = document.getElementById(`webview-${id}`);
                if(wv) wv.remove();
                
                delete bots[id]; 
            }
            document.getElementById(`tab-${id}`).remove(); document.getElementById(`ws-${id}`).remove();

            if(activeTabId === id) {
                const remainingIds = Object.keys(bots);
                if(remainingIds.length > 0) {
                    const firstTab = document.querySelector('.tab-item');
                    if (firstTab) selectTab(firstTab.id.replace('tab-', ''));
                    else { activeTabId = null; document.getElementById('welcome-screen').style.display = 'flex'; }
                } else {
                    activeTabId = null;
                    document.getElementById('welcome-screen').style.display = 'flex';
                }
            }

            saveSession(); updateBotCount();
        }

        function toggleBot(id) {
            const bot = bots[id];
            const text = document.getElementById(`msg-${id}`).value;
            if (globalMode === 'chat') { if(bot.isChatRunning) bot.stopChat(); else bot.startChat(text); } 
            else { if(bot.isMailRunning) bot.stopMail(); else bot.startMail(text); }
        }
        function startAll() {
            Object.values(bots).forEach(b => {
                const text = document.getElementById(`msg-${b.id}`).value;
                if (globalMode === 'chat') { if(!b.isChatRunning) b.startChat(text); } else { if(!b.isMailRunning) b.startMail(text); }
            });
        }
        function stopAll() { Object.values(bots).forEach(b => { if (globalMode === 'chat') b.stopChat(); else b.stopMail(); }); }
        async function clearAllStats() {
            if(!confirm("Очистить статистику на ВСЕХ анкетах?")) return;
            const type = globalMode === 'chat' ? 'chat' : 'mail';
            for (const b of Object.values(bots)) {
                if (globalMode === 'chat') {
                    b.chatStats = {sent:0, errors:0, waiting:0};
                    b.chatHistory = {sent:[], errors:[], waiting:[]};
                } else {
                    b.mailStats = {sent:0, errors:0, waiting:0};
                    b.mailHistory = {sent:[], errors:[], waiting:[]};
                }
                b.updateUI();
                // Сбрасываем на сервере
                await resetStatsOnServer(b.displayId, type);
            }
        }
        // Показать загрузку на вкладке
        function showTabLoading(botId) {
            const tab = document.getElementById(`tab-${botId}`);
            if (tab) tab.classList.add('tab-loading');
        }

        // Скрыть загрузку на вкладке
        function hideTabLoading(botId) {
            const tab = document.getElementById(`tab-${botId}`);
            if (tab) tab.classList.remove('tab-loading');
        }

        // Перелогинить одну анкету
        async function reloginBot(botId) {
            const bot = bots[botId];
            if (!bot) return false;

            showTabLoading(botId);
            try {
                const res = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: bot.login, Password: bot.pass });
                if (res.data.Token) {
                    bot.token = res.data.Token;
                    bot.getProfileData();
                    hideTabLoading(botId);
                    return true;
                }
            } catch (e) {
                console.error(`Relogin error for ${bot.displayId}:`, e);
            }
            hideTabLoading(botId);
            return false;
        }

        async function reloginAllBots() {
            if(!confirm("Перезайти во все анкеты?")) return;
            const botIds = Object.keys(bots);
            if(botIds.length === 0) return;

            const btn = document.querySelector('.btn-refresh');
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
            btn.disabled = true;

            // Показываем загрузку на всех вкладках
            botIds.forEach(id => showTabLoading(id));

            for(const id of botIds) {
                await reloginBot(id);
                await new Promise(r => setTimeout(r, 300));
            }

            btn.innerHTML = orig;
            btn.disabled = false;
        }
        
        // ОБНОВЛЕННАЯ ФУНКЦИЯ exportAllData
        async function exportAllData() {
            try {
                const data = {
                    bots: [],
                    templates: botTemplates,
                    accountPreferences: accountPreferences,
                    globalSettings: globalSettings,
                    exportDate: new Date().toISOString()
                };
                
                // Сохраняем данные ботов
                Object.values(bots).forEach(bot => {
                    data.bots.push({
                        id: bot.id,
                        login: bot.login,
                        displayId: bot.displayId,
                        token: bot.token ? '[HIDDEN]' : null,
                        mailSettings: bot.mailSettings,
                        chatSettings: bot.chatSettings,
                        vipList: bot.vipList
                    });
                });
                
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `lababot_backup_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                
                return true;
            } catch (error) {
                console.error('Error exporting data:', error);
                return false;
            }
        }
        
        // ОБНОВЛЕННАЯ ФУНКЦИЯ handleFullImport
        async function handleFullImport(input) {
            if (!input.files.length) return;
            
            if (!confirm('Внимание! Импорт перезапишет существующие данные. Продолжить?')) {
                input.value = '';
                return;
            }
            
            const btn = input.parentElement.querySelector('button');
            const origText = btn.innerHTML;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Импорт...';
            btn.disabled = true;
            
            try {
                const reader = new FileReader();
                
                reader.onload = async function(e) {
                    try {
                        const data = JSON.parse(e.target.result);
                        
                        // Импортируем ботов
                        if (data.bots && Array.isArray(data.bots)) {
                            for (const botData of data.bots) {
                                if (botData.login && botData.displayId) {
                                    await performLogin(botData.login, botData.pass || 'password', botData.displayId);
                                }
                            }
                        }
                        
                        // Импортируем шаблоны
                        if (data.templates) {
                            botTemplates = data.templates;
                            localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                        }
                        
                        // Импортируем настройки
                        if (data.accountPreferences) {
                            accountPreferences = data.accountPreferences;
                            localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
                        }
                        
                        if (data.globalSettings) {
                            globalSettings = { ...globalSettings, ...data.globalSettings };
                            localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
                        }
                        
                        alert('Данные успешно импортированы! Перезагрузите приложение.');
                        setTimeout(() => location.reload(), 1000);
                        
                    } catch (error) {
                        console.error('Import error:', error);
                        alert('Ошибка импорта: ' + error.message);
                    } finally {
                        btn.innerHTML = origText;
                        btn.disabled = false;
                        input.value = '';
                    }
                };
                
                reader.onerror = function(error) {
                    alert('Ошибка чтения файла');
                    btn.innerHTML = origText;
                    btn.disabled = false;
                    input.value = '';
                };
                
                reader.readAsText(input.files[0]);
                
            } catch (error) {
                console.error('Import error:', error);
                alert('Ошибка импорта: ' + error.message);
                btn.innerHTML = origText;
                btn.disabled = false;
                input.value = '';
            }
        }

        // =====================================================
        // === ВИДЕОЧАТ (SHARE MY CAM) ===
        // =====================================================

        // Сохранённые камеры для каждой анкеты
        let savedCameras = JSON.parse(localStorage.getItem('savedCameras')) || {};

        // Окна видеочата для каждой анкеты
        const videoChatWindows = new Map();

        // Открыть видеочат - показать модальное окно выбора камеры
        async function openVideoChatWindow(botId) {
            const bot = bots[botId];
            if (!bot) return;

            // Проверяем, есть ли сохранённая камера для этой анкеты
            const savedCamera = savedCameras[bot.displayId];
            if (savedCamera) {
                // Сразу открываем с сохранённой камерой
                launchVideoChatWindow(botId, savedCamera);
                return;
            }

            // Показываем модальное окно выбора камеры
            document.getElementById('camera-select-bot-id').value = botId;
            document.getElementById('camera-remember-choice').checked = false;

            // Загружаем список камер
            await loadAvailableCameras();

            openModal('camera-select-modal');
        }

        // Загрузить список доступных камер
        async function loadAvailableCameras() {
            const select = document.getElementById('camera-select-list');
            select.innerHTML = '<option value="">Загрузка...</option>';

            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(device => device.kind === 'videoinput');

                if (videoDevices.length === 0) {
                    select.innerHTML = '<option value="">Камеры не найдены</option>';
                    return;
                }

                select.innerHTML = '';
                videoDevices.forEach((device, index) => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Камера ${index + 1}`;
                    select.appendChild(option);
                });

            } catch (error) {
                console.error('Ошибка получения списка камер:', error);
                select.innerHTML = '<option value="">Ошибка доступа к камерам</option>';
            }
        }

        // Подтвердить выбор камеры и открыть видеочат
        function confirmCameraSelection() {
            const botId = document.getElementById('camera-select-bot-id').value;
            const cameraId = document.getElementById('camera-select-list').value;
            const remember = document.getElementById('camera-remember-choice').checked;

            if (!cameraId) {
                alert('Выберите камеру');
                return;
            }

            const bot = bots[botId];
            if (!bot) return;

            // Запоминаем выбор если нужно
            if (remember) {
                savedCameras[bot.displayId] = cameraId;
                localStorage.setItem('savedCameras', JSON.stringify(savedCameras));
            }

            closeModal('camera-select-modal');
            launchVideoChatWindow(botId, cameraId);
        }

        // Запустить окно видеочата
        async function launchVideoChatWindow(botId, cameraId) {
            const bot = bots[botId];
            if (!bot) return;

            // Проверяем, есть ли уже открытое окно
            if (videoChatWindows.has(botId)) {
                // Фокусируем существующее окно
                const { ipcRenderer } = require('electron');
                ipcRenderer.invoke('focus-video-chat-window', { botId });
                return;
            }

            try {
                const { ipcRenderer } = require('electron');

                // Открываем окно видеочата
                const result = await ipcRenderer.invoke('open-video-chat-window', {
                    botId: botId,
                    displayId: bot.displayId,
                    login: bot.login,
                    pass: bot.pass,
                    cameraId: cameraId
                });

                if (result.success) {
                    videoChatWindows.set(botId, true);

                    // Меняем стиль кнопки на "активный"
                    const btn = document.getElementById(`btn-share-cam-${botId}`);
                    if (btn) btn.classList.add('cam-active');

                    console.log(`✅ Видеочат открыт для ${bot.displayId}`);
                }
            } catch (error) {
                console.error('Ошибка открытия видеочата:', error);
                alert('Ошибка открытия видеочата: ' + error.message);
            }
        }

        // Обработчик закрытия окна видеочата (вызывается из main process)
        if (typeof require !== 'undefined') {
            const { ipcRenderer } = require('electron');

            ipcRenderer.on('video-chat-window-closed', (event, botId) => {
                videoChatWindows.delete(botId);

                // Убираем стиль "активный" с кнопки
                const btn = document.getElementById(`btn-share-cam-${botId}`);
                if (btn) btn.classList.remove('cam-active');

                console.log(`📹 Видеочат закрыт для ${botId}`);
            });

            // Обработчик уведомления о камере мужчины
            ipcRenderer.on('video-chat-man-camera', (event, data) => {
                const { botId, manName, manId, type } = data;
                const bot = bots[botId];
                if (!bot) return;

                let message = '';
                if (type === 'camera_on') {
                    message = `${manName} (${manId}) включил камеру`;
                } else if (type === 'watching') {
                    message = `${manName} (${manId}) смотрит вашу камеру`;
                }

                if (message) {
                    // Звук
                    playSound('chat');

                    // Toast уведомление
                    showCameraToast(message, bot.displayId);

                    // Мигание вкладки
                    flashTab(botId);
                }
            });
        }

        // Показать toast уведомление о камере
        function showCameraToast(message, displayId) {
            // Удаляем старый toast если есть
            const existingToast = document.querySelector('.camera-toast');
            if (existingToast) existingToast.remove();

            const toast = document.createElement('div');
            toast.className = 'camera-toast';
            toast.innerHTML = `
                <i class="fa fa-video-camera"></i>
                <span><b>[${displayId}]</b> ${message}</span>
            `;
            document.body.appendChild(toast);

            // Показываем
            setTimeout(() => toast.classList.add('show'), 10);

            // Убираем через 5 секунд
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 5000);
        }

        // Мигание вкладки
        function flashTab(botId) {
            const tab = document.getElementById(`tab-${botId}`);
            if (!tab) return;

            let flashes = 0;
            const maxFlashes = 6;
            const interval = setInterval(() => {
                tab.style.backgroundColor = flashes % 2 === 0 ? '#dc3545' : '';
                flashes++;
                if (flashes >= maxFlashes) {
                    clearInterval(interval);
                    tab.style.backgroundColor = '';
                }
            }, 300);
        }

        // === АВТООТВЕТЫ (если не определены) ===
        if (typeof toggleAutoReply === 'undefined') {
            function toggleAutoReply(botId) {
                const bot = bots[botId];
                if (!bot) return;
                const checkbox = document.getElementById(`auto-reply-enabled-${botId}`);
                bot.autoReplyEnabled = checkbox.checked;
                console.log(`[AutoReply] ${bot.displayId}: автоответы ${checkbox.checked ? 'включены' : 'выключены'}`);
            }
        }

        if (typeof addAutoReply === 'undefined') {
            function addAutoReply(botId) {
                const bot = bots[botId];
                if (!bot) return;
                if (!bot.autoReplies) bot.autoReplies = [];
                bot.autoReplies.push({ text: '', delay: 5 });
                renderAutoReplies(botId);
            }
        }

        if (typeof renderAutoReplies === 'undefined') {
            function renderAutoReplies(botId) {
                const bot = bots[botId];
                const listEl = document.getElementById(`auto-reply-list-${botId}`);
                if (!listEl || !bot) return;

                if (!bot.autoReplies || bot.autoReplies.length === 0) {
                    listEl.innerHTML = '<div class="text-muted small text-center p-2">Нет автоответов</div>';
                    return;
                }

                listEl.innerHTML = bot.autoReplies.map((reply, idx) => `
                    <div class="auto-reply-item">
                        <div class="auto-reply-item-header">
                            <span class="auto-reply-num">#${idx + 1}</span>
                            <input type="number" class="form-control form-control-sm auto-reply-delay"
                                   value="${reply.delay}" min="1" max="300"
                                   onchange="updateAutoReplyDelay('${botId}', ${idx}, this.value)"
                                   title="Задержка в секундах">
                            <span class="text-muted small">сек</span>
                            <button class="btn btn-sm btn-outline-danger" onclick="removeAutoReply('${botId}', ${idx})">
                                <i class="fa fa-times"></i>
                            </button>
                        </div>
                        <textarea class="form-control form-control-sm mt-1" rows="2"
                                  onchange="updateAutoReplyText('${botId}', ${idx}, this.value)"
                                  placeholder="Текст автоответа...">${reply.text}</textarea>
                    </div>
                `).join('');
            }
        }

        if (typeof removeAutoReply === 'undefined') {
            function removeAutoReply(botId, index) {
                const bot = bots[botId];
                if (!bot || !bot.autoReplies) return;
                bot.autoReplies.splice(index, 1);
                renderAutoReplies(botId);
            }
        }

        if (typeof updateAutoReplyText === 'undefined') {
            function updateAutoReplyText(botId, index, text) {
                const bot = bots[botId];
                if (!bot || !bot.autoReplies) return;
                bot.autoReplies[index].text = text;
            }
        }

        if (typeof updateAutoReplyDelay === 'undefined') {
            function updateAutoReplyDelay(botId, index, delay) {
                const bot = bots[botId];
                if (!bot || !bot.autoReplies) return;
                bot.autoReplies[index].delay = parseInt(delay) || 5;
            }
        }
