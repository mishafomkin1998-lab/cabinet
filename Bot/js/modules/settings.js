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
