// ============= АВТООЧИСТКА ОШИБОК =============

// Открыть модалку настроек автоочистки (ПКМ на кнопке ластика)
function openAutoClearSettings(event) {
    event.preventDefault();

    // Определяем текущий режим (Mail/Chat)
    const isChat = globalMode === 'chat';

    // Инициализируем настройки ошибок если их нет
    if (isChat && !globalSettings.autoClearChat) {
        globalSettings.autoClearChat = { byTimeEnabled: false, byTimeMinutes: '', byErrorsEnabled: false, byErrorsCount: '' };
    } else if (!isChat && !globalSettings.autoClearMail) {
        globalSettings.autoClearMail = { byTimeEnabled: false, byTimeMinutes: '', byErrorsEnabled: false, byErrorsCount: '' };
    }

    // Инициализируем настройки отправленных если их нет
    if (isChat && !globalSettings.autoClearSentChat) {
        globalSettings.autoClearSentChat = { byTimeEnabled: false, byTimeMinutes: '', bySentEnabled: false, bySentCount: '' };
    } else if (!isChat && !globalSettings.autoClearSentMail) {
        globalSettings.autoClearSentMail = { byTimeEnabled: false, byTimeMinutes: '', bySentEnabled: false, bySentCount: '' };
    }

    const currentSettings = isChat ? globalSettings.autoClearChat : globalSettings.autoClearMail;
    const currentSentSettings = isChat ? globalSettings.autoClearSentChat : globalSettings.autoClearSentMail;

    // Обновляем UI модалки - секция Ошибки
    document.getElementById('auto-clear-mode-label').textContent = isChat ? 'Chat' : 'Mail';
    document.getElementById('auto-clear-by-time-enabled').checked = currentSettings.byTimeEnabled;
    document.getElementById('auto-clear-time-value').value = currentSettings.byTimeMinutes || '';
    document.getElementById('auto-clear-by-errors-enabled').checked = currentSettings.byErrorsEnabled;
    document.getElementById('auto-clear-errors-value').value = currentSettings.byErrorsCount || '';

    // Обновляем UI модалки - секция Отправленные
    document.getElementById('auto-clear-sent-by-time-enabled').checked = currentSentSettings?.byTimeEnabled || false;
    document.getElementById('auto-clear-sent-time-value').value = currentSentSettings?.byTimeMinutes || '';
    document.getElementById('auto-clear-sent-by-count-enabled').checked = currentSentSettings?.bySentEnabled || false;
    document.getElementById('auto-clear-sent-count-value').value = currentSentSettings?.bySentCount || '';

    openModal('auto-clear-modal');
}

// Сохранить настройки автоочистки
function saveAutoClearSettings() {
    const isChat = globalMode === 'chat';

    // Настройки ошибок
    const errorSettings = {
        byTimeEnabled: document.getElementById('auto-clear-by-time-enabled').checked,
        byTimeMinutes: document.getElementById('auto-clear-time-value').value ? parseInt(document.getElementById('auto-clear-time-value').value) : '',
        byErrorsEnabled: document.getElementById('auto-clear-by-errors-enabled').checked,
        byErrorsCount: document.getElementById('auto-clear-errors-value').value ? parseInt(document.getElementById('auto-clear-errors-value').value) : ''
    };

    // Настройки отправленных
    const sentSettings = {
        byTimeEnabled: document.getElementById('auto-clear-sent-by-time-enabled').checked,
        byTimeMinutes: document.getElementById('auto-clear-sent-time-value').value ? parseInt(document.getElementById('auto-clear-sent-time-value').value) : '',
        bySentEnabled: document.getElementById('auto-clear-sent-by-count-enabled').checked,
        bySentCount: document.getElementById('auto-clear-sent-count-value').value ? parseInt(document.getElementById('auto-clear-sent-count-value').value) : ''
    };

    if (isChat) {
        globalSettings.autoClearChat = errorSettings;
        globalSettings.autoClearSentChat = sentSettings;
    } else {
        globalSettings.autoClearMail = errorSettings;
        globalSettings.autoClearSentMail = sentSettings;
    }

    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
    console.log(`[AutoClear] Настройки ${isChat ? 'Chat' : 'Mail'} сохранены:`, { errors: errorSettings, sent: sentSettings });
}

// Время последней автоочистки (глобальное, раздельно для ошибок и отправленных)
let lastAutoClearErrorsTime = { mail: 0, chat: 0 };
let lastAutoClearSentTime = { mail: 0, chat: 0 };

// Проверка условий автоочистки для бота (вызывается в scheduleNextMail/scheduleNextChat)
function checkAutoClearConditions(bot, mode) {
    const isChat = mode === 'chat';
    const settings = isChat ? globalSettings.autoClearChat : globalSettings.autoClearMail;
    if (!settings) return false;

    const stats = isChat ? bot.chatStats : bot.mailStats;
    const startTime = isChat ? bot.chatStartTime : bot.mailStartTime;
    const lastClearTime = lastAutoClearErrorsTime[mode] || 0;

    let shouldClear = false;

    // Условие 1: По времени (от старта рассылки, но не чаще чем раз в N минут)
    if (settings.byTimeEnabled && startTime) {
        const elapsedFromStart = (Date.now() - startTime) / 60000;
        const elapsedFromLastClear = (Date.now() - lastClearTime) / 60000;

        // Срабатывает если: прошло достаточно времени от старта И от последней очистки
        if (elapsedFromStart >= settings.byTimeMinutes && elapsedFromLastClear >= settings.byTimeMinutes) {
            shouldClear = true;
            console.log(`[AutoClear] ${bot.displayId} - условие времени (${Math.floor(elapsedFromStart)} мин от старта)`);
        }
    }

    // Условие 2: По количеству ошибок
    if (settings.byErrorsEnabled && stats.errors >= settings.byErrorsCount) {
        shouldClear = true;
        console.log(`[AutoClear] ${bot.displayId} - условие ошибок (${stats.errors} >= ${settings.byErrorsCount})`);
    }

    return shouldClear;
}

// Выполнить автоочистку для всех ботов
function performAutoClear(mode) {
    const isChat = mode === 'chat';
    let totalCleared = 0;

    Object.values(bots).forEach(bot => {
        const stats = isChat ? bot.chatStats : bot.mailStats;
        const history = isChat ? bot.chatHistory : bot.mailHistory;

        if (stats.errors > 0) {
            totalCleared += stats.errors;
            stats.errors = 0;
            if (history) history.errors = [];
            bot.updateUI();
        }

        // НЕ сбрасываем mailStartTime/chatStartTime - это основной таймер!
        // Он нужен для автоочистки отправленных
    });

    // Запоминаем время последней очистки ошибок
    lastAutoClearErrorsTime[mode] = Date.now();

    if (totalCleared > 0) {
        console.log(`[AutoClear] ${mode}: Очищено ${totalCleared} ошибок по всем анкетам`);
    }
}

// Проверка условий автоочистки отправленных для бота
function checkAutoClearSentConditions(bot, mode) {
    const isChat = mode === 'chat';
    const settings = isChat ? globalSettings.autoClearSentChat : globalSettings.autoClearSentMail;
    if (!settings) return false;

    const stats = isChat ? bot.chatStats : bot.mailStats;
    const startTime = isChat ? bot.chatStartTime : bot.mailStartTime;
    const lastClearTime = lastAutoClearSentTime[mode] || 0;

    let shouldClear = false;

    // Условие 1: По времени (от старта рассылки, но не чаще чем раз в N минут)
    if (settings.byTimeEnabled && settings.byTimeMinutes && startTime) {
        const elapsedFromStart = (Date.now() - startTime) / 60000;
        const elapsedFromLastClear = (Date.now() - lastClearTime) / 60000;

        // Срабатывает если: прошло достаточно времени от старта И от последней очистки
        if (elapsedFromStart >= settings.byTimeMinutes && elapsedFromLastClear >= settings.byTimeMinutes) {
            shouldClear = true;
            console.log(`[AutoClearSent] ${bot.displayId} - условие времени (${Math.floor(elapsedFromStart)} мин от старта)`);
        }
    }

    // Условие 2: По количеству отправленных
    if (settings.bySentEnabled && settings.bySentCount && stats.sent >= settings.bySentCount) {
        shouldClear = true;
        console.log(`[AutoClearSent] ${bot.displayId} - условие отправленных (${stats.sent} >= ${settings.bySentCount})`);
    }

    return shouldClear;
}

// Выполнить автоочистку отправленных для всех ботов
function performAutoClearSent(mode) {
    const isChat = mode === 'chat';
    let totalCleared = 0;

    Object.values(bots).forEach(bot => {
        const stats = isChat ? bot.chatStats : bot.mailStats;
        const history = isChat ? bot.chatHistory : bot.mailHistory;

        if (stats.sent > 0) {
            totalCleared += stats.sent;
            stats.sent = 0;

            // Очищаем историю отправок (это и есть список контактов для фильтрации)
            if (history) history.sent = [];

            bot.updateUI();
        }

        // НЕ сбрасываем mailStartTime/chatStartTime - это основной таймер!
    });

    // Запоминаем время последней очистки отправленных
    lastAutoClearSentTime[mode] = Date.now();

    if (totalCleared > 0) {
        console.log(`[AutoClearSent] ${mode}: Очищено ${totalCleared} отправленных, история сброшена - бот сможет писать тем же людям`);
    }
}
