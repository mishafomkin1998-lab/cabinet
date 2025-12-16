// Версия приложения
const APP_VERSION = '1.3.0';

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
let closedBotsCache = {}; // Кэш данных закрытых ботов для уведомлений
let botTemplates = JSON.parse(localStorage.getItem('botTemplates')) || {};
let accountPreferences = JSON.parse(localStorage.getItem('accountPreferences')) || {};

let defaultSettings = {
    lang: 'ru', theme: 'light', proxy: '', proxyURL: '', proxyAI: '',
    hotkeys: true, myPrompt: '', myPromptChat: '', apiKey: '',
    soundsEnabled: true, desktopNotifications: true, confirmTabClose: true, extendedFeatures: true,
    skipDeleteConfirm: false, // Не спрашивать об удалении шаблона
    keepLoggerEntries: false, // Сохранять записи в логгере после просмотра
    translatorId: null, // ID переводчика для статистики
    aiReplyPrompt: '', // Промпт для AI ответов на письма
    chatPrompt: '', // Промпт для AI ответов в чатах
    // Прокси для анкет по позициям (1-10, 11-20, 21-30, 31-40, 41-50, 51-60)
    proxy1: '', proxy2: '', proxy3: '', proxy4: '', proxy5: '', proxy6: '',
    // Отключенные статусы (пропускаются в авто-режиме)
    disabledStatuses: [],
    // Автоочистка ошибок (для Mail)
    autoClearMail: {
        byTimeEnabled: true,
        byTimeMinutes: 120,
        byErrorsEnabled: false,
        byErrorsCount: 100
    },
    // Автоочистка ошибок (для Chat)
    autoClearChat: {
        byTimeEnabled: true,
        byTimeMinutes: 120,
        byErrorsEnabled: false,
        byErrorsCount: 100
    },
    // Активные шаблоны промптов (ID из сервера)
    activePromptTemplates: {
        myPrompt: null,
        myPromptChat: null,
        replyPrompt: null,
        chatPrompt: null
    }
};

// Шаблоны промптов (загружаются с сервера)
let promptTemplates = {
    myPrompt: [],
    myPromptChat: [],
    replyPrompt: [],
    chatPrompt: []
};

let globalSettings = JSON.parse(localStorage.getItem('globalSettings')) || defaultSettings;
globalSettings = { ...defaultSettings, ...globalSettings };

let globalMode = 'mail';
let activeTabId = null;

// Статус управления с сервера (panic mode, stopSpam, botEnabled, разрешение рассылки)
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
