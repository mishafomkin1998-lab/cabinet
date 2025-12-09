/**
 * settings.js - Настройки приложения
 * Загрузка, сохранение и применение настроек
 */

// ============================================================================
// ЗАГРУЗКА НАСТРОЕК
// ============================================================================

/**
 * Загрузить настройки из localStorage
 */
function loadSettings() {
    const saved = localStorage.getItem('globalSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            globalSettings = { ...globalSettings, ...parsed };
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

    // Применяем настройки
    applySettings();
}

/**
 * Сохранить настройки в localStorage
 */
function saveSettings() {
    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
    applySettings();
}

/**
 * Применить настройки к UI
 */
function applySettings() {
    // Тема
    applyTheme(globalSettings.theme);

    // Язык (если есть система локализации)
    if (typeof applyLanguage === 'function') {
        applyLanguage(globalSettings.lang);
    }

    // Расширенные функции
    toggleExtendedFeatures();
}

// ============================================================================
// ТЕМЫ
// ============================================================================

/**
 * Применить тему
 * @param {string} theme - Название темы: 'light', 'dark', 'ladadate'
 */
function applyTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-ladadate');
    document.body.classList.add(`theme-${theme}`);
    globalSettings.theme = theme;
}

/**
 * Переключить тему
 */
function toggleTheme() {
    const themes = ['light', 'dark', 'ladadate'];
    const currentIndex = themes.indexOf(globalSettings.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    applyTheme(themes[nextIndex]);
    saveSettings();
}

// ============================================================================
// РАСШИРЕННЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Переключить видимость расширенных функций (AI и т.д.)
 */
function toggleExtendedFeatures() {
    const containers = document.querySelectorAll('.ai-container');
    containers.forEach(c => {
        if (globalSettings.extendedFeatures) {
            c.classList.remove('ai-hidden');
        } else {
            c.classList.add('ai-hidden');
        }
    });
}

// ============================================================================
// НАСТРОЙКИ БОТА
// ============================================================================

/**
 * Обновить настройки бота
 * @param {string} botId - ID бота
 * @param {string} type - Тип настройки ('speed', 'target' и т.д.)
 * @param {*} val - Значение
 */
function updateSettings(botId, type, val) {
    const isChat = globalMode === 'chat';
    const bot = bots[botId];
    if (!bot) return;

    const set = isChat ? bot.chatSettings : bot.mailSettings;

    if (type === 'speed') {
        set.speed = val;
    } else {
        set.target = document.getElementById(`target-select-${botId}`).value;
        if (!isChat) {
            set.photoOnly = document.getElementById(`check-photo-${botId}`).checked;
            bot.mailSettings.auto = document.getElementById(`auto-check-${botId}`).checked;
        }
    }

    saveSession();
}

/**
 * Обработчик Auto с поддержкой Shift
 * @param {string} botId - ID бота
 */
function handleAutoChange(botId) {
    const checkbox = document.getElementById(`auto-check-${botId}`);
    const isChecked = checkbox.checked;

    if (shiftWasPressed) {
        // Shift был зажат при клике - применяем ко всем анкетам
        setAutoForAll(isChecked);
        shiftWasPressed = false;
    } else {
        // Обычное поведение - только для этой анкеты
        const bot = bots[botId];
        bot.mailSettings.auto = isChecked;
        saveSession();
    }
}

/**
 * Установить Auto для ВСЕХ анкет
 * @param {boolean} isChecked - Значение
 */
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

/**
 * Обработчик скорости с поддержкой Shift
 * @param {string} botId - ID бота
 * @param {string} val - Значение скорости
 */
function handleSpeedChange(botId, val) {
    if (shiftWasPressed) {
        // Shift был зажат при клике - применяем ко всем анкетам
        setSpeedForAll(val);
        shiftWasPressed = false;
    } else {
        // Обычное поведение
        updateSettings(botId, 'speed', val);
    }
}

/**
 * Установить скорость для ВСЕХ анкет
 * @param {string} val - Значение скорости
 */
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

/**
 * Обновить настройки ротации чата
 * @param {string} botId - ID бота
 */
function updateChatRotation(botId) {
    const bot = bots[botId];
    if (!bot) return;

    bot.chatSettings.rotationHours = parseInt(document.getElementById(`rot-time-${botId}`).value);
    bot.chatSettings.cyclic = document.getElementById(`rot-cyclic-${botId}`).checked;
    saveSession();
}

// ============================================================================
// ГЛОБАЛЬНЫЙ РЕЖИМ (MAIL/CHAT)
// ============================================================================

/**
 * Переключить глобальный режим Mail/Chat
 */
function toggleGlobalMode() {
    globalMode = globalMode === 'mail' ? 'chat' : 'mail';

    // Обновляем UI
    const modeSwitch = document.getElementById('mode-switch');
    if (modeSwitch) {
        modeSwitch.classList.toggle('mode-chat', globalMode === 'chat');
        modeSwitch.innerHTML = globalMode === 'chat'
            ? '<i class="fa fa-comments"></i> CHAT'
            : '<i class="fa fa-envelope"></i> MAIL';
    }

    // Обновляем интерфейс для всех ботов
    Object.keys(bots).forEach(botId => {
        updateInterfaceForMode(botId);
    });
}

/**
 * Установить глобальную категорию для всех ботов
 * @param {string} target - Категория (online, payers и т.д.)
 */
function setGlobalTarget(target) {
    const isChat = globalMode === 'chat';
    Object.values(bots).forEach(bot => {
        if (isChat) {
            bot.chatSettings.target = target;
        } else {
            bot.mailSettings.target = target;
        }
        const sel = document.getElementById(`target-select-${bot.id}`);
        if (sel) sel.value = target;
    });
    saveSession();
}

// ============================================================================
// МОДАЛЬНОЕ ОКНО НАСТРОЕК
// ============================================================================

/**
 * Открыть модальное окно настроек
 */
function openSettingsModal() {
    // Заполняем поля
    document.getElementById('set-lang').value = globalSettings.lang;
    document.getElementById('set-theme').value = globalSettings.theme;
    document.getElementById('set-sound').checked = globalSettings.soundsEnabled;
    document.getElementById('set-extended').checked = globalSettings.extendedFeatures;
    document.getElementById('set-skip-confirm').checked = globalSettings.skipDeleteConfirm;
    document.getElementById('set-confirm-close').checked = globalSettings.confirmTabClose;
    document.getElementById('set-api-key').value = globalSettings.apiKey || '';
    document.getElementById('set-translator-id').value = globalSettings.translatorId || '';

    // Прокси
    for (let i = 1; i <= 6; i++) {
        const el = document.getElementById(`set-proxy${i}`);
        if (el) el.value = globalSettings[`proxy${i}`] || '';
    }
    const proxyAI = document.getElementById('set-proxy-ai');
    if (proxyAI) proxyAI.value = globalSettings.proxyAI || '';

    openModal('settings-modal');
}

/**
 * Сохранить настройки из модального окна
 */
function saveSettingsFromModal() {
    globalSettings.lang = document.getElementById('set-lang').value;
    globalSettings.theme = document.getElementById('set-theme').value;
    globalSettings.soundsEnabled = document.getElementById('set-sound').checked;
    globalSettings.extendedFeatures = document.getElementById('set-extended').checked;
    globalSettings.skipDeleteConfirm = document.getElementById('set-skip-confirm').checked;
    globalSettings.confirmTabClose = document.getElementById('set-confirm-close').checked;
    globalSettings.apiKey = document.getElementById('set-api-key').value.trim();
    globalSettings.translatorId = document.getElementById('set-translator-id').value.trim() || null;

    // Прокси
    for (let i = 1; i <= 6; i++) {
        const el = document.getElementById(`set-proxy${i}`);
        if (el) globalSettings[`proxy${i}`] = el.value.trim();
    }
    const proxyAI = document.getElementById('set-proxy-ai');
    if (proxyAI) globalSettings.proxyAI = proxyAI.value.trim();

    saveSettings();
    closeModal('settings-modal');
    showToast('Настройки сохранены', 'success');
}

console.log('[Lababot] settings.js loaded');
