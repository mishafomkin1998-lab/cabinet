/**
 * ============================================
 * NOVA DASHBOARD - CONFIGURATION
 * ============================================
 *
 * Централизованный файл конфигурации.
 * Все константы и настройки в одном месте.
 *
 * Подключение: <script src="public/js/config.js"></script>
 */

const CONFIG = {

    // ============================================
    // ROLES (Роли пользователей)
    // ============================================

    ROLES: {
        DIRECTOR: 'director',
        ADMIN: 'admin',
        TRANSLATOR: 'translator'
    },

    // ============================================
    // STATUSES (Статусы)
    // ============================================

    STATUS: {
        ONLINE: 'online',
        OFFLINE: 'offline'
    },

    // ============================================
    // ACTION TYPES (Типы действий)
    // ============================================

    ACTION_TYPES: {
        LETTER: 'letter',
        CHAT: 'chat',
        MAIL: 'mail'
    },

    PROFILE_ACTION_TYPES: {
        ADD: 'add',
        DELETE: 'delete',
        ASSIGN_ADMIN: 'assign_admin',
        ASSIGN_TRANSLATOR: 'assign_translator',
        PAYMENT: 'payment',
        TRIAL: 'trial',
        DELETION_BACKUP: 'deletion_backup'
    },

    // ============================================
    // API ENDPOINTS (API маршруты)
    // ============================================

    API: {
        // Auth
        LOGIN: '/api/login',
        USER_PROFILE: '/api/user/profile',

        // Profiles
        PROFILES: '/api/profiles',
        PROFILES_BULK: '/api/profiles/bulk',
        PROFILES_ASSIGN_ADMIN: '/api/profiles/assign-admin',
        PROFILES_ASSIGN_TRANSLATOR: '/api/profiles/assign-translator',
        PROFILES_TOGGLE_ACCESS: '/api/profiles/toggle-access',

        // Team
        TEAM: '/api/team',
        USERS: '/api/users',

        // Bots
        BOTS_STATUS: '/api/bots/status',
        BOTS_UPDATE_ALL: '/api/bots/update-all',
        BOTS_SYNC_PROMPT: '/api/bots/sync-prompt',

        // Activity
        ACTIVITY_RECENT: '/api/activity/recent',
        HISTORY: '/api/history',

        // Billing
        BILLING_PROFILE_STATUS: '/api/billing/profile-status',
        BILLING_ADD_BALANCE: '/api/billing/add-balance',
        BILLING_PAY_PROFILE: '/api/billing/pay-profile',

        // Templates
        FAVORITE_TEMPLATES: '/api/favorite-templates'
    },

    // ============================================
    // TIMING (Таймеры и интервалы)
    // ============================================

    TIMING: {
        /** Интервал обновления данных (мс) */
        REFRESH_INTERVAL: 30000,

        /** Интервал проверки heartbeat ботов (мс) */
        HEARTBEAT_CHECK_INTERVAL: 10000,

        /** Таймаут для считания бота оффлайн (мс) */
        BOT_OFFLINE_TIMEOUT: 60000,

        /** Задержка debounce для поиска (мс) */
        SEARCH_DEBOUNCE: 300,

        /** Задержка анимации (мс) */
        ANIMATION_DELAY: 100
    },

    // ============================================
    // PAGINATION (Пагинация)
    // ============================================

    PAGINATION: {
        /** Элементов на странице по умолчанию */
        DEFAULT_PAGE_SIZE: 20,

        /** Максимум элементов на странице */
        MAX_PAGE_SIZE: 100,

        /** Лимит для истории */
        HISTORY_LIMIT: 50,

        /** Лимит для последней активности */
        RECENT_ACTIVITY_LIMIT: 20
    },

    // ============================================
    // BILLING (Биллинг)
    // ============================================

    BILLING: {
        /** Стоимость анкеты в день ($) */
        PRICE_PER_DAY: 1.0,

        /** Длительность пробного периода (дней) */
        TRIAL_DAYS: 3,

        /** Минимальная сумма пополнения ($) */
        MIN_DEPOSIT: 10,

        /** Варианты оплаты (дней) */
        PAYMENT_OPTIONS: [7, 14, 30, 90]
    },

    // ============================================
    // UI SETTINGS (Настройки интерфейса)
    // ============================================

    UI: {
        /** Поддерживаемые языки */
        LANGUAGES: ['ru', 'en', 'uk'],

        /** Язык по умолчанию */
        DEFAULT_LANGUAGE: 'ru',

        /** Формат даты */
        DATE_FORMAT: 'dd.MM.yyyy',

        /** Формат даты и времени */
        DATETIME_FORMAT: 'dd.MM.yyyy HH:mm',

        /** Максимальная длина заметки */
        MAX_NOTE_LENGTH: 500,

        /** Максимум анкет для одновременного добавления */
        MAX_BULK_PROFILES: 100
    },

    // ============================================
    // STORAGE KEYS (Ключи localStorage)
    // ============================================

    STORAGE: {
        /** Данные пользователя */
        USER: 'novaUser',

        /** Выбранный язык */
        LANGUAGE: 'novaLanguage',

        /** Тёмная тема */
        DARK_MODE: 'novaDarkMode',

        /** Настройки таблицы */
        TABLE_SETTINGS: 'novaTableSettings',

        /** Последние фильтры */
        LAST_FILTERS: 'novaLastFilters'
    },

    // ============================================
    // VALIDATION (Валидация)
    // ============================================

    VALIDATION: {
        /** Минимальная длина пароля */
        MIN_PASSWORD_LENGTH: 4,

        /** Максимальная длина пароля */
        MAX_PASSWORD_LENGTH: 100,

        /** Минимальная длина имени пользователя */
        MIN_USERNAME_LENGTH: 2,

        /** Максимальная длина имени пользователя */
        MAX_USERNAME_LENGTH: 100,

        /** Регулярка для profile_id */
        PROFILE_ID_PATTERN: /^[a-zA-Z0-9_-]+$/
    },

    // ============================================
    // COLORS (Цвета для графиков и статусов)
    // ============================================

    COLORS: {
        /** Основной цвет */
        PRIMARY: '#6366f1',

        /** Вторичный цвет */
        SECONDARY: '#8b5cf6',

        /** Успех */
        SUCCESS: '#10b981',

        /** Предупреждение */
        WARNING: '#f59e0b',

        /** Ошибка */
        ERROR: '#ef4444',

        /** Онлайн */
        ONLINE: '#10b981',

        /** Оффлайн */
        OFFLINE: '#6b7280',

        /** Градиент для кнопок */
        GRADIENT: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },

    // ============================================
    // ICONS (Иконки Font Awesome)
    // ============================================

    ICONS: {
        LETTER: 'fa-envelope',
        CHAT: 'fa-comments',
        USER: 'fa-user',
        USERS: 'fa-users',
        PROFILE: 'fa-id-card',
        BOT: 'fa-robot',
        STATS: 'fa-chart-pie',
        SETTINGS: 'fa-cog',
        MONEY: 'fa-wallet',
        ONLINE: 'fa-circle',
        OFFLINE: 'fa-circle',
        EDIT: 'fa-edit',
        DELETE: 'fa-trash',
        ADD: 'fa-plus',
        CHECK: 'fa-check',
        TIMES: 'fa-times',
        SPINNER: 'fa-spinner fa-spin'
    }
};

// ============================================
// HELPER FUNCTIONS (Вспомогательные функции)
// ============================================

/**
 * Проверяет, является ли пользователь директором
 * @param {AuthUser} user
 * @returns {boolean}
 */
function isDirector(user) {
    return user && user.role === CONFIG.ROLES.DIRECTOR;
}

/**
 * Проверяет, является ли пользователь админом
 * @param {AuthUser} user
 * @returns {boolean}
 */
function isAdmin(user) {
    return user && user.role === CONFIG.ROLES.ADMIN;
}

/**
 * Проверяет, является ли пользователь переводчиком
 * @param {AuthUser} user
 * @returns {boolean}
 */
function isTranslator(user) {
    return user && user.role === CONFIG.ROLES.TRANSLATOR;
}

/**
 * Может ли пользователь управлять командой
 * @param {AuthUser} user
 * @returns {boolean}
 */
function canManageTeam(user) {
    return isDirector(user) || isAdmin(user);
}

/**
 * Может ли пользователь видеть биллинг
 * @param {AuthUser} user
 * @returns {boolean}
 */
function canViewBilling(user) {
    return isDirector(user);
}

/**
 * Форматирует дату
 * @param {string|Date} date
 * @param {boolean} [includeTime=false]
 * @returns {string}
 */
function formatDate(date, includeTime = false) {
    if (!date) return '-';
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();

    if (includeTime) {
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
    return `${day}.${month}.${year}`;
}

/**
 * Форматирует сумму денег
 * @param {number} amount
 * @param {string} [currency='$']
 * @returns {string}
 */
function formatMoney(amount, currency = '$') {
    return `${currency}${(amount || 0).toFixed(2)}`;
}

/**
 * Форматирует время в минутах
 * @param {number} seconds
 * @returns {string}
 */
function formatResponseTime(seconds) {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}м ${secs}с` : `${secs}с`;
}

/**
 * Получает данные пользователя из localStorage
 * @returns {AuthUser|null}
 */
function getCurrentUser() {
    const data = localStorage.getItem(CONFIG.STORAGE.USER)
        || sessionStorage.getItem(CONFIG.STORAGE.USER);
    return data ? JSON.parse(data) : null;
}

/**
 * Сохраняет данные пользователя
 * @param {AuthUser} user
 * @param {boolean} [remember=false]
 */
function saveCurrentUser(user, remember = false) {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(CONFIG.STORAGE.USER, JSON.stringify(user));
}

/**
 * Очищает данные пользователя (logout)
 */
function clearCurrentUser() {
    localStorage.removeItem(CONFIG.STORAGE.USER);
    sessionStorage.removeItem(CONFIG.STORAGE.USER);
}

// Экспорт для Node.js (если используется)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
