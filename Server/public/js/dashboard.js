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

                activeMenu: 'stats',
                activeSubmenu: 'general',
                showCalendar: false,
                showAddAccountModal: false,
                showAddAdminModal: false,
                showAssignAccountsModal: false,
                showTranslatorProfilesModal: false,
                selectedTranslatorForProfiles: null,
                selectedTranslatorProfileIds: [],
                showViewAdminModal: false,
                sortBy: 'date',
                sortDirection: 'desc',
                searchQuery: '',
                adminTypeFilter: 'all', // 'our' = наши админы, 'other' = другие, 'all' = все (по умолчанию)
                adminFilter: 'all', // Фильтр по конкретному админу (для директора)
                translatorFilter: 'all', // Фильтр по переводчику (для админа)
                expandedAdminId: null, // ID развёрнутого админа в списке
                directTranslators: [], // Переводчики напрямую под директором
                controlFilter: { adminId: '', translatorId: '' }, // Фильтры в панели управления
                newAccountAssignTo: null, // Кому назначить новую анкету
                profilesWithMailing: [], // Анкеты с рассылкой
                autoRefreshStats: false, // Автообновление статистики
                refreshingStats: false, // Индикатор обновления
                errorLogs: [], // Логи ошибок
                botLogs: [], // Логи ботов
                botLogsFilter: 'all', // Фильтр логов ботов
                botLogsHasMore: false, // Есть ли ещё логи
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
                    // Новая структура - данные за выбранный период
                    incomingLetters: 0,
                    incomingChats: 0,
                    uniqueMen: 0,
                    letters: 0,
                    chats: 0,
                    errors: 0,
                    // Новые поля для X/Y отображения
                    incomingChatsTotal: 0,
                    incomingChatsAnswered: 0,
                    uniqueMenLetters: 0,
                    uniqueMenChats: 0,
                    // Метрики
                    metrics: { totalProfiles: 0, profilesOnline: 0, avgResponseTime: 0, medianResponseTime: 0 },
                    // Для обратной совместимости
                    today: { letters: 0, chats: 0, uniqueMen: 0, errors: 0, incomingLetters: 0, incomingChats: 0 },
                    yesterday: { letters: 0, chats: 0 },
                    week: { letters: 0, chats: 0, uniqueMen: 0, errors: 0 },
                    month: { letters: 0, chats: 0, uniqueMen: 0, incomingLetters: 0, incomingChats: 0 }
                },

                // Статус ботов (программ, не анкет!)
                botsStatus: { online: 0, offline: 0, total: 0 },

                // Последняя активность
                recentActivity: [],

                // Избранные шаблоны
                favoriteTemplates: [],

                // Отправленные письма (сгруппированные)
                sentLettersGrouped: [],

                // Последние ответы на входящие
                lastResponses: [],
                showAllResponses: false,

                // Использование ИИ (массовые рассылки)
                aiUsageData: [],
                showAllAiUsage: false,

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
                        this.showHistoryCalendar = false;
                    } else if (type === 'history') {
                        this.showHistoryCalendar = !this.showHistoryCalendar;
                        this.showStatsCalendar = false;
                    }
                },

                accountsFilter: {
                    dateFrom: '',
                    dateTo: ''
                },

                monitoringFunction: 'lastResponses',

                // Показать все элементы в детальной активности
                showAllResponses: false,
                showAllLetters: false,
                showAllTemplates: false,
                showAllAiUsage: false,

                newAccountIds: '',
                newAccountComment: '',

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
                    profileId: '',
                    days: 30,
                    note: ''
                },
                profilePaymentHistory: [],

                // Инициализация - загрузка данных с сервера
                async init() {
                    console.log('Dashboard init, user:', this.currentUser);
                    // Восстанавливаем активную вкладку из localStorage
                    const savedMenu = localStorage.getItem('dashboard_activeMenu');
                    if (savedMenu) {
                        this.activeMenu = savedMenu;
                    }
                    // Устанавливаем период по умолчанию - текущий месяц
                    this.setDefaultDateRange();
                    // Инициализация Flatpickr
                    this.$nextTick(() => this.initFlatpickr());
                    await this.loadAllData();
                    // Автообновление каждые 30 секунд
                    setInterval(() => this.loadDashboardStats(), 30000);
                    // ВАЖНО: Пинги активности отправляются только из бота,
                    // когда переводчик реально работает (клики, печать текста).
                    // Автоматические действия бота НЕ должны генерировать пинги.
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
                                const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                self.statsFilter.dateFrom = formatDate(selectedDates[0]);
                                self.statsFilter.dateTo = formatDate(selectedDates[1]);
                                self.statsFilter.quickRange = '';
                                self.loadDashboardStats();
                            }
                        }
                    };

                    // Календарь статистики
                    this.statsDatePicker = flatpickr('#statsDatePicker', config);

                    // Календарь истории
                    this.historyDatePicker = flatpickr('#historyDatePicker', {
                        ...config,
                        defaultDate: [this.historyFilter.dateFrom, this.historyFilter.dateTo],
                        onChange: function(selectedDates) {
                            if (selectedDates.length === 2) {
                                const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
                    // Форматируем без UTC чтобы избежать сдвига дат
                    const formatDate = (d) => {
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    };

                    this.statsFilter.dateFrom = formatDate(firstDay);
                    this.statsFilter.dateTo = formatDate(now);
                    this.statsFilter.quickRange = 'month';

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
                            this.loadAccounts(),
                            this.loadBotsStatus(),
                            this.loadTeam(),
                            this.loadRecentActivity(),
                            this.loadSentLettersGrouped(),
                            this.loadFavoriteTemplates(),
                            this.loadLastResponses(),
                            this.loadAiUsage(),
                            this.loadHourlyActivity(),
                            this.loadTranslatorStats(),
                            this.loadHistoryActions(),
                            this.loadProfileHistory(),
                            this.loadSavedPrompt(),
                            this.loadUserBalance(),
                            this.loadPricing(),
                            this.loadControlSettings()
                        ];

                        // Загружаем финансовые данные только для директора
                        if (this.currentUser.role === 'director') {
                            loadPromises.push(this.loadFinanceData());
                        }

                        await Promise.all(loadPromises);
                    } catch (e) {
                        console.error('Error loading data:', e);
                        this.error = 'Ошибка загрузки данных';
                    }
                    this.loading = false;
                },

                async loadDashboardStats(preserveOnline = false) {
                    try {
                        // Сохраняем текущие значения онлайн если есть фильтр по датам
                        const savedOnline = preserveOnline ? {
                            totalProfiles: this.stats.metrics?.totalProfiles,
                            profilesOnline: this.stats.metrics?.profilesOnline
                        } : null;

                        let url = `${API_BASE}/api/dashboard?userId=${this.currentUser.id}&role=${this.currentUser.role}`;
                        if (this.statsFilter.dateFrom) {
                            url += `&dateFrom=${this.statsFilter.dateFrom}`;
                        }
                        if (this.statsFilter.dateTo) {
                            url += `&dateTo=${this.statsFilter.dateTo}`;
                        }
                        // Фильтры по админу/переводчику
                        if (this.statsFilter.admin) {
                            url += `&filterAdminId=${this.statsFilter.admin}`;
                        }
                        if (this.statsFilter.translator) {
                            url += `&filterTranslatorId=${this.statsFilter.translator}`;
                        }
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success) {
                            this.stats = data.dashboard;

                            // Восстанавливаем онлайн статус если был фильтр
                            if (preserveOnline && savedOnline) {
                                this.stats.metrics.totalProfiles = savedOnline.totalProfiles;
                                this.stats.metrics.profilesOnline = savedOnline.profilesOnline;
                            }
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
                            this.loadSentLettersGrouped(),
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

                        // DEBUG: Проверяем что приходит с сервера
                        console.log('📊 DEBUG loadAccounts:', data.list?.length || 0, 'profiles loaded');
                        if (data.list && data.list.length > 0) {
                            console.log('   First profile raw data:', {
                                id: data.list[0].profile_id,
                                last_online: data.list[0].last_online,
                                incoming_month: data.list[0].incoming_month,
                                incoming_total: data.list[0].incoming_total,
                                status: data.list[0].status
                            });
                        }

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
                                    lastOnline: p.last_online ? new Date(p.last_online).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '-',
                                    incoming: p.incoming_month || 0,
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

                            // DEBUG: Проверяем обработанные данные
                            if (accountsWithPayment.length > 0) {
                                console.log('   First account processed:', {
                                    id: accountsWithPayment[0].id,
                                    status: accountsWithPayment[0].status,
                                    lastOnline: accountsWithPayment[0].lastOnline,
                                    incoming: accountsWithPayment[0].incoming
                                });
                            }

                            this.accounts = accountsWithPayment;
                        }
                    } catch (e) { console.error('loadAccounts error:', e); }
                },

                async loadBotsStatus() {
                    console.log('🤖 loadBotsStatus() вызвана');
                    try {
                        const url = `${API_BASE}/api/bots/status?userId=${this.currentUser.id}&role=${this.currentUser.role}`;
                        console.log('🌐 Запрос:', url);
                        const res = await fetch(url);
                        const data = await res.json();
                        console.log('📥 Ответ от сервера:', data);
                        console.log('   bots:', data.bots?.length || 0, 'шт');
                        console.log('   botsSummary:', data.botsSummary);
                        if (data.success) {
                            // ВАЖНО: используем botsSummary для статистики ПРОГРАММ-ботов, не анкет!
                            this.botsStatus = data.botsSummary || { online: 0, offline: 0, total: 0 };

                            // data.bots - это уже уникальные программы-боты с сервера
                            // Фильтруем только активные за последний час
                            const oneHourAgo = Date.now() - 60 * 60 * 1000;

                            const rawBots = data.bots || [];
                            console.log('🔍 Фильтрация ботов:');
                            console.log('   До фильтрации:', rawBots.length);

                            this.bots = rawBots
                                .filter(b => {
                                    const lastHeartbeat = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0;
                                    const passesFilter = lastHeartbeat > oneHourAgo;
                                    if (!passesFilter) {
                                        console.log(`   ❌ Бот ${b.botId || b.bot_id} отфильтрован: lastHeartbeat=${b.lastHeartbeat}`);
                                    }
                                    return passesFilter;
                                })
                                .map(b => ({
                                    id: b.botId || b.bot_id,
                                    name: b.name || this.formatBotName(b.botId || b.bot_id),
                                    icon: b.platform?.includes('Windows') ? 'fas fa-desktop' : 'fas fa-laptop',
                                    status: b.status === 'online' ? 'active' : 'inactive',
                                    os: b.platform || 'Unknown',
                                    ip: b.ip || '-',
                                    version: b.version || '-',
                                    lastHeartbeat: b.lastHeartbeat,
                                    profilesCount: b.profilesCount || 0  // Количество анкет в этом боте
                                }));

                            console.log('   После фильтрации:', this.bots.length);
                            if (this.bots.length > 0) {
                                console.log('✅ Боты для отображения:', this.bots);
                            }

                            // Обновляем статусы анкет из data.profiles (не из data.bots!)
                            if (data.profiles) {
                                data.profiles.forEach(p => {
                                    const profileId = p.profileId || p.profile_id;
                                    const acc = this.accounts.find(a => a.id === profileId);
                                    if (acc) {
                                        acc.status = p.status || 'offline';
                                        acc.lastOnline = p.lastHeartbeat ? new Date(p.lastHeartbeat).toLocaleString('ru-RU') : '-';
                                    }
                                });
                            }
                        }
                    } catch (e) { console.error('loadBotsStatus error:', e); }
                },

                // Форматирование имени бота из machineId
                formatBotName(machineId) {
                    if (!machineId) return 'Неизвестный бот';
                    // machine_1234567890123_abc123def -> "Бот abc123"
                    const parts = machineId.split('_');
                    if (parts.length >= 3) {
                        return `Бот ${parts[2].substring(0, 6)}`;
                    }
                    return `Бот ${machineId.substring(0, 10)}`;
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
                                    accountsCount: t.accounts_count || 0
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
                                    salary: a.salary !== null && a.salary !== undefined ? a.salary : null,
                                    balance: a.balance || 0,
                                    translators: translatorsList.filter(t => t.owner_id === a.id).map(t => ({
                                        id: t.id,
                                        name: t.username,
                                        login: t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0
                                    }))
                                }));
                                this.myTranslators = [];
                                // Для директора: переводчики напрямую под ним (owner_id = директора)
                                this.directTranslators = translatorsList
                                    .filter(t => t.owner_id === this.currentUser.id)
                                    .map(t => ({
                                        id: t.id,
                                        name: t.username,
                                        login: t.login || t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0,
                                        salary: t.salary,
                                        aiEnabled: t.ai_enabled || false
                                    }));
                                // Для директора: все переводчики с информацией об админе
                                this.allTranslators = translatorsList.map(t => {
                                    const admin = adminsList.find(a => a.id === t.owner_id);
                                    return {
                                        id: t.id,
                                        name: t.username,
                                        login: t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0,
                                        adminId: t.owner_id,
                                        adminName: admin ? admin.username : null
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

                async loadFavoriteTemplates() {
                    try {
                        const res = await fetch(`${API_BASE}/api/favorite-templates?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        if (data.success) {
                            this.favoriteTemplates = data.templates;
                        }
                    } catch (e) { console.error('loadFavoriteTemplates error:', e); }
                },

                async loadSentLettersGrouped() {
                    try {
                        let url = `${API_BASE}/api/activity/sent-letters-grouped?userId=${this.currentUser.id}&role=${this.currentUser.role}&limit=50`;
                        if (this.statsFilter.dateFrom) {
                            url += `&dateFrom=${this.statsFilter.dateFrom}`;
                        }
                        if (this.statsFilter.dateTo) {
                            url += `&dateTo=${this.statsFilter.dateTo}`;
                        }
                        // Фильтры по админу/переводчику
                        if (this.statsFilter.admin) {
                            url += `&filterAdminId=${this.statsFilter.admin}`;
                        }
                        if (this.statsFilter.translator) {
                            url += `&filterTranslatorId=${this.statsFilter.translator}`;
                        }
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success) {
                            this.sentLettersGrouped = data.letters;
                        }
                    } catch (e) { console.error('loadSentLettersGrouped error:', e); }
                },

                async loadLastResponses() {
                    try {
                        let url = `${API_BASE}/api/stats/last-responses?userId=${this.currentUser.id}&role=${this.currentUser.role}&limit=100`;
                        if (this.statsFilter.dateFrom) {
                            url += `&dateFrom=${this.statsFilter.dateFrom}`;
                        }
                        if (this.statsFilter.dateTo) {
                            url += `&dateTo=${this.statsFilter.dateTo}`;
                        }
                        if (this.statsFilter.admin) {
                            url += `&filterAdminId=${this.statsFilter.admin}`;
                        }
                        if (this.statsFilter.translator) {
                            url += `&filterTranslatorId=${this.statsFilter.translator}`;
                        }
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success) {
                            this.lastResponses = data.responses;
                        }
                    } catch (e) { console.error('loadLastResponses error:', e); }
                },

                async loadAiUsage() {
                    try {
                        let url = `${API_BASE}/api/stats/ai-usage?userId=${this.currentUser.id}&role=${this.currentUser.role}&limit=100`;
                        if (this.statsFilter.dateFrom) {
                            url += `&dateFrom=${this.statsFilter.dateFrom}`;
                        }
                        if (this.statsFilter.dateTo) {
                            url += `&dateTo=${this.statsFilter.dateTo}`;
                        }
                        if (this.statsFilter.admin) {
                            url += `&filterAdminId=${this.statsFilter.admin}`;
                        }
                        if (this.statsFilter.translator) {
                            url += `&filterTranslatorId=${this.statsFilter.translator}`;
                        }
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success) {
                            this.aiUsageData = data.aiUsage;
                        }
                    } catch (e) { console.error('loadAiUsage error:', e); }
                },

                async loadHourlyActivity() {
                    try {
                        let url = `${API_BASE}/api/stats/hourly-activity?userId=${this.currentUser.id}&role=${this.currentUser.role}&days=7`;
                        if (this.statsFilter.dateFrom) {
                            url += `&dateFrom=${this.statsFilter.dateFrom}`;
                        }
                        if (this.statsFilter.dateTo) {
                            url += `&dateTo=${this.statsFilter.dateTo}`;
                        }
                        if (this.statsFilter.admin) {
                            url += `&filterAdminId=${this.statsFilter.admin}`;
                        }
                        if (this.statsFilter.translator) {
                            url += `&filterTranslatorId=${this.statsFilter.translator}`;
                        }
                        const res = await fetch(url);
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

                formatDateTime(timestamp) {
                    if (!timestamp) return '';
                    const date = new Date(timestamp);
                    return date.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
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
                    console.log(`📌 setActiveMenu('${menu}')`);
                    this.activeMenu = menu;
                    this.activeSubmenu = 'general';
                    // Сохраняем активную вкладку в localStorage
                    localStorage.setItem('dashboard_activeMenu', menu);

                    // При переключении на "Управление" загружаем статус ботов
                    if (menu === 'control') {
                        console.log('🔄 Переключение на вкладку Управление - загружаем ботов...');
                        this.loadBotsStatus();
                    }
                },

                setActiveSubmenu(submenu) {
                    this.activeSubmenu = submenu;
                },

                // Раскрытие/скрытие списка переводчиков админа
                toggleAdminExpanded(adminId) {
                    if (this.expandedAdminId === adminId) {
                        this.expandedAdminId = null;
                    } else {
                        this.expandedAdminId = adminId;
                    }
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
                    // API возвращает массив из 24 чисел где индекс = час
                    if (this.hourlyActivity && this.hourlyActivity.length > 0) {
                        const value = this.hourlyActivity[hour];
                        if (typeof value === 'number') {
                            return Math.min(value, 1) || 0.05;
                        }
                        // Старый формат с объектами
                        const hourData = this.hourlyActivity.find(h => h.hour === hour);
                        if (hourData) {
                            return Math.min(hourData.intensity / 100, 1) || 0.05;
                        }
                    }
                    // Fallback на минимальные значения
                    return 0.05;
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
                    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
                    // Перезагружаем ВСЕ блоки статистики с новым фильтром
                    this.applyStatsFilter();
                },

                // Применить фильтры (вызывается при изменении админа/переводчика/дат)
                applyStatsFilter() {
                    this.loadDashboardStats(true);
                    this.loadSentLettersGrouped();
                    this.loadLastResponses();
                    this.loadAiUsage();
                    this.loadHourlyActivity();
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
                    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    for (let i = startDay - 1; i > 0; i--) {
                        const d = new Date(this.calendarYear, this.calendarMonth, 1 - i);
                        days.push({ day: d.getDate(), date: toDateStr(d), currentMonth: false });
                    }

                    // Дни текущего месяца
                    for (let i = 1; i <= lastDay.getDate(); i++) {
                        const d = new Date(this.calendarYear, this.calendarMonth, i);
                        days.push({ day: i, date: toDateStr(d), currentMonth: true });
                    }

                    // Дни следующего месяца (до 42 дней = 6 недель)
                    const remaining = 42 - days.length;
                    for (let i = 1; i <= remaining; i++) {
                        const d = new Date(this.calendarYear, this.calendarMonth + 1, i);
                        days.push({ day: i, date: toDateStr(d), currentMonth: false });
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

                getAdminColor(adminId, adminName) {
                    if (!adminId && !adminName) return 'text-gray-400';

                    // Массив цветов для админов (такие же как в команде)
                    const colors = [
                        'text-blue-600',      // blue-indigo
                        'text-purple-600',    // purple
                        'text-green-600',     // green
                        'text-orange-600',    // orange
                        'text-pink-600',      // pink
                        'text-indigo-600',    // indigo
                        'text-teal-600',      // teal
                        'text-red-600'        // red
                    ];

                    // Хэш от adminId для стабильного выбора цвета
                    const hash = String(adminId || adminName).split('').reduce((acc, char) => {
                        return char.charCodeAt(0) + ((acc << 5) - acc);
                    }, 0);

                    return colors[Math.abs(hash) % colors.length];
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
                                profileIds: this.selectedTranslatorProfileIds,
                                translatorName: this.selectedTranslatorForProfiles.name,
                                userId: this.currentUser.id,
                                userName: this.currentUser.username
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.showTranslatorProfilesModal = false;
                            await this.loadTeam();
                            await this.loadProfileHistory();
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

                    // Для директора: adminId может быть пустым (переводчик напрямую под директором)
                    // или указывать на конкретного админа

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
                            // Для директора: если adminId пустой - создаём под директором,
                            // иначе под выбранным админом
                            let ownerId;
                            if (this.currentUser.role === 'director') {
                                ownerId = this.newTranslator.adminId || this.currentUser.id;
                            } else {
                                ownerId = this.currentUser.id;
                            }

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

                exportLastResponses() {
                    const responses = this.recentActivity.filter(a => (a.action_type === 'chat' || a.action_type === 'letter') && a.is_reply);
                    if (responses.length === 0) {
                        alert('Нет данных об ответах для экспорта');
                        return;
                    }

                    let content = '=== ПОСЛЕДНИЕ ОТВЕТЫ ===\n';
                    content += `Экспорт: ${new Date().toLocaleString('ru-RU')}\n`;
                    content += `Всего ответов: ${responses.length}\n`;
                    content += '='.repeat(50) + '\n\n';

                    responses.forEach((activity, i) => {
                        content += `--- Ответ #${i + 1} ---\n`;
                        content += `Дата: ${new Date(activity.created_at).toLocaleString('ru-RU')}\n`;
                        content += `Анкета: ${activity.profile_id}\n`;
                        content += `Мужчина: ${activity.man_id}\n`;
                        content += `Тип: ${activity.action_type === 'chat' ? 'Чат' : 'Письмо'}\n`;
                        content += `Текст:\n${activity.message_text || '(текст не сохранён)'}\n`;
                        content += '\n' + '-'.repeat(40) + '\n\n';
                    });

                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `last_responses_${new Date().toISOString().slice(0,10)}.txt`;
                    link.click();
                },

                exportSentLetters() {
                    const letters = this.recentActivity.filter(a => a.action_type === 'letter');
                    if (letters.length === 0) {
                        alert('Нет отправленных писем для экспорта');
                        return;
                    }

                    let content = '=== ОТПРАВЛЕННЫЕ ПИСЬМА ===\n';
                    content += `Экспорт: ${new Date().toLocaleString('ru-RU')}\n`;
                    content += `Всего писем: ${letters.length}\n`;
                    content += '='.repeat(50) + '\n\n';

                    letters.forEach((activity, i) => {
                        content += `--- Письмо #${i + 1} ---\n`;
                        content += `Дата: ${new Date(activity.created_at).toLocaleString('ru-RU')}\n`;
                        content += `Анкета: ${activity.profile_id}\n`;
                        content += `Мужчина: ${activity.man_id}\n`;
                        content += `Текст:\n${activity.message_text || '(текст не сохранён)'}\n`;
                        content += '\n' + '-'.repeat(40) + '\n\n';
                    });

                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `sent_letters_${new Date().toISOString().slice(0,10)}.txt`;
                    link.click();
                },

                exportSentLettersGrouped() {
                    if (this.sentLettersGrouped.length === 0) {
                        alert('Нет отправленных писем для экспорта');
                        return;
                    }

                    let content = '=== ОТПРАВЛЕННЫЕ ПИСЬМА (СГРУППИРОВАННЫЕ) ===\n';
                    content += `Экспорт: ${new Date().toLocaleString('ru-RU')}\n`;
                    content += `Всего уникальных писем: ${this.sentLettersGrouped.length}\n`;
                    content += '='.repeat(50) + '\n\n';

                    this.sentLettersGrouped.forEach((letter, i) => {
                        content += `--- Письмо #${i + 1} ---\n`;
                        content += `Анкета: ${letter.profileId}\n`;
                        content += `Отправлено: ${letter.sentCount} раз\n`;
                        content += `Последняя отправка: ${this.formatDateTime(letter.lastSentAt)}\n`;
                        content += `Текст:\n${letter.messageText}\n`;
                        content += '\n' + '-'.repeat(40) + '\n\n';
                    });

                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `sent_letters_grouped_${new Date().toISOString().slice(0,10)}.txt`;
                    link.click();
                },

                exportAiUsage() {
                    const aiActivities = this.recentActivity.filter(a => a.used_ai);
                    if (aiActivities.length === 0) {
                        alert('Нет данных об использовании ИИ для экспорта');
                        return;
                    }

                    let content = '=== ИСПОЛЬЗОВАНИЕ ИИ ===\n';
                    content += `Экспорт: ${new Date().toLocaleString('ru-RU')}\n`;
                    content += `Всего генераций: ${aiActivities.length}\n`;
                    content += '='.repeat(50) + '\n\n';

                    aiActivities.forEach((activity, i) => {
                        content += `--- Генерация #${i + 1} ---\n`;
                        content += `Дата: ${new Date(activity.created_at).toLocaleString('ru-RU')}\n`;
                        content += `Анкета: ${activity.profile_id}\n`;
                        content += `Мужчина: ${activity.man_id}\n`;
                        content += `Тип: ${activity.action_type === 'chat' ? 'Чат' : 'Письмо'}\n`;
                        content += `Текст:\n${activity.message_text || '(ИИ генерация)'}\n`;
                        content += '\n' + '-'.repeat(40) + '\n\n';
                    });

                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `ai_usage_${new Date().toISOString().slice(0,10)}.txt`;
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
                    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

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
                        'add': 'bg-green-100 text-green-800',
                        'added': 'bg-green-100 text-green-800',
                        'delete': 'bg-red-100 text-red-800',
                        'removed': 'bg-red-100 text-red-800',
                        'assign_admin': 'bg-blue-100 text-blue-800',
                        'unassign_admin': 'bg-yellow-100 text-yellow-800',
                        'assign_translator': 'bg-indigo-100 text-indigo-800',
                        'unassign_translator': 'bg-orange-100 text-orange-800',
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

                    // Найти имя админа для логирования
                    const admin = this.admins.find(a => a.id === adminId);
                    const adminName = admin ? admin.name : null;

                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/assign-admin`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileIds: this.selectedProfileIds,
                                adminId: adminId,
                                adminName: adminName,
                                userId: this.currentUser.id,
                                userName: this.currentUser.username
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.selectedProfileIds = [];
                            await this.loadAccounts();
                            await this.loadProfileHistory();
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

                    // Найти имя переводчика для логирования
                    const translator = this.myTranslators.find(t => t.id === translatorId) ||
                                        this.allTranslators?.find(t => t.id === translatorId);
                    const translatorName = translator ? translator.name : null;

                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/assign-translator`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileIds: this.selectedProfileIds,
                                translatorId: translatorId,
                                translatorName: translatorName,
                                userId: this.currentUser.id,
                                userName: this.currentUser.username
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this.selectedProfileIds = [];
                            await this.loadAccounts();
                            await this.loadTeam();
                            await this.loadProfileHistory();
                            alert(translatorId ? `Анкеты назначены переводчику` : 'Назначение снято');
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось назначить'));
                        }
                    } catch (e) {
                        console.error('assignSelectedToTranslator error:', e);
                        alert('Ошибка сети');
                    }
                },

                async paySelectedProfiles() {
                    if (this.selectedProfileIds.length === 0) return;

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

                // Оплатить анкету (директор)
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
                            alert(data.error || 'Ошибка оплаты');
                        }
                    } catch (e) {
                        console.error('submitProfilePayment error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // Убрать оплату с анкеты (директор)
                async removeProfilePayment() {
                    if (!this.profilePayment.profileId) {
                        alert('Введите ID анкеты');
                        return;
                    }

                    if (!confirm(`Убрать оплату с анкеты ${this.profilePayment.profileId}?`)) return;

                    try {
                        const res = await fetch(`${API_BASE}/api/billing/remove-payment`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                profileId: this.profilePayment.profileId,
                                byUserId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert(`Оплата с анкеты ${this.profilePayment.profileId} снята`);
                            this.profilePayment = { profileId: '', days: 30, note: '' };
                            await this.loadFinanceData();
                            await this.loadAccounts();
                        } else {
                            alert(data.error || 'Ошибка');
                        }
                    } catch (e) {
                        console.error('removeProfilePayment error:', e);
                        alert('Ошибка соединения');
                    }
                },

                // ========== END BILLING FUNCTIONS ==========

                // ========== MAILING CONTROL FUNCTIONS ==========

                // Получить отфильтрованные профили для панели управления рассылкой
                getFilteredProfiles() {
                    if (!this.profilesWithMailing || this.profilesWithMailing.length === 0) {
                        return [];
                    }

                    let filtered = [...this.profilesWithMailing];

                    // Фильтр по админу
                    if (this.controlFilter.adminId) {
                        filtered = filtered.filter(p => p.adminId === this.controlFilter.adminId);
                    }

                    // Фильтр по переводчику
                    if (this.controlFilter.translatorId) {
                        filtered = filtered.filter(p => p.translatorId === this.controlFilter.translatorId);
                    }

                    return filtered;
                },

                // Получить количество писем за сегодня
                getTotalMailToday() {
                    return this.stats?.today?.letters || 0;
                },

                // Получить количество писем за последний час
                getTotalMailHour() {
                    // Пока возвращаем 0, т.к. нет данных по часам
                    return 0;
                },

                // Получить количество чатов за сегодня
                getTotalChatToday() {
                    return this.stats?.today?.chats || 0;
                },

                // Получить количество чатов за последний час
                getTotalChatHour() {
                    // Пока возвращаем 0, т.к. нет данных по часам
                    return 0;
                },

                // Получить количество ошибок за сегодня
                getTotalErrorsToday() {
                    return this.stats?.today?.errors || 0;
                },

                // Получить количество онлайн профилей из списка рассылки
                getOnlineProfiles() {
                    if (!this.profilesWithMailing || this.profilesWithMailing.length === 0) {
                        return 0;
                    }
                    return this.profilesWithMailing.filter(p => p.isOnline).length;
                },

                // Переключить рассылку для профиля
                async toggleProfileMailing(profile) {
                    try {
                        const newStatus = !profile.mailingEnabled;
                        const res = await fetch(`${API_BASE}/api/profiles/${profile.profileId}/mailing`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                enabled: newStatus,
                                userId: this.currentUser.id
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            profile.mailingEnabled = newStatus;
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось изменить статус'));
                        }
                    } catch (e) {
                        console.error('toggleProfileMailing error:', e);
                        alert('Ошибка сети');
                    }
                },

                // Обновить статистику профилей
                async refreshProfileStats() {
                    this.refreshingStats = true;
                    try {
                        await this.loadDashboardStats();
                    } finally {
                        this.refreshingStats = false;
                    }
                },

                // Обработчик изменения фильтра по админу
                onAdminFilterChange() {
                    // Сбрасываем фильтр по переводчику при смене админа
                    this.controlFilter.translatorId = '';
                },

                // Получить переводчиков для выбранного админа
                getTranslatorsForAdmin() {
                    if (!this.controlFilter.adminId) {
                        // Если админ не выбран - возвращаем всех переводчиков
                        return this.translators || [];
                    }

                    // Возвращаем переводчиков только этого админа
                    return (this.translators || []).filter(t => t.adminId === this.controlFilter.adminId);
                },

                // ========== END MAILING CONTROL FUNCTIONS ==========

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
