        function dashboard() {
            return {
                // User data from auth
                currentUser: novaUserData,

                // Settings modal
                showSettingsModal: false,
                userSettings: {
                    newUsername: '',
                    newPassword: '',
                    newPasswordConfirm: '',
                    avatarUrl: ''
                },
                settingsSaving: false,

                // Localization
                language: savedLanguage,

                // Dark mode
                darkMode: localStorage.getItem('novaDarkMode') === 'true',

                // Balance (for admins without "мой админ")
                userBalance: 0,

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

                activeMenu: 'stats',
                activeSubmenu: 'general',
                showCalendar: false,
                showMonitoringCalendar: false,
                showAddAccountModal: false,
                showAddAdminModal: false,
                showAssignAccountsModal: false,
                showViewAdminModal: false,
                showTranslatorModal: false,
                showAssignTranslatorModal: false,
                editingTranslator: null,
                selectedTranslatorForAssign: null,
                translatorProfileIds: [],
                newTranslator: { id: null, name: '', login: '', password: '' },
                sortBy: 'date',
                sortDirection: 'desc',
                searchQuery: '',
                selectedProfileIds: [], // Выбранные анкеты для оплаты
                loading: true,
                error: null,

                // Статистика с сервера
                stats: {
                    today: { letters: 0, chats: 0, uniqueMen: 0, income: '0.00', errors: 0 },
                    yesterday: { letters: 0, chats: 0, income: '0.00' },
                    week: { letters: 0, chats: 0, uniqueMen: 0, income: '0.00', errors: 0 },
                    month: { letters: 0, chats: 0, uniqueMen: 0, income: '0.00' },
                    metrics: { totalProfiles: 0, avgResponseTime: 0, growthPercent: 0, avgDailyIncome: '0.00' }
                },

                // Статус ботов
                botsStatus: { online: 0, idle: 0, offline: 0, never_connected: 0 },

                // Последняя активность
                recentActivity: [],

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
                newAccountLogin: '',
                newAccountPassword: '',

                newAdmin: {
                    id: null,
                    name: '',
                    login: '',
                    password: '',
                    initials: '',
                    isMyAdmin: false,
                    salary: ''
                },

                selectedAdmin: null,
                accountsToAssign: '',
                assignComment: '',
                selectedAccountIds: [],

                generationPrompt: '',

                // Фильтры истории
                historyFilter: {
                    admin: '',
                    dateFrom: '',
                    dateTo: ''
                },
                showHistoryCalendar: false,
                profileHistory: [],

                // Данные загружаются с сервера
                accounts: [],
                bots: [],
                admins: [],
                translators: [], // Переводчики этого админа
                team: [],
                translatorStats: [],
                historyActions: [],

                // Финансы (только для директора)
                financeAdmins: [],
                financeHistory: [],
                financeTotalSum: 0,
                financeTopup: { adminId: '', amount: 10, note: '' },
                profilePayment: { profileId: '', days: 30, note: '' },

                // Инициализация - загрузка данных с сервера
                async init() {
                    console.log('Dashboard init, user:', this.currentUser);
                    // Устанавливаем период по умолчанию - текущий месяц
                    this.setDefaultDateRange();
                    // Инициализация Flatpickr
                    this.$nextTick(() => this.initFlatpickr());
                    await this.loadAllData();
                    // Загружаем баланс для админов без "мой админ"
                    if (!this.currentUser.isRestricted) {
                        await this.loadUserBalance();
                    }
                    // Загружаем финансовые данные для директора
                    if (this.currentUser.role === 'director') {
                        await this.loadFinanceData();
                    }
                    // Автообновление каждые 30 секунд
                    setInterval(() => this.loadDashboardStats(), 30000);
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
                        await Promise.all([
                            this.loadDashboardStats(),
                            this.loadAccounts(),
                            this.loadBotsStatus(),
                            this.loadTeam(),
                            this.loadRecentActivity(),
                            this.loadFavoriteTemplates(),
                            this.loadHourlyActivity(),
                            this.loadTranslatorStats(),
                            this.loadHistoryActions(),
                            this.loadProfileHistory()
                        ]);
                    } catch (e) {
                        console.error('Error loading data:', e);
                        this.error = 'Ошибка загрузки данных';
                    }
                    this.loading = false;
                },

                // Загрузка баланса пользователя
                async loadUserBalance() {
                    try {
                        const res = await fetch(`${API_BASE}/api/billing/balance/${this.currentUser.id}`);
                        const data = await res.json();
                        if (data.success) {
                            this.userBalance = data.balance || 0;
                        }
                    } catch (e) {
                        console.error('loadUserBalance error:', e);
                    }
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
                            this.loadAccounts(),
                            this.loadBotsStatus()
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
                            // Получаем статус оплаты для каждого профиля
                            const accountsWithPayment = await Promise.all(data.list.map(async (p) => {
                                let paymentStatus = { isPaid: false, isFree: false, daysLeft: 0, isTrial: false, trialUsed: false };
                                try {
                                    const payRes = await fetch(`${API_BASE}/api/billing/profile-status/${p.profile_id}`);
                                    const payData = await payRes.json();
                                    if (payData.success) {
                                        paymentStatus = {
                                            isPaid: payData.isPaid,
                                            isFree: payData.isFree,
                                            daysLeft: payData.daysLeft,
                                            isTrial: payData.isTrial || false,
                                            trialUsed: payData.trialUsed || false
                                        };
                                    }
                                } catch (e) {}

                                return {
                                    id: p.profile_id,
                                    login: p.login || p.profile_id,
                                    password: p.password || '',
                                    status: p.status || 'offline',
                                    lastOnline: p.last_online ? new Date(p.last_online).toLocaleString('ru-RU') : '-',
                                    letters: p.letters_today || 0,
                                    admin: p.admin_name || '',
                                    translator: p.trans_name || '',
                                    addedDate: new Date(p.added_at).toLocaleDateString('ru-RU'),
                                    comment: p.note ? p.note.replace(/\s*\[Last seen:.*?\]/g, '').trim() : '',
                                    paused: p.paused || false,
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
                        if (data.success) {
                            this.botsStatus = data.summary;

                            // Группируем по botId чтобы получить уникальные боты
                            const botsMap = {};
                            data.bots.forEach(b => {
                                // Используем botId или profileId как ключ
                                const botId = b.botId || b.bot_id || b.profileId || b.profile_id;
                                if (botId && botId !== 'null' && botId !== 'undefined') {
                                    // Определяем активность бота
                                    const isActive = b.status === 'online' || b.status === 'active' || b.status === 'idle';

                                    if (!botsMap[botId]) {
                                        botsMap[botId] = {
                                            id: botId,
                                            name: b.name || `Бот ${botId}`,
                                            icon: b.platform?.includes('Windows') ? 'fas fa-desktop' : 'fas fa-laptop',
                                            status: isActive ? 'active' : 'inactive',
                                            os: b.platform || 'Unknown',
                                            ip: b.ip || '-',
                                            version: b.version || '-',
                                            lastHeartbeat: b.lastHeartbeat,
                                            profilesCount: b.profilesCount || 1
                                        };
                                    } else {
                                        botsMap[botId].profilesCount = (botsMap[botId].profilesCount || 0) + 1;
                                        // Обновляем статус если хоть одна анкета online
                                        if (isActive) {
                                            botsMap[botId].status = 'active';
                                        }
                                    }
                                }
                            });
                            this.bots = Object.values(botsMap);

                            // Если ботов нет, но есть данные - показываем их
                            if (this.bots.length === 0 && data.bots.length > 0) {
                                console.log('Bot data received but not parsed:', data.bots);
                            }

                            // Также обновляем статусы анкет
                            data.bots.forEach(b => {
                                const profileId = b.profileId || b.profile_id;
                                const acc = this.accounts.find(a => a.id === profileId);
                                if (acc) {
                                    const isOnline = b.status === 'online' || b.status === 'active';
                                    acc.status = isOnline ? 'online' : (b.status === 'idle' ? 'working' : 'offline');
                                    acc.lastOnline = b.lastHeartbeat ? new Date(b.lastHeartbeat).toLocaleString('ru-RU') : '-';
                                }
                            });
                        }
                    } catch (e) { console.error('loadBotsStatus error:', e); }
                },

                async loadTeam() {
                    try {
                        const res = await fetch(`${API_BASE}/api/team?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        if (data.success) {
                            this.team = data.list;
                            // Для админа - загружаем только своих переводчиков
                            const translatorsList = data.list.filter(u => u.role === 'translator');
                            this.translators = translatorsList.map(t => ({
                                id: t.id,
                                name: t.username,
                                login: t.username,
                                conversion: t.conversion || 0,
                                accounts: t.accounts || []
                            }));
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
                },
                
                setActiveSubmenu(submenu) {
                    this.activeSubmenu = submenu;
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
                
                get filteredAccounts() {
                    let filtered = this.accounts;
                    
                    if (this.searchQuery) {
                        const query = this.searchQuery.toLowerCase();
                        filtered = filtered.filter(account => 
                            account.id.toLowerCase().includes(query) ||
                            account.login.toLowerCase().includes(query)
                        );
                    }
                    
                    filtered.sort((a, b) => {
                        let result = 0;
                        switch (this.sortBy) {
                            case 'id':
                                result = (a.id || '').localeCompare(b.id || '');
                                break;
                            case 'login':
                                result = (a.login || '').localeCompare(b.login || '');
                                break;
                            case 'status':
                                const statusOrder = { 'online': 1, 'working': 2, 'offline': 3, 'inactive': 4 };
                                result = (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5);
                                break;
                            case 'lastOnline':
                                result = new Date(a.lastOnline || 0) - new Date(b.lastOnline || 0);
                                break;
                            case 'letters':
                                result = (a.letters || 0) - (b.letters || 0);
                                break;
                            case 'admin':
                                result = (a.admin || '').localeCompare(b.admin || '');
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
                
                toggleAccountAccess(account) {
                    account.paused = !account.paused;
                    console.log(`Анкета ${account.id} ${account.paused ? 'приостановлена' : 'возобновлена'}`);
                },
                
                deleteAccount(account) {
                    if (confirm(`Удалить анкету ${account.login}?`)) {
                        const index = this.accounts.findIndex(a => a.id === account.id);
                        if (index > -1) {
                            this.accounts.splice(index, 1);
                        }
                    }
                },

                // Функции для выделения анкет
                toggleProfileSelection(profileId, checked) {
                    if (checked) {
                        if (!this.selectedProfileIds.includes(profileId)) {
                            this.selectedProfileIds.push(profileId);
                        }
                    } else {
                        this.selectedProfileIds = this.selectedProfileIds.filter(id => id !== profileId);
                    }
                },

                toggleSelectAllProfiles(checked) {
                    if (checked) {
                        this.selectedProfileIds = this.filteredAccounts
                            .filter(a => !a.isPaid && !a.isFree)
                            .map(a => a.id);
                    } else {
                        this.selectedProfileIds = [];
                    }
                },

                async paySelectedProfiles() {
                    if (this.selectedProfileIds.length === 0) return;

                    const selectedAccounts = this.accounts.filter(a => this.selectedProfileIds.includes(a.id));
                    const PRICE_PER_PROFILE = 0.05; // $0.05 за анкету в день
                    const DAYS = 30;
                    const totalCost = selectedAccounts.length * PRICE_PER_PROFILE * DAYS;

                    if (this.userBalance < totalCost) {
                        alert(`Недостаточно средств. Нужно: $${totalCost.toFixed(2)}, На балансе: $${this.userBalance.toFixed(2)}`);
                        return;
                    }

                    if (!confirm(`Оплатить ${this.selectedProfileIds.length} анкет на 30 дней за $${totalCost.toFixed(2)}?`)) return;

                    let successCount = 0;
                    try {
                        for (const profileId of this.selectedProfileIds) {
                            const res = await fetch(`${API_BASE}/api/billing/pay-profile`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userId: this.currentUser.id,
                                    profileId: profileId,
                                    days: DAYS
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
                        alert('Ошибка при оплате');
                    }
                },

                assignAccount(account) {
                    console.log(`Анкета ${account.id} назначена админу: ${account.admin}`);
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

                    // Отправляем на сервер
                    fetch(`${API_BASE}/api/profiles/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            profiles: ids,
                            note: this.newAccountComment || '',
                            adminId: this.currentUser.role === 'director' ? null : this.currentUser.id,
                            userId: this.currentUser.id,
                            userName: this.currentUser.username
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            this.newAccountIds = '';
                            this.newAccountComment = '';
                            this.newAccountLogin = '';
                            this.newAccountPassword = '';
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
                
                editAdmin(admin) {
                    this.newAdmin = { 
                        id: admin.id,
                        name: admin.name,
                        login: admin.login || '',
                        password: admin.password || '',
                        initials: admin.initials || '',
                        isMyAdmin: admin.isMyAdmin,
                        salary: admin.salary || ''
                    };
                    this.showAddAdminModal = true;
                },
                
                assignAccountsToAdmin(admin) {
                    this.selectedAdmin = admin;
                    this.accountsToAssign = '';
                    this.assignComment = '';
                    this.selectedAccountIds = [];
                    this.showAssignAccountsModal = true;
                },

                assignAccountsToAdminConfirm() {
                    // Собираем ID из чекбоксов и текстового поля
                    let ids = [...this.selectedAccountIds];

                    if (this.accountsToAssign.trim()) {
                        const manualIds = this.accountsToAssign.split(/[\s,]+/).filter(id => id.length >= 5);
                        ids = [...ids, ...manualIds];
                    }

                    // Убираем дубликаты
                    ids = [...new Set(ids)];

                    if (ids.length === 0) {
                        alert('Выберите или введите ID анкет');
                        return;
                    }

                    // Обновляем анкеты в базе данных
                    ids.forEach(id => {
                        const accountIndex = this.accounts.findIndex(a => String(a.id) === String(id));
                        if (accountIndex > -1) {
                            this.accounts[accountIndex].admin = this.selectedAdmin.login;
                            if (this.assignComment) {
                                this.accounts[accountIndex].comment = this.assignComment;
                            }
                        }
                    });

                    this.showAssignAccountsModal = false;
                    this.selectedAccountIds = [];
                    alert(`Назначено ${ids.length} анкет администратору ${this.selectedAdmin.name}`);
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

                    if (!this.newAdmin.isMyAdmin && !this.newAdmin.salary) {
                        alert('Для не "моего админа" укажите сумму');
                        return;
                    }

                    try {
                        if (this.newAdmin.id) {
                            // Редактирование существующего админа
                            const res = await fetch(`${API_BASE}/api/users/${this.newAdmin.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    username: this.newAdmin.login,
                                    password: this.newAdmin.password,
                                    salary: this.newAdmin.isMyAdmin ? null : parseFloat(this.newAdmin.salary),
                                    isRestricted: this.newAdmin.isMyAdmin
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
                                    isRestricted: this.newAdmin.isMyAdmin
                                })
                            });
                            const data = await res.json();
                            if (!data.success) {
                                alert('Ошибка создания: ' + (data.error || 'Неизвестная ошибка'));
                                return;
                            }
                        }

                        // Перезагружаем команду
                        await this.loadTeam();

                        this.newAdmin = {
                            id: null,
                            name: '',
                            login: '',
                            password: '',
                            initials: '',
                            isMyAdmin: false,
                            salary: ''
                        };
                        this.showAddAdminModal = false;

                        alert('Администратор сохранен');
                    } catch (e) {
                        console.error('saveAdmin error:', e);
                        alert('Ошибка сохранения администратора');
                    }
                },

                // === Функции управления переводчиками ===
                openAddTranslatorModal() {
                    this.editingTranslator = null;
                    this.newTranslator = { id: null, name: '', login: '', password: '' };
                    this.showTranslatorModal = true;
                },

                editTranslator(translator) {
                    this.editingTranslator = translator;
                    this.newTranslator = {
                        id: translator.id,
                        name: translator.name,
                        login: translator.login,
                        password: ''
                    };
                    this.showTranslatorModal = true;
                },

                async saveTranslator() {
                    if (!this.newTranslator.name || !this.newTranslator.login) {
                        alert('Заполните имя и логин');
                        return;
                    }

                    if (!this.editingTranslator && !this.newTranslator.password) {
                        alert('Введите пароль для нового переводчика');
                        return;
                    }

                    try {
                        if (this.editingTranslator) {
                            // Редактирование
                            const body = { username: this.newTranslator.name };
                            if (this.newTranslator.password) {
                                body.password = this.newTranslator.password;
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
                            // Создание
                            const res = await fetch(`${API_BASE}/api/users`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    username: this.newTranslator.name,
                                    login: this.newTranslator.login,
                                    password: this.newTranslator.password,
                                    role: 'translator',
                                    ownerId: this.currentUser.id
                                })
                            });
                            const data = await res.json();
                            if (!data.success) {
                                alert('Ошибка: ' + (data.error || 'Логин занят'));
                                return;
                            }
                        }

                        await this.loadTeam();
                        this.showTranslatorModal = false;
                        alert(this.editingTranslator ? 'Переводчик обновлен' : 'Переводчик создан');
                    } catch (e) {
                        console.error('saveTranslator error:', e);
                        alert('Ошибка сети');
                    }
                },

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

                async openAssignProfilesToTranslator(translator) {
                    this.selectedTranslatorForAssign = translator;
                    this.translatorProfileIds = [];

                    try {
                        const res = await fetch(`${API_BASE}/api/team/translator/${translator.id}/profiles`);
                        const data = await res.json();
                        if (data.success && data.profileIds) {
                            this.translatorProfileIds = data.profileIds.map(String);
                        }
                    } catch (e) {
                        console.error('Error loading translator profiles:', e);
                    }

                    this.showAssignTranslatorModal = true;
                },

                toggleTranslatorProfile(profileId) {
                    const id = String(profileId);
                    const idx = this.translatorProfileIds.indexOf(id);
                    if (idx > -1) {
                        this.translatorProfileIds.splice(idx, 1);
                    } else {
                        this.translatorProfileIds.push(id);
                    }
                },

                async saveTranslatorProfiles() {
                    if (!this.selectedTranslatorForAssign) return;

                    try {
                        const res = await fetch(`${API_BASE}/api/team/translator/${this.selectedTranslatorForAssign.id}/profiles`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ profileIds: this.translatorProfileIds })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.showAssignTranslatorModal = false;
                            await this.loadTeam();
                            await this.loadAccounts();
                            alert(`Анкеты назначены переводчику ${this.selectedTranslatorForAssign.name}`);
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось назначить'));
                        }
                    } catch (e) {
                        console.error('saveTranslatorProfiles error:', e);
                        alert('Ошибка сети');
                    }
                },

                toggleBotStatus(bot) {
                    bot.status = bot.status === 'active' ? 'inactive' : 'active';
                    console.log(`Бот ${bot.name} ${bot.status === 'active' ? 'активирован' : 'деактивирован'}`);
                },
                
                saveBotName(bot) {
                    console.log(`Название бота сохранено: ${bot.name}`);
                    alert(`Название бота сохранено: ${bot.name}`);
                },
                
                updateAllBots() {
                    console.log('Обновление всех ботов...');
                    alert('Все боты обновлены');
                },
                
                syncPromptWithBots() {
                    console.log('Промт синхронизирован с ботами:', this.generationPrompt);
                    alert('Промт синхронизирован с ботами');
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
                    csv += `Доход,$${this.stats.today.income || '0.00'},$${this.stats.month.income || '0.00'}\n`;
                    csv += `\nВремя работы сегодня: ${this.stats.metrics.workTime || '0ч 0м'}\n`;
                    csv += `Время работы за месяц: ${this.stats.metrics.workTimeMonth || '0ч 0м'}\n`;

                    // Скачиваем файл
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `nova_stats_${dateFrom}_${dateTo}.csv`;
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

                // ========== ФИНАНСЫ (только для директора) ==========
                get financeAdminsTotalBalance() {
                    return this.financeAdmins.reduce((sum, admin) => sum + (admin.balance || 0), 0);
                },

                get combinedFinanceHistory() {
                    const topups = this.financeHistory.map((h, i) => ({
                        ...h,
                        type: 'topup',
                        uniqueId: 'topup_' + i,
                        createdAt: h.created_at
                    }));
                    return topups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                },

                async loadFinanceData() {
                    if (this.currentUser.role !== 'director') return;
                    try {
                        const adminsRes = await fetch(`${API_BASE}/api/billing/admins`);
                        const adminsData = await adminsRes.json();
                        if (adminsData.success) {
                            this.financeAdmins = adminsData.admins || [];
                        }
                        const historyRes = await fetch(`${API_BASE}/api/billing/history`);
                        const historyData = await historyRes.json();
                        if (historyData.success) {
                            this.financeHistory = historyData.history || [];
                            this.financeTotalSum = historyData.totalSum || 0;
                        }
                    } catch (e) {
                        console.error('loadFinanceData error:', e);
                    }
                },

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
                            alert(`Баланс ${admin?.name || 'Админ'} пополнен на $${this.financeTopup.amount}`);
                            this.financeTopup = { adminId: '', amount: 10, note: '' };
                            await this.loadFinanceData();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
                        }
                    } catch (e) {
                        console.error('submitFinanceTopup error:', e);
                        alert('Ошибка соединения');
                    }
                },

                async submitProfilePayment() {
                    if (!this.profilePayment.profileId || !this.profilePayment.days) {
                        alert('Введите ID анкеты и выберите период');
                        return;
                    }
                    try {
                        const res = await fetch(`${API_BASE}/api/billing/pay-profile`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: this.profilePayment.profileId,
                                days: this.profilePayment.days,
                                byUserId: this.currentUser.id,
                                note: this.profilePayment.note || null
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert(`Анкета ${this.profilePayment.profileId} оплачена на ${this.profilePayment.days} дней`);
                            this.profilePayment = { profileId: '', days: 30, note: '' };
                            await this.loadFinanceData();
                            await this.loadAccounts();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
                        }
                    } catch (e) {
                        console.error('submitProfilePayment error:', e);
                        alert('Ошибка соединения');
                    }
                },

                async deleteAdmin(admin) {
                    if (!confirm(`Удалить админа "${admin.name}"?`)) return;
                    try {
                        const res = await fetch(`${API_BASE}/api/users/${admin.id}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (data.success) {
                            await this.loadTeam();
                            alert('Админ удален');
                        } else {
                            alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
                        }
                    } catch (e) {
                        console.error('deleteAdmin error:', e);
                        alert('Ошибка соединения');
                    }
                },

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
