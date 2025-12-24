// Загрузка истории ЧАТА
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
        showToast('Добавьте OpenAI API Key в настройках');
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
            showToast(`⚠️ ${reason}`, 'warning');
            return;
        }
    }

    // Получаем последние сообщения из истории чата
    const partnerMessages = chatHistoryEl.querySelectorAll('.chat-msg.partner .msg-bubble');
    const myMessages = chatHistoryEl.querySelectorAll('.chat-msg.me .msg-bubble');

    if (partnerMessages.length === 0) {
        showToast('Нет входящих сообщений для ответа', 'warning');
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

        // Используем разные промпты для чатов и писем
        const basePrompt = isChat
            ? (globalSettings.chatPrompt || '')      // Промпт для чатов
            : (globalSettings.aiReplyPrompt || '');  // Промпт для писем

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
        showToast(`Ошибка генерации: ${errorMsg}`);
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

        // === ЛОГИРОВАНИЕ В СТАТИСТИКУ ===
        // Определяем: это ответ на входящее или просто отправка?
        // isReply = true только если есть запись о входящем письме от этого мужчины
        const partnerIdStr = minichatPartnerId.toString();
        const hasIncoming = bot.incomingTimes && bot.incomingTimes[partnerIdStr];
        const isReply = !!hasIncoming;

        try {
            const msgType = minichatType === 'chat' ? 'chat_msg' : 'outgoing';
            const lababotResult = await sendMessageToLababot({
                botId: bot.id,
                accountDisplayId: bot.displayId,
                recipientId: minichatPartnerId,
                type: msgType,
                textContent: message,
                status: 'success',
                responseTime: null,
                isFirst: false,
                isLast: false,
                convId: null,
                mediaUrl: null,
                fileName: null,
                translatorId: bot.translatorId || globalSettings.translatorId || null,
                errorReason: null,
                usedAi: false,
                isReply: isReply  // true только если было входящее от этого мужчины
            });

            if (lababotResult.success) {
                console.log(`[MiniChat] 📊 Статистика записана (isReply=${isReply})`);
            } else {
                console.warn(`[MiniChat] ⚠️ Не удалось записать статистику:`, lababotResult.error);
            }
        } catch (statError) {
            console.warn(`[MiniChat] ⚠️ Ошибка записи статистики:`, statError.message);
        }

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
        showToast(`Ошибка отправки ${minichatType === 'chat' ? 'чата' : 'письма'}`);
        inputEl.value = message;
    } finally {
        inputEl.disabled = false;
    }
}
