// Версия приложения
const APP_VERSION = '1.4.0';

// Лимит записей в blacklist (предотвращение утечки памяти)
const BLACKLIST_MAX_SIZE = 5000;

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
    hotkeys: true, myPrompt: '', myPromptChat: '', improvePrompt: '', apiKey: '',
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
    // Автоочистка отправленных (для Mail)
    autoClearSentMail: {
        byTimeEnabled: false,
        byTimeMinutes: '',
        bySentEnabled: false,
        bySentCount: ''
    },
    // Автоочистка отправленных (для Chat)
    autoClearSentChat: {
        byTimeEnabled: false,
        byTimeMinutes: '',
        bySentEnabled: false,
        bySentCount: ''
    },
    // Автоочистка ошибок (для Mail)
    autoClearMail: {
        byTimeEnabled: false,
        byTimeMinutes: '',
        byErrorsEnabled: false,
        byErrorsCount: ''
    },
    // Автоочистка ошибок (для Chat)
    autoClearChat: {
        byTimeEnabled: false,
        byTimeMinutes: '',
        byErrorsEnabled: false,
        byErrorsCount: ''
    },
    // Активные шаблоны промптов (ID из сервера)
    activePromptTemplates: {
        improvePrompt: null,
        myPrompt: null,
        myPromptChat: null,
        replyPrompt: null,
        chatPrompt: null
    }
};

// Шаблоны промптов (загружаются с сервера)
let promptTemplates = {
    improvePrompt: [],
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

// ============= ПЕРЕМЕННЫЕ ТРАНСКРИПЦИИ (макросы для подстановки) =============
const TRANSCRIPTION_VARIABLES = [
    // Базовые данные
    { name: '{name}', desc: 'Имя', example: 'John' },
    { name: '{age}', desc: 'Возраст', example: '38' },
    { name: '{city}', desc: 'Город', example: 'Paris' },
    { name: '{country}', desc: 'Страна', example: 'France' },
    // Расширенные данные профиля
    { name: '{occupation}', desc: 'Профессия', example: 'Engineer' },
    { name: '{marital}', desc: 'Семейное положение', example: 'Single' },
    { name: '{zodiac}', desc: 'Знак зодиака', example: 'Aries' },
    { name: '{height}', desc: 'Рост (см)', example: '180' },
    { name: '{weight}', desc: 'Вес (кг)', example: '75' },
    { name: '{eye}', desc: 'Цвет глаз', example: 'Blue' },
    { name: '{hair}', desc: 'Цвет волос', example: 'Brown' },
    { name: '{education}', desc: 'Образование', example: 'University' },
    { name: '{religion}', desc: 'Религия', example: 'Christian' },
    { name: '{smoking}', desc: 'Курение', example: 'No' },
    { name: '{alcohol}', desc: 'Алкоголь', example: 'Occasionally' },
    { name: '{children}', desc: 'Дети', example: 'No' },
    { name: '{wantchildren}', desc: 'Хочет детей', example: 'Yes' },
    { name: '{languages}', desc: 'Языки', example: 'English, Spanish' },
    { name: '{about}', desc: 'О себе', example: 'I love traveling...' },
    { name: '{lookingfor}', desc: 'Ищу', example: 'Serious relationship' },
    { name: '{interests}', desc: 'Интересы', example: 'Music, Sports' }
];

// Текущий textarea для контекстного меню транскрипции
let currentContextMenuTextarea = null;

// ============= API ДЛЯ ОТПРАВКИ ДАННЫХ НА LABABOT SERVER =============
const LABABOT_SERVER = 'http://188.137.253.169:3000';

// Вспомогательные функции для работы с данными

// Генерация уникального conversation ID для диалога
function generateConvId(botId, recipientId) {
    return `conv_${botId}_${recipientId}`;
}
