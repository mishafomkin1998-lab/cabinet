/**
 * Dashboard Stats Component - Статистика
 *
 * @module dashboard/components/stats
 * @description Функции загрузки и обработки статистики
 */

const StatsComponent = {
    /**
     * Построить URL с фильтрами для запроса статистики
     * @param {string} baseUrl - Базовый URL
     * @param {Object} state - Состояние дашборда
     * @returns {string} URL с параметрами
     */
    buildStatsUrl(baseUrl, state) {
        const params = new URLSearchParams();
        params.append('userId', state.currentUser.id);
        params.append('role', state.currentUser.role);

        if (state.statsFilter.dateFrom) {
            params.append('dateFrom', state.statsFilter.dateFrom);
        }
        if (state.statsFilter.dateTo) {
            params.append('dateTo', state.statsFilter.dateTo);
        }
        if (state.statsFilter.admin && state.currentUser.role === 'director') {
            params.append('filterAdminId', state.statsFilter.admin);
        }
        if (state.statsFilter.translator) {
            params.append('filterTranslatorId', state.statsFilter.translator);
        }

        return `${baseUrl}?${params.toString()}`;
    },

    /**
     * Загрузить основную статистику дашборда
     * @param {Object} context - Контекст Alpine.js (this)
     * @param {boolean} withFilters - Применять ли фильтры
     */
    async loadDashboardStats(context, withFilters = false) {
        try {
            let url = `${API_BASE}/api/dashboard?userId=${context.currentUser.id}&role=${context.currentUser.role}`;

            if (withFilters) {
                if (context.statsFilter.dateFrom) url += `&dateFrom=${context.statsFilter.dateFrom}`;
                if (context.statsFilter.dateTo) url += `&dateTo=${context.statsFilter.dateTo}`;
                if (context.statsFilter.admin && context.currentUser.role === 'director') {
                    url += `&filterAdminId=${context.statsFilter.admin}`;
                }
                if (context.statsFilter.translator) {
                    url += `&filterTranslatorId=${context.statsFilter.translator}`;
                }
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                // Прямое присваивание как в оригинале
                context.stats = data.dashboard;
            }
        } catch (e) {
            console.error('loadDashboardStats error:', e);
        }
    },

    /**
     * Загрузить почасовую активность
     * @param {Object} context - Контекст Alpine.js
     */
    async loadHourlyActivity(context) {
        try {
            let url = `${API_BASE}/api/stats/hourly-activity?userId=${context.currentUser.id}&role=${context.currentUser.role}`;

            if (context.statsFilter.dateFrom) url += `&dateFrom=${context.statsFilter.dateFrom}`;
            if (context.statsFilter.dateTo) url += `&dateTo=${context.statsFilter.dateTo}`;
            if (context.statsFilter.admin && context.currentUser.role === 'director') {
                url += `&filterAdminId=${context.statsFilter.admin}`;
            }
            if (context.statsFilter.translator) {
                url += `&filterTranslatorId=${context.statsFilter.translator}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                context.hourlyActivity = data.hourlyData || [];
            }
        } catch (e) {
            console.error('loadHourlyActivity error:', e);
        }
    },

    /**
     * Загрузить последние ответы
     * @param {Object} context - Контекст Alpine.js
     */
    async loadLastResponses(context) {
        try {
            let url = `${API_BASE}/api/stats/last-responses?userId=${context.currentUser.id}&role=${context.currentUser.role}&limit=50`;

            if (context.statsFilter.dateFrom) url += `&dateFrom=${context.statsFilter.dateFrom}`;
            if (context.statsFilter.dateTo) url += `&dateTo=${context.statsFilter.dateTo}`;
            if (context.statsFilter.admin && context.currentUser.role === 'director') {
                url += `&filterAdminId=${context.statsFilter.admin}`;
            }
            if (context.statsFilter.translator) {
                url += `&filterTranslatorId=${context.statsFilter.translator}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                context.lastResponses = data.responses || [];
            }
        } catch (e) {
            console.error('loadLastResponses error:', e);
        }
    },

    /**
     * Загрузить сгруппированные отправленные письма
     * @param {Object} context - Контекст Alpine.js
     */
    async loadSentLettersGrouped(context) {
        try {
            let url = `${API_BASE}/api/activity/sent-letters-grouped?userId=${context.currentUser.id}&role=${context.currentUser.role}`;

            if (context.statsFilter.dateFrom) url += `&dateFrom=${context.statsFilter.dateFrom}`;
            if (context.statsFilter.dateTo) url += `&dateTo=${context.statsFilter.dateTo}`;
            if (context.statsFilter.admin && context.currentUser.role === 'director') {
                url += `&filterAdminId=${context.statsFilter.admin}`;
            }
            if (context.statsFilter.translator) {
                url += `&filterTranslatorId=${context.statsFilter.translator}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                context.sentLettersGrouped = data.letters || [];
            }
        } catch (e) {
            console.error('loadSentLettersGrouped error:', e);
        }
    },

    /**
     * Загрузить использование AI
     * @param {Object} context - Контекст Alpine.js
     */
    async loadAiUsage(context) {
        try {
            let url = `${API_BASE}/api/stats/ai-usage?userId=${context.currentUser.id}&role=${context.currentUser.role}`;

            if (context.statsFilter.dateFrom) url += `&dateFrom=${context.statsFilter.dateFrom}`;
            if (context.statsFilter.dateTo) url += `&dateTo=${context.statsFilter.dateTo}`;
            if (context.statsFilter.admin && context.currentUser.role === 'director') {
                url += `&filterAdminId=${context.statsFilter.admin}`;
            }
            if (context.statsFilter.translator) {
                url += `&filterTranslatorId=${context.statsFilter.translator}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                context.aiUsageData = data.aiUsage || [];
            }
        } catch (e) {
            console.error('loadAiUsage error:', e);
        }
    },

    /**
     * Загрузить последнюю активность
     * @param {Object} context - Контекст Alpine.js
     */
    async loadRecentActivity(context) {
        try {
            const url = `${API_BASE}/api/activity/recent?userId=${context.currentUser.id}&role=${context.currentUser.role}&limit=50`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                context.recentActivity = data.activity || [];
            }
        } catch (e) {
            console.error('loadRecentActivity error:', e);
        }
    },

    /**
     * Применить фильтры статистики
     * @param {Object} context - Контекст Alpine.js
     */
    async applyStatsFilter(context) {
        await Promise.all([
            this.loadDashboardStats(context, true),
            this.loadSentLettersGrouped(context),
            this.loadLastResponses(context),
            this.loadAiUsage(context),
            this.loadHourlyActivity(context)
        ]);
    },

    /**
     * Установить быстрый диапазон дат
     * @param {Object} context - Контекст Alpine.js
     * @param {string} range - Тип диапазона (today, week, month)
     */
    setQuickDateRange(context, range) {
        const { dateFrom, dateTo } = DashboardUtils.getQuickDateRange(range);

        context.statsFilter.quickRange = range;
        context.statsFilter.dateFrom = dateFrom;
        context.statsFilter.dateTo = dateTo;

        // Обновить Flatpickr если есть
        if (context.statsDatePicker) {
            context.statsDatePicker.setDate([new Date(dateFrom), new Date(dateTo)], false);
        }

        this.applyStatsFilter(context);
    },

    /**
     * Получить текст диапазона дат
     * @param {Object} context - Контекст Alpine.js
     * @returns {string} Текст диапазона
     */
    getDateRangeText(context) {
        if (!context.statsFilter.dateFrom || !context.statsFilter.dateTo) {
            return context.t?.('common.selectPeriod') || 'Выбрать период';
        }
        const from = new Date(context.statsFilter.dateFrom);
        const to = new Date(context.statsFilter.dateTo);
        const locale = DashboardUtils.getDateLocale(context.language);
        const formatShort = (d) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

        if (context.statsFilter.dateFrom === context.statsFilter.dateTo) {
            return formatShort(from);
        }
        return `${formatShort(from)} - ${formatShort(to)}`;
    },

    /**
     * Выбрать дату в календаре
     * @param {Object} context - Контекст Alpine.js
     * @param {string} date - Дата в формате YYYY-MM-DD
     */
    selectCalendarDate(context, date) {
        if (context.calendarSelectingStart || !context.statsFilter.dateFrom) {
            context.statsFilter.dateFrom = date;
            context.statsFilter.dateTo = date;
            context.calendarSelectingStart = false;
        } else {
            if (date < context.statsFilter.dateFrom) {
                context.statsFilter.dateTo = context.statsFilter.dateFrom;
                context.statsFilter.dateFrom = date;
            } else {
                context.statsFilter.dateTo = date;
            }
            context.calendarSelectingStart = true;
            context.statsFilter.quickRange = '';
            context.showStatsCalendar = false;
            this.applyStatsFilter(context);
        }
    },

    /**
     * Получить заголовок функции мониторинга
     * @param {string} func - Тип функции
     * @returns {string} Заголовок
     */
    getMonitoringTitle(func) {
        const titles = {
            'lastResponses': 'Последние ответы (письма/чаты)',
            'sentLetters': 'Отправленные письма',
            'favoriteMailing': 'Любимая рассылка',
            'workTime': 'Время реальной работы',
            'aiUsage': 'Использование ИИ'
        };
        return titles[func] || func;
    },

    /**
     * Получить уровень активности для часа
     * @param {Array} hourlyActivity - Данные активности
     * @param {number} hour - Час
     * @returns {number} Уровень (0-1)
     */
    getActivityLevel(hourlyActivity, hour) {
        return DashboardUtils.getActivityLevel(hourlyActivity, hour);
    },

    /**
     * Получить цвет активности
     * @param {number} level - Уровень активности
     * @returns {string} CSS классы
     */
    getActivityColor(level) {
        return DashboardUtils.getActivityColor(level);
    }
};

// Экспорт
if (typeof window !== 'undefined') {
    window.StatsComponent = StatsComponent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatsComponent;
}
