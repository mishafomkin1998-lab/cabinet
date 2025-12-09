/**
 * ai.js - AI функции для генерации и улучшения текста
 * Интеграция с OpenAI API
 */

// ============================================================================
// УПРАВЛЕНИЕ AI МЕНЮ
// ============================================================================

/**
 * Переключить видимость AI меню
 * @param {string} botId - ID бота
 */
function toggleAI(botId) {
    const options = document.getElementById(`ai-options-${botId}`);
    if (options) {
        options.classList.toggle('show');
    }
}

// ============================================================================
// ОБРАБОТКА AI ДЕЙСТВИЙ
// ============================================================================

/**
 * Обработка AI действий
 * @param {string} botId - ID бота
 * @param {string} action - Действие: 'improve', 'generate', 'myprompt'
 * @param {Event} event - Событие клика
 */
async function handleAIAction(botId, action, event) {
    // Shift + клик = для всех анкет
    if (event && event.shiftKey) {
        await generateAIForAll(action);
        return;
    }

    const bot = bots[botId];
    if (!bot) return;

    // Проверяем API ключ
    if (!globalSettings.apiKey) {
        alert('Добавьте OpenAI API Key в настройках');
        return;
    }

    // Проверяем разрешение AI для анкеты
    const aiStatus = await checkProfileAIEnabled(bot.displayId);
    if (!aiStatus.enabled) {
        const reason = aiStatus.reason === 'disabled_by_admin'
            ? 'AI отключен администратором для этой анкеты'
            : aiStatus.reason === 'no_translator'
            ? 'Анкете не назначен переводчик'
            : 'AI недоступен для этой анкеты';
        alert(`${reason}`);
        return;
    }

    const textarea = document.getElementById(`msg-${botId}`);
    if (!textarea) return;

    const currentText = textarea.value;

    // Показываем индикатор загрузки
    textarea.disabled = true;
    const originalPlaceholder = textarea.placeholder;
    textarea.placeholder = 'AI обрабатывает...';

    try {
        let prompt = '';
        let systemPrompt = '';
        const isChat = globalMode === 'chat';

        switch (action) {
            case 'improve':
                if (!currentText.trim()) {
                    alert('Введите текст для улучшения');
                    return;
                }
                systemPrompt = isChat
                    ? 'You are an expert at improving romantic chat messages for a dating site. Improve the message to be more engaging while keeping the same meaning. Write in English. Do not use emojis.'
                    : 'You are an expert at improving romantic letters for a dating site. Improve the letter to be more warm and personal while keeping the same meaning. Write in English. Do not use emojis.';
                prompt = `Improve this ${isChat ? 'chat message' : 'letter'}: "${currentText}"`;
                break;

            case 'generate':
                systemPrompt = isChat
                    ? 'You are an expert at writing romantic chat invitations for a dating site. Write a friendly, intriguing message that makes the person want to respond. Use {Name} placeholder for recipient name. Write in English. Keep it short (2-3 sentences). Do not use emojis.'
                    : 'You are an expert at writing romantic letters for a dating site. Write a warm, personal letter. Use {Name}, {City}, {Age} placeholders where appropriate. Write in English. Keep it medium length (3-5 sentences). Do not use emojis.';
                prompt = `Write a new ${isChat ? 'chat invitation' : 'letter'}`;
                break;

            case 'myprompt':
                const userPrompt = prompt('Введите свой промпт для AI:');
                if (!userPrompt) return;
                systemPrompt = 'You are a helpful assistant for writing messages on a dating site. Write in English. Do not use emojis.';
                prompt = userPrompt;
                break;
        }

        const result = await callOpenAI(systemPrompt, prompt);

        if (result.success) {
            textarea.value = result.text;
            // Помечаем что AI был использован
            bot.usedAi = true;
            console.log(`AI: Текст сгенерирован для ${bot.displayId}, флаг usedAi = true`);
            // Автосохраняем
            autoSaveTemplateText(botId);
        } else {
            alert('Ошибка AI: ' + result.error);
        }

    } catch (error) {
        console.error('AI action error:', error);
        alert('Ошибка AI: ' + error.message);
    } finally {
        textarea.disabled = false;
        textarea.placeholder = originalPlaceholder;
    }
}

/**
 * AI генерация для ВСЕХ анкет
 * @param {string} action - Действие
 */
async function generateAIForAll(action) {
    if (!globalSettings.apiKey) {
        alert('Добавьте OpenAI API Key в настройках');
        return;
    }

    const botIds = Object.keys(bots);
    if (botIds.length === 0) return;

    if (!confirm(`Применить AI "${action}" ко всем ${botIds.length} анкетам?`)) return;

    let count = 0;
    let errors = 0;

    for (const botId of botIds) {
        const bot = bots[botId];

        // Проверяем AI статус
        const aiStatus = await checkProfileAIEnabled(bot.displayId);
        if (!aiStatus.enabled) {
            errors++;
            continue;
        }

        const textarea = document.getElementById(`msg-${botId}`);
        if (!textarea) continue;

        try {
            const isChat = globalMode === 'chat';
            let systemPrompt = isChat
                ? 'You are an expert at writing romantic chat invitations for a dating site. Write a friendly, intriguing message. Use {Name} placeholder. Write in English. Keep it short (2-3 sentences). Do not use emojis.'
                : 'You are an expert at writing romantic letters for a dating site. Write a warm, personal letter. Use {Name}, {City}, {Age} placeholders. Write in English. Keep it medium length (3-5 sentences). Do not use emojis.';

            let prompt = '';
            if (action === 'improve' && textarea.value.trim()) {
                prompt = `Improve this text: "${textarea.value}"`;
            } else {
                prompt = `Write a new ${isChat ? 'chat invitation' : 'letter'}`;
            }

            const result = await callOpenAI(systemPrompt, prompt);

            if (result.success) {
                textarea.value = result.text;
                bot.usedAi = true;
                autoSaveTemplateText(botId);
                count++;
            } else {
                errors++;
            }

            // Пауза между запросами (rate limiting)
            await new Promise(r => setTimeout(r, 1000));

        } catch (e) {
            errors++;
        }
    }

    showBulkNotification(`AI применён: ${count} успешно, ${errors} ошибок`, count);
}

// ============================================================================
// ВЫЗОВ OPENAI API
// ============================================================================

/**
 * Вызов OpenAI API
 * @param {string} systemPrompt - Системный промпт
 * @param {string} userPrompt - Пользовательский промпт
 * @returns {Promise<Object>} - { success, text, error }
 */
async function callOpenAI(systemPrompt, userPrompt) {
    try {
        const config = {
            headers: {
                'Authorization': `Bearer ${globalSettings.apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        // Прокси для AI (если указан)
        if (globalSettings.proxyAI) {
            const proxyConfig = parseProxyUrl(globalSettings.proxyAI);
            if (proxyConfig) config.proxy = proxyConfig;
        }

        const response = await axios.post(OPENAI_API_ENDPOINT, {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.8,
            max_tokens: 500
        }, config);

        const generatedText = response.data.choices[0].message.content.trim();
        return { success: true, text: generatedText };

    } catch (error) {
        console.error('OpenAI API error:', error);
        const errorMsg = error.response?.data?.error?.message || error.message || 'Unknown error';
        return { success: false, error: errorMsg };
    }
}

// ============================================================================
// ГЕНЕРАЦИЯ ШАБЛОНА ЧЕРЕЗ AI
// ============================================================================

/**
 * Генерация текста шаблона с помощью AI (из модального окна)
 */
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
            alert(`${reason}`);
            return;
        }
    }

    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Генерация...';

    try {
        const isChat = globalMode === 'chat';
        const systemPrompt = isChat
            ? `You are an expert at writing romantic chat invitations for a dating site. Write in English. The message should be friendly, intriguing and make the person want to respond. Use {Name} placeholder for recipient's name if appropriate. Keep it short (2-3 sentences). Do not use emojis.`
            : `You are an expert at writing romantic letters for a dating site. Write in English. The letter should be warm, personal and engaging. Use {Name} placeholder for recipient's name, {City} for their city, {Age} for their age if appropriate. Keep it medium length (3-5 sentences). Do not use emojis.`;

        const result = await callOpenAI(systemPrompt, `Write a ${isChat ? 'chat invitation' : 'letter'} with this style/theme: ${userPrompt}`);

        if (result.success) {
            textArea.value = result.text;
            promptInput.value = '';
        } else {
            alert(`Ошибка генерации: ${result.error}`);
        }

    } catch (error) {
        console.error('AI Generation error:', error);
        alert(`Ошибка генерации: ${error.message}`);
    } finally {
        btn.innerHTML = originalBtnHtml;
        btn.disabled = false;
    }
}

// ============================================================================
// AI ОТВЕТ В MINICHAT
// ============================================================================

/**
 * Генерация AI ответа для MiniChat
 */
async function generateMiniChatAIReply() {
    if (!globalSettings.apiKey) {
        alert('Добавьте OpenAI API Key в настройках');
        return;
    }

    const input = document.getElementById('mini-chat-input');
    const historyContainer = document.getElementById('mini-chat-history');
    const btn = document.getElementById('mini-chat-ai-btn');

    if (!input || !historyContainer) return;

    // Получаем последние сообщения из истории для контекста
    const messages = historyContainer.querySelectorAll('.mini-chat-message');
    let context = '';
    const lastMessages = Array.from(messages).slice(-5);
    lastMessages.forEach(msg => {
        const isOutgoing = msg.classList.contains('outgoing');
        const text = msg.querySelector('.message-text')?.textContent || '';
        context += `${isOutgoing ? 'Me' : 'Him'}: ${text}\n`;
    });

    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const systemPrompt = 'You are helping a woman write a romantic reply on a dating site. Based on the conversation history, write a short, warm, engaging response. Write in English. Do not use emojis. Keep it 1-2 sentences.';
        const userPrompt = context
            ? `Based on this conversation, write a reply:\n${context}`
            : 'Write a friendly opening message for a dating chat';

        const result = await callOpenAI(systemPrompt, userPrompt);

        if (result.success) {
            input.value = result.text;
            input.focus();
        } else {
            alert('Ошибка AI: ' + result.error);
        }

    } catch (error) {
        alert('Ошибка AI: ' + error.message);
    } finally {
        btn.innerHTML = originalBtnHtml;
        btn.disabled = false;
    }
}

console.log('[Lababot] ai.js loaded');
