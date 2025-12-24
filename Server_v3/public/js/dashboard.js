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

                activeMenu: 'accounts', // По умолчанию открываем Анкеты (быстрая загрузка)
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
                loading: true,
                error: null,

                // Lazy loading: отслеживание загруженных вкладок
                loadedTabs: {},

                // Settings modal
                showSettingsModal: false,
                userSettings: {
                    newUsername: '',
                    newPassword: '',
                    newPasswordConfirm: '',
                    avatarUrl: ''
                },
                settingsSaving: false,


                // Статус ботов (программ, не анкет!)
                botsStatus: { online: 0, offline: 0, total: 0 },

                // Последняя активность
                recentActivity: [],

                // Избранные шаблоны
                favoriteTemplates: [],

                // Отправленные письма (сгруппированные)
                sentLettersGrouped: [],

                // Календарь
                calendarMonth: new Date().getMonth(),
                calendarYear: new Date().getFullYear(),
                calendarSelectingStart: true,
                calendarPosition: '',

                // Открыть календарь с позиционированием
                openCalendar(event, type) {
                    const btn = event.currentTarget;
                    const rect = btn.getBoundingClientRect();
                    this.calendarPosition = `top: ${rect.bottom + 4}px; left: ${rect.left}px;`;

                    if (type === 'history') {
                        this.showHistoryCalendar = !this.showHistoryCalendar;
                    }
                },

                accountsFilter: {
                    dateFrom: '',
                    dateTo: ''
                },

                monitoringFunction: 'lastResponses',

                // Показать все элементы в детальной активности
                showAllLetters: false,
                showAllTemplates: false,

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
                    adminId: '',
                    isOwnTranslator: false // По умолчанию НЕ "мой переводчик"
                },
                editingTranslator: null,

                // Выбор анкет по комментарию при создании админа
                uniqueProfileNotes: [], // Уникальные комментарии анкет
                selectedProfileNote: '', // Выбранный комментарий для фильтрации

                showAddTranslatorModal: false,
                selectedAdmin: null,
                accountsToAssign: '',
                assignComment: '',
                selectedAccountIds: [],
                selectedProfileIds: [], // Выбранные анкеты для оплаты

                generationPrompt: '',

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
                historyActions: [],

                // Система оплаты
                userBalance: 0,
                isRestricted: false, // "мой админ" - бесплатные анкеты
                pricing: { 15: 1, 30: 2, 45: 3, 60: 4 },
                showExtendModal: false,
                extendingProfile: null,
                selectedDays: 30,
                showPaymentModal: false, // Модалка выбора дней для оплаты
                paymentDays: 30, // Выбранное кол-во дней
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
                    // ВАЖНО: Пинги активности отправляются только из бота,
                    // когда переводчик реально работает (клики, печать текста).
                    // Автоматические действия бота НЕ должны генерировать пинги.
                },

                // Инициализация Flatpickr календарей
                initFlatpickr() {
                    const self = this;

                    // Календарь истории
                    this.historyDatePicker = flatpickr('#historyDatePicker', {
                        mode: 'range',
                        dateFormat: 'Y-m-d',
                        locale: 'ru',
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
                    // По умолчанию загружаем только за СЕГОДНЯ (быстрее)
                    const formatDate = (d) => {
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    };

                    // Анкеты - только сегодня
                    this.accountsFilter.dateFrom = formatDate(now);
                    this.accountsFilter.dateTo = formatDate(now);

                    // История - только сегодня
                    this.historyFilter.dateFrom = formatDate(now);
                    this.historyFilter.dateTo = formatDate(now);
                },

                async loadAllData() {
                    this.loading = true;
                    try {
                        // LAZY LOADING: Загружаем только критичные данные при старте
                        // Остальное грузится при переключении на вкладку
                        const essentialPromises = [
                            this.loadAccounts(),        // Список анкет (нужен сразу)
                            this.loadBotsStatus(),      // Статус ботов (нужен сразу)
                            this.loadUserBalance(),     // Баланс пользователя
                            this.loadPricing()          // Тарифы (быстро)
                        ];

                        // Для директора загружаем команду сразу (нужна для модалки добавления анкет)
                        if (this.currentUser.role === 'director') {
                            essentialPromises.push(this.loadTeam());
                        }

                        await Promise.all(essentialPromises);

                        // Помечаем accounts как загруженную вкладку
                        this.loadedTabs.accounts = true;

                        // Загружаем данные для текущей активной вкладки
                        await this.loadTabData(this.activeMenu);
                    } catch (e) {
                        console.error('Error loading data:', e);
                        this.error = 'Ошибка загрузки данных';
                    }
                    this.loading = false;
                },

                // Lazy loading: загрузка данных для конкретной вкладки
                async loadTabData(menu) {
                    // Если вкладка уже загружена - пропускаем
                    if (this.loadedTabs[menu]) {
                        console.log(`📌 Tab '${menu}' already loaded, skipping`);
                        return;
                    }

                    console.log(`📥 Lazy loading data for tab: ${menu}`);

                    try {
                        switch (menu) {
                            case 'team':
                                await this.loadTeam();
                                break;

                            case 'history':
                                await Promise.all([
                                    this.loadHistoryActions(),
                                    this.loadProfileHistory()
                                ]);
                                break;

                            case 'finance':
                                if (this.currentUser.role === 'director') {
                                    await this.loadFinanceData();
                                }
                                break;

                            case 'control':
                                await Promise.all([
                                    this.loadBotsStatus(),
                                    this.loadSavedPrompt()  // Загружаем промпт для генерации
                                ]);
                                break;

                            case 'accounts':
                                // Уже загружено в loadAllData
                                await this.loadFavoriteTemplates();
                                break;

                            case 'training':
                                await this.loadSavedPrompt();
                                break;
                        }

                        this.loadedTabs[menu] = true;
                        console.log(`✅ Tab '${menu}' loaded successfully`);
                    } catch (e) {
                        console.error(`Error loading tab ${menu}:`, e);
                    }
                },


                async loadAccounts() {
                    try {
                        const res = await fetch(`${API_BASE}/api/profiles?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();

                        if (data.success) {
                            // Получаем статусы оплаты для всех анкет ОДНИМ запросом (вместо N запросов)
                            const profileIds = data.list.map(p => p.profile_id);
                            let paymentStatuses = {};

                            if (profileIds.length > 0) {
                                try {
                                    const payRes = await fetch(`${API_BASE}/api/billing/profiles-status`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ profileIds })
                                    });
                                    const payData = await payRes.json();
                                    if (payData.success) {
                                        paymentStatuses = payData.statuses;
                                    }
                                } catch (e) { /* ignore */ }
                            }

                            const accountsWithPayment = data.list.map(p => {
                                const paymentStatus = paymentStatuses[p.profile_id] || {
                                    isPaid: true, isFree: false, daysLeft: 999, isTrial: false, trialUsed: false
                                };

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
                            });

                            this.accounts = accountsWithPayment;

                            // Извлекаем уникальные комментарии для фильтрации
                            this.uniqueProfileNotes = [...new Set(
                                accountsWithPayment
                                    .map(a => a.comment)
                                    .filter(c => c && c.trim().length > 0)
                            )].sort();
                        }
                    } catch (e) { console.error('loadAccounts error:', e); }
                },

                // Получить ID анкет по выбранному комментарию
                getProfileIdsByNote(note) {
                    return this.accounts
                        .filter(a => a.comment === note)
                        .map(a => a.id);
                },

                // Выбрать анкеты по комментарию (добавить к списку в модалке админа)
                selectProfilesByNote() {
                    if (!this.selectedProfileNote) return;
                    const ids = this.getProfileIdsByNote(this.selectedProfileNote);
                    if (ids.length === 0) {
                        alert('Нет анкет с таким комментарием');
                        return;
                    }
                    // Добавляем к текущему списку
                    const currentIds = this.newAdmin.profileIds
                        ? this.newAdmin.profileIds.split(/[\s,]+/).filter(id => id.trim())
                        : [];
                    const allIds = [...new Set([...currentIds, ...ids])];
                    this.newAdmin.profileIds = allIds.join(', ');
                    this.selectedProfileNote = ''; // Сбрасываем выбор
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
                            // Сервер уже фильтрует ботов за последний час, повторная фильтрация не нужна
                            const rawBots = data.bots || [];
                            console.log('🤖 Получено ботов с сервера:', rawBots.length);

                            this.bots = rawBots.map(b => ({
                                id: b.botId || b.bot_id,
                                name: b.name || this.formatBotName(b.botId || b.bot_id),
                                icon: b.platform?.includes('Windows') ? 'fas fa-desktop' : 'fas fa-laptop',
                                status: b.status === 'online' ? 'active' : 'inactive',
                                os: b.platform || 'Unknown',
                                ip: b.ip || '-',
                                version: b.version || '-',
                                lastHeartbeat: b.lastHeartbeat,
                                // Расширенные данные
                                profilesCount: b.profilesCount || 0,
                                profilesRunning: b.profilesRunning || 0,
                                profilesStopped: b.profilesStopped || 0,
                                uptime: b.uptime || 0,
                                memoryUsage: b.memoryUsage || null,
                                globalMode: b.globalMode || 'mail',
                                sessionStats: b.sessionStats || { mailSent: 0, chatSent: 0, errors: 0 }
                            }));

                            console.log('✅ Боты для отображения:', this.bots.length, this.bots);

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

                // Форматирование uptime из секунд в читаемый формат
                formatUptime(seconds) {
                    if (!seconds || seconds <= 0) return '-';
                    const hours = Math.floor(seconds / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    if (hours > 0) {
                        return `${hours}ч ${minutes}м`;
                    }
                    return `${minutes}м`;
                },

                // Форматирование режима работы
                formatMode(mode) {
                    return mode === 'mail' ? 'Письма' : (mode === 'chat' ? 'Чаты' : mode);
                },

                // Очистка IP от ::ffff: префикса (IPv4-mapped IPv6)
                cleanIP(ip) {
                    if (!ip) return '-';
                    return ip.replace(/^::ffff:/i, '');
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
                                    aiEnabled: this.currentUser.aiEnabled || false,
                                    translators: translatorsList.map(t => ({
                                        id: t.id,
                                        name: t.username,
                                        login: t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0,
                                        aiEnabled: t.ai_enabled || false
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
                                    salary: a.salary !== null && a.salary !== undefined ? a.salary : null,
                                    balance: a.balance || 0,
                                    aiEnabled: a.ai_enabled || false,
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
                                // Для директора: переводчики напрямую под ним (owner_id = директора)
                                // + "потерянные" переводчики (чей админ был удалён)
                                const adminIds = adminsList.map(a => a.id);
                                this.directTranslators = translatorsList
                                    .filter(t => t.owner_id === this.currentUser.id || !adminIds.includes(t.owner_id))
                                    .map(t => ({
                                        id: t.id,
                                        name: t.username,
                                        login: t.login || t.username,
                                        conversion: t.conversion || 0,
                                        accounts: t.accounts || [],
                                        accountsCount: t.accounts_count || 0,
                                        salary: t.salary,
                                        aiEnabled: t.ai_enabled || false,
                                        isOwnTranslator: t.is_own_translator !== false,
                                        balance: parseFloat(t.balance) || 0,
                                        isOrphaned: t.owner_id !== this.currentUser.id && !adminIds.includes(t.owner_id)
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

                async loadFavoriteTemplates() {
                    try {
                        const res = await fetch(`${API_BASE}/api/favorite-templates?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
                        const data = await res.json();
                        if (data.success) {
                            this.favoriteTemplates = data.templates;
                        }
                    } catch (e) { console.error('loadFavoriteTemplates error:', e); }
                },

                // Защита от дублирования
                _loadingSentLetters: false,
                async loadSentLettersGrouped() {
                    if (this._loadingSentLetters) return;
                    this._loadingSentLetters = true;
                    try {
                        let url = `${API_BASE}/api/activity/sent-letters-grouped?userId=${this.currentUser.id}&role=${this.currentUser.role}&limit=50`;
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success) {
                            this.sentLettersGrouped = data.letters;
                        }
                    } catch (e) { console.error('loadSentLettersGrouped error:', e); }
                    finally { this._loadingSentLetters = false; }
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

                    // LAZY LOADING: загружаем данные для вкладки при переключении
                    this.loadTabData(menu);
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

                // Calendar functions

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

                    // Парсим выбранного админа/переводчика из newAccountAssignTo
                    let adminId = null;
                    let translatorId = null;

                    if (this.currentUser.role === 'director' && this.newAccountAssignTo) {
                        // Формат: "admin_5" или "translator_10"
                        const parts = this.newAccountAssignTo.split('_');
                        if (parts.length === 2) {
                            const type = parts[0];
                            const id = parseInt(parts[1]);
                            if (type === 'admin') {
                                adminId = id;
                            } else if (type === 'translator') {
                                translatorId = id;
                            }
                        }
                    } else if (this.currentUser.role === 'admin') {
                        // Админ добавляет - назначаем себе
                        adminId = this.currentUser.id;
                    }

                    // Отправляем на сервер
                    fetch(`${API_BASE}/api/profiles/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            profiles: ids,
                            note: this.newAccountComment || '',
                            adminId: adminId,
                            translatorId: translatorId,
                            userId: this.currentUser.id,
                            userName: this.currentUser.username
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            this.newAccountIds = '';
                            this.newAccountComment = '';
                            this.newAccountAssignTo = null;
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
                        password: '••••••••', // Показываем звёздочки для существующего пароля
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

                // Переключение AI для пользователя (админа или переводчика)
                async toggleAiEnabled(user) {
                    const newValue = !user.aiEnabled;
                    try {
                        const res = await fetch(`${API_BASE}/api/users/${user.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ aiEnabled: newValue })
                        });
                        const data = await res.json();
                        if (data.success) {
                            user.aiEnabled = newValue;
                            // Обновляем данные в списках
                            await this.loadTeam();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось обновить AI'));
                        }
                    } catch (e) {
                        console.error('toggleAiEnabled error:', e);
                        alert('Ошибка сети');
                    }
                },

                // Переключение "Мой админ" (is_restricted)
                async toggleIsRestricted(admin) {
                    const newValue = !admin.isMyAdmin;
                    try {
                        const res = await fetch(`${API_BASE}/api/users/${admin.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_restricted: newValue })
                        });
                        const data = await res.json();
                        if (data.success) {
                            admin.isMyAdmin = newValue;
                            await this.loadTeam();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось обновить'));
                        }
                    } catch (e) {
                        console.error('toggleIsRestricted error:', e);
                        alert('Ошибка сети');
                    }
                },

                // Переключение "Мой переводчик" (is_own_translator)
                async toggleIsOwnTranslator(translator) {
                    const newValue = !translator.isOwnTranslator;
                    try {
                        const res = await fetch(`${API_BASE}/api/users/${translator.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ isOwnTranslator: newValue })
                        });
                        const data = await res.json();
                        if (data.success) {
                            translator.isOwnTranslator = newValue;
                            await this.loadTeam();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось обновить'));
                        }
                    } catch (e) {
                        console.error('toggleIsOwnTranslator error:', e);
                        alert('Ошибка сети');
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
                    // При создании нового админа пароль обязателен
                    // При редактировании - пароль не обязателен (если звёздочки - не меняем)
                    const isEditing = !!this.newAdmin.id;
                    const passwordChanged = this.newAdmin.password && this.newAdmin.password !== '••••••••';

                    if (!this.newAdmin.name || !this.newAdmin.login) {
                        alert('Заполните имя и логин');
                        return;
                    }

                    if (!isEditing && !this.newAdmin.password) {
                        alert('Введите пароль для нового админа');
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

                        if (isEditing) {
                            // Редактирование существующего админа
                            const updateData = {
                                username: this.newAdmin.login,
                                salary: this.newAdmin.isMyAdmin ? null : parseFloat(this.newAdmin.salary),
                                isRestricted: this.newAdmin.isMyAdmin,
                                aiEnabled: this.newAdmin.aiEnabled
                            };
                            // Пароль отправляем только если он был изменён
                            if (passwordChanged) {
                                updateData.password = this.newAdmin.password;
                            }

                            const res = await fetch(`${API_BASE}/api/users/${this.newAdmin.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(updateData)
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
                    const passwordChanged = this.newTranslator.password && this.newTranslator.password !== '••••••••';
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
                            // Пароль отправляем только если он был изменён (не звёздочки)
                            if (passwordChanged) {
                                body.password = this.newTranslator.password;
                            }
                            // Для переводчиков под директором - поле isOwnTranslator и salary
                            if (this.currentUser.role === 'director' && !this.newTranslator.adminId) {
                                body.isOwnTranslator = this.newTranslator.isOwnTranslator;
                                // Salary только если НЕ свой переводчик
                                if (!this.newTranslator.isOwnTranslator && this.newTranslator.salary) {
                                    body.salary = parseFloat(this.newTranslator.salary);
                                } else if (this.newTranslator.isOwnTranslator) {
                                    body.salary = null; // Сбрасываем salary для своего переводчика
                                }
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

                            const createData = {
                                username: this.newTranslator.name,
                                login: this.newTranslator.login,
                                password: this.newTranslator.password,
                                role: 'translator',
                                ownerId: ownerId,
                                aiEnabled: this.newTranslator.aiEnabled
                            };
                            // Для переводчиков под директором - поле isOwnTranslator и salary
                            if (this.currentUser.role === 'director' && !this.newTranslator.adminId) {
                                createData.isOwnTranslator = this.newTranslator.isOwnTranslator;
                                // Salary только если НЕ свой переводчик
                                if (!this.newTranslator.isOwnTranslator && this.newTranslator.salary) {
                                    createData.salary = parseFloat(this.newTranslator.salary);
                                }
                            }

                            const res = await fetch(`${API_BASE}/api/users`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(createData)
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
                        password: '••••••••', // Показываем звёздочки для существующего пароля
                        salary: translator.salary || '',
                        aiEnabled: translator.aiEnabled || false,
                        adminId: translator.adminId || '',
                        isOwnTranslator: translator.isOwnTranslator || false
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
                            method: 'POST',  // Исправлено: было PUT, сервер ожидает POST
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: bot.name })
                        });
                        const data = await res.json();
                        if (data.success) {
                            console.log('✅ Имя бота сохранено:', bot.name);
                        }
                    } catch (e) {
                        console.error('Ошибка сохранения имени бота:', e);
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

                async clearProfileHistory() {
                    if (!confirm('Вы уверены, что хотите полностью очистить историю? Это действие необратимо.')) {
                        return;
                    }

                    try {
                        const res = await fetch(`${API_BASE}/api/profiles/history/clear`, {
                            method: 'DELETE'
                        });
                        const data = await res.json();
                        if (data.success) {
                            alert(`История очищена. Удалено записей: ${data.deletedCount}`);
                            this.profileHistory = [];
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось очистить историю'));
                        }
                    } catch (e) {
                        console.error('clearProfileHistory error:', e);
                        alert('Ошибка при очистке истории');
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

                    // Для директора - переход на вкладку Финансы с автозаполнением
                    if (this.currentUser.role === 'director') {
                        // Собираем ID выбранных анкет
                        const selectedIds = this.selectedProfileIds.map(id => {
                            const acc = this.accounts.find(a => a.id === id);
                            return acc ? acc.profile_id : id;
                        }).join(', ');

                        // Заполняем форму оплаты
                        this.profilePayment.profileId = selectedIds;

                        // Переход на вкладку Финансы
                        this.setActiveMenu('finances');

                        // Сбрасываем выбор
                        this.selectedProfileIds = [];

                        return;
                    }

                    // Для остальных ролей - показываем модалку выбора дней
                    this.paymentDays = 30; // По умолчанию 30 дней
                    this.showPaymentModal = true;
                },

                // Подтверждение оплаты из модалки
                async confirmPayment() {
                    const selectedAccounts = this.accounts.filter(a => this.selectedProfileIds.includes(a.id));
                    const cost = this.pricing[this.paymentDays] || 2;
                    const totalCost = selectedAccounts.length * cost;

                    if (this.userBalance < totalCost) {
                        alert(`Недостаточно средств. Нужно: $${totalCost}, на балансе: $${this.userBalance.toFixed(2)}`);
                        return;
                    }

                    try {
                        let successCount = 0;
                        for (const profileId of this.selectedProfileIds) {
                            const res = await fetch(`${API_BASE}/api/billing/pay`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    profileId: profileId,
                                    days: this.paymentDays,
                                    userId: this.currentUser.id
                                })
                            });
                            const data = await res.json();
                            if (data.success) successCount++;
                        }

                        alert(`Оплачено ${successCount} из ${this.selectedProfileIds.length} анкет на ${this.paymentDays} дней`);
                        this.selectedProfileIds = [];
                        this.showPaymentModal = false;
                        await this.loadAccounts();
                        await this.loadUserBalance();
                    } catch (e) {
                        console.error('confirmPayment error:', e);
                        alert('Ошибка оплаты');
                    }
                },

                // Удалить выбранные анкеты
                async deleteSelectedProfiles() {
                    if (this.selectedProfileIds.length === 0) return;

                    if (!confirm(`Удалить ${this.selectedProfileIds.length} анкет? Это действие нельзя отменить.`)) return;

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
                            alert(`Удалено ${data.deleted} анкет`);
                            this.selectedProfileIds = [];
                            await this.loadAccounts();
                            await this.loadProfileHistory();
                        } else {
                            alert('Ошибка: ' + (data.error || 'Не удалось удалить'));
                        }
                    } catch (e) {
                        console.error('deleteSelectedProfiles error:', e);
                        alert('Ошибка сети');
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
                // Поддерживает несколько ID через запятую: "123, 456, 789"
                async submitProfilePayment() {
                    if (!this.profilePayment.profileId || !this.profilePayment.days) {
                        alert('Введите ID анкеты и выберите период');
                        return;
                    }

                    // Разбираем ID через запятую
                    const profileIds = this.profilePayment.profileId
                        .split(/[,\s]+/)
                        .map(id => id.trim())
                        .filter(id => id.length > 0);

                    if (profileIds.length === 0) {
                        alert('Введите хотя бы один ID анкеты');
                        return;
                    }

                    // Подтверждение для нескольких анкет
                    if (profileIds.length > 1) {
                        if (!confirm(`Оплатить ${profileIds.length} анкет на ${this.profilePayment.days} дней?`)) {
                            return;
                        }
                    }

                    try {
                        let successCount = 0;
                        let errors = [];

                        for (const profileId of profileIds) {
                            const res = await fetch(`${API_BASE}/api/billing/pay-profile`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    profileId: profileId,
                                    days: this.profilePayment.days,
                                    byUserId: this.currentUser.id,
                                    note: this.profilePayment.note || null
                                })
                            });
                            const data = await res.json();
                            if (data.success) {
                                successCount++;
                            } else {
                                errors.push(`${profileId}: ${data.error || 'Ошибка'}`);
                            }
                        }

                        // Результат
                        if (profileIds.length === 1) {
                            if (successCount === 1) {
                                alert(`Анкета ${profileIds[0]} оплачена на ${this.profilePayment.days} дней`);
                            } else {
                                alert(errors[0] || 'Ошибка оплаты');
                            }
                        } else {
                            let msg = `Оплачено: ${successCount} из ${profileIds.length} анкет`;
                            if (errors.length > 0) {
                                msg += `\n\nОшибки:\n${errors.join('\n')}`;
                            }
                            alert(msg);
                        }

                        if (successCount > 0) {
                            this.profilePayment = { profileId: '', days: 30, note: '' };
                            await this.loadFinanceData();
                            await this.loadAccounts();
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

        // Компонент Клиенты (CRM)
        function clientsComponent() {
            return {
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
                showClientMessagesModal: false,
                selectedClient: null,
                clientMessages: [],

                async loadClientsData() {
                    await Promise.all([
                        this.loadClients(),
                        this.loadClientsStats()
                    ]);
                },

                async loadClients() {
                    try {
                        const params = new URLSearchParams({
                            type: this.clientsFilter.type,
                            page: this.clientsPagination.page,
                            limit: this.clientsPagination.limit,
                            sortBy: this.clientsFilter.sortBy,
                            sortDir: this.clientsFilter.sortDir
                        });

                        if (this.clientsFilter.dateFrom) params.append('dateFrom', this.clientsFilter.dateFrom);
                        if (this.clientsFilter.dateTo) params.append('dateTo', this.clientsFilter.dateTo);
                        if (this.clientsFilter.search) params.append('search', this.clientsFilter.search);

                        const res = await fetch(`/api/clients?${params}`);
                        const data = await res.json();

                        if (data.success) {
                            this.clients = data.clients;
                            this.clientsPagination = {
                                ...this.clientsPagination,
                                ...data.pagination
                            };
                        }
                    } catch (error) {
                        console.error('Error loading clients:', error);
                    }
                },

                async loadClientsStats() {
                    try {
                        const params = new URLSearchParams();
                        if (this.clientsFilter.dateFrom) params.append('dateFrom', this.clientsFilter.dateFrom);
                        if (this.clientsFilter.dateTo) params.append('dateTo', this.clientsFilter.dateTo);

                        const res = await fetch(`/api/clients/stats?${params}`);
                        const data = await res.json();

                        if (data.success) {
                            this.clientsStats = data.stats;
                        }
                    } catch (error) {
                        console.error('Error loading clients stats:', error);
                    }
                },

                async showClientMessages(client) {
                    this.selectedClient = client;
                    this.clientMessages = [];
                    this.showClientMessagesModal = true;

                    try {
                        const params = new URLSearchParams({
                            type: client.type,
                            limit: 100
                        });

                        const res = await fetch(`/api/clients/${client.manId}/messages?${params}`);
                        const data = await res.json();

                        if (data.success) {
                            this.clientMessages = data.messages;
                        }
                    } catch (error) {
                        console.error('Error loading client messages:', error);
                    }
                },

                exportClientsCSV() {
                    const params = new URLSearchParams({
                        type: this.clientsFilter.type
                    });

                    if (this.clientsFilter.dateFrom) params.append('dateFrom', this.clientsFilter.dateFrom);
                    if (this.clientsFilter.dateTo) params.append('dateTo', this.clientsFilter.dateTo);

                    window.location.href = `/api/clients/export?${params}`;
                },

                formatDateTime(date) {
                    if (!date) return '-';
                    return new Date(date).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            };
        }

        document.addEventListener('DOMContentLoaded', () => {
            const elements = document.querySelectorAll('.fade-in');
            elements.forEach((el, i) => {
                el.style.animationDelay = `${i * 0.1}s`;
            });
        });
