        function dashboard() {
            return {
                // User data from auth
                currentUser: novaUserData,

                // Localization
                language: savedLanguage,

                // Dark mode
                darkMode: localStorage.getItem('novaDarkMode') === 'true',

                // Toggle dark mode
                toggleDarkMode() {
                    this.darkMode = !this.darkMode;
                    localStorage.setItem('novaDarkMode', this.darkMode);
                },

                // Translation function
                t(key) {
                    const keys = key.split('.');
                    let value = LOCALES[this.language];
                    for (const k of keys) {
                        if (value && value[k] !== undefined) {
                            value = value[k];
                        } else {
                            // Fallback to Russian
                            value = LOCALES['ru'];
                            for (const k2 of keys) {
                                if (value && value[k2] !== undefined) {
                                    value = value[k2];
                                } else {
                                    return key; // Return key if not found
                                }
                            }
                            return value;
                        }
                    }
                    return value;
                },

                // Change language and save to localStorage
                changeLanguage() {
                    localStorage.setItem('novaLanguage', this.language);
                    document.documentElement.lang = this.language === 'uk' ? 'uk' : (this.language === 'en' ? 'en' : 'ru');
                    document.title = this.t('pageTitle');
                },

                // Get localized date
                formatDate(date, options = {}) {
                    if (!date) return '-';
                    const locale = getDateLocale(this.language);
                    return new Date(date).toLocaleDateString(locale, options);
                },

                // Get localized date and time
                formatDateTime(date) {
                    if (!date) return '-';
                    const locale = getDateLocale(this.language);
                    return new Date(date).toLocaleString(locale, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                },

                activeMenu: (() => {
                    const hash = window.location.hash.slice(1);
                    const validMenus = ['stats', 'accounts', 'team', 'control', 'monitoring', 'finances', 'history', 'training'];
                    return validMenus.includes(hash) ? hash : 'stats';
                })(),
                activeSubmenu: 'general',
                showCalendar: false,
                showMonitoringCalendar: false,
                showAddAccountModal: false,
                showAddAdminModal: false,
                showAssignAccountsModal: false,
                showTranslatorProfilesModal: false,
                selectedTranslatorForProfiles: null,
                selectedTranslatorProfileIds: [],
                showViewAdminModal: false,
                expandedAdminId: null, // ID развёрнутого админа в аккордеоне
                sortBy: 'date',
                sortDirection: 'desc',
                searchQuery: '',
                adminTypeFilter: 'all', // 'our' = наши админы, 'other' = другие, 'all' = все (по умолчанию)
                adminFilter: 'all', // Фильтр по конкретному админу (для директора)
                translatorFilter: 'all', // Фильтр по переводчику (для админа)
                loading: true,
                error: null,

                // Settings modal
                showSettingsModal: false,
                userSettings: {
                    newUsername: '',
                    newPassword: '',
                    newPasswordConfirm: '',
                    avatarUrl: ''
                },
                settingsSaving: false,

                // Статистика с сервера
                stats: {
                    today: { letters: 0, chats: 0, uniqueMen: 0, errors: 0 },
                    yesterday: { letters: 0, chats: 0 },
                    week: { letters: 0, chats: 0, uniqueMen: 0, errors: 0 },
                    month: { letters: 0, chats: 0, uniqueMen: 0 },
                    metrics: { totalProfiles: 0, avgResponseTime: 0, growthPercent: 0 }
                },

                // Статус ботов
                botsStatus: { online: 0, idle: 0, offline: 0, never_connected: 0 },

                // Последняя активность
                recentActivity: [],

                // История ошибок
                errorLogs: [],
                errorLogsOffset: 0,

                // Профили с управлением рассылкой
                profilesWithMailing: [],

                // Избранные шаблоны
                favoriteTemplates: [],

                // Почасовая активность для графика
                hourlyActivity: [],

                statsFilter: {
                    admin: '',
                    translator: '',
                    dateRange: 'Текущий месяц',
                    dateFrom: '',
                    dateTo: '',
                    quickRange: 'month'
                },

                // Календарь
                showStatsCalendar: false,
                showAccountsCalendar: false,
                showMonitoringCalendar: false,
                calendarMonth: new Date().getMonth(),
                calendarYear: new Date().getFullYear(),
                calendarSelectingStart: true,
                calendarPosition: '',

                // Открыть календарь с позиционированием
                openCalendar(event, type) {
                    const btn = event.currentTarget;
                    const rect = btn.getBoundingClientRect();
                    this.calendarPosition = `top: ${rect.bottom + 4}px; left: ${rect.left}px;`;

                    if (type === 'stats') {
                        this.showStatsCalendar = !this.showStatsCalendar;
                        this.showMonitoringCalendar = false;
                        this.showHistoryCalendar = false;
                    } else if (type === 'monitoring') {
                        this.showMonitoringCalendar = !this.showMonitoringCalendar;
                        this.showStatsCalendar = false;
                        this.showHistoryCalendar = false;
                    } else if (type === 'history') {
                        this.showHistoryCalendar = !this.showHistoryCalendar;
                        this.showStatsCalendar = false;
                        this.showMonitoringCalendar = false;
                    }
                },

                monitoringFilter: {
                    admin: '',
                    translator: '',
                    dateFrom: '',
                    dateTo: ''
                },

                accountsFilter: {
                    dateFrom: '',
                    dateTo: ''
                },

                monitoringFunction: 'lastResponses',

                newAccountIds: '',
                newAccountComment: '',
                newAccountAssignTo: '', // формат: 'admin_123' или 'translator_456' или ''

                newAdmin: {
                    id: null,
                    name: '',
                    login: '',
                    password: '',
                    initials: '',
                    isMyAdmin: false,
                    salary: '',
                    aiEnabled: false,
                    profileIds: '' // Список ID анкет через запятую или с новой строки
                },

                newTranslator: {
                    id: null,
                    name: '',
                    login: '',
                    password: '',
                    salary: '',
                    aiEnabled: false,
                    adminId: ''
                },
                editingTranslator: null,

                showAddTranslatorModal: false,
                selectedAdmin: null,
                accountsToAssign: '',
                assignComment: '',
                selectedAccountIds: [],
                selectedProfileIds: [], // Выбранные анкеты для оплаты

                generationPrompt: '',

                // Настройки управления
                controlSettings: {
                    mailingEnabled: true,
                    stopSpam: false,
                    panicMode: false
                },

                // Фильтры истории
                historyFilter: {
                    admin: '',
                    profileId: '',
                    dateFrom: '',
                    dateTo: ''
                },
                showHistoryCalendar: false,
                profileHistory: [],

                // Данные загружаются с сервера
                accounts: [],
                bots: [],
                admins: [],
                team: [],
                myTranslators: [], // Переводчики текущего админа
                allTranslators: [], // Все переводчики (для директора)
                translatorStats: [],
                historyActions: [],

                // Система оплаты
                userBalance: 0,
                isRestricted: false, // "мой админ" - бесплатные анкеты
                pricing: { 15: 1, 30: 2, 45: 3, 60: 4 },
                showExtendModal: false,
                extendingProfile: null,
                selectedDays: 30,
                showTopupModal: false,
                topupUserId: null,
                topupAmount: 10,

                // Финансы (только для директора)
                financeAdmins: [],
                financeHistory: [],
                financeTotalSum: 0,
                financeTopup: {
                    adminId: '',
                    amount: 10,
                    note: ''
                },
                profilePayment: {
                    profileIds: '', // Несколько ID через запятую или пробел
                    days: 30,
                    note: ''
                },
                profilePaymentHistory: [],

                // Инициализация - загрузка данных с сервера
                async init() {
                    console.log('Dashboard init, user:', this.currentUser);
                    // Устанавливаем период по умолчанию - текущий месяц
                    this.setDefaultDateRange();
                    // Инициализация Flatpickr
                    this.$nextTick(() => this.initFlatpickr());
                    await this.loadAllData();
                    // Автообновление каждые 30 секунд
                    setInterval(() => this.loadDashboardStats(), 30000);
                    // Очищаем поле поиска после загрузки (против автозаполнения браузера)
                    setTimeout(() => { this.searchQuery = ''; }, 200);
                },

                // Инициализация Flatpickr календарей
                initFlatpickr() {
                    const self = this;
                    const config = {
                        mode: 'range',
                        dateFormat: 'Y-m-d',
                        locale: 'ru',
                        defaultDate: [this.statsFilter.dateFrom, this.statsFilter.dateTo],
                        onChange: function(selectedDates, dateStr) {
                            if (selectedDates.length === 2) {
                                const formatDate = (d) => d.toISOString().split('T')[0];
                                self.statsFilter.dateFrom = formatDate(selectedDates[0]);
                                self.statsFilter.dateTo = formatDate(selectedDates[1]);
                                self.statsFilter.quickRange = '';
                                self.loadDashboardStats();
                            }
                        }
                    };

                    // Календарь статистики
                    this.statsDatePicker = flatpickr('#statsDatePicker', config);

                    // Календарь мониторинга
                    this.monitoringDatePicker = flatpickr('#monitoringDatePicker', {
                        ...config,
                        defaultDate: [this.monitoringFilter.dateFrom, this.monitoringFilter.dateTo],
                        onChange: function(selectedDates) {
                            if (selectedDates.length === 2) {
                                const formatDate = (d) => d.toISOString().split('T')[0];
                                self.monitoringFilter.dateFrom = formatDate(selectedDates[0]);
                                self.monitoringFilter.dateTo = formatDate(selectedDates[1]);
                                self.loadMonitoringData();
                            }
                        }
                    });

                    // Календарь истории
                    this.historyDatePicker = flatpickr('#historyDatePicker', {
                        ...config,
                        defaultDate: [this.historyFilter.dateFrom, this.historyFilter.dateTo],
                        onChange: function(selectedDates) {
                            if (selectedDates.length === 2) {
                                const formatDate = (d) => d.toISOString().split('T')[0];
                                self.historyFilter.dateFrom = formatDate(selectedDates[0]);
                                self.historyFilter.dateTo = formatDate(selectedDates[1]);
                                self.loadProfileHistory();
                            }
                        }
                    });
                },

                // Установить период по умолчанию - с 1 числа текущего месяца до сегодня
                setDefaultDateRange() {
                    const now = new Date();
                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                    const formatDate = (d) => d.toISOString().split('T')[0];

                    this.statsFilter.dateFrom = formatDate(firstDay);
                    this.statsFilter.dateTo = formatDate(now);
                    this.statsFilter.quickRange = 'month';

                    this.monitoringFilter.dateFrom = formatDate(firstDay);
                    this.monitoringFilter.dateTo = formatDate(now);

                    this.accountsFilter.dateFrom = formatDate(firstDay);
                    this.accountsFilter.dateTo = formatDate(now);

                    this.historyFilter.dateFrom = formatDate(firstDay);
                    this.historyFilter.dateTo = formatDate(now);
                },

                async loadAllData() {
                    this.loading = true;
                    try {
                        const loadPromises = [
                            this.loadDashboardStats(),
                            this.loadAccounts().then(() => this.loadBotsStatus()), // Боты после анкет!
                            this.loadTeam(),
                            this.loadRecentActivity(),
                            this.loadFavoriteTemplates(),
                            this.loadHourlyActivity(),
                            this.loadTranslatorStats(),
                            this.loadHistoryActions(),
                            this.loadProfileHistory(),
                            this.loadSavedPrompt(),
                            this.loadUserBalance(),
                            this.loadPricing(),
                            this.loadControlSettings()
                        ];

                        // Загружаем финансовые данные и ошибки только для директора
                        if (this.currentUser.role === 'director') {
                            loadPromises.push(this.loadFinanceData());
                            loadPromises.push(this.loadErrorLogs());
                        }

                        await Promise.all(loadPromises);
                    } catch (e) {
                        console.error('Error loading data:', e);
                        this.error = 'Ошибка загрузки данных';
                    }
                    this.loading = false;
                },

                async loadDashboardStats() {
                    try {
                        let url = `${API_BASE}/api/dashboard?userId=${this.currentUser.id}&role=${this.currentUser.role}`;
                        if (this.statsFilter.dateFrom) {
                            url += `&dateFrom=${this.statsFilter.dateFrom}`;
                        }
                        if (this.statsFilter.dateTo) {
                            url += `&dateTo=${this.statsFilter.dateTo}`;
                        }
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success) {
                            this.stats = data.dashboard;
                        }
                    } catch (e) { console.error('loadDashboardStats error:', e); }
                },

                // Полное обновление всей статистики
                async refreshAllStats() {
                    this.loading = true;
                    try {
                        await Promise.all([
                            this.loadDashboardStats(),
                            this.loadHourlyActivity(),
                            this.loadTranslatorStats(),
                            this.loadRecentActivity(),
                            this.loadAccounts().then(() => this.loadBotsStatus()) // Боты после анкет!
                        ]);
                        console.log('✅ Статистика обновлена');
                    } catch (e) {
                        console.error('refreshAllStats error:', e);
                    }
                    this.loading = false;
                },

                async loadAccounts() {
                    try {
                        const res = await fetch(`${API_BASE}/api/profiles?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        if (data.success) {
                            // Загружаем статус оплаты для каждой анкеты
                            const accountsWithPayment = await Promise.all(data.list.map(async p => {
                                let paymentStatus = { isPaid: true, isFree: false, daysLeft: 999, isTrial: false, trialUsed: false };
                                try {
                                    const payRes = await fetch(`${API_BASE}/api/billing/profile-status/${encodeURIComponent(p.profile_id)}`);
                                    const payData = await payRes.json();
                                    if (payData.success) {
                                        paymentStatus = {
                                            isPaid: payData.isPaid,
                                            isFree: payData.isFree,
                                            daysLeft: payData.daysLeft || 0,
                                            isTrial: payData.isTrial,
                                            trialUsed: payData.trialUsed
                                        };
                                    }
                                } catch (e) { /* ignore */ }

                                return {
                                    id: p.profile_id,
                                    profile_id: p.profile_id,
                                    login: p.login || p.profile_id,
                                    password: p.password || '',
                                    status: p.status || 'offline',
                                    lastOnline: p.last_online ? new Date(p.last_online).toLocaleString('ru-RU') : '-',
                                    incoming: p.incoming_today || 0,
                                    admin: p.admin_name || '',
                                    adminId: p.admin_id || null,
                                    adminIsRestricted: p.admin_is_restricted || false,
                                    translator: p.trans_name || '',
                                    translatorId: p.translator_id || null,
                                    translatorName: p.trans_name || '',
                                    addedDate: new Date(p.added_at).toLocaleDateString('ru-RU'),
                                    comment: p.note ? p.note.replace(/\s*\[Last seen:.*?\]/g, '').trim() : '',
                                    paused: p.paused || false,
                                    // Payment status
                                    isPaid: paymentStatus.isPaid,
                                    isFree: paymentStatus.isFree,
                                    daysLeft: paymentStatus.daysLeft,
                                    isTrial: paymentStatus.isTrial,
                                    trialUsed: paymentStatus.trialUsed
                                };
                            }));
                            this.accounts = accountsWithPayment;
                        }
                    } catch (e) { console.error('loadAccounts error:', e); }
                },

                async loadBotsStatus() {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/status?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        // DEBUG: Логируем ответ сервера
                        console.log('🤖 loadBotsStatus response:', {
                            botsCount: data.bots?.length,
                            bots: data.bots,
                            botsSummary: data.botsSummary
                        });
                        if (data.success) {
                            // Статистика по БОТАМ (программам) - для карточки "Статус ботов"
                            this.botsStatus = data.botsSummary || { online: 0, offline: 0, total: 0 };

                            // Список уникальных ботов (программ) - для вкладки "Управление"
                            this.bots = (data.bots || []).map(b => ({
                                id: b.botId,
                                name: `Бот ${b.botId?.substring(0, 8) || 'Unknown'}...`,
                                icon: b.platform?.includes('Windows') ? 'fas fa-desktop' : 'fas fa-laptop',
                                status: b.status === 'online' ? 'active' : 'inactive',
                                os: b.platform || 'Unknown',
                                ip: b.ip || '-',
                                version: b.version || '-',
                                lastHeartbeat: b.lastHeartbeat,
                                profilesCount: b.profilesCount || 0
                            }));

                            // Обновляем статусы АНКЕТ в таблице (из profiles)
                            (data.profiles || []).forEach(p => {
                                const acc = this.accounts.find(a => a.id === p.profileId);
                                if (acc) {
                                    acc.status = p.status === 'online' ? 'online' : (p.status === 'idle' ? 'working' : 'offline');
                                    acc.lastOnline = p.lastHeartbeat ? new Date(p.lastHeartbeat).toLocaleString('ru-RU') : '-';
                                    acc.mailingEnabled = p.mailingEnabled;
                                }
                            });

                            // Сохраняем профили для управления рассылкой
                            this.profilesWithMailing = (data.profiles || []).map(p => ({
                                profileId: p.profileId,
                                note: p.note,
                                status: p.status,
                                mailingEnabled: p.mailingEnabled !== false  // по умолчанию true
                            }));
                        }
                    } catch (e) { console.error('loadBotsStatus error:', e); }
                },

                async loadTeam() {
                    try {
                        const res = await fetch(`${API_BASE}/api/team?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        if (data.success) {
                            this.team = data.list;
                            // Формируем admins с переводчиками
                            const adminsList = data.list.filter(u => u.role === 'admin');
                            const translatorsList = data.list.filter(u => u.role === 'translator');

                            if (this.currentUser.role === 'admin') {
                                // Для админа: показываем себя с переводчиками
                                this.admins = [{
                                    id: this.currentUser.id,
                                    name: this.currentUser.username,
                                    login: this.currentUser.username,
                                    initials: this.currentUser.username.substring(0, 2).toUpperCase(),
                                    accounts: 0,
                                    conversion: 0,
                                    isMyAdmin: false,
                                    salary: null,
                                    balance: 0,
                                    translators: translatorsList.map(t => ({
                                        id: t.id,
                                        name: t.username,
                                        login: t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0
                                    }))
                                }];
                                // Также сохраняем в отдельный массив для удобства
                                this.myTranslators = translatorsList.map(t => ({
                                    id: t.id,
                                    name: t.username,
                                    login: t.username,
                                    conversion: t.conversion || 0,
                                    accounts: t.accounts || [],
                                    accountsCount: t.accounts_count || 0,
                                    aiEnabled: t.ai_enabled || false
                                }));
                            } else {
                                // Для директора: показываем всех админов с их переводчиками
                                this.admins = adminsList.map(a => ({
                                    id: a.id,
                                    name: a.username,
                                    login: a.username,
                                    initials: a.username.substring(0, 2).toUpperCase(),
                                    accounts: a.accounts_count || 0,
                                    conversion: a.conversion || 0,
                                    isMyAdmin: a.is_restricted || false,
                                    aiEnabled: a.ai_enabled || false,
                                    salary: a.salary !== null && a.salary !== undefined ? a.salary : null,
                                    balance: a.balance || 0,
                                    translators: translatorsList.filter(t => t.owner_id === a.id).map(t => ({
                                        id: t.id,
                                        name: t.username,
                                        login: t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0,
                                        aiEnabled: t.ai_enabled || false
                                    }))
                                }));
                                this.myTranslators = [];
                                // Для директора: все переводчики с информацией об админе
                                this.allTranslators = translatorsList.map(t => {
                                    // Проверяем, есть ли owner среди админов (а не директор)
                                    const admin = adminsList.find(a => a.id === t.owner_id);
                                    return {
                                        id: t.id,
                                        name: t.username,
                                        login: t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0,
                                        // adminId только если владелец - админ, а не директор
                                        adminId: admin ? t.owner_id : null,
                                        adminName: admin ? admin.username : null,
                                        aiEnabled: t.ai_enabled || false
                                    };
                                });
                            }
                        }
                    } catch (e) { console.error('loadTeam error:', e); }
                },

                async loadRecentActivity() {
                    try {
                        const res = await fetch(`${API_BASE}/api/activity/recent?userId=${this.currentUser.id}&role=${this.currentUser.role}&limit=20`);
                        const data = await res.json();
                        if (data.success) {
                            this.recentActivity = data.activity;
                        }
                    } catch (e) { console.error('loadRecentActivity error:', e); }
                },

                // Загрузка истории ошибок
                async loadErrorLogs(reset = true) {
                    try {
                        if (reset) {
                            this.errorLogsOffset = 0;
                            this.errorLogs = [];
                        }
                        const res = await fetch(`${API_BASE}/api/error_logs?userId=${this.currentUser.id}&role=${this.currentUser.role}&limit=20&offset=${this.errorLogsOffset}`);
                        const data = await res.json();
                        if (data.success) {
                            if (reset) {
                                this.errorLogs = data.logs;
                            } else {
                                this.errorLogs = [...this.errorLogs, ...data.logs];
                            }
                        }
                    } catch (e) { console.error('loadErrorLogs error:', e); }
                },

                // Загрузить больше ошибок
                async loadMoreErrors() {
                    this.errorLogsOffset += 20;
                    await this.loadErrorLogs(false);
                },

                // Форматирование времени ошибки
                formatErrorTime(timestamp) {
                    if (!timestamp) return '';
                    const date = new Date(timestamp);
                    const now = new Date();
                    const diff = now - date;

                    // Сегодня - показываем время
                    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
                        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    }
                    // Вчера
                    if (diff < 48 * 60 * 60 * 1000) {
                        return 'Вчера ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    }
                    // Иначе дата
                    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' +
                           date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                },

                async loadFavoriteTemplates() {
                    try {
                        const res = await fetch(`${API_BASE}/api/favorite-templates?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        if (data.success) {
                            this.favoriteTemplates = data.templates;
                        }
                    } catch (e) { console.error('loadFavoriteTemplates error:', e); }
                },

                async loadHourlyActivity() {
                    try {
                        const res = await fetch(`${API_BASE}/api/stats/hourly-activity?userId=${this.currentUser.id}&role=${this.currentUser.role}&days=7`);
                        const data = await res.json();
                        if (data.success) {
                            this.hourlyActivity = data.hourlyData;
                        }
                    } catch (e) { console.error('loadHourlyActivity error:', e); }
                },

                async loadTranslatorStats() {
                    try {
                        const res = await fetch(`${API_BASE}/api/stats/translators?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        if (data.success) {
                            this.translatorStats = data.translators;
                        }
                    } catch (e) { console.error('loadTranslatorStats error:', e); }
                },

                async loadHistoryActions() {
                    try {
                        const res = await fetch(`${API_BASE}/api/history?userId=${this.currentUser.id}&role=${this.currentUser.role}&limit=50`);
                        const data = await res.json();
                        if (data.success) {
                            this.historyActions = data.list || [];
                        }
                    } catch (e) { console.error('loadHistoryActions error:', e); }
                },

                formatHistoryTime(timestamp) {
                    if (!timestamp) return '';
                    const date = new Date(timestamp);
                    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                },

                getActionTypeLabel(type) {
                    const labels = {
                        'outgoing': 'Письмо',
                        'chat_msg': 'Чат',
                        'incoming': 'Входящее'
                    };
                    return labels[type] || type;
                },

                getActionTypeClass(type) {
                    const classes = {
                        'outgoing': 'bg-green-100 text-green-800',
                        'chat_msg': 'bg-blue-100 text-blue-800',
                        'incoming': 'bg-purple-100 text-purple-800'
                    };
                    return classes[type] || 'bg-gray-100 text-gray-800';
                },

                setActiveMenu(menu) {
                    this.activeMenu = menu;
                    this.activeSubmenu = 'general';
                    window.location.hash = menu;
                    // Очищаем поиск при переходе на вкладку Анкеты
                    if (menu === 'accounts') {
                        this.searchQuery = '';
                        // Дополнительная очистка через задержку (против автозаполнения браузера)
                        setTimeout(() => { this.searchQuery = ''; }, 100);
                    }
                },
                
                setActiveSubmenu(submenu) {
                    this.activeSubmenu = submenu;
                },

                // Аккордеон для админов
                toggleAdminExpanded(adminId) {
                    this.expandedAdminId = this.expandedAdminId === adminId ? null : adminId;
                },

                // Переключить AI для пользователя
                async toggleAiEnabled(user) {
                    try {
                        const newValue = !user.aiEnabled;
                        // POST вместо PUT для совместимости с nginx/proxy
                        const res = await fetch(`/api/users/${user.id}/update`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ aiEnabled: newValue })
                        });
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(`HTTP ${res.status}: ${text}`);
                        }
                        const data = await res.json();
                        if (data.success) {
                            user.aiEnabled = newValue;
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось обновить'));
                        }
                    } catch (e) {
                        console.error('toggleAiEnabled error:', e);
                        alert('Ошибка: ' + e.message);
                    }
                },

                // Переключить "Мой админ" (is_restricted)
                async toggleIsRestricted(admin) {
                    try {
                        const newValue = !admin.isMyAdmin;
                        // POST вместо PUT для совместимости с nginx/proxy
                        const res = await fetch(`/api/users/${admin.id}/update`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_restricted: newValue })
                        });
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(`HTTP ${res.status}: ${text}`);
                        }
                        const data = await res.json();
                        if (data.success) {
                            admin.isMyAdmin = newValue;
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось обновить'));
                        }
                    } catch (e) {
                        console.error('toggleIsRestricted error:', e);
                        alert('Ошибка: ' + e.message);
                    }
                },

                // Переводчики напрямую под директором (без админа)
                get directTranslators() {
                    return this.allTranslators.filter(t => !t.adminId);
                },

                getPageTitle() {
                    const page = this.t('pages.' + this.activeMenu);
                    return page?.title || this.activeMenu;
                },

                getPageSubtitle() {
                    const page = this.t('pages.' + this.activeMenu);
                    return page?.subtitle || '';
                },
                
                getActivityLevel(hour) {
                    // Используем реальные данные если есть
                    if (this.hourlyActivity && this.hourlyActivity.length > 0) {
                        const hourData = this.hourlyActivity.find(h => h.hour === hour);
                        if (hourData) {
                            return Math.min(hourData.intensity / 100, 1) || 0.1;
                        }
                    }
                    // Fallback на базовые значения
                    return 0.1;
                },

                getActivityColor(hour) {
                    const level = this.getActivityLevel(hour);
                    if (level > 0.8) return 'from-red-400 to-orange-400';
                    if (level > 0.6) return 'from-yellow-400 to-amber-400';
                    if (level > 0.4) return 'from-blue-400 to-cyan-400';
                    return 'from-gray-300 to-gray-400';
                },

                setDateRange(range) {
                    const now = new Date();
                    const months = this.t('calendar.months');
                    const locale = getDateLocale(this.language);
                    const ranges = {
                        'month': `${months[now.getMonth()]} ${now.getFullYear()}`,
                        'week': this.t('common.week'),
                        'day': now.toLocaleDateString(locale)
                    };
                    this.statsFilter.dateRange = ranges[range];
                    this.showCalendar = false;
                },

                setQuickDateRange(range) {
                    const now = new Date();
                    const formatDate = (d) => d.toISOString().split('T')[0];
                    let dateFrom, dateTo;

                    this.statsFilter.quickRange = range;

                    if (range === 'today') {
                        dateFrom = new Date(now);
                        dateTo = new Date(now);
                    } else if (range === 'week') {
                        dateFrom = new Date(now);
                        dateFrom.setDate(now.getDate() - 7);
                        dateTo = new Date(now);
                    } else if (range === 'month') {
                        // Текущий месяц: с 1 числа до сегодня
                        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
                        dateTo = new Date(now);
                    }

                    this.statsFilter.dateFrom = formatDate(dateFrom);
                    this.statsFilter.dateTo = formatDate(dateTo);

                    // Обновить Flatpickr
                    if (this.statsDatePicker) {
                        this.statsDatePicker.setDate([dateFrom, dateTo], false);
                    }

                    this.applyDateFilter();
                },

                applyDateFilter() {
                    // Перезагружаем статистику с новым фильтром
                    this.loadDashboardStats();
                },

                // Calendar functions
                getDateRangeText() {
                    if (!this.statsFilter.dateFrom || !this.statsFilter.dateTo) {
                        return this.t('common.selectPeriod');
                    }
                    const from = new Date(this.statsFilter.dateFrom);
                    const to = new Date(this.statsFilter.dateTo);
                    const locale = getDateLocale(this.language);
                    const formatShort = (d) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

                    if (this.statsFilter.dateFrom === this.statsFilter.dateTo) {
                        return formatShort(from);
                    }
                    return `${formatShort(from)} - ${formatShort(to)}`;
                },

                getCalendarMonthName() {
                    const months = this.t('calendar.months');
                    return `${months[this.calendarMonth]} ${this.calendarYear}`;
                },

                getCalendarDays() {
                    const days = [];
                    const firstDay = new Date(this.calendarYear, this.calendarMonth, 1);
                    const lastDay = new Date(this.calendarYear, this.calendarMonth + 1, 0);

                    // Дни предыдущего месяца
                    let startDay = firstDay.getDay() || 7; // Понедельник = 1
                    for (let i = startDay - 1; i > 0; i--) {
                        const d = new Date(this.calendarYear, this.calendarMonth, 1 - i);
                        days.push({ day: d.getDate(), date: d.toISOString().split('T')[0], currentMonth: false });
                    }

                    // Дни текущего месяца
                    for (let i = 1; i <= lastDay.getDate(); i++) {
                        const d = new Date(this.calendarYear, this.calendarMonth, i);
                        days.push({ day: i, date: d.toISOString().split('T')[0], currentMonth: true });
                    }

                    // Дни следующего месяца (до 42 дней = 6 недель)
                    const remaining = 42 - days.length;
                    for (let i = 1; i <= remaining; i++) {
                        const d = new Date(this.calendarYear, this.calendarMonth + 1, i);
                        days.push({ day: i, date: d.toISOString().split('T')[0], currentMonth: false });
                    }

                    return days;
                },

                selectCalendarDate(date) {
                    if (this.calendarSelectingStart || !this.statsFilter.dateFrom) {
                        this.statsFilter.dateFrom = date;
                        this.statsFilter.dateTo = date;
                        this.calendarSelectingStart = false;
                    } else {
                        if (date < this.statsFilter.dateFrom) {
                            this.statsFilter.dateTo = this.statsFilter.dateFrom;
                            this.statsFilter.dateFrom = date;
                        } else {
                            this.statsFilter.dateTo = date;
                        }
                        this.calendarSelectingStart = true;
                        this.statsFilter.quickRange = '';
                        this.showStatsCalendar = false;
                        this.applyDateFilter();
                    }
                },

                isDateSelected(date) {
                    return date === this.statsFilter.dateFrom || date === this.statsFilter.dateTo;
                },

                isDateInRange(date) {
                    if (!this.statsFilter.dateFrom || !this.statsFilter.dateTo) return false;
                    return date > this.statsFilter.dateFrom && date < this.statsFilter.dateTo;
                },

                // Функции календаря мониторинга
                getMonitoringDateRangeText() {
                    if (!this.monitoringFilter.dateFrom || !this.monitoringFilter.dateTo) {
                        return 'Выберите период';
                    }
                    const from = new Date(this.monitoringFilter.dateFrom);
                    const to = new Date(this.monitoringFilter.dateTo);
                    const formatShort = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

                    if (this.monitoringFilter.dateFrom === this.monitoringFilter.dateTo) {
                        return formatShort(from);
                    }
                    return `${formatShort(from)} - ${formatShort(to)}`;
                },

                selectMonitoringCalendarDate(date) {
                    if (this.calendarSelectingStart || !this.monitoringFilter.dateFrom) {
                        this.monitoringFilter.dateFrom = date;
                        this.monitoringFilter.dateTo = date;
                        this.calendarSelectingStart = false;
                    } else {
                        if (date < this.monitoringFilter.dateFrom) {
                            this.monitoringFilter.dateTo = this.monitoringFilter.dateFrom;
                            this.monitoringFilter.dateFrom = date;
                        } else {
                            this.monitoringFilter.dateTo = date;
                        }
                        this.calendarSelectingStart = true;
                        this.showMonitoringCalendar = false;
                    }
                },

                isMonitoringDateSelected(date) {
                    return date === this.monitoringFilter.dateFrom || date === this.monitoringFilter.dateTo;
                },

                isMonitoringDateInRange(date) {
                    if (!this.monitoringFilter.dateFrom || !this.monitoringFilter.dateTo) return false;
                    return date > this.monitoringFilter.dateFrom && date < this.monitoringFilter.dateTo;
                },

                setMonitoringQuickRange(range) {
                    const now = new Date();
                    const formatDate = (d) => d.toISOString().split('T')[0];

                    if (range === 'today') {
                        this.monitoringFilter.dateFrom = formatDate(now);
                        this.monitoringFilter.dateTo = formatDate(now);
                    } else if (range === 'week') {
                        const weekAgo = new Date(now);
                        weekAgo.setDate(now.getDate() - 7);
                        this.monitoringFilter.dateFrom = formatDate(weekAgo);
                        this.monitoringFilter.dateTo = formatDate(now);
                    } else if (range === 'month') {
                        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                        this.monitoringFilter.dateFrom = formatDate(firstDay);
                        this.monitoringFilter.dateTo = formatDate(now);
                    }

                    this.showMonitoringCalendar = false;
                },

                setMonitoringFunction(func) {
                    this.monitoringFunction = func;
                },
                
                getMonitoringTitle() {
                    const titles = {
                        'lastResponses': 'Последние ответы (письма/чаты)',
                        'sentLetters': 'Отправленные письма',
                        'favoriteMailing': 'Любимая рассылка',
                        'workTime': 'Время реальной работы',
                        'aiUsage': 'Использование ИИ'
                    };
                    return titles[this.monitoringFunction];
                },

                formatActivityTime(timestamp) {
                    if (!timestamp) return '';
                    const date = new Date(timestamp);
                    const now = new Date();
                    const diffMs = now - date;
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMs / 3600000);
                    const locale = getDateLocale(this.language);

                    if (diffMins < 1) return this.t('time.justNow');
                    if (diffMins < 60) return `${diffMins} ${this.t('time.minutesAgo')}`;
                    if (diffHours < 24) return `${diffHours} ${this.t('time.hoursAgo')}`;
                    return date.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                },
                
                // Объединенная история финансов (пополнения + оплата анкет)
                get combinedFinanceHistory() {
                    const combined = [];

                    // Добавляем пополнения
                    this.financeHistory.forEach((item, idx) => {
                        combined.push({
                            ...item,
                            uniqueId: 'topup_' + (item.id || idx),
                            type: 'topup'
                        });
                    });

                    // Добавляем оплаты анкет
                    this.profilePaymentHistory.forEach((item, idx) => {
                        combined.push({
                            ...item,
                            uniqueId: 'profile_' + (item.id || idx),
                            type: item.actionType === 'removal' ? 'profile_removal' : 'profile_payment'
                        });
                    });

                    // Сортируем по дате (новые сверху)
                    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                    return combined;
                },

                get filteredAccounts() {
                    let filtered = this.accounts;

                    // Фильтр по типу админа (только для директора)
                    if (this.currentUser.role === 'director' && this.adminTypeFilter !== 'all') {
                        if (this.adminTypeFilter === 'our') {
                            filtered = filtered.filter(account => account.adminIsRestricted === true);
                        } else if (this.adminTypeFilter === 'other') {
                            filtered = filtered.filter(account => account.adminIsRestricted === false);
                        }
                    }

                    // Фильтр по конкретному админу (для директора)
                    if (this.currentUser.role === 'director' && this.adminFilter !== 'all') {
                        if (this.adminFilter === 'unassigned') {
                            filtered = filtered.filter(account => !account.adminId);
                        } else {
                            filtered = filtered.filter(account => account.adminId == this.adminFilter);
                        }
                    }

                    // Фильтр по переводчику (для админа)
                    if (this.currentUser.role === 'admin' && this.translatorFilter !== 'all') {
                        if (this.translatorFilter === 'unassigned') {
                            filtered = filtered.filter(account => !account.translatorId);
                        } else {
                            filtered = filtered.filter(account => account.translatorId == this.translatorFilter);
                        }
                    }

                    if (this.searchQuery) {
                        const query = this.searchQuery.toLowerCase();
                        filtered = filtered.filter(account =>
                            account.id.toLowerCase().includes(query) ||
                            account.login?.toLowerCase().includes(query)
                        );
                    }

                    filtered.sort((a, b) => {
                        let result = 0;
                        switch (this.sortBy) {
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
                        return this.sortDirection === 'desc' ? -result : result;
                    });

                    return filtered;
                },
                
                sortAccounts(field) {
                    if (this.sortBy === field) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortBy = field;
                        this.sortDirection = 'asc';
                    }
                },

                // Изменение ширины колонок таблицы
                initResize(e) {
                    const th = e.target.parentElement;
                    const table = th.closest('table');
                    const handle = e.target;
                    const startX = e.pageX;
                    const startWidth = th.offsetWidth;

                    handle.classList.add('resizing');
                    table.classList.add('resizing');

                    const doResize = (e) => {
                        const newWidth = Math.max(50, startWidth + (e.pageX - startX));
                        th.style.width = newWidth + 'px';
                    };

                    const stopResize = () => {
                        handle.classList.remove('resizing');
                        table.classList.remove('resizing');
                        document.removeEventListener('mousemove', doResize);
                        document.removeEventListener('mouseup', stopResize);
                    };

                    document.addEventListener('mousemove', doResize);
                    document.addEventListener('mouseup', stopResize);
                },

                getStatusClass(status) {
                    const classes = {
                        'online': 'bg-green-100 text-green-800',
                        'working': 'bg-blue-100 text-blue-800',
                        'offline': 'bg-gray-100 text-gray-800',
                        'inactive': 'bg-red-100 text-red-800'
                    };
                    return classes[status] || 'bg-gray-100 text-gray-800';
                },
                
                getStatusText(status) {
                    const statuses = this.t('profiles.profileStatuses');
                    return statuses[status] || status;
                },
                
                async toggleAccountAccess(account) {
                    const newPaused = !account.paused;
                    const profileId = account.profile_id || account.id;
                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/toggle-access`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: profileId,
                                paused: newPaused
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            // Обновляем в массиве напрямую для реактивности Alpine
                            const idx = this.accounts.findIndex(a => a.id === account.id);
                            if (idx > -1) {
                                this.accounts[idx].paused = newPaused;
                            }
                            console.log(`✅ Анкета ${profileId} ${newPaused ? 'приостановлена' : 'возобновлена'}`);
                        } else {
                            console.error('Ошибка toggle:', data.error);
                            alert('Ошибка: ' + (data.error || 'Не удалось изменить статус'));
                        }
                    } catch (e) {
                        console.error('Ошибка:', e);
                        alert('Ошибка при изменении статуса анкеты');
                    }
                },

                async deleteAccount(account) {
                    if (confirm(this.t('messages.deleteConfirm') + ` ${account.login}?`)) {
                        try {
                            const profileId = account.profile_id || account.id;
                            const res = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(profileId)}`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' }
                            });
                            const data = await res.json();
                            if (data.success) {
                                this.accounts = this.accounts.filter(a => a.id !== account.id);
                                console.log(`✅ Анкета ${profileId} удалена`);
                            } else {
                                console.error('Ошибка удаления:', data.error);
                                alert('Ошибка удаления: ' + (data.error || 'Неизвестная ошибка'));
                            }
                        } catch (e) {
                            console.error('Ошибка:', e);
                            alert('Ошибка при удалении анкеты');
                        }
                    }
                },
                
                async assignAccount(account) {
                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/assign-admin`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: account.profile_id,
                                adminLogin: account.admin || null,
                                performedBy: this.currentUser.username
                            })
                        });
                        const data = await res.json();
                        if (!data.success) {
                            console.error('Ошибка назначения:', data.error);
                        }
                    } catch (e) {
                        console.error('Ошибка:', e);
                    }
                },
                
                saveAccounts() {
                    if (!this.newAccountIds.trim()) {
                        alert('Введите ID анкет');
                        return;
                    }

                    const ids = this.newAccountIds.split(/[\s,]+/).filter(id => id.trim().length >= 3);

                    if (ids.length === 0) {
                        alert('Введите корректные ID анкет');
                        return;
                    }

                    // Парсим выбранного назначаемого (admin_123 или translator_456)
                    let assignAdminId = this.currentUser.role === 'director' ? null : this.currentUser.id;
                    let assignTranslatorId = null;

                    if (this.newAccountAssignTo) {
                        const [type, id] = this.newAccountAssignTo.split('_');
                        if (type === 'admin') {
                            assignAdminId = parseInt(id);
                            assignTranslatorId = null;
                        } else if (type === 'translator') {
                            assignTranslatorId = parseInt(id);
                            // Найдём админа этого переводчика
                            const translator = this.allTranslators.find(t => t.id === parseInt(id));
                            if (translator && translator.adminId) {
                                assignAdminId = translator.adminId;
                            }
                        }
                    }

                    // Отправляем на сервер
                    fetch(`${API_BASE}/api/profiles/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            profiles: ids,
                            note: this.newAccountComment || '',
                            adminId: assignAdminId,
                            translatorId: assignTranslatorId,
                            userId: this.currentUser.id,
                            userName: this.currentUser.username
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            this.newAccountIds = '';
                            this.newAccountComment = '';
                            this.newAccountAssignTo = '';
                            this.showAddAccountModal = false;
                            alert(`Добавлено ${ids.length} анкет`);
                            this.loadAccounts(); // Перезагружаем список с сервера
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось добавить анкеты'));
                        }
                    })
                    .catch(err => {
                        console.error('saveAccounts error:', err);
                        alert('Ошибка сети при добавлении анкет');
                    });
                },
                
                async editAdmin(admin) {
                    // Загружаем список назначенных анкет для этого админа
                    let assignedIds = '';
                    try {
                        const res = await fetch(`/api/team/${admin.id}/profiles`);
                        const data = await res.json();
                        if (data.success && data.profileIds) {
                            assignedIds = data.profileIds.join(', ');
                        }
                    } catch (e) {
                        console.error('Error loading admin profiles:', e);
                    }

                    this.newAdmin = {
                        id: admin.id,
                        name: admin.name,
                        login: admin.login || '',
                        password: admin.password || '',
                        initials: admin.initials || '',
                        isMyAdmin: admin.isMyAdmin,
                        salary: admin.salary !== null && admin.salary !== undefined ? admin.salary : '',
                        aiEnabled: admin.aiEnabled || false,
                        profileIds: assignedIds
                    };
                    this.showAddAdminModal = true;
                },

                async deleteAdmin(admin) {
                    if (!confirm(`Удалить админа "${admin.name}"? Все его анкеты будут откреплены.`)) return;
                    try {
                        const response = await fetch(`/api/team/${admin.id}`, { method: 'DELETE' });
                        const data = await response.json();
                        if (data.success) {
                            await this.loadTeam();
                            await this.loadAccounts();
                            alert('Админ удалён');
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось удалить'));
                        }
                    } catch (e) {
                        alert('Ошибка: ' + e.message);
                    }
                },

                assignAccountsToAdmin(admin) {
                    this.selectedAdmin = admin;
                    this.accountsToAssign = '';
                    this.assignComment = '';
                    this.selectedAccountIds = [];
                    this.showAssignAccountsModal = true;
                },

                async assignAccountsToAdminConfirm() {
                    // Собираем ID из чекбоксов и текстового поля
                    let ids = [...this.selectedAccountIds];

                    if (this.accountsToAssign.trim()) {
                        const manualIds = this.accountsToAssign.split(/[\s,]+/).filter(id => id.length >= 3);
                        ids = [...ids, ...manualIds];
                    }

                    // Убираем дубликаты
                    ids = [...new Set(ids)];

                    if (ids.length === 0) {
                        alert('Выберите или введите ID анкет');
                        return;
                    }

                    try {
                        // Сначала получаем текущие анкеты админа
                        const currentRes = await fetch(`${API_BASE}/api/team/${this.selectedAdmin.id}/profiles`);
                        const currentData = await currentRes.json();
                        const currentIds = currentData.success ? currentData.profileIds : [];

                        // Объединяем с новыми (без дубликатов)
                        const allIds = [...new Set([...currentIds, ...ids])];

                        // Отправляем на сервер
                        const res = await fetch(`${API_BASE}/api/team/${this.selectedAdmin.id}/profiles`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ profileIds: allIds })
                        });
                        const data = await res.json();

                        if (data.success) {
                            this.showAssignAccountsModal = false;
                            this.selectedAccountIds = [];
                            alert(`Назначено ${ids.length} анкет администратору ${this.selectedAdmin.name}`);
                            await this.loadAccounts();
                            await this.loadTeam();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось назначить анкеты'));
                        }
                    } catch (e) {
                        console.error('assignAccountsToAdminConfirm error:', e);
                        alert('Ошибка сети при назначении анкет');
                    }
                },

                // Открыть модальное окно назначения анкет переводчику
                async openTranslatorProfilesModal(translator) {
                    this.selectedTranslatorForProfiles = translator;
                    this.selectedTranslatorProfileIds = [];

                    // Загружаем уже назначенные анкеты
                    try {
                        const res = await fetch(`${API_BASE}/api/team/translator/${translator.id}/profiles`);
                        const data = await res.json();
                        if (data.success && data.profileIds) {
                            this.selectedTranslatorProfileIds = data.profileIds.map(String);
                        }
                    } catch (e) {
                        console.error('Error loading translator profiles:', e);
                    }

                    this.showTranslatorProfilesModal = true;
                },

                // Переключить выбор анкеты для переводчика
                toggleTranslatorProfile(profileId) {
                    const id = String(profileId);
                    const idx = this.selectedTranslatorProfileIds.indexOf(id);
                    if (idx > -1) {
                        this.selectedTranslatorProfileIds.splice(idx, 1);
                    } else {
                        this.selectedTranslatorProfileIds.push(id);
                    }
                },

                // Сохранить назначенные анкеты переводчику
                async saveTranslatorProfiles() {
                    if (!this.selectedTranslatorForProfiles) return;

                    try {
                        const res = await fetch(`${API_BASE}/api/team/translator/${this.selectedTranslatorForProfiles.id}/profiles`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileIds: this.selectedTranslatorProfileIds
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.showTranslatorProfilesModal = false;
                            await this.loadTeam();
                            alert(`Анкеты назначены переводчику ${this.selectedTranslatorForProfiles.name}`);
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось назначить анкеты'));
                        }
                    } catch (e) {
                        console.error('saveTranslatorProfiles error:', e);
                        alert('Ошибка сети');
                    }
                },

                viewAdminDetails(admin) {
                    this.selectedAdmin = admin;
                    this.showViewAdminModal = true;
                },
                
                async saveAdmin() {
                    if (!this.newAdmin.name || !this.newAdmin.login || !this.newAdmin.password) {
                        alert('Заполните все обязательные поля');
                        return;
                    }

                    if (!this.newAdmin.isMyAdmin && this.newAdmin.salary === '') {
                        alert('Для не "моего админа" укажите сумму');
                        return;
                    }

                    // Парсим список ID анкет
                    const profileIds = this.newAdmin.profileIds
                        ? this.newAdmin.profileIds.split(/[\s,]+/).map(id => id.trim()).filter(id => id)
                        : [];

                    try {
                        let adminId = this.newAdmin.id;

                        if (this.newAdmin.id) {
                            // Редактирование существующего админа
                            const res = await fetch(`${API_BASE}/api/users/${this.newAdmin.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    username: this.newAdmin.login,
                                    password: this.newAdmin.password,
                                    salary: this.newAdmin.isMyAdmin ? null : parseFloat(this.newAdmin.salary),
                                    isRestricted: this.newAdmin.isMyAdmin,
                                    aiEnabled: this.newAdmin.aiEnabled
                                })
                            });
                            const data = await res.json();
                            if (!data.success) {
                                alert('Ошибка сохранения: ' + (data.error || 'Неизвестная ошибка'));
                                return;
                            }
                        } else {
                            // Создание нового админа
                            const res = await fetch(`${API_BASE}/api/users`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    username: this.newAdmin.login,
                                    password: this.newAdmin.password,
                                    role: 'admin',
                                    ownerId: this.currentUser.id,
                                    salary: this.newAdmin.isMyAdmin ? null : parseFloat(this.newAdmin.salary),
                                    isRestricted: this.newAdmin.isMyAdmin,
                                    aiEnabled: this.newAdmin.aiEnabled
                                })
                            });
                            const data = await res.json();
                            if (!data.success) {
                                alert('Ошибка создания: ' + (data.error || 'Неизвестная ошибка'));
                                return;
                            }
                            adminId = data.userId;
                        }

                        // Назначаем анкеты админу (если указаны)
                        if (adminId && profileIds.length > 0) {
                            await fetch(`${API_BASE}/api/team/${adminId}/profiles`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ profileIds })
                            });
                        } else if (adminId && this.newAdmin.id) {
                            // При редактировании обновляем список (может быть пустым)
                            await fetch(`${API_BASE}/api/team/${adminId}/profiles`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ profileIds })
                            });
                        }

                        // Перезагружаем команду и анкеты
                        await this.loadTeam();
                        await this.loadAccounts();

                        this.newAdmin = {
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
                        this.showAddAdminModal = false;

                        alert('Администратор сохранен');
                    } catch (e) {
                        console.error('saveAdmin error:', e);
                        alert('Ошибка сохранения администратора');
                    }
                },

                openAddTranslatorModal() {
                    this.newTranslator = {
                        id: null,
                        name: '',
                        login: '',
                        password: '',
                        salary: '',
                        aiEnabled: false,
                        adminId: ''
                    };
                    this.showAddTranslatorModal = true;
                },

                async saveTranslator() {
                    if (!this.newTranslator.name || !this.newTranslator.login) {
                        alert('Заполните имя и логин');
                        return;
                    }

                    // Пароль обязателен только для нового переводчика
                    if (!this.editingTranslator && !this.newTranslator.password) {
                        alert('Введите пароль для нового переводчика');
                        return;
                    }

                    // Для директора требуем выбор админа (только при создании)
                    if (!this.editingTranslator && this.currentUser.role === 'director' && !this.newTranslator.adminId) {
                        alert('Выберите админа для переводчика');
                        return;
                    }

                    try {
                        if (this.editingTranslator) {
                            // Редактирование существующего переводчика
                            const body = {
                                username: this.newTranslator.name,
                                aiEnabled: this.newTranslator.aiEnabled
                            };
                            if (this.newTranslator.password) {
                                body.password = this.newTranslator.password;
                            }
                            if (this.newTranslator.salary) {
                                body.salary = parseFloat(this.newTranslator.salary);
                            }

                            const res = await fetch(`${API_BASE}/api/users/${this.editingTranslator.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body)
                            });
                            const data = await res.json();
                            if (!data.success) {
                                alert('Ошибка: ' + (data.error || 'Не удалось сохранить'));
                                return;
                            }
                        } else {
                            // Создание нового переводчика
                            const ownerId = this.currentUser.role === 'director'
                                ? this.newTranslator.adminId
                                : this.currentUser.id;

                            const res = await fetch(`${API_BASE}/api/users`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    username: this.newTranslator.name,
                                    login: this.newTranslator.login,
                                    password: this.newTranslator.password,
                                    role: 'translator',
                                    ownerId: ownerId,
                                    salary: this.newTranslator.salary ? parseFloat(this.newTranslator.salary) : null,
                                    aiEnabled: this.newTranslator.aiEnabled
                                })
                            });
                            const data = await res.json();
                            if (!data.success) {
                                alert('Ошибка создания: ' + (data.error || 'Логин занят'));
                                return;
                            }
                        }

                        // Перезагружаем команду
                        await this.loadTeam();

                        const wasEditing = !!this.editingTranslator;

                        // Сбрасываем форму
                        this.newTranslator = {
                            id: null,
                            name: '',
                            login: '',
                            password: '',
                            salary: '',
                            aiEnabled: false,
                            adminId: ''
                        };
                        this.editingTranslator = null;
                        this.showAddTranslatorModal = false;

                        alert(wasEditing ? 'Переводчик обновлен' : 'Переводчик добавлен');
                    } catch (e) {
                        console.error('saveTranslator error:', e);
                        alert('Ошибка сохранения переводчика');
                    }
                },

                // Редактирование переводчика
                editTranslator(translator) {
                    this.editingTranslator = translator;
                    this.newTranslator = {
                        id: translator.id,
                        name: translator.name,
                        login: translator.login,
                        password: '',
                        salary: translator.salary || '',
                        aiEnabled: translator.aiEnabled || false,
                        adminId: translator.adminId || ''
                    };
                    this.showAddTranslatorModal = true;
                },

                // Удаление переводчика
                async deleteTranslator(translator) {
                    if (!confirm(`Удалить переводчика "${translator.name}"? Его анкеты станут неназначенными.`)) {
                        return;
                    }

                    try {
                        const res = await fetch(`${API_BASE}/api/users/${translator.id}`, {
                            method: 'DELETE'
                        });
                        const data = await res.json();
                        if (data.success) {
                            await this.loadTeam();
                            alert('Переводчик удален');
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось удалить'));
                        }
                    } catch (e) {
                        console.error('deleteTranslator error:', e);
                        alert('Ошибка сети');
                    }
                },

                async toggleBotStatus(bot) {
                    const newActive = bot.status !== 'active';
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/${bot.id}/toggle`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ active: newActive })
                        });
                        const data = await res.json();
                        if (data.success) {
                            bot.status = newActive ? 'active' : 'inactive';
                        }
                    } catch (e) {
                        console.error('Ошибка:', e);
                    }
                },

                // Переключение рассылки для одной анкеты
                async toggleProfileMailing(profile) {
                    const newEnabled = !profile.mailingEnabled;
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/profile/${profile.profileId}/toggle-mailing`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: this.currentUser.id,
                                enabled: newEnabled
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            profile.mailingEnabled = newEnabled;
                            // Также обновляем в accounts
                            const acc = this.accounts.find(a => a.id === profile.profileId);
                            if (acc) acc.mailingEnabled = newEnabled;
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось переключить'));
                        }
                    } catch (e) {
                        console.error('toggleProfileMailing error:', e);
                        alert('Ошибка сети');
                    }
                },

                // Переключение рассылки для всех анкет
                async toggleAllProfilesMailing(enabled) {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/profiles/toggle-mailing-all`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: this.currentUser.id,
                                enabled: enabled
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            // Обновляем все профили
                            this.profilesWithMailing.forEach(p => p.mailingEnabled = enabled);
                            this.accounts.forEach(a => a.mailingEnabled = enabled);
                            alert(`Рассылка ${enabled ? 'включена' : 'отключена'} для ${data.count} анкет`);
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось переключить'));
                        }
                    } catch (e) {
                        console.error('toggleAllProfilesMailing error:', e);
                        alert('Ошибка сети');
                    }
                },

                async saveBotName(bot) {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/${bot.id}/name`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: bot.name })
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert(this.t('messages.botNameSaved'));
                        }
                    } catch (e) {
                        console.error('Ошибка:', e);
                    }
                },

                async updateAllBots() {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/refresh-all`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const data = await res.json();
                        if (data.success) {
                            // Обновляем список ботов
                            await this.loadBotsStatus();
                            alert(this.t('messages.botsUpdated'));
                        }
                    } catch (e) {
                        console.error('Ошибка:', e);
                    }
                },

                async syncPromptWithBots() {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/sync-prompt`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                prompt: this.generationPrompt,
                                userId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert(this.t('messages.botsSynced'));
                        }
                    } catch (e) {
                        console.error('Ошибка:', e);
                    }
                },

                // === Настройки управления ===
                async loadControlSettings() {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/control/settings?userId=${this.currentUser.id}`);
                        const data = await res.json();
                        if (data.success && data.settings) {
                            this.controlSettings = data.settings;
                        }
                    } catch (e) {
                        console.error('loadControlSettings error:', e);
                    }
                },

                async toggleMailingEnabled() {
                    this.controlSettings.mailingEnabled = !this.controlSettings.mailingEnabled;
                    await this.saveControlSettings();
                },

                async toggleStopSpam() {
                    this.controlSettings.stopSpam = !this.controlSettings.stopSpam;
                    await this.saveControlSettings();
                },

                async saveControlSettings() {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/control/settings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: this.currentUser.id,
                                settings: this.controlSettings
                            })
                        });
                        const data = await res.json();
                        if (!data.success) {
                            alert('Ошибка сохранения настроек');
                        }
                    } catch (e) {
                        console.error('saveControlSettings error:', e);
                        alert('Ошибка сети при сохранении настроек');
                    }
                },

                async activatePanicMode() {
                    if (!confirm('ВНИМАНИЕ! Это остановит ВСЕ боты немедленно. Продолжить?')) {
                        return;
                    }
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/control/panic`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: this.currentUser.id,
                                activate: !this.controlSettings.panicMode
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.controlSettings.panicMode = !this.controlSettings.panicMode;
                            alert(data.message);
                            await this.loadBotsStatus();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось активировать panic mode'));
                        }
                    } catch (e) {
                        console.error('activatePanicMode error:', e);
                        alert('Ошибка сети');
                    }
                },

                // === Функции экспорта статистики ===
                exportStats() {
                    const dateFrom = this.statsFilter.dateFrom || 'все';
                    const dateTo = this.statsFilter.dateTo || 'все';

                    // Формируем CSV данные
                    let csv = 'Статистика Nova\n';
                    csv += `Период: ${dateFrom} - ${dateTo}\n\n`;
                    csv += 'Показатель,Сегодня,За месяц\n';
                    csv += `Письма,${this.stats.today.letters || 0},${this.stats.month.letters || 0}\n`;
                    csv += `Чаты,${this.stats.today.chats || 0},${this.stats.month.chats || 0}\n`;
                    csv += `Уникальные мужчины,${this.stats.today.uniqueMen || 0},${this.stats.month.uniqueMen || 0}\n`;
                    csv += `\nВремя работы сегодня: ${this.stats.metrics.workTime || '0ч 0м'}\n`;
                    csv += `Время работы за месяц: ${this.stats.metrics.workTimeMonth || '0ч 0м'}\n`;

                    // Скачиваем файл
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `nova_stats_${dateFrom}_${dateTo}.csv`;
                    link.click();
                },

                exportFavoriteTemplates() {
                    if (this.favoriteTemplates.length === 0) {
                        alert('Нет избранных шаблонов для экспорта');
                        return;
                    }

                    let content = '=== ИЗБРАННЫЕ ШАБЛОНЫ РАССЫЛКИ ===\n';
                    content += `Экспорт: ${new Date().toLocaleString('ru-RU')}\n`;
                    content += `Всего шаблонов: ${this.favoriteTemplates.length}\n`;
                    content += '=' .repeat(50) + '\n\n';

                    this.favoriteTemplates.forEach((t, i) => {
                        content += `--- Шаблон #${i + 1} ---\n`;
                        content += `Название: ${t.templateName || 'Без названия'}\n`;
                        content += `Анкета: ${t.profileLogin || t.profileId}\n`;
                        content += `Дата добавления: ${new Date(t.createdAt).toLocaleString('ru-RU')}\n`;
                        content += `Текст:\n${t.templateText}\n`;
                        content += '\n' + '-'.repeat(40) + '\n\n';
                    });

                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `favorite_templates_${new Date().toISOString().slice(0,10)}.txt`;
                    link.click();
                },

                // === Функции истории изменений анкет ===
                getHistoryDateRangeText() {
                    if (this.historyFilter.dateFrom && this.historyFilter.dateTo) {
                        const from = new Date(this.historyFilter.dateFrom);
                        const to = new Date(this.historyFilter.dateTo);
                        return `${from.toLocaleDateString('ru-RU')} - ${to.toLocaleDateString('ru-RU')}`;
                    }
                    return 'Выбрать период';
                },

                selectHistoryCalendarDate(date) {
                    if (!date) return;

                    if (this.calendarSelectingStart || !this.historyFilter.dateFrom) {
                        this.historyFilter.dateFrom = date;
                        this.historyFilter.dateTo = date;
                        this.calendarSelectingStart = false;
                    } else {
                        if (date < this.historyFilter.dateFrom) {
                            this.historyFilter.dateTo = this.historyFilter.dateFrom;
                            this.historyFilter.dateFrom = date;
                        } else {
                            this.historyFilter.dateTo = date;
                        }
                        this.calendarSelectingStart = true;
                        this.showHistoryCalendar = false;
                    }
                },

                isHistoryDateSelected(date) {
                    return date === this.historyFilter.dateFrom || date === this.historyFilter.dateTo;
                },

                isHistoryDateInRange(date) {
                    if (!this.historyFilter.dateFrom || !this.historyFilter.dateTo) return false;
                    return date >= this.historyFilter.dateFrom && date <= this.historyFilter.dateTo;
                },

                setHistoryQuickRange(range) {
                    const now = new Date();
                    const formatDate = (d) => d.toISOString().split('T')[0];

                    if (range === 'today') {
                        this.historyFilter.dateFrom = formatDate(now);
                        this.historyFilter.dateTo = formatDate(now);
                    } else if (range === 'week') {
                        const weekAgo = new Date(now);
                        weekAgo.setDate(now.getDate() - 7);
                        this.historyFilter.dateFrom = formatDate(weekAgo);
                        this.historyFilter.dateTo = formatDate(now);
                    } else if (range === 'month') {
                        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                        this.historyFilter.dateFrom = formatDate(firstDay);
                        this.historyFilter.dateTo = formatDate(now);
                    }

                    this.showHistoryCalendar = false;
                    this.loadProfileHistory();
                },

                async loadProfileHistory() {
                    try {
                        let url = `${API_BASE}/api/profile-history?userId=${this.currentUser.id}&role=${this.currentUser.role}`;
                        if (this.historyFilter.dateFrom) {
                            url += `&dateFrom=${this.historyFilter.dateFrom}`;
                        }
                        if (this.historyFilter.dateTo) {
                            url += `&dateTo=${this.historyFilter.dateTo}`;
                        }
                        if (this.historyFilter.admin) {
                            url += `&adminId=${this.historyFilter.admin}`;
                        }
                        if (this.historyFilter.profileId) {
                            url += `&profileId=${this.historyFilter.profileId}`;
                        }
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success) {
                            this.profileHistory = data.history || [];
                        } else {
                            // Заглушка если API не реализован
                            this.profileHistory = [];
                        }
                    } catch (e) {
                        console.error('loadProfileHistory error:', e);
                        this.profileHistory = [];
                    }
                },

                async loadSavedPrompt() {
                    try {
                        const res = await fetch(`${API_BASE}/api/bots/prompt`);
                        const data = await res.json();
                        if (data.success && data.prompt) {
                            this.generationPrompt = data.prompt;
                        }
                    } catch (e) {
                        console.error('loadSavedPrompt error:', e);
                    }
                },

                getProfileActionClass(actionType) {
                    const classes = {
                        'added': 'bg-green-100 text-green-800',
                        'removed': 'bg-red-100 text-red-800',
                        'assigned': 'bg-blue-100 text-blue-800',
                        'unassigned': 'bg-yellow-100 text-yellow-800',
                        'paused': 'bg-gray-100 text-gray-800',
                        'resumed': 'bg-emerald-100 text-emerald-800',
                        'updated': 'bg-purple-100 text-purple-800'
                    };
                    return classes[actionType] || 'bg-gray-100 text-gray-800';
                },

                getProfileActionLabel(actionType) {
                    const actions = this.t('history.actions');
                    return actions[actionType] || actionType;
                },

                // ========== BILLING FUNCTIONS ==========

                async loadUserBalance() {
                    try {
                        const res = await fetch(`${API_BASE}/api/billing/balance/${this.currentUser.id}`);
                        const data = await res.json();
                        if (data.success) {
                            this.userBalance = data.balance || 0;
                            this.isRestricted = data.isRestricted || false;
                        }
                    } catch (e) {
                        console.error('loadUserBalance error:', e);
                    }
                },

                async loadPricing() {
                    try {
                        const res = await fetch(`${API_BASE}/api/billing/pricing`);
                        const data = await res.json();
                        if (data.success) {
                            this.pricing = data.pricing;
                        }
                    } catch (e) {
                        console.error('loadPricing error:', e);
                    }
                },

                // Открыть модал продления анкеты
                openExtendModal(account) {
                    this.extendingProfile = account;
                    this.selectedDays = 30;
                    this.showExtendModal = true;
                },

                // Продлить анкету
                async extendProfile() {
                    if (!this.extendingProfile) return;

                    const cost = this.pricing[this.selectedDays] || 0;

                    if (this.userBalance < cost && !this.isRestricted) {
                        alert(`Недостаточно средств. Нужно: $${cost}, на балансе: $${this.userBalance.toFixed(2)}`);
                        return;
                    }

                    try {
                        const res = await fetch(`${API_BASE}/api/billing/extend-profile`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: this.extendingProfile.profile_id,
                                days: this.selectedDays,
                                userId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.userBalance = data.newBalance;
                            alert(`Анкета продлена на ${this.selectedDays} дней. Списано: $${data.cost}`);
                            this.showExtendModal = false;
                            await this.loadAccounts();
                        } else {
                            alert(data.error || 'Ошибка продления');
                        }
                    } catch (e) {
                        console.error('extendProfile error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // Активировать тестовый период
                async startTrial(account) {
                    try {
                        const res = await fetch(`${API_BASE}/api/billing/start-trial`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: account.profile_id,
                                userId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert(`Тестовый период активирован (${data.trialDays || 2} дня)`);
                            await this.loadAccounts();
                        } else {
                            alert(data.error || 'Ошибка активации');
                        }
                    } catch (e) {
                        console.error('startTrial error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // Выбор анкет
                toggleProfileSelection(profileId, checked) {
                    const id = String(profileId);
                    if (checked) {
                        if (!this.selectedProfileIds.includes(id)) {
                            this.selectedProfileIds.push(id);
                        }
                    } else {
                        this.selectedProfileIds = this.selectedProfileIds.filter(pid => pid !== id);
                    }
                },

                toggleSelectAllProfiles(checked) {
                    if (checked) {
                        this.selectedProfileIds = this.filteredAccounts.map(a => String(a.id));
                    } else {
                        this.selectedProfileIds = [];
                    }
                },

                // Назначить выбранные анкеты админу (для директора)
                async assignSelectedToAdmin(adminId) {
                    if (this.selectedProfileIds.length === 0) return;

                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/assign-admin`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileIds: this.selectedProfileIds,
                                adminId: adminId,
                                userId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.selectedProfileIds = [];
                            await this.loadAccounts();
                            alert(adminId ? `Анкеты назначены админу` : 'Назначение снято');
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось назначить'));
                        }
                    } catch (e) {
                        console.error('assignSelectedToAdmin error:', e);
                        alert('Ошибка сети');
                    }
                },

                // Назначить выбранные анкеты переводчику (для админа)
                async assignSelectedToTranslator(translatorId) {
                    if (this.selectedProfileIds.length === 0) return;

                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/assign-translator`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileIds: this.selectedProfileIds,
                                translatorId: translatorId,
                                userId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.selectedProfileIds = [];
                            await this.loadAccounts();
                            await this.loadTeam();
                            alert(translatorId ? `Анкеты назначены переводчику` : 'Назначение снято');
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось назначить'));
                        }
                    } catch (e) {
                        console.error('assignSelectedToTranslator error:', e);
                        alert('Ошибка сети');
                    }
                },

                // Удалить выбранные анкеты
                async deleteSelectedProfiles() {
                    if (this.selectedProfileIds.length === 0) return;

                    const count = this.selectedProfileIds.length;
                    if (!confirm(`Вы уверены, что хотите удалить ${count} анкет(ы)?`)) {
                        return;
                    }

                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/bulk-delete`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileIds: this.selectedProfileIds,
                                userId: this.currentUser.id,
                                userName: this.currentUser.username
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.selectedProfileIds = [];
                            await this.loadAccounts();
                            alert(`Удалено ${data.deleted || count} анкет`);
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось удалить'));
                        }
                    } catch (e) {
                        console.error('deleteSelectedProfiles error:', e);
                        alert('Ошибка сети');
                    }
                },

                async paySelectedProfiles() {
                    if (this.selectedProfileIds.length === 0) return;

                    // Для директора - переход на вкладку Финансы с заполненными ID
                    if (this.currentUser.role === 'director') {
                        this.profilePayment.profileIds = this.selectedProfileIds.join(', ');
                        this.selectedProfileIds = [];
                        this.setActiveMenu('finances');
                        return;
                    }

                    // Для админа (не restricted) - оплата с баланса
                    const selectedAccounts = this.accounts.filter(a => this.selectedProfileIds.includes(a.id));
                    let totalCost = 0;
                    for (const acc of selectedAccounts) {
                        const cost = this.pricing[30] || 2; // Стоимость за 30 дней по умолчанию
                        totalCost += cost;
                    }

                    if (this.userBalance < totalCost) {
                        alert(`Недостаточно средств. Нужно: $${totalCost}, на балансе: $${this.userBalance.toFixed(2)}`);
                        return;
                    }

                    if (!confirm(`Оплатить ${this.selectedProfileIds.length} анкет на 30 дней за $${totalCost}?`)) return;

                    try {
                        let successCount = 0;
                        for (const profileId of this.selectedProfileIds) {
                            const res = await fetch(`${API_BASE}/api/billing/pay`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    profileId: profileId,
                                    days: 30,
                                    userId: this.currentUser.id
                                })
                            });
                            const data = await res.json();
                            if (data.success) successCount++;
                        }

                        alert(`Оплачено ${successCount} из ${this.selectedProfileIds.length} анкет`);
                        this.selectedProfileIds = [];
                        await this.loadAccounts();
                        await this.loadUserBalance();
                    } catch (e) {
                        console.error('paySelectedProfiles error:', e);
                        alert('Ошибка оплаты');
                    }
                },

                // Открыть модал пополнения баланса (для директора)
                openTopupModal(userId) {
                    this.topupUserId = userId;
                    this.topupAmount = 10;
                    this.showTopupModal = true;
                },

                // Пополнить баланс пользователя
                async topupBalance() {
                    if (!this.topupUserId || !this.topupAmount || this.topupAmount <= 0) return;

                    try {
                        const res = await fetch(`${API_BASE}/api/billing/topup`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: this.topupUserId,
                                amount: this.topupAmount,
                                byUserId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert(`Баланс пополнен. Новый баланс: $${data.newBalance.toFixed(2)}`);
                            this.showTopupModal = false;
                            await this.loadTeam();
                        } else {
                            alert(data.error || 'Ошибка пополнения');
                        }
                    } catch (e) {
                        console.error('topupBalance error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // Сбросить настройки пользователя
                resetUserSettings() {
                    this.userSettings = {
                        newUsername: '',
                        newPassword: '',
                        newPasswordConfirm: '',
                        avatarUrl: ''
                    };
                },

                // Сохранить настройки пользователя
                async saveUserSettings() {
                    if (this.userSettings.newPassword && this.userSettings.newPassword !== this.userSettings.newPasswordConfirm) {
                        alert('Пароли не совпадают');
                        return;
                    }

                    this.settingsSaving = true;
                    try {
                        const updateData = {
                            userId: this.currentUser.id
                        };

                        if (this.userSettings.newUsername) {
                            updateData.username = this.userSettings.newUsername;
                        }
                        if (this.userSettings.newPassword) {
                            updateData.password = this.userSettings.newPassword;
                        }
                        if (this.userSettings.avatarUrl) {
                            updateData.avatarUrl = this.userSettings.avatarUrl;
                        }

                        const res = await fetch(`${API_BASE}/api/user/profile`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updateData)
                        });

                        const data = await res.json();
                        if (data.success) {
                            // Обновляем локальные данные пользователя
                            if (updateData.username) {
                                this.currentUser.username = updateData.username;
                            }
                            if (updateData.avatarUrl) {
                                this.currentUser.avatar_url = updateData.avatarUrl;
                            }

                            // Сохраняем в localStorage/sessionStorage
                            const storage = localStorage.getItem('novaUser') ? localStorage : sessionStorage;
                            storage.setItem('novaUser', JSON.stringify(this.currentUser));

                            alert('Настройки сохранены');
                            this.showSettingsModal = false;
                            this.resetUserSettings();
                        } else {
                            alert(data.error || 'Ошибка сохранения');
                        }
                    } catch (e) {
                        console.error('saveUserSettings error:', e);
                        alert('Ошибка соединения');
                    } finally {
                        this.settingsSaving = false;
                    }
                },

                // Получить класс для статуса оплаты
                getPaymentStatusClass(account) {
                    if (account.isFree) return 'text-green-600';
                    if (!account.isPaid) return 'text-red-600';
                    if (account.daysLeft <= 3) return 'text-orange-500';
                    return 'text-green-600';
                },

                // Получить текст статуса оплаты
                getPaymentStatusText(account) {
                    if (account.isFree) return 'Бесплатно';
                    if (!account.isPaid) {
                        if (account.trialUsed) return 'Истёк';
                        return 'Не оплачено';
                    }
                    if (account.isTrial) return `Trial: ${account.daysLeft} дн.`;
                    return `${account.daysLeft} дн.`;
                },

                // ========== FINANCE FUNCTIONS (только для директора) ==========

                // Загрузить данные финансов
                async loadFinanceData() {
                    if (this.currentUser.role !== 'director') return;

                    try {
                        // Загружаем список админов для пополнения
                        const adminsRes = await fetch(`${API_BASE}/api/billing/admins?userId=${this.currentUser.id}`);
                        const adminsData = await adminsRes.json();
                        if (adminsData.success) {
                            this.financeAdmins = adminsData.admins;
                        }

                        // Загружаем историю пополнений админов
                        const historyRes = await fetch(`${API_BASE}/api/billing/history?userId=${this.currentUser.id}&limit=100`);
                        const historyData = await historyRes.json();
                        if (historyData.success) {
                            this.financeHistory = historyData.history;
                            this.financeTotalSum = historyData.totalSum;
                        }

                        // Загружаем историю оплаты анкет
                        const profileHistoryRes = await fetch(`${API_BASE}/api/billing/profile-payment-history?userId=${this.currentUser.id}&limit=100`);
                        const profileHistoryData = await profileHistoryRes.json();
                        if (profileHistoryData.success) {
                            this.profilePaymentHistory = profileHistoryData.history;
                        }
                    } catch (e) {
                        console.error('loadFinanceData error:', e);
                    }
                },

                // Вычисляемое свойство: общий баланс всех админов
                get financeAdminsTotalBalance() {
                    return this.financeAdmins.reduce((sum, admin) => sum + admin.balance, 0);
                },

                // Отправить пополнение
                async submitFinanceTopup() {
                    if (!this.financeTopup.adminId || !this.financeTopup.amount || this.financeTopup.amount <= 0) {
                        alert('Выберите админа и введите сумму');
                        return;
                    }

                    try {
                        const res = await fetch(`${API_BASE}/api/billing/topup`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: this.financeTopup.adminId,
                                amount: this.financeTopup.amount,
                                byUserId: this.currentUser.id,
                                note: this.financeTopup.note || null
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            const admin = this.financeAdmins.find(a => a.id == this.financeTopup.adminId);
                            const adminName = admin ? admin.name : 'Админ';
                            alert(`Баланс ${adminName} пополнен на $${this.financeTopup.amount}.\nНовый баланс: $${data.newBalance.toFixed(2)}`);

                            // Сбрасываем форму
                            this.financeTopup = { adminId: '', amount: 10, note: '' };

                            // Обновляем данные
                            await this.loadFinanceData();
                            await this.loadTeam();
                        } else {
                            alert(data.error || 'Ошибка пополнения');
                        }
                    } catch (e) {
                        console.error('submitFinanceTopup error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // Оплатить анкеты (директор)
                async submitProfilePayment() {
                    if (!this.profilePayment.profileIds.trim() || !this.profilePayment.days) {
                        alert('Введите ID анкет и выберите период');
                        return;
                    }

                    // Парсим ID анкет
                    const ids = this.profilePayment.profileIds.split(/[\s,]+/).filter(id => id.trim().length >= 3);
                    if (ids.length === 0) {
                        alert('Введите корректные ID анкет');
                        return;
                    }

                    try {
                        let successCount = 0;
                        for (const profileId of ids) {
                            const res = await fetch(`${API_BASE}/api/billing/pay-profile`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    profileId: profileId.trim(),
                                    days: this.profilePayment.days,
                                    byUserId: this.currentUser.id,
                                    note: this.profilePayment.note || null
                                })
                            });
                            const data = await res.json();
                            if (data.success) successCount++;
                        }

                        alert(`Оплачено ${successCount} из ${ids.length} анкет на ${this.profilePayment.days} дней`);
                        this.profilePayment = { profileIds: '', days: 30, note: '' };
                        await this.loadFinanceData();
                        await this.loadAccounts();
                    } catch (e) {
                        console.error('submitProfilePayment error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // Убрать оплату с анкет (директор)
                async removeProfilePayment() {
                    if (!this.profilePayment.profileIds.trim()) {
                        alert('Введите ID анкет');
                        return;
                    }

                    // Парсим ID анкет
                    const ids = this.profilePayment.profileIds.split(/[\s,]+/).filter(id => id.trim().length >= 3);
                    if (ids.length === 0) {
                        alert('Введите корректные ID анкет');
                        return;
                    }

                    if (!confirm(`Убрать оплату с ${ids.length} анкет?`)) return;

                    try {
                        let successCount = 0;
                        for (const profileId of ids) {
                            const res = await fetch(`${API_BASE}/api/billing/remove-payment`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    profileId: profileId.trim(),
                                    byUserId: this.currentUser.id
                                })
                            });
                            const data = await res.json();
                            if (data.success) successCount++;
                        }

                        alert(`Оплата снята с ${successCount} из ${ids.length} анкет`);
                        this.profilePayment = { profileIds: '', days: 30, note: '' };
                        await this.loadFinanceData();
                        await this.loadAccounts();
                    } catch (e) {
                        console.error('removeProfilePayment error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // ========== END BILLING FUNCTIONS ==========

                logout() {
                    // Очищаем данные авторизации
                    localStorage.removeItem('novaUser');
                    sessionStorage.removeItem('novaUser');
                    // Перенаправляем на страницу входа
                    window.location.href = 'login.html';
                }
            }
        }
        
        function toggleActive(element) {
            element.classList.toggle('active');
        }
        
        document.addEventListener('DOMContentLoaded', () => {
            const elements = document.querySelectorAll('.fade-in');
            elements.forEach((el, i) => {
                el.style.animationDelay = `${i * 0.1}s`;
            });
        });
