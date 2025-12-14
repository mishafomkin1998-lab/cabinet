/**
 * Dashboard State - Управление состоянием приложения
 *
 * @module dashboard/state
 * @description Централизованное хранилище состояния дашборда
 */

/**
 * Начальное состояние дашборда
 * @returns {Object} Объект состояния
 */
function getInitialState() {
    // Получаем период по умолчанию (текущий месяц)
    const defaultRange = DashboardUtils.getDefaultDateRange();

    return {
        // =====================================================
        // Пользователь и авторизация
        // =====================================================
        currentUser: JSON.parse(localStorage.getItem('novaUser') || sessionStorage.getItem('novaUser') || 'null'),
        userBalance: 0,
        isRestricted: false,

        // =====================================================
        // Навигация и UI
        // =====================================================
        activeTab: 'dashboard',
        sidebarCollapsed: false,
        language: localStorage.getItem('novaLanguage') || 'ru',

        // Модальные окна
        showAddAccountModal: false,
        showAddAdminModal: false,
        showAddTranslatorModal: false,
        showTranslatorProfilesModal: false,
        showAssignAccountsModal: false,
        showExtendModal: false,
        showTopupModal: false,
        showSettingsModal: false,
        showViewAdminModal: false,
        showStatsCalendar: false,
        showHistoryCalendar: false,
        showClientMessagesModal: false,

        // =====================================================
        // Статистика
        // =====================================================
        stats: {
            today: { letters: 0, chats: 0, uniqueMen: 0 },
            month: { letters: 0, chats: 0, uniqueMen: 0 },
            metrics: { workTime: '0ч 0м', workTimeMonth: '0ч 0м', avgResponseTime: '-' }
        },
        hourlyActivity: [],
        recentActivity: [],
        sentLettersGrouped: [],
        aiUsageData: [],
        lastResponses: [],

        // Фильтры статистики
        statsFilter: {
            dateFrom: defaultRange.dateFrom,
            dateTo: defaultRange.dateTo,
            quickRange: 'month',
            admin: '',
            translator: ''
        },

        // Мониторинг
        monitoringFunction: 'lastResponses',

        // =====================================================
        // Аккаунты (Анкеты)
        // =====================================================
        accounts: [],
        searchQuery: '',
        sortBy: 'id',
        sortDirection: 'asc',
        adminFilter: 'all',
        adminTypeFilter: 'all',
        translatorFilter: 'all',
        selectedProfileIds: [],

        // Добавление аккаунтов
        newAccountIds: '',
        newAccountComment: '',

        // Продление анкеты
        extendingProfile: null,
        selectedDays: 30,

        // =====================================================
        // Команда
        // =====================================================
        admins: [],
        myTranslators: [],
        allTranslators: [],
        translators: [],

        // Создание/редактирование админа
        newAdmin: {
            id: null,
            name: '',
            login: '',
            password: '',
            initials: '',
            isMyAdmin: false,
            salary: '',
            aiEnabled: false,
            profileIds: ''
        },
        selectedAdmin: null,

        // Создание/редактирование переводчика
        newTranslator: {
            id: null,
            name: '',
            login: '',
            password: '',
            salary: '',
            aiEnabled: false,
            adminId: '',
            isOwnTranslator: true
        },
        editingTranslator: null,
        selectedTranslatorForProfiles: null,
        selectedTranslatorProfileIds: [],

        // Назначение аккаунтов
        accountsToAssign: '',
        assignComment: '',
        selectedAccountIds: [],

        // =====================================================
        // Боты
        // =====================================================
        bots: [],
        botsOnline: 0,
        botsTotal: 0,
        generationPrompt: '',
        controlSettings: {
            mailingEnabled: true,
            stopSpam: false,
            panicMode: false
        },

        // Логи
        botLogs: [],
        botLogsFilter: '',
        botLogsOffset: 0,
        botLogsHasMore: false,
        errorLogs: [],
        errorLogsOffset: 0,

        // =====================================================
        // Биллинг и финансы
        // =====================================================
        pricing: {},
        topupUserId: null,
        topupAmount: 10,

        // Финансы (директор)
        financeAdmins: [],
        financeHistory: [],
        financeTotalSum: 0,
        profilePaymentHistory: [],
        financeTopup: { adminId: '', amount: 10, note: '' },
        profilePayment: { profileId: '', days: 30, note: '' },

        // =====================================================
        // История изменений
        // =====================================================
        profileHistory: [],
        historyFilter: {
            dateFrom: '',
            dateTo: '',
            admin: '',
            profileId: ''
        },

        // =====================================================
        // Избранные шаблоны
        // =====================================================
        favoriteTemplates: [],

        // =====================================================
        // Управление рассылкой
        // =====================================================
        profilesWithMailing: [],
        controlFilter: {
            adminId: '',
            translatorId: ''
        },
        refreshingStats: false,

        // =====================================================
        // Настройки пользователя
        // =====================================================
        userSettings: {
            newUsername: '',
            newPassword: '',
            newPasswordConfirm: '',
            avatarUrl: ''
        },
        settingsSaving: false,

        // =====================================================
        // Клиенты (CRM)
        // =====================================================
        clients: [],
        clientsStats: {
            letters: { uniqueClients: 0, totalMessages: 0, profilesCount: 0 },
            chats: { uniqueClients: 0, totalMessages: 0, profilesCount: 0 },
            total: { uniqueClients: 0, totalMessages: 0 }
        },
        clientsFilter: {
            type: 'all',
            dateFrom: '',
            dateTo: '',
            search: '',
            sortBy: 'date',
            sortDir: 'desc'
        },
        clientsPagination: {
            page: 1,
            limit: 50,
            totalCount: 0,
            totalPages: 0
        },
        selectedClient: null,
        clientMessages: [],

        // =====================================================
        // Календарь
        // =====================================================
        calendarYear: new Date().getFullYear(),
        calendarMonth: new Date().getMonth(),
        calendarSelectingStart: true
    };
}

/**
 * Сброс настроек пользователя
 * @param {Object} state - Объект состояния
 */
function resetUserSettings(state) {
    state.userSettings = {
        newUsername: '',
        newPassword: '',
        newPasswordConfirm: '',
        avatarUrl: ''
    };
}

/**
 * Сброс формы админа
 * @param {Object} state - Объект состояния
 */
function resetAdminForm(state) {
    state.newAdmin = {
        id: null,
        name: '',
        login: '',
        password: '',
        initials: '',
        isMyAdmin: false,
        salary: '',
        aiEnabled: false,
        profileIds: ''
    };
}

/**
 * Сброс формы переводчика
 * @param {Object} state - Объект состояния
 */
function resetTranslatorForm(state) {
    state.newTranslator = {
        id: null,
        name: '',
        login: '',
        password: '',
        salary: '',
        aiEnabled: false,
        adminId: '',
        isOwnTranslator: true
    };
    state.editingTranslator = null;
}

/**
 * Сброс формы финансов
 * @param {Object} state - Объект состояния
 */
function resetFinanceForms(state) {
    state.financeTopup = { adminId: '', amount: 10, note: '' };
    state.profilePayment = { profileId: '', days: 30, note: '' };
}

/**
 * Вычисляемые свойства (computed properties)
 * Возвращает объект с геттерами для Alpine.js
 */
const computedProperties = {
    /**
     * Отфильтрованные аккаунты
     */
    getFilteredAccounts(state) {
        let filtered = state.accounts;

        // Фильтр по типу админа (только для директора)
        if (state.currentUser?.role === 'director' && state.adminTypeFilter !== 'all') {
            if (state.adminTypeFilter === 'our') {
                filtered = filtered.filter(account => account.adminIsRestricted === true);
            } else if (state.adminTypeFilter === 'other') {
                filtered = filtered.filter(account => account.adminIsRestricted === false);
            }
        }

        // Фильтр по конкретному админу (для директора)
        if (state.currentUser?.role === 'director' && state.adminFilter !== 'all') {
            if (state.adminFilter === 'unassigned') {
                filtered = filtered.filter(account => !account.adminId);
            } else {
                filtered = filtered.filter(account => account.adminId == state.adminFilter);
            }
        }

        // Фильтр по переводчику (для админа)
        if (state.currentUser?.role === 'admin' && state.translatorFilter !== 'all') {
            if (state.translatorFilter === 'unassigned') {
                filtered = filtered.filter(account => !account.translatorId);
            } else {
                filtered = filtered.filter(account => account.translatorId == state.translatorFilter);
            }
        }

        // Поиск по запросу
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            filtered = filtered.filter(account =>
                account.id?.toLowerCase().includes(query) ||
                account.login?.toLowerCase().includes(query)
            );
        }

        // Сортировка
        filtered.sort((a, b) => {
            let result = 0;
            switch (state.sortBy) {
                case 'id':
                    result = (a.id || '').localeCompare(b.id || '');
                    break;
                case 'status':
                    const statusOrder = { 'online': 1, 'working': 2, 'offline': 3, 'inactive': 4 };
                    result = (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5);
                    break;
                case 'lastOnline':
                    result = new Date(a.lastOnline || 0) - new Date(b.lastOnline || 0);
                    break;
                case 'incoming':
                    result = (a.incoming || 0) - (b.incoming || 0);
                    break;
                case 'admin':
                    result = (a.admin || '').localeCompare(b.admin || '');
                    break;
                case 'translator':
                    result = (a.translatorName || '').localeCompare(b.translatorName || '');
                    break;
                case 'date':
                    result = new Date(a.addedDate || 0) - new Date(b.addedDate || 0);
                    break;
                default:
                    result = 0;
            }
            return state.sortDirection === 'desc' ? -result : result;
        });

        return filtered;
    },

    /**
     * Объединённая история финансов
     */
    getCombinedFinanceHistory(state) {
        return DashboardUtils.combineFinanceHistory(
            state.financeHistory || [],
            state.profilePaymentHistory || []
        );
    },

    /**
     * Общий баланс всех админов
     */
    getFinanceAdminsTotalBalance(state) {
        return (state.financeAdmins || []).reduce((sum, admin) => sum + (admin.balance || 0), 0);
    },

    /**
     * Отфильтрованные профили для управления рассылкой
     */
    getFilteredMailingProfiles(state) {
        if (!state.profilesWithMailing || state.profilesWithMailing.length === 0) {
            return [];
        }

        let filtered = [...state.profilesWithMailing];

        if (state.controlFilter.adminId) {
            filtered = filtered.filter(p => p.adminId === state.controlFilter.adminId);
        }

        if (state.controlFilter.translatorId) {
            filtered = filtered.filter(p => p.translatorId === state.controlFilter.translatorId);
        }

        return filtered;
    },

    /**
     * Переводчики для выбранного админа
     */
    getTranslatorsForAdmin(state) {
        if (!state.controlFilter.adminId) {
            return state.translators || [];
        }
        return (state.translators || []).filter(t => t.adminId === state.controlFilter.adminId);
    }
};

// Экспорт для использования в других модулях
if (typeof window !== 'undefined') {
    window.DashboardState = {
        getInitialState,
        resetUserSettings,
        resetAdminForm,
        resetTranslatorForm,
        resetFinanceForms,
        computed: computedProperties
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getInitialState,
        resetUserSettings,
        resetAdminForm,
        resetTranslatorForm,
        resetFinanceForms,
        computed: computedProperties
    };
}
