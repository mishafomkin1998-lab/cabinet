function loadGlobalSettingsUI() {
    document.getElementById('set-lang').value = globalSettings.lang;
    document.getElementById('set-theme').value = globalSettings.theme;
    document.getElementById('set-proxy').value = globalSettings.proxy;
    document.getElementById('set-proxy-url').value = globalSettings.proxyURL || '';
    document.getElementById('set-proxy-ai').value = globalSettings.proxyAI || '';
    document.getElementById('set-hotkeys').checked = globalSettings.hotkeys;
    document.getElementById('set-apikey').value = globalSettings.apiKey || '';
    document.getElementById('set-prompt').value = globalSettings.myPrompt || '';
    document.getElementById('set-prompt-chat').value = globalSettings.myPromptChat || '';
    document.getElementById('set-ai-reply-prompt').value = globalSettings.aiReplyPrompt || '';
    document.getElementById('set-chat-prompt').value = globalSettings.chatPrompt || '';
    document.getElementById('set-sounds').checked = globalSettings.soundsEnabled;
    document.getElementById('set-desktop-notifications').checked = globalSettings.desktopNotifications;
    document.getElementById('set-confirm-close').checked = globalSettings.confirmTabClose;
    document.getElementById('set-extended').checked = globalSettings.extendedFeatures;
    document.getElementById('set-skip-delete-confirm').checked = globalSettings.skipDeleteConfirm;
    document.getElementById('set-keep-logger-entries').checked = globalSettings.keepLoggerEntries;
    document.getElementById('set-translator-id').value = globalSettings.translatorId || '';
    applyTheme(globalSettings.theme);

    // Загружаем шаблоны промптов с сервера
    loadPromptTemplates();

    // ВАЖНО: Устанавливаем default прокси в main процесс при старте
    initDefaultProxy();
}

// Установить default прокси из настроек в main процесс
async function initDefaultProxy() {
    const { ipcRenderer } = require('electron');

    // Берём первый доступный прокси (proxy1)
    const defaultProxy = globalSettings.proxy1 || globalSettings.proxy || null;

    if (defaultProxy && defaultProxy.trim()) {
        try {
            await ipcRenderer.invoke('set-bot-proxy', { botId: 'default', proxyString: defaultProxy.trim() });
            console.log(`%c[Proxy Init] Default прокси установлен: ${defaultProxy}`, 'color: green; font-weight: bold');
        } catch (e) {
            console.error('[Proxy Init] Ошибка:', e);
        }
    } else {
        console.log('[Proxy Init] Default прокси не настроен');
    }
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
    globalSettings.myPromptChat = document.getElementById('set-prompt-chat').value;
    globalSettings.aiReplyPrompt = document.getElementById('set-ai-reply-prompt').value;
    globalSettings.chatPrompt = document.getElementById('set-chat-prompt').value;
    globalSettings.soundsEnabled = document.getElementById('set-sounds').checked;
    globalSettings.desktopNotifications = document.getElementById('set-desktop-notifications').checked;
    globalSettings.confirmTabClose = document.getElementById('set-confirm-close').checked;
    globalSettings.extendedFeatures = document.getElementById('set-extended').checked;
    globalSettings.skipDeleteConfirm = document.getElementById('set-skip-delete-confirm').checked;
    globalSettings.keepLoggerEntries = document.getElementById('set-keep-logger-entries').checked;

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

    // ВАЖНО: Обновляем default прокси в main процесс
    initDefaultProxy();
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
    document.getElementById('set-prompt-chat').value = globalSettings.myPromptChat || '';
    document.getElementById('set-ai-reply-prompt').value = globalSettings.aiReplyPrompt || '';
    document.getElementById('set-chat-prompt').value = globalSettings.chatPrompt || '';
    document.getElementById('set-sounds').checked = globalSettings.soundsEnabled;
    document.getElementById('set-desktop-notifications').checked = globalSettings.desktopNotifications;
    document.getElementById('set-confirm-close').checked = globalSettings.confirmTabClose;
    document.getElementById('set-extended').checked = globalSettings.extendedFeatures;
    document.getElementById('set-skip-delete-confirm').checked = globalSettings.skipDeleteConfirm;
    document.getElementById('set-keep-logger-entries').checked = globalSettings.keepLoggerEntries;
    document.getElementById('set-translator-id').value = globalSettings.translatorId || '';

    // Загружаем прокси для анкет (1-6)
    for (let i = 1; i <= 6; i++) {
        const proxyInput = document.getElementById(`set-proxy-${i}`);
        if (proxyInput) {
            proxyInput.value = globalSettings[`proxy${i}`] || '';
        }
    }

    // Загружаем шаблоны промптов
    loadPromptTemplates();

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

// Тест прокси - реальная проверка через main процесс
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

    // Проверяем формат (ip:port или domain:port:user:pass)
    const parts = proxy.split(':');
    if (parts.length !== 2 && parts.length !== 4) {
        statusSpan.innerHTML = '<i class="fa fa-times-circle"></i>';
        statusSpan.className = 'proxy-status error';
        statusSpan.title = 'Неверный формат. Используйте ip:port или domain:port:user:pass';
        return;
    }

    statusSpan.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    statusSpan.className = 'proxy-status testing';
    statusSpan.title = 'Проверка подключения...';

    try {
        // Реальный тест через main процесс
        const { ipcRenderer } = require('electron');
        const result = await ipcRenderer.invoke('test-proxy', { proxyString: proxy });

        if (result.success) {
            statusSpan.innerHTML = '<i class="fa fa-check-circle"></i>';
            statusSpan.className = 'proxy-status success';
            statusSpan.title = result.ip ? `✅ Работает! IP: ${result.ip}` : '✅ Прокси работает!';
        } else {
            statusSpan.innerHTML = '<i class="fa fa-times-circle"></i>';
            statusSpan.className = 'proxy-status error';
            statusSpan.title = `❌ ${result.error || 'Ошибка подключения'}`;
        }
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

    // Определяем какой прокси использовать (25 анкет на прокси)
    const proxyIndex = Math.ceil(position / 25); // 1-25 -> 1, 26-50 -> 2, и т.д.

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
    }, true); // capture phase для перехвата до браузера
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
    const oldMode = globalMode;

    if (globalMode === 'mail') {
        globalMode = 'chat';
        document.body.classList.remove('mode-mail'); document.body.classList.add('mode-chat');
        btn.innerHTML = '<i class="fa fa-comments"></i>'; btn.className = 'btn btn-circle btn-mode-switch active-chat';
    } else {
        globalMode = 'mail';
        document.body.classList.remove('mode-chat'); document.body.classList.add('mode-mail');
        btn.innerHTML = '<i class="fa fa-envelope"></i>'; btn.className = 'btn btn-circle btn-mode-switch active-mail';
    }

    // DEBUG LOG
    console.log(`%c[DEBUG-TPL] 🔄 MODE SWITCH`, 'background: #f39c12; color: white; padding: 2px 5px; font-weight: bold;', {
        from: oldMode,
        to: globalMode,
        activeTabId
    });

    // DEBUG: Показать состояние ВСЕХ textarea ДО обновления
    console.log(`%c[DEBUG-TPL] 📋 ВСЕ TEXTAREA ДО обновления:`, 'background: #3498db; color: white; padding: 2px 5px;');
    Object.values(bots).forEach(b => {
        const textarea = document.getElementById(`msg-${b.id}`);
        console.log(`  ${b.displayId}: "${textarea?.value?.substring(0, 50)}..."`);
    });

    if(activeTabId && bots[activeTabId]) updateInterfaceForMode(activeTabId);

    // DEBUG: Показать состояние ВСЕХ textarea ПОСЛЕ обновления
    console.log(`%c[DEBUG-TPL] 📋 ВСЕ TEXTAREA ПОСЛЕ обновления:`, 'background: #27ae60; color: white; padding: 2px 5px;');
    Object.values(bots).forEach(b => {
        const textarea = document.getElementById(`msg-${b.id}`);
        const isActive = b.id === activeTabId ? '✅ АКТИВНАЯ' : '⬜ неактивная';
        console.log(`  ${isActive} ${b.displayId}: "${textarea?.value?.substring(0, 50)}..."`);
    });
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

// =====================================================
// === ШАБЛОНЫ ПРОМПТОВ (localStorage + опционально сервер) ===
// =====================================================

// Маппинг типов промптов к ID элементов
const promptTypeToTextarea = {
    improvePrompt: 'set-improve-prompt',
    myPrompt: 'set-prompt',
    myPromptChat: 'set-prompt-chat',
    replyPrompt: 'set-ai-reply-prompt',
    chatPrompt: 'set-chat-prompt'
};

const promptTypeToSetting = {
    improvePrompt: 'improvePrompt',
    myPrompt: 'myPrompt',
    myPromptChat: 'myPromptChat',
    replyPrompt: 'aiReplyPrompt',
    chatPrompt: 'chatPrompt'
};

// Загрузить шаблоны промптов (сначала localStorage, потом сервер если есть ID)
async function loadPromptTemplates() {
    // 1. Загружаем из localStorage
    const saved = localStorage.getItem('promptTemplates');
    if (saved) {
        try {
            promptTemplates = JSON.parse(saved);
            console.log('[PromptTemplates] Загружено из localStorage:', promptTemplates);
        } catch (e) {
            console.error('[PromptTemplates] Ошибка парсинга localStorage:', e);
            promptTemplates = { improvePrompt: [], myPrompt: [], myPromptChat: [], replyPrompt: [], chatPrompt: [] };
        }
    }

    // 2. Обновляем выпадающие списки
    updatePromptDropdown('improvePrompt');
    updatePromptDropdown('myPrompt');
    updatePromptDropdown('myPromptChat');
    updatePromptDropdown('replyPrompt');
    updatePromptDropdown('chatPrompt');

    // 3. Если есть translatorId - пробуем загрузить с сервера (для синхронизации)
    if (globalSettings.translatorId) {
        try {
            const response = await axios.get(`${LABABOT_SERVER}/api/prompt-templates/${globalSettings.translatorId}`);
            if (response.data.success && response.data.data) {
                // Мержим серверные шаблоны с локальными
                const serverTemplates = response.data.data;
                ['improvePrompt', 'myPrompt', 'myPromptChat', 'replyPrompt', 'chatPrompt'].forEach(type => {
                    if (serverTemplates[type] && serverTemplates[type].length > 0) {
                        promptTemplates[type] = serverTemplates[type];
                    }
                });
                savePromptTemplatesToStorage();
                updatePromptDropdown('improvePrompt');
                updatePromptDropdown('myPrompt');
                updatePromptDropdown('myPromptChat');
                updatePromptDropdown('replyPrompt');
                updatePromptDropdown('chatPrompt');
                console.log('[PromptTemplates] Синхронизировано с сервером');
            }
        } catch (error) {
            console.log('[PromptTemplates] Сервер недоступен, используем localStorage');
        }
    }
}

// Сохранить шаблоны в localStorage
function savePromptTemplatesToStorage() {
    localStorage.setItem('promptTemplates', JSON.stringify(promptTemplates));
}

// Обновить выпадающий список шаблонов
function updatePromptDropdown(promptType) {
    const select = document.getElementById(`select-${promptType}`);
    if (!select) return;

    const templates = promptTemplates[promptType] || [];
    const activeId = globalSettings.activePromptTemplates?.[promptType];

    // Очищаем и заполняем заново
    select.innerHTML = '<option value="">-- Без шаблона --</option>';

    templates.forEach(tpl => {
        const option = document.createElement('option');
        option.value = tpl.id;
        option.textContent = tpl.name;
        if (tpl.isActive || tpl.id === activeId) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Если есть активный шаблон - загружаем его текст
    const activeTemplate = templates.find(t => t.isActive || t.id === activeId);
    if (activeTemplate) {
        const textarea = document.getElementById(promptTypeToTextarea[promptType]);
        if (textarea) {
            textarea.value = activeTemplate.text;
            // Также обновляем globalSettings
            const settingKey = promptTypeToSetting[promptType];
            globalSettings[settingKey] = activeTemplate.text;
        }
    }
}

// Выбрать шаблон из выпадающего списка
async function selectPromptTemplate(promptType) {
    const select = document.getElementById(`select-${promptType}`);
    const templateId = select.value;
    const textarea = document.getElementById(promptTypeToTextarea[promptType]);

    if (!templateId) {
        // Очищаем текст если выбрано "Без шаблона"
        textarea.value = '';
        const settingKey = promptTypeToSetting[promptType];
        globalSettings[settingKey] = '';
        globalSettings.activePromptTemplates = globalSettings.activePromptTemplates || {};
        globalSettings.activePromptTemplates[promptType] = null;
        localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
        return;
    }

    // Находим шаблон и загружаем его текст
    const template = (promptTemplates[promptType] || []).find(t => t.id == templateId);
    if (template) {
        textarea.value = template.text;
        const settingKey = promptTypeToSetting[promptType];
        globalSettings[settingKey] = template.text;
        globalSettings.activePromptTemplates = globalSettings.activePromptTemplates || {};
        globalSettings.activePromptTemplates[promptType] = template.id;
        localStorage.setItem('globalSettings', JSON.stringify(globalSettings));

        // Устанавливаем активный на сервере (только для серверных шаблонов)
        if (globalSettings.translatorId && !String(templateId).startsWith('local_')) {
            try {
                await axios.post(`${LABABOT_SERVER}/api/prompt-templates/${globalSettings.translatorId}/set-active`, {
                    promptType,
                    templateId: template.id
                });
            } catch (e) {
                // Игнорируем ошибки сервера
            }
        }
    }
}

// Текущий тип промпта для добавления (используется модальным окном)
let pendingPromptType = null;

// Добавить новый шаблон - открывает модальное окно
function addPromptTemplate(promptType) {
    console.log('[addPromptTemplate] Вызвана функция, promptType:', promptType);

    const textareaId = promptTypeToTextarea[promptType];
    const textarea = document.getElementById(textareaId);

    if (!textarea) {
        showToast('Ошибка: не найден элемент textarea');
        return;
    }

    const text = textarea.value.trim();
    if (!text) {
        showToast('Сначала введите текст промпта в поле ниже', 'warning');
        return;
    }

    // Сохраняем тип и открываем модалку
    pendingPromptType = promptType;
    document.getElementById('prompt-name-input').value = '';
    openModal('prompt-name-modal');

    // Фокус на поле ввода
    setTimeout(() => {
        document.getElementById('prompt-name-input').focus();
    }, 100);
}

// Подтверждение добавления шаблона (вызывается из модалки)
async function confirmAddPromptTemplate() {
    const name = document.getElementById('prompt-name-input').value.trim();
    if (!name) {
        showToast('Введите название шаблона', 'warning');
        return;
    }

    const promptType = pendingPromptType;
    if (!promptType) return;

    closeModal('prompt-name-modal');

    try {
        const textareaId = promptTypeToTextarea[promptType];
        const textarea = document.getElementById(textareaId);
        const text = textarea.value.trim();

        // Генерируем локальный ID
        const localId = 'local_' + Date.now();

        // Добавляем в локальный список
        promptTemplates[promptType] = promptTemplates[promptType] || [];
        // Деактивируем остальные локально
        promptTemplates[promptType].forEach(t => t.isActive = false);

        const newTemplate = {
            id: localId,
            name: name,
            text: text,
            isActive: true
        };
        promptTemplates[promptType].push(newTemplate);

        // Сохраняем в localStorage
        savePromptTemplatesToStorage();

        // Обновляем dropdown
        updatePromptDropdown(promptType);

        // Сохраняем активный ID
        globalSettings.activePromptTemplates = globalSettings.activePromptTemplates || {};
        globalSettings.activePromptTemplates[promptType] = localId;
        localStorage.setItem('globalSettings', JSON.stringify(globalSettings));

        console.log('[PromptTemplates] Шаблон сохранён локально:', newTemplate);

        // Если есть translatorId - пробуем сохранить на сервер
        if (globalSettings.translatorId) {
            try {
                const response = await axios.post(`${LABABOT_SERVER}/api/prompt-templates/${globalSettings.translatorId}`, {
                    promptType,
                    name: name,
                    text,
                    isActive: true
                });
                if (response.data.success) {
                    // Обновляем ID на серверный
                    newTemplate.id = response.data.data.id;
                    globalSettings.activePromptTemplates[promptType] = response.data.data.id;
                    savePromptTemplatesToStorage();
                    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
                    updatePromptDropdown(promptType);
                    console.log('[PromptTemplates] Синхронизировано с сервером');
                }
            } catch (error) {
                console.log('[PromptTemplates] Сервер недоступен, сохранено только локально');
            }
        }

        showToast('Шаблон сохранён!', 'success');
    } catch (err) {
        console.error('[confirmAddPromptTemplate] Ошибка:', err);
        showToast('Ошибка при добавлении шаблона: ' + err.message);
    }
}

// Удалить шаблон (локально, опционально с сервера)
async function deletePromptTemplate(promptType) {
    const select = document.getElementById(`select-${promptType}`);
    const templateId = select.value;

    if (!templateId) {
        showToast('Сначала выберите шаблон для удаления', 'warning');
        return;
    }

    const template = (promptTemplates[promptType] || []).find(t => t.id == templateId);
    if (!template) return;

    if (!await customConfirm(`Удалить шаблон "${template.name}"?`, { type: 'danger' })) return;

    // Удаляем из локального списка
    promptTemplates[promptType] = (promptTemplates[promptType] || []).filter(t => t.id != templateId);

    // Сохраняем в localStorage
    savePromptTemplatesToStorage();

    // Очищаем textarea
    const textarea = document.getElementById(promptTypeToTextarea[promptType]);
    textarea.value = '';

    // Сбрасываем активный ID
    globalSettings.activePromptTemplates = globalSettings.activePromptTemplates || {};
    globalSettings.activePromptTemplates[promptType] = null;
    const settingKey = promptTypeToSetting[promptType];
    globalSettings[settingKey] = '';
    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));

    // Обновляем dropdown
    updatePromptDropdown(promptType);

    console.log('[PromptTemplates] Шаблон удалён локально');

    // Если есть translatorId и это серверный шаблон - удаляем с сервера
    if (globalSettings.translatorId && !String(templateId).startsWith('local_')) {
        try {
            await axios.delete(`${LABABOT_SERVER}/api/prompt-templates/${globalSettings.translatorId}/${templateId}`);
            console.log('[PromptTemplates] Удалено с сервера');
        } catch (error) {
            console.log('[PromptTemplates] Не удалось удалить с сервера:', error.message);
        }
    }

    showToast('Шаблон удалён', 'success');
}

// Сохранить текст промпта (при редактировании)
async function savePromptText(promptType) {
    const textarea = document.getElementById(promptTypeToTextarea[promptType]);
    const text = textarea.value;
    const settingKey = promptTypeToSetting[promptType];

    // Сохраняем в локальные настройки
    globalSettings[settingKey] = text;
    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));

    // Если выбран шаблон - обновляем его локально
    const select = document.getElementById(`select-${promptType}`);
    const templateId = select?.value;

    if (templateId) {
        // Обновляем локальный кеш
        const template = (promptTemplates[promptType] || []).find(t => t.id == templateId);
        if (template) {
            template.text = text;
            savePromptTemplatesToStorage();
        }

        // Если есть translatorId и это серверный шаблон - обновляем на сервере
        if (globalSettings.translatorId && !String(templateId).startsWith('local_')) {
            try {
                await axios.put(`${LABABOT_SERVER}/api/prompt-templates/${globalSettings.translatorId}/${templateId}`, {
                    text
                });
                console.log('[PromptTemplates] Текст обновлён на сервере');
            } catch (error) {
                console.log('[PromptTemplates] Сервер недоступен, сохранено локально');
            }
        }
    }
}
