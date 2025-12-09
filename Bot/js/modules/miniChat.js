/**
 * miniChat.js - MiniChat функционал
 * Быстрый чат с партнером из уведомлений
 */

// ============================================================================
// ПЕРЕМЕННЫЕ MINICHAT
// ============================================================================

let miniChatBotId = null;
let miniChatPartnerId = null;
let miniChatPartnerName = null;

// ============================================================================
// ОТКРЫТИЕ/ЗАКРЫТИЕ MINICHAT
// ============================================================================

/**
 * Открыть MiniChat
 * @param {string} botId - ID бота
 * @param {string} partnerId - ID партнера
 * @param {string} partnerName - Имя партнера
 */
async function openMiniChat(botId, partnerId, partnerName) {
    miniChatBotId = botId;
    miniChatPartnerId = partnerId;
    miniChatPartnerName = partnerName || `ID ${partnerId}`;

    const container = document.getElementById('mini-chat-container');
    if (!container) return;

    // Заголовок
    const header = container.querySelector('.mini-chat-header-title');
    if (header) {
        header.innerHTML = `<i class="fa fa-comments"></i> ${miniChatPartnerName}`;
    }

    // Очищаем историю
    const history = document.getElementById('mini-chat-history');
    if (history) {
        history.innerHTML = '<div class="text-center text-muted p-3"><i class="fa fa-spinner fa-spin"></i> Загрузка...</div>';
    }

    // Показываем контейнер
    container.classList.add('show');

    // Загружаем историю
    await loadMiniChatHistoryUI();
}

/**
 * Закрыть MiniChat
 */
function closeMiniChat() {
    const container = document.getElementById('mini-chat-container');
    if (container) {
        container.classList.remove('show');
    }
    miniChatBotId = null;
    miniChatPartnerId = null;
    miniChatPartnerName = null;
}

// ============================================================================
// ЗАГРУЗКА ИСТОРИИ
// ============================================================================

/**
 * Загрузить и отобразить историю MiniChat
 */
async function loadMiniChatHistoryUI() {
    const history = document.getElementById('mini-chat-history');
    if (!history || !miniChatBotId || !miniChatPartnerId) return;

    const bot = bots[miniChatBotId];
    if (!bot || !bot.webview) {
        history.innerHTML = '<div class="text-center text-muted p-3">Сессия недоступна</div>';
        return;
    }

    try {
        // Загружаем историю через WebView
        const result = await bot.webview.executeJavaScript(`
            (async () => {
                try {
                    const res = await fetch('https://ladadate.com/chat-messages?recipientId=${miniChatPartnerId}&skip=0&limit=50', {
                        method: 'GET',
                        credentials: 'include'
                    });
                    const data = await res.json();
                    return { success: true, messages: data.Messages || [] };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `);

        if (!result.success) {
            history.innerHTML = `<div class="text-center text-danger p-3">Ошибка: ${result.error}</div>`;
            return;
        }

        const messages = result.messages;

        if (messages.length === 0) {
            history.innerHTML = '<div class="text-center text-muted p-3">Нет сообщений</div>';
            return;
        }

        // Рендерим сообщения
        history.innerHTML = messages.reverse().map(msg => {
            const isOutgoing = msg.IsOutgoing;
            const time = new Date(msg.SendDate).toLocaleTimeString();
            const text = msg.Body || '';

            return `
                <div class="mini-chat-message ${isOutgoing ? 'outgoing' : 'incoming'}">
                    <div class="message-text">${escapeHtml(text)}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }).join('');

        // Скроллим вниз
        history.scrollTop = history.scrollHeight;

    } catch (error) {
        console.error('Load MiniChat history error:', error);
        history.innerHTML = `<div class="text-center text-danger p-3">Ошибка загрузки</div>`;
    }
}

// ============================================================================
// ОТПРАВКА СООБЩЕНИЯ
// ============================================================================

/**
 * Отправить сообщение из MiniChat
 */
async function sendMiniChatMessage() {
    const input = document.getElementById('mini-chat-input');
    if (!input || !miniChatBotId || !miniChatPartnerId) return;

    const text = input.value.trim();
    if (!text) return;

    const bot = bots[miniChatBotId];
    if (!bot || !bot.webview) {
        showToast('Сессия недоступна', 'error');
        return;
    }

    const sendBtn = document.getElementById('mini-chat-send-btn');
    const originalBtnHtml = sendBtn.innerHTML;
    sendBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    sendBtn.disabled = true;
    input.disabled = true;

    try {
        // Отправляем через WebView
        const result = await bot.webview.executeJavaScript(`
            (async () => {
                try {
                    const res = await fetch('https://ladadate.com/chat-send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipientId: ${miniChatPartnerId},
                            body: ${JSON.stringify(text)}
                        }),
                        credentials: 'include'
                    });
                    const data = await res.json();
                    return { success: res.ok, data };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `);

        if (result.success) {
            // Очищаем input
            input.value = '';

            // Добавляем сообщение в историю
            const history = document.getElementById('mini-chat-history');
            const msgDiv = document.createElement('div');
            msgDiv.className = 'mini-chat-message outgoing';
            msgDiv.innerHTML = `
                <div class="message-text">${escapeHtml(text)}</div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            `;
            history.appendChild(msgDiv);
            history.scrollTop = history.scrollHeight;

            // Отправляем статистику на сервер
            const convData = bot.trackConversation(miniChatPartnerId);
            const convId = bot.getConvId(miniChatPartnerId);

            sendMessageToLababot({
                botId: bot.id,
                accountDisplayId: bot.displayId,
                recipientId: miniChatPartnerId,
                type: 'chat_msg',
                textContent: text,
                status: 'success',
                responseTime: convData.responseTime,
                isFirst: convData.isFirst,
                isLast: false,
                convId: convId,
                mediaUrl: null,
                fileName: null,
                translatorId: globalSettings.translatorId,
                errorReason: null,
                usedAi: bot.usedAi || false
            });

            // Сбрасываем флаг AI
            if (bot.usedAi) {
                bot.usedAi = false;
            }

            // Инкрементируем статистику
            bot.incrementStat('chat', 'sent');

        } else {
            showToast('Ошибка отправки: ' + (result.error || 'Unknown'), 'error');
        }

    } catch (error) {
        console.error('Send MiniChat message error:', error);
        showToast('Ошибка отправки', 'error');
    } finally {
        sendBtn.innerHTML = originalBtnHtml;
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
    }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Экранирование HTML
 * @param {string} text - Текст для экранирования
 * @returns {string} - Экранированный текст
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Обработка Enter в input MiniChat
 * @param {KeyboardEvent} e - Событие клавиатуры
 */
function handleMiniChatKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMiniChatMessage();
    }
}

/**
 * Обновить MiniChat (перезагрузить историю)
 */
async function refreshMiniChat() {
    if (miniChatBotId && miniChatPartnerId) {
        await loadMiniChatHistoryUI();
    }
}

console.log('[Lababot] miniChat.js loaded');
