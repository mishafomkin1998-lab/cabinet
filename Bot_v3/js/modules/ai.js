function toggleAI(botId) {
    const opts = document.getElementById(`ai-options-${botId}`);
    const wasShown = opts.classList.contains('show');
    document.querySelectorAll('.ai-options').forEach(el => el.classList.remove('show'));
    if(!wasShown) opts.classList.add('show');
}

// =====================================================
// === ПОДМЕНЮ ШАБЛОНОВ ПРОМПТОВ ===
// =====================================================

let promptSubmenuTimeout = {};

function showPromptSubmenu(botId) {
    cancelHidePromptSubmenu(botId);
    const submenu = document.getElementById(`prompt-submenu-${botId}`);
    if (!submenu) return;

    // Определяем тип промпта в зависимости от режима
    const isChat = globalMode === 'chat';
    const promptType = isChat ? 'myPromptChat' : 'myPrompt';
    const templates = promptTemplates[promptType] || [];

    // Генерируем HTML подменю
    let html = `<div class="prompt-submenu-item" onclick="handleAIActionWithTemplate('${botId}', 'myprompt', null, event)" title="Shift=всем">По умолчанию</div>`;

    if (templates.length > 0) {
        templates.forEach(tpl => {
            html += `<div class="prompt-submenu-item" onclick="handleAIActionWithTemplate('${botId}', 'myprompt', '${tpl.id}', event)" title="Shift=всем">${tpl.name}</div>`;
        });
    } else {
        html += `<div class="prompt-submenu-item disabled">Нет шаблонов</div>`;
    }

    submenu.innerHTML = html;
    submenu.classList.add('show');
}

function hidePromptSubmenuDelayed(botId) {
    promptSubmenuTimeout[botId] = setTimeout(() => {
        const submenu = document.getElementById(`prompt-submenu-${botId}`);
        if (submenu) submenu.classList.remove('show');
    }, 200);
}

function cancelHidePromptSubmenu(botId) {
    if (promptSubmenuTimeout[botId]) {
        clearTimeout(promptSubmenuTimeout[botId]);
        promptSubmenuTimeout[botId] = null;
    }
}

// =====================================================
// === ПОДМЕНЮ ШАБЛОНОВ IMPROVE ===
// =====================================================

let improveSubmenuTimeout = {};

function showImproveSubmenu(botId) {
    cancelHideImproveSubmenu(botId);
    const submenu = document.getElementById(`improve-submenu-${botId}`);
    if (!submenu) return;

    const templates = promptTemplates.improvePrompt || [];

    // Генерируем HTML подменю
    let html = `<div class="prompt-submenu-item" onclick="handleAIActionWithTemplate('${botId}', 'improve', null, event)" title="Shift=всем">По умолчанию</div>`;

    if (templates.length > 0) {
        templates.forEach(tpl => {
            html += `<div class="prompt-submenu-item" onclick="handleAIActionWithTemplate('${botId}', 'improve', '${tpl.id}', event)" title="Shift=всем">${tpl.name}</div>`;
        });
    } else {
        html += `<div class="prompt-submenu-item disabled">Нет шаблонов</div>`;
    }

    submenu.innerHTML = html;
    submenu.classList.add('show');
}

function hideImproveSubmenuDelayed(botId) {
    improveSubmenuTimeout[botId] = setTimeout(() => {
        const submenu = document.getElementById(`improve-submenu-${botId}`);
        if (submenu) submenu.classList.remove('show');
    }, 200);
}

function cancelHideImproveSubmenu(botId) {
    if (improveSubmenuTimeout[botId]) {
        clearTimeout(improveSubmenuTimeout[botId]);
        improveSubmenuTimeout[botId] = null;
    }
}

// Обработка AI действия с конкретным шаблоном
async function handleAIActionWithTemplate(botId, action, templateId, event) {
    // Закрываем меню
    document.getElementById(`ai-options-${botId}`).classList.remove('show');
    const submenu = document.getElementById(`prompt-submenu-${botId}`);
    if (submenu) submenu.classList.remove('show');
    const improveSubmenu = document.getElementById(`improve-submenu-${botId}`);
    if (improveSubmenu) improveSubmenu.classList.remove('show');

    // Shift + клик = генерация для всех анкет
    if (event && event.shiftKey) {
        await generateAIForAllWithTemplate(action, templateId);
        return;
    }

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
            showToast(`⚠️ ${reason}`, 'warning');
            return;
        }
    }

    if(!globalSettings.apiKey) { showToast("Введите OpenAI API Key в настройках!"); return; }

    const txtArea = document.getElementById(`msg-${botId}`);
    const currentText = txtArea.value;

    let prompt = "";
    let systemRole = "You are a helpful dating assistant. Write engaging, short, and natural texts for dating sites.";

    if(action === 'myprompt') {
        const isChat = globalMode === 'chat';
        const promptType = isChat ? 'myPromptChat' : 'myPrompt';

        let myPromptValue = '';
        if (templateId) {
            // Используем конкретный шаблон
            const template = (promptTemplates[promptType] || []).find(t => t.id == templateId);
            if (template) {
                myPromptValue = template.text;
            }
        } else {
            // По умолчанию - используем встроенный промпт
            myPromptValue = '';
        }

        if (myPromptValue) {
            prompt = `${myPromptValue}. \n\nOriginal text: "${currentText}"`;
        } else {
            // Встроенный промпт по умолчанию
            prompt = isChat
                ? `Write a short, engaging chat message for a dating site. Keep it natural and flirty. Original text: "${currentText}"`
                : `Write an engaging letter for a dating site. Keep it warm and personal. Original text: "${currentText}"`;
        }
    } else if (action === 'improve') {
        if(!currentText) { showToast("Напишите что-то, чтобы улучшить!"); return; }

        // Получаем промпт из шаблона или настроек
        let improvePromptValue = '';
        if (templateId) {
            const template = (promptTemplates.improvePrompt || []).find(t => t.id == templateId);
            if (template) {
                improvePromptValue = template.text;
            }
        } else {
            improvePromptValue = globalSettings.improvePrompt || '';
        }

        // Стандартный промпт если пусто
        const defaultImprovePrompt = `Исправь грамматику, сделай текст более человечным и женским. Оставь текст на русском, сохрани естественность и не используй "Приветствие" или подпись. Текст: "{text}"`;
        const improvePromptTemplate = improvePromptValue || defaultImprovePrompt;

        // Заменяем {text} на текущий текст
        prompt = improvePromptTemplate.includes('{text}')
            ? improvePromptTemplate.replace('{text}', currentText)
            : `${improvePromptTemplate}\n\nТекст: "${currentText}"`;
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
            if (bots[botId]) {
                bots[botId].usedAi = true;
                console.log(`🤖 AI генерация для бота ${botId} - флаг usedAi установлен`);
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

// Генерация AI для всех анкет с конкретным шаблоном
async function generateAIForAllWithTemplate(action, templateId) {
    if(!globalSettings.apiKey) { showToast("Введите OpenAI API Key в настройках!"); return; }

    const botIds = Object.keys(bots);
    if (botIds.length === 0) return;

    const actionLabel = action === 'improve' ? 'Improve' : 'My Prompt';
    showBulkNotification(`AI ${actionLabel} запущен для всех...`, botIds.length);

    let config = { headers: { 'Authorization': `Bearer ${globalSettings.apiKey}`, 'Content-Type': 'application/json' } };
    if (globalSettings.proxyAI) {
        const proxyConfig = parseProxyUrl(globalSettings.proxyAI);
        if (proxyConfig) config.proxy = proxyConfig;
    }

    const systemRole = "You are a helpful dating assistant. Write engaging, short, and natural texts for dating sites.";
    let successCount = 0;

    // Получаем шаблон в зависимости от action
    let templateValue = '';
    if (action === 'myprompt') {
        const isChat = globalMode === 'chat';
        const promptType = isChat ? 'myPromptChat' : 'myPrompt';
        if (templateId) {
            const template = (promptTemplates[promptType] || []).find(t => t.id == templateId);
            if (template) templateValue = template.text;
        }
    } else if (action === 'improve') {
        if (templateId) {
            const template = (promptTemplates.improvePrompt || []).find(t => t.id == templateId);
            if (template) templateValue = template.text;
        } else {
            templateValue = globalSettings.improvePrompt || '';
        }
    }

    for (const botId of botIds) {
        const bot = bots[botId];
        const txtArea = document.getElementById(`msg-${botId}`);
        if (!txtArea) continue;

        const currentText = txtArea.value;
        let prompt = "";

        if (action === 'myprompt') {
            if (templateValue) {
                prompt = `${templateValue}. \n\nOriginal text: "${currentText}"`;
            } else {
                const isChat = globalMode === 'chat';
                prompt = isChat
                    ? `Write a short, engaging chat message for a dating site. Keep it natural and flirty. Original text: "${currentText}"`
                    : `Write an engaging letter for a dating site. Keep it warm and personal. Original text: "${currentText}"`;
            }
        } else if (action === 'improve') {
            if (!currentText) continue;
            const defaultImprovePrompt = `Исправь грамматику, сделай текст более человечным и женским. Оставь текст на русском, сохрани естественность и не используй "Приветствие" или подпись. Текст: "{text}"`;
            const improvePromptTemplate = templateValue || defaultImprovePrompt;
            prompt = improvePromptTemplate.includes('{text}')
                ? improvePromptTemplate.replace('{text}', currentText)
                : `${improvePromptTemplate}\n\nТекст: "${currentText}"`;
        }

        if (!prompt) continue;

        try {
            const response = await axios.post(OPENAI_API_ENDPOINT, {
                model: "gpt-3.5-turbo",
                messages: [ { role: "system", content: systemRole }, { role: "user", content: prompt } ],
                temperature: 0.9
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

        await new Promise(r => setTimeout(r, 300));
    }

    showBulkNotification(`AI ${actionLabel} выполнен`, successCount);
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
            showToast(`⚠️ ${reason}`, 'warning');
            return;
        }
    }

    if(!globalSettings.apiKey) { showToast("Введите OpenAI API Key в настройках!"); return; }

    const txtArea = document.getElementById(`msg-${botId}`);
    const currentText = txtArea.value;

    let prompt = "";
    let systemRole = "You are a helpful dating assistant. Write engaging, short, and natural texts for dating sites.";

    if(action === 'myprompt') {
        // В режиме Chat используем myPromptChat, в режиме Mail - myPrompt
        const isChat = globalMode === 'chat';
        const myPromptValue = isChat ? globalSettings.myPromptChat : globalSettings.myPrompt;
        const promptName = isChat ? "My Prompt (Chat)" : "My Prompt";

        if(!myPromptValue) { showToast(`Заполните '${promptName}' в настройках!`); return; }
        prompt = `${myPromptValue}. \n\nOriginal text: "${currentText}"`;
    } else if (action === 'improve') {
        if(!currentText) { showToast("Напишите что-то, чтобы улучшить!"); return; }
        // Используем пользовательский промпт из настроек или стандартный
        const defaultImprovePrompt = `Исправь грамматику, сделай текст более человечным и женским. Оставь текст на русском, сохрани естественность и не используй "Приветствие" или подпись. Текст: "{text}"`;
        const improvePromptTemplate = globalSettings.improvePrompt || defaultImprovePrompt;
        // Заменяем {text} на текущий текст
        prompt = improvePromptTemplate.includes('{text}')
            ? improvePromptTemplate.replace('{text}', currentText)
            : `${improvePromptTemplate}\n\nТекст: "${currentText}"`;
    } else if (action === 'generate') {
        // Используем промпт с сервера (синхронизированный из дашборда) или дефолтный
        prompt = serverGenerationPrompt || DEFAULT_GENERATION_PROMPT;
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
            // В режиме Chat используем myPromptChat, в режиме Mail - myPrompt
            const isChat = globalMode === 'chat';
            const myPromptValue = isChat ? globalSettings.myPromptChat : globalSettings.myPrompt;
            if(!myPromptValue) continue;
            prompt = `${myPromptValue}. \n\nOriginal text: "${currentText}"`;
        } else if (action === 'improve') {
            if(!currentText) continue;
            // Используем пользовательский промпт из настроек или стандартный
            const defaultImprovePrompt = `Исправь грамматику, сделай текст более человечным и женским. Оставь текст на русском, сохрани естественность и не используй "Приветствие" или подпись. Текст: "{text}"`;
            const improvePromptTemplate = globalSettings.improvePrompt || defaultImprovePrompt;
            // Заменяем {text} на текущий текст
            prompt = improvePromptTemplate.includes('{text}')
                ? improvePromptTemplate.replace('{text}', currentText)
                : `${improvePromptTemplate}\n\nТекст: "${currentText}"`;
        } else if (action === 'generate') {
            // Используем промпт с сервера (синхронизированный из дашборда) или дефолтный
            prompt = serverGenerationPrompt || DEFAULT_GENERATION_PROMPT;
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
