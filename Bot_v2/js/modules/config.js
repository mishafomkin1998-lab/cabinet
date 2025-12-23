// Версия приложения
const APP_VERSION = '1.5.0';

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

// Статус управления с сервера
let controlStatus = {
    botEnabled: true, // Статус бот-машины (MACHINE_ID)
    mailingEnabled: true,
    lastCheck: null
};

// Промпт для генерации с сервера (синхронизируется из дашборда)
let serverGenerationPrompt = '';
const DEFAULT_GENERATION_PROMPT = 'Write a creative and engaging opening message for a dating site to start a conversation with a man. Keep it short and intriguing.';

// ============= SHARED ONLINE POOL =============
// Глобальный пул мужчин онлайн, собранный со всех анкет
const SharedPool = {
    users: new Map(),           // AccountId → user data
    lastUpdate: 0,              // Время последнего обновления
    updateInterval: 30000,      // Интервал обновления (30 сек)
    isUpdating: false,          // Флаг что идёт обновление
    timer: null,                // ID таймера

    // Запуск автообновления
    start() {
        if (this.timer) return;
        this.refresh();
        this.timer = setInterval(() => this.refresh(), this.updateInterval);
        console.log('[SharedPool] Запущен');
    },

    // Остановка
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('[SharedPool] Остановлен');
    },

    // Обновление пула - сбор данных со всех анкет
    async refresh() {
        if (this.isUpdating) return;
        if (Object.keys(bots).length === 0) return;

        this.isUpdating = true;
        const newUsers = new Map();

        try {
            // Собираем списки со всех активных ботов
            const promises = Object.values(bots)
                .filter(bot => bot.token)
                .map(async (bot) => {
                    try {
                        const res = await makeApiRequest(bot, 'GET', '/api/users/online');
                        return res.data.Users || [];
                    } catch (e) {
                        return [];
                    }
                });

            const results = await Promise.all(promises);

            // Объединяем в один пул (Map автоматически убирает дубли)
            results.forEach(users => {
                users.forEach(u => {
                    if (!newUsers.has(u.AccountId)) {
                        newUsers.set(u.AccountId, u);
                    }
                });
            });

            this.users = newUsers;
            this.lastUpdate = Date.now();

            // Обновляем счётчик в UI если есть
            const counter = document.getElementById('shared-online-count');
            if (counter) counter.textContent = this.users.size;

        } catch (e) {
            console.error('[SharedPool] Ошибка обновления:', e);
        } finally {
            this.isUpdating = false;
        }
    },

    // Получить всех пользователей как массив
    getAll() {
        return Array.from(this.users.values());
    },

    // Количество пользователей
    get size() {
        return this.users.size;
    }
};

// ============= ONLINE SMART - Горячая очередь и глобальные лимиты =============
// Горячая очередь: мужчины, которым недавно успешно отправили (активны сейчас)
// Другие анкеты приоритетно отправят им в течение 5 минут
let hotManQueue = {};
// Структура: { manId: { addedAt: timestamp, sentBy: ['bot_123', 'bot_456'], name: 'John' } }

// Глобальные лимиты: мужчины с ошибкой "hourly limit exceeded"
// Если 2+ анкеты получили лимит - добавляем в errors всех ботов
let globalLimitedMen = {};
// Структура: { manId: { failedBots: ['bot_123', 'bot_456'], limitedAt: timestamp } }

// Константы для Online Smart
const HOT_QUEUE_EXPIRY_MS = 5 * 60 * 1000;  // 5 минут - время жизни в горячей очереди
const LIMIT_ERROR_TEXT = "The user's hourly incoming message limit has been exceeded";

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
const LABABOT_SERVER = 'http://188.137.254.179:3000';

// Вспомогательные функции для работы с данными

// Генерация уникального conversation ID для диалога
function generateConvId(botId, recipientId) {
    return `conv_${botId}_${recipientId}`;
}
