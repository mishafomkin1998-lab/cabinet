/**
 * Dashboard Index - Главный модуль дашборда
 *
 * @module dashboard/index
 * @description Точка входа, объединение всех компонентов в Alpine.js data
 */

/**
 * Главная функция дашборда для Alpine.js
 * Объединяет все компоненты и методы
 * @returns {Object} Alpine.js data object
 */
function dashboard() {
    // Получаем начальное состояние
    const state = DashboardState.getInitialState();

    return {
        // =====================================================
        // Состояние
        // =====================================================
        ...state,

        // =====================================================
        // Вычисляемые свойства (getters)
        // =====================================================

        get filteredAccounts() {
            return DashboardState.computed.getFilteredAccounts(this);
        },

        get combinedFinanceHistory() {
            return DashboardState.computed.getCombinedFinanceHistory(this);
        },

        get financeAdminsTotalBalance() {
            return DashboardState.computed.getFinanceAdminsTotalBalance(this);
        },

        // =====================================================
        // Локализация
        // =====================================================

        t(key) {
            if (typeof LOCALES === 'undefined') return key;
            const keys = key.split('.');
            let value = LOCALES[this.language];
            for (const k of keys) {
                if (value && value[k] !== undefined) {
                    value = value[k];
                } else {
                    value = LOCALES['ru'];
                    for (const k2 of keys) {
                        if (value && value[k2] !== undefined) {
                            value = value[k2];
                        } else {
                            return key;
                        }
                    }
                    return value;
                }
            }
            return value;
        },

        // =====================================================
        // Темная тема
        // =====================================================

        toggleDarkMode() {
            this.darkMode = !this.darkMode;
            localStorage.setItem('novaDarkMode', this.darkMode);
        },

        // =====================================================
        // Навигация
        // =====================================================

        setActiveMenu(menu) {
            this.activeMenu = menu;
            this.activeSubmenu = 'general';
            localStorage.setItem('dashboard_activeMenu', menu);

            if (menu === 'control') {
                this.loadBotsStatus();
                this.refreshAllLogs();
            }
        },

        setActiveSubmenu(submenu) {
            this.activeSubmenu = submenu;
        },

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

        // =====================================================
        // Инициализация
        // =====================================================

        async init() {
            // Проверка авторизации
            if (!this.currentUser) {
                window.location.href = 'login.html';
                return;
            }

            // Инициализация настроек
            SettingsComponent.initSettings(this);

            // Устанавливаем период по умолчанию
            this.setDefaultDateRange();

            // Инициализация Flatpickr
            this.$nextTick(() => this.initFlatpickr());

            // Загрузка начальных данных
            await this.loadAllData();

            // Запуск периодического обновления
            this.startAutoRefresh();
        },

        setDefaultDateRange() {
            const defaultRange = DashboardUtils.getDefaultDateRange();
            this.statsFilter.dateFrom = defaultRange.dateFrom;
            this.statsFilter.dateTo = defaultRange.dateTo;
            this.statsFilter.quickRange = 'month';

            this.historyFilter.dateFrom = defaultRange.dateFrom;
            this.historyFilter.dateTo = defaultRange.dateTo;
        },

        initFlatpickr() {
            const self = this;
            const config = {
                mode: 'range',
                dateFormat: 'Y-m-d',
                locale: 'ru',
                defaultDate: [this.statsFilter.dateFrom, this.statsFilter.dateTo],
                onChange: function(selectedDates, dateStr) {
                    if (selectedDates.length === 2) {
                        const formatDate = (d) => DashboardUtils.formatDateToISO(d);
                        self.statsFilter.dateFrom = formatDate(selectedDates[0]);
                        self.statsFilter.dateTo = formatDate(selectedDates[1]);
                        self.statsFilter.quickRange = '';
                        self.loadDashboardStats();
                    }
                }
            };

            if (typeof flatpickr !== 'undefined') {
                this.statsDatePicker = flatpickr('#statsDatePicker', config);

                this.historyDatePicker = flatpickr('#historyDatePicker', {
                    ...config,
                    defaultDate: [this.historyFilter.dateFrom, this.historyFilter.dateTo],
                    onChange: function(selectedDates) {
                        if (selectedDates.length === 2) {
                            const formatDate = (d) => DashboardUtils.formatDateToISO(d);
                            self.historyFilter.dateFrom = formatDate(selectedDates[0]);
                            self.historyFilter.dateTo = formatDate(selectedDates[1]);
                            self.loadProfileHistory();
                        }
                    }
                });
            }
        },

        async loadAllData() {
            this.loading = true;
            this.error = null;
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
                    this.loadProfileHistory(),
                    this.loadSavedPrompt(),
                    this.loadUserBalance(),
                    this.loadPricing(),
                    this.loadControlSettings()
                ];

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

        async refreshAllStats() {
            this.loading = true;
            try {
                await Promise.all([
                    this.loadDashboardStats(true),
                    this.loadSentLettersGrouped(),
                    this.loadLastResponses(),
                    this.loadAiUsage(),
                    this.loadHourlyActivity()
                ]);
            } catch (e) {
                console.error('refreshAllStats error:', e);
            }
            this.loading = false;
        },

        startAutoRefresh() {
            // Обновление каждые 30 секунд
            setInterval(() => {
                this.loadDashboardStats(true);
                this.loadBotsStatus();
            }, 30000);

            // Обновление аккаунтов каждые 60 секунд
            setInterval(() => {
                this.loadAccounts();
            }, 60000);
        },

        // =====================================================
        // Календарь
        // =====================================================

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

        applyDateFilter() {
            this.applyStatsFilter();
        },

        // =====================================================
        // Статистика
        // =====================================================

        async loadDashboardStats(withFilters = false) {
            await StatsComponent.loadDashboardStats(this, withFilters);
        },

        async loadHourlyActivity() {
            await StatsComponent.loadHourlyActivity(this);
        },

        async loadLastResponses() {
            await StatsComponent.loadLastResponses(this);
        },

        async loadSentLettersGrouped() {
            await StatsComponent.loadSentLettersGrouped(this);
        },

        async loadAiUsage() {
            await StatsComponent.loadAiUsage(this);
        },

        async loadRecentActivity() {
            await StatsComponent.loadRecentActivity(this);
        },

        applyStatsFilter() {
            StatsComponent.applyStatsFilter(this);
        },

        setQuickDateRange(range) {
            StatsComponent.setQuickDateRange(this, range);
        },

        getDateRangeText() {
            return StatsComponent.getDateRangeText(this);
        },

        selectCalendarDate(date) {
            StatsComponent.selectCalendarDate(this, date);
        },

        setMonitoringFunction(func) {
            this.monitoringFunction = func;
        },

        getMonitoringTitle() {
            return StatsComponent.getMonitoringTitle(this.monitoringFunction);
        },

        getActivityLevel(hour) {
            return StatsComponent.getActivityLevel(this.hourlyActivity, hour);
        },

        getActivityColor(hour) {
            const level = this.getActivityLevel(hour);
            return StatsComponent.getActivityColor(level);
        },

        // =====================================================
        // Аккаунты (Анкеты)
        // =====================================================

        async loadAccounts() {
            await ProfilesComponent.loadAccounts(this);
        },

        async toggleAccountAccess(account) {
            await ProfilesComponent.toggleAccountAccess(this, account);
        },

        async deleteAccount(account) {
            await ProfilesComponent.deleteAccount(this, account);
        },

        saveAccounts() {
            ProfilesComponent.saveAccounts(this);
        },

        async assignSelectedToAdmin(adminId) {
            await ProfilesComponent.assignSelectedToAdmin(this, adminId);
        },

        async assignSelectedToTranslator(translatorId) {
            await ProfilesComponent.assignSelectedToTranslator(this, translatorId);
        },

        toggleProfileSelection(profileId, checked) {
            ProfilesComponent.toggleProfileSelection(this, profileId, checked);
        },

        toggleSelectAllProfiles(checked) {
            ProfilesComponent.toggleSelectAllProfiles(this, checked);
        },

        sortAccounts(field) {
            ProfilesComponent.sortAccounts(this, field);
        },

        async loadProfileHistory() {
            await ProfilesComponent.loadProfileHistory(this);
        },

        setHistoryQuickRange(range) {
            ProfilesComponent.setHistoryQuickRange(this, range);
        },

        getHistoryDateRangeText() {
            return ProfilesComponent.getHistoryDateRangeText(this);
        },

        async toggleProfileMailing(profile) {
            await ProfilesComponent.toggleProfileMailing(this, profile);
        },

        async deleteSelectedProfiles() {
            if (this.selectedProfileIds.length === 0) return;
            if (!confirm(`Удалить ${this.selectedProfileIds.length} выбранных анкет?`)) return;

            let deletedCount = 0;
            for (const profileId of this.selectedProfileIds) {
                try {
                    const params = new URLSearchParams({
                        role: this.currentUser.role,
                        userId: this.currentUser.id,
                        userName: this.currentUser.username
                    });
                    const res = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(profileId)}?${params}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const data = await res.json();
                    if (data.success) deletedCount++;
                } catch (e) {
                    console.error('Error deleting profile:', profileId, e);
                }
            }

            alert(`Удалено ${deletedCount} из ${this.selectedProfileIds.length} анкет`);
            this.selectedProfileIds = [];
            await this.loadAccounts();
        },

        getProfileIdsByNote(note) {
            return this.accounts
                .filter(acc => acc.note === note)
                .map(acc => acc.id);
        },

        selectProfilesByNote() {
            if (!this.selectedProfileNote) return;
            const ids = this.getProfileIdsByNote(this.selectedProfileNote);
            if (ids.length === 0) {
                alert('Нет анкет с таким комментарием');
                return;
            }
            ids.forEach(id => {
                if (!this.selectedProfileIds.includes(id)) {
                    this.selectedProfileIds.push(id);
                }
            });
        },

        // =====================================================
        // Команда
        // =====================================================

        async loadTeam() {
            await TeamComponent.loadTeam(this);
        },

        async editAdmin(admin) {
            await TeamComponent.editAdmin(this, admin);
        },

        async saveAdmin() {
            await TeamComponent.saveAdmin(this);
        },

        async deleteAdmin(admin) {
            await TeamComponent.deleteAdmin(this, admin);
        },

        async toggleAiEnabled(user) {
            await TeamComponent.toggleAiEnabled(this, user);
        },

        async toggleIsRestricted(admin) {
            await TeamComponent.toggleIsRestricted(this, admin);
        },

        openAddTranslatorModal() {
            TeamComponent.openAddTranslatorModal(this);
        },

        editTranslator(translator) {
            TeamComponent.editTranslator(this, translator);
        },

        async saveTranslator() {
            await TeamComponent.saveTranslator(this);
        },

        async deleteTranslator(translator) {
            await TeamComponent.deleteTranslator(this, translator);
        },

        assignAccountsToAdmin(admin) {
            TeamComponent.assignAccountsToAdmin(this, admin);
        },

        async assignAccountsToAdminConfirm() {
            await TeamComponent.assignAccountsToAdminConfirm(this);
        },

        async openTranslatorProfilesModal(translator) {
            await TeamComponent.openTranslatorProfilesModal(this, translator);
        },

        toggleTranslatorProfile(profileId) {
            TeamComponent.toggleTranslatorProfile(this, profileId);
        },

        async saveTranslatorProfiles() {
            await TeamComponent.saveTranslatorProfiles(this);
        },

        viewAdminDetails(admin) {
            this.selectedAdmin = admin;
            this.showViewAdminModal = true;
        },

        // =====================================================
        // Биллинг
        // =====================================================

        async loadUserBalance() {
            await BillingComponent.loadUserBalance(this);
        },

        async loadPricing() {
            await BillingComponent.loadPricing(this);
        },

        openExtendModal(account) {
            BillingComponent.openExtendModal(this, account);
        },

        async extendProfile() {
            await BillingComponent.extendProfile(this);
        },

        async startTrial(account) {
            await BillingComponent.startTrial(this, account);
        },

        async paySelectedProfiles() {
            await BillingComponent.paySelectedProfiles(this);
        },

        openTopupModal(userId) {
            BillingComponent.openTopupModal(this, userId);
        },

        async topupBalance() {
            await BillingComponent.topupBalance(this);
        },

        async loadFinanceData() {
            await BillingComponent.loadFinanceData(this);
        },

        async submitFinanceTopup() {
            await BillingComponent.submitFinanceTopup(this);
        },

        async submitProfilePayment() {
            await BillingComponent.submitProfilePayment(this);
        },

        async removeProfilePayment() {
            await BillingComponent.removeProfilePayment(this);
        },

        // =====================================================
        // Боты
        // =====================================================

        async loadBotsStatus() {
            await BotsComponent.loadBotsStatus(this);
        },

        async toggleBotStatus(bot) {
            await BotsComponent.toggleBotStatus(this, bot);
        },

        async saveBotName(bot) {
            await BotsComponent.saveBotName(this, bot);
        },

        async syncPromptWithBots() {
            await BotsComponent.syncPromptWithBots(this);
        },

        async loadSavedPrompt() {
            await BotsComponent.loadSavedPrompt(this);
        },

        async loadControlSettings() {
            await BotsComponent.loadControlSettings(this);
        },

        async toggleMailingEnabled() {
            await BotsComponent.toggleMailingEnabled(this);
        },

        async toggleStopSpam() {
            await BotsComponent.toggleStopSpam(this);
        },

        async saveControlSettings() {
            await BotsComponent.saveControlSettings(this);
        },

        async activatePanicMode() {
            await BotsComponent.activatePanicMode(this);
        },

        async loadBotLogs(reset = true) {
            await BotsComponent.loadBotLogs(this, reset);
        },

        async loadMoreBotLogs() {
            await BotsComponent.loadMoreBotLogs(this);
        },

        async loadErrorLogs(reset = true) {
            await BotsComponent.loadErrorLogs(this, reset);
        },

        async loadMoreErrors() {
            await BotsComponent.loadMoreErrors(this);
        },

        async refreshAllLogs() {
            await BotsComponent.refreshAllLogs(this);
        },

        getTotalMailToday() {
            return BotsComponent.getTotalMailToday(this);
        },

        getTotalChatToday() {
            return BotsComponent.getTotalChatToday(this);
        },

        getOnlineProfiles() {
            return BotsComponent.getOnlineProfiles(this);
        },

        async refreshProfileStats() {
            await BotsComponent.refreshProfileStats(this);
        },

        onAdminFilterChange() {
            BotsComponent.onAdminFilterChange(this);
        },

        getFilteredProfiles() {
            return DashboardState.computed.getFilteredMailingProfiles(this);
        },

        getTranslatorsForAdmin() {
            return DashboardState.computed.getTranslatorsForAdmin(this);
        },

        // =====================================================
        // Настройки
        // =====================================================

        resetUserSettings() {
            SettingsComponent.resetUserSettings(this);
        },

        async saveUserSettings() {
            await SettingsComponent.saveUserSettings(this);
        },

        logout() {
            SettingsComponent.logout(this);
        },

        async loadFavoriteTemplates() {
            await SettingsComponent.loadFavoriteTemplates(this);
        },

        changeLanguage(lang) {
            SettingsComponent.changeLanguage(this, lang);
        },

        toggleSidebar() {
            SettingsComponent.toggleSidebar(this);
        },

        // =====================================================
        // Утилиты форматирования
        // =====================================================

        formatDateTime(date) {
            return DashboardUtils.formatDateTime(date, this.language);
        },

        formatActivityTime(timestamp) {
            const translations = this.t?.('time') || {};
            return DashboardUtils.formatRelativeTime(timestamp, translations, this.language);
        },

        formatBotLogTime(timestamp) {
            return DashboardUtils.formatBotLogTime(timestamp);
        },

        formatErrorTime(timestamp) {
            return DashboardUtils.formatErrorTime(timestamp);
        },

        formatUptime(seconds) {
            return DashboardUtils.formatUptime(seconds);
        },

        formatMode(mode) {
            return DashboardUtils.formatMode(mode);
        },

        formatBotName(machineId) {
            return DashboardUtils.formatBotName(machineId);
        },

        formatHistoryTime(timestamp) {
            return DashboardUtils.formatHistoryTime(timestamp);
        },

        formatDate(date, options = {}) {
            return DashboardUtils.formatDate(date, this.language, options);
        },

        // =====================================================
        // CSS классы
        // =====================================================

        getStatusClass(status) {
            return DashboardUtils.getStatusClass(status);
        },

        getStatusText(status) {
            const statuses = this.t?.('profiles.profileStatuses') || {};
            return statuses[status] || status;
        },

        getAdminColor(adminId, adminName) {
            return DashboardUtils.getAdminColor(adminId, adminName);
        },

        getPaymentStatusClass(account) {
            return DashboardUtils.getPaymentStatusClass(account);
        },

        getPaymentStatusText(account) {
            return DashboardUtils.getPaymentStatusText(account);
        },

        getProfileActionClass(actionType) {
            return DashboardUtils.getProfileActionClass(actionType);
        },

        getProfileActionLabel(actionType) {
            const actions = this.t?.('history.actions') || {};
            return actions[actionType] || actionType;
        },

        // =====================================================
        // Экспорт
        // =====================================================

        exportStats() {
            DashboardUtils.exportStats(this.stats, this.statsFilter);
        },

        exportFavoriteTemplates() {
            DashboardUtils.exportFavoriteTemplates(this.favoriteTemplates);
        },

        exportLastResponses() {
            const responses = this.recentActivity.filter(a =>
                (a.action_type === 'chat' || a.action_type === 'letter') && a.is_reply
            );
            DashboardUtils.exportLastResponses(responses);
        },

        exportSentLettersGrouped() {
            DashboardUtils.exportSentLettersGrouped(this.sentLettersGrouped, (d) => this.formatDateTime(d));
        },

        exportAiUsage() {
            const aiActivities = this.recentActivity.filter(a => a.used_ai);
            DashboardUtils.exportAiUsage(aiActivities);
        },

        // =====================================================
        // Календарь
        // =====================================================

        getCalendarMonthName() {
            const months = this.t?.('calendar.months') || [
                'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
            ];
            return `${months[this.calendarMonth]} ${this.calendarYear}`;
        },

        getCalendarDays() {
            return DashboardUtils.getCalendarDays(this.calendarYear, this.calendarMonth);
        },

        isDateSelected(date) {
            return date === this.statsFilter.dateFrom || date === this.statsFilter.dateTo;
        },

        isDateInRange(date) {
            if (!this.statsFilter.dateFrom || !this.statsFilter.dateTo) return false;
            return date > this.statsFilter.dateFrom && date < this.statsFilter.dateTo;
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

        // =====================================================
        // UI Helpers
        // =====================================================

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
        }
    };
}

/**
 * Компонент Клиенты (CRM)
 * @returns {Object} Alpine.js data object
 */
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
            return DashboardUtils.formatDateTime(date);
        }
    };
}

// Вспомогательная функция
function toggleActive(element) {
    element.classList.toggle('active');
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    const elements = document.querySelectorAll('.fade-in');
    elements.forEach((el, i) => {
        el.style.animationDelay = `${i * 0.1}s`;
    });
});

// Экспорт
if (typeof window !== 'undefined') {
    window.dashboard = dashboard;
    window.clientsComponent = clientsComponent;
    window.toggleActive = toggleActive;
}
