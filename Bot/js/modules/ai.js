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
            showToast(`⚠️ ${reason}`);
            return;
        }
    }

    if(!globalSettings.apiKey) { showToast("Введите OpenAI API Key в настройках!"); return; }

    const txtArea = document.getElementById(`msg-${botId}`);
    const currentText = txtArea.value;

    let prompt = "";
    let systemRole = "You are a helpful dating assistant. Write engaging, short, and natural texts for dating sites.";

    if(action === 'myprompt') {
        if(!globalSettings.myPrompt) { showToast("Заполните 'My Prompt' в настройках!"); return; }
        prompt = `${globalSettings.myPrompt}. \n\nOriginal text: "${currentText}"`;
    } else if (action === 'improve') {
        if(!currentText) { showToast("Напишите что-то, чтобы улучшить!"); return; }
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
        showToast("Ошибка AI. Проверьте ключ или прокси.");
    } finally {
        btn.innerHTML = originalHtml;
    }
}

// Генерация AI текста для ВСЕХ анкет (параллельно, разные тексты)
async function generateAIForAll(action) {
    if(!globalSettings.apiKey) { showToast("Введите OpenAI API Key в настройках!"); return; }

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
