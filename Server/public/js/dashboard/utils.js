/**
 * Dashboard Utils - Общие утилиты и хелперы
 *
 * @module dashboard/utils
 * @description Форматирование дат, времени, экспорт данных и прочие утилиты
 */

const DashboardUtils = {
    /**
     * Форматирование даты в строку YYYY-MM-DD
     * @param {Date} date - Дата для форматирования
     * @returns {string} Строка в формате YYYY-MM-DD
     */
    formatDateToISO(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Получить локаль для дат на основе языка
     * @param {string} lang - Код языка (ru, uk, en)
     * @returns {string} Локаль для toLocaleString
     */
    getDateLocale(lang) {
        const locales = {
            'ru': 'ru-RU',
            'uk': 'uk-UA',
            'en': 'en-US'
        };
        return locales[lang] || 'ru-RU';
    },

    /**
     * Форматирование даты для отображения
     * @param {string|Date} date - Дата
     * @param {string} lang - Язык
     * @param {Object} options - Опции форматирования
     * @returns {string} Отформатированная дата
     */
    formatDate(date, lang = 'ru', options = {}) {
        if (!date) return '-';
        const locale = this.getDateLocale(lang);
        return new Date(date).toLocaleDateString(locale, options);
    },

    /**
     * Форматирование даты и времени
     * @param {string|Date} date - Дата
     * @param {string} lang - Язык
     * @returns {string} Отформатированная дата и время
     */
    formatDateTime(date, lang = 'ru') {
        if (!date) return '-';
        const locale = this.getDateLocale(lang);
        return new Date(date).toLocaleString(locale, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Форматирование времени относительно текущего момента
     * @param {string|Date} timestamp - Временная метка
     * @param {Object} translations - Объект с переводами
     * @param {string} lang - Язык
     * @returns {string} Относительное время
     */
    formatRelativeTime(timestamp, translations = {}, lang = 'ru') {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const locale = this.getDateLocale(lang);

        if (diffMins < 1) return translations.justNow || 'только что';
        if (diffMins < 60) return `${diffMins} ${translations.minutesAgo || 'мин. назад'}`;
        if (diffHours < 24) return `${diffHours} ${translations.hoursAgo || 'ч. назад'}`;
        return date.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    },

    /**
     * Форматирование времени лога бота
     * @param {string|Date} timestamp - Временная метка
     * @returns {string} Отформатированное время
     */
    formatBotLogTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        if (isToday) {
            return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    },

    /**
     * Форматирование времени ошибки (аналогично formatBotLogTime)
     * @param {string|Date} timestamp - Временная метка
     * @returns {string} Отформатированное время
     */
    formatErrorTime(timestamp) {
        return this.formatBotLogTime(timestamp);
    },

    /**
     * Форматирование времени истории
     * @param {string|Date} timestamp - Временная метка
     * @returns {string} Отформатированное время
     */
    formatHistoryTime(timestamp) {
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

    /**
     * Форматирование uptime из секунд
     * @param {number} seconds - Секунды
     * @returns {string} Отформатированное время
     */
    formatUptime(seconds) {
        if (!seconds || seconds <= 0) return '-';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}ч ${minutes}м`;
        }
        return `${minutes}м`;
    },

    /**
     * Форматирование режима работы
     * @param {string} mode - Режим (mail/chat)
     * @returns {string} Отформатированный режим
     */
    formatMode(mode) {
        return mode === 'mail' ? 'Письма' : (mode === 'chat' ? 'Чаты' : mode);
    },

    /**
     * Форматирование имени бота из machineId
     * @param {string} machineId - ID машины
     * @returns {string} Отформатированное имя
     */
    formatBotName(machineId) {
        if (!machineId) return 'Неизвестный бот';
        const parts = machineId.split('_');
        if (parts.length >= 3) {
            return `Бот ${parts[2].substring(0, 6)}`;
        }
        return `Бот ${machineId.substring(0, 10)}`;
    },

    /**
     * Получение периода по умолчанию (текущий месяц)
     * @returns {Object} { dateFrom, dateTo }
     */
    getDefaultDateRange() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
            dateFrom: this.formatDateToISO(firstDay),
            dateTo: this.formatDateToISO(now)
        };
    },

    /**
     * Получение диапазона дат по типу
     * @param {string} range - Тип диапазона (today, week, month)
     * @returns {Object} { dateFrom, dateTo }
     */
    getQuickDateRange(range) {
        const now = new Date();
        let dateFrom, dateTo;

        if (range === 'today') {
            dateFrom = new Date(now);
            dateTo = new Date(now);
        } else if (range === 'week') {
            dateFrom = new Date(now);
            dateFrom.setDate(now.getDate() - 7);
            dateTo = new Date(now);
        } else if (range === 'month') {
            dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
            dateTo = new Date(now);
        }

        return {
            dateFrom: this.formatDateToISO(dateFrom),
            dateTo: this.formatDateToISO(dateTo)
        };
    },

    /**
     * Генерация дней для календаря
     * @param {number} year - Год
     * @param {number} month - Месяц (0-11)
     * @returns {Array} Массив дней
     */
    getCalendarDays(year, month) {
        const days = [];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Дни предыдущего месяца
        let startDay = firstDay.getDay() || 7;
        for (let i = startDay - 1; i > 0; i--) {
            const d = new Date(year, month, 1 - i);
            days.push({ day: d.getDate(), date: this.formatDateToISO(d), currentMonth: false });
        }

        // Дни текущего месяца
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const d = new Date(year, month, i);
            days.push({ day: i, date: this.formatDateToISO(d), currentMonth: true });
        }

        // Дни следующего месяца (до 42 дней = 6 недель)
        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            days.push({ day: i, date: this.formatDateToISO(d), currentMonth: false });
        }

        return days;
    },

    // =====================================================
    // CSS классы для статусов
    // =====================================================

    /**
     * Получить CSS класс для статуса
     * @param {string} status - Статус (online, working, offline, inactive)
     * @returns {string} CSS классы
     */
    getStatusClass(status) {
        const classes = {
            'online': 'bg-green-100 text-green-800',
            'working': 'bg-blue-100 text-blue-800',
            'offline': 'bg-gray-100 text-gray-800',
            'inactive': 'bg-red-100 text-red-800'
        };
        return classes[status] || 'bg-gray-100 text-gray-800';
    },

    /**
     * Получить CSS класс для типа действия
     * @param {string} type - Тип (outgoing, chat_msg, incoming)
     * @returns {string} CSS классы
     */
    getActionTypeClass(type) {
        const classes = {
            'outgoing': 'bg-green-100 text-green-800',
            'chat_msg': 'bg-blue-100 text-blue-800',
            'incoming': 'bg-purple-100 text-purple-800'
        };
        return classes[type] || 'bg-gray-100 text-gray-800';
    },

    /**
     * Получить метку для типа действия
     * @param {string} type - Тип
     * @returns {string} Метка
     */
    getActionTypeLabel(type) {
        const labels = {
            'outgoing': 'Письмо',
            'chat_msg': 'Чат',
            'incoming': 'Входящее'
        };
        return labels[type] || type;
    },

    /**
     * Получить CSS класс для действия в истории
     * @param {string} actionType - Тип действия
     * @returns {string} CSS классы
     */
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

    /**
     * Получить цвет для админа (стабильный по ID)
     * @param {string|number} adminId - ID админа
     * @param {string} adminName - Имя админа
     * @returns {string} CSS класс цвета
     */
    getAdminColor(adminId, adminName) {
        if (!adminId && !adminName) return 'text-gray-400';

        const colors = [
            'text-blue-600',
            'text-purple-600',
            'text-green-600',
            'text-orange-600',
            'text-pink-600',
            'text-indigo-600',
            'text-teal-600',
            'text-red-600'
        ];

        const hash = String(adminId || adminName).split('').reduce((acc, char) => {
            return char.charCodeAt(0) + ((acc << 5) - acc);
        }, 0);

        return colors[Math.abs(hash) % colors.length];
    },

    /**
     * Получить CSS класс для статуса оплаты
     * @param {Object} account - Аккаунт
     * @returns {string} CSS класс
     */
    getPaymentStatusClass(account) {
        if (account.isFree) return 'text-green-600';
        if (!account.isPaid) return 'text-red-600';
        if (account.daysLeft <= 3) return 'text-orange-500';
        return 'text-green-600';
    },

    /**
     * Получить текст статуса оплаты
     * @param {Object} account - Аккаунт
     * @returns {string} Текст статуса
     */
    getPaymentStatusText(account) {
        if (account.isFree) return 'Бесплатно';
        if (!account.isPaid) {
            if (account.trialUsed) return 'Истёк';
            return 'Не оплачено';
        }
        if (account.isTrial) return `Trial: ${account.daysLeft} дн.`;
        return `${account.daysLeft} дн.`;
    },

    // =====================================================
    // Функции экспорта
    // =====================================================

    /**
     * Скачать файл
     * @param {string} content - Содержимое файла
     * @param {string} filename - Имя файла
     * @param {string} type - MIME тип
     */
    downloadFile(content, filename, type = 'text/plain;charset=utf-8;') {
        const blob = new Blob([content], { type });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    },

    /**
     * Экспорт статистики в CSV
     * @param {Object} stats - Объект статистики
     * @param {Object} filter - Фильтры
     */
    exportStats(stats, filter) {
        const dateFrom = filter.dateFrom || 'все';
        const dateTo = filter.dateTo || 'все';

        let csv = 'Статистика Nova\n';
        csv += `Период: ${dateFrom} - ${dateTo}\n\n`;
        csv += 'Показатель,Сегодня,За месяц\n';
        csv += `Письма,${stats.today?.letters || 0},${stats.month?.letters || 0}\n`;
        csv += `Чаты,${stats.today?.chats || 0},${stats.month?.chats || 0}\n`;
        csv += `Уникальные мужчины,${stats.today?.uniqueMen || 0},${stats.month?.uniqueMen || 0}\n`;
        csv += `\nВремя работы сегодня: ${stats.metrics?.workTime || '0ч 0м'}\n`;
        csv += `Время работы за месяц: ${stats.metrics?.workTimeMonth || '0ч 0м'}\n`;

        this.downloadFile(csv, `nova_stats_${dateFrom}_${dateTo}.csv`, 'text/csv;charset=utf-8;');
    },

    /**
     * Экспорт избранных шаблонов
     * @param {Array} templates - Массив шаблонов
     */
    exportFavoriteTemplates(templates) {
        if (!templates || templates.length === 0) {
            alert('Нет избранных шаблонов для экспорта');
            return;
        }

        let content = '=== ИЗБРАННЫЕ ШАБЛОНЫ РАССЫЛКИ ===\n';
        content += `Экспорт: ${new Date().toLocaleString('ru-RU')}\n`;
        content += `Всего шаблонов: ${templates.length}\n`;
        content += '='.repeat(50) + '\n\n';

        templates.forEach((t, i) => {
            content += `--- Шаблон #${i + 1} ---\n`;
            content += `Название: ${t.templateName || 'Без названия'}\n`;
            content += `Анкета: ${t.profileLogin || t.profileId}\n`;
            content += `Дата добавления: ${new Date(t.createdAt).toLocaleString('ru-RU')}\n`;
            content += `Текст:\n${t.templateText}\n`;
            content += '\n' + '-'.repeat(40) + '\n\n';
        });

        this.downloadFile(content, `favorite_templates_${new Date().toISOString().slice(0,10)}.txt`);
    },

    /**
     * Экспорт последних ответов
     * @param {Array} responses - Массив ответов
     */
    exportLastResponses(responses) {
        if (!responses || responses.length === 0) {
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

        this.downloadFile(content, `last_responses_${new Date().toISOString().slice(0,10)}.txt`);
    },

    /**
     * Экспорт отправленных писем (сгруппированных)
     * @param {Array} letters - Массив писем
     * @param {Function} formatDateTime - Функция форматирования даты
     */
    exportSentLettersGrouped(letters, formatDateTime) {
        if (!letters || letters.length === 0) {
            alert('Нет отправленных писем для экспорта');
            return;
        }

        let content = '=== ОТПРАВЛЕННЫЕ ПИСЬМА (СГРУППИРОВАННЫЕ) ===\n';
        content += `Экспорт: ${new Date().toLocaleString('ru-RU')}\n`;
        content += `Всего уникальных писем: ${letters.length}\n`;
        content += '='.repeat(50) + '\n\n';

        letters.forEach((letter, i) => {
            content += `--- Письмо #${i + 1} ---\n`;
            content += `Анкета: ${letter.profileId}\n`;
            content += `Отправлено: ${letter.sentCount} раз\n`;
            content += `Последняя отправка: ${formatDateTime ? formatDateTime(letter.lastSentAt) : new Date(letter.lastSentAt).toLocaleString('ru-RU')}\n`;
            content += `Текст:\n${letter.messageText}\n`;
            content += '\n' + '-'.repeat(40) + '\n\n';
        });

        this.downloadFile(content, `sent_letters_grouped_${new Date().toISOString().slice(0,10)}.txt`);
    },

    /**
     * Экспорт использования AI
     * @param {Array} aiActivities - Массив AI активностей
     */
    exportAiUsage(aiActivities) {
        if (!aiActivities || aiActivities.length === 0) {
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

        this.downloadFile(content, `ai_usage_${new Date().toISOString().slice(0,10)}.txt`);
    },

    // =====================================================
    // Вспомогательные функции
    // =====================================================

    /**
     * Получить уровень активности по часу
     * @param {Array} hourlyActivity - Массив почасовой активности
     * @param {number} hour - Час (0-23)
     * @returns {number} Уровень активности (0-1)
     */
    getActivityLevel(hourlyActivity, hour) {
        if (hourlyActivity && hourlyActivity.length > 0) {
            const value = hourlyActivity[hour];
            if (typeof value === 'number') {
                return Math.min(value, 1) || 0.05;
            }
            // Старый формат с объектами
            const hourData = hourlyActivity.find(h => h.hour === hour);
            if (hourData) {
                return Math.min(hourData.intensity / 100, 1) || 0.05;
            }
        }
        return 0.05;
    },

    /**
     * Получить цвет активности по уровню
     * @param {number} level - Уровень активности (0-1)
     * @returns {string} CSS классы градиента
     */
    getActivityColor(level) {
        if (level > 0.8) return 'from-red-400 to-orange-400';
        if (level > 0.6) return 'from-yellow-400 to-amber-400';
        if (level > 0.4) return 'from-blue-400 to-cyan-400';
        return 'from-gray-300 to-gray-400';
    },

    /**
     * Объединить массивы финансовой истории
     * @param {Array} financeHistory - История пополнений
     * @param {Array} profilePaymentHistory - История оплат анкет
     * @returns {Array} Объединённая и отсортированная история
     */
    combineFinanceHistory(financeHistory, profilePaymentHistory) {
        const combined = [];

        financeHistory.forEach((item, idx) => {
            combined.push({
                ...item,
                uniqueId: 'topup_' + (item.id || idx),
                type: 'topup'
            });
        });

        profilePaymentHistory.forEach((item, idx) => {
            combined.push({
                ...item,
                uniqueId: 'profile_' + (item.id || idx),
                type: item.actionType === 'removal' ? 'profile_removal' : 'profile_payment'
            });
        });

        // Сортировка по дате (новые сверху)
        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return combined;
    }
};

// Экспорт для использования в других модулях
if (typeof window !== 'undefined') {
    window.DashboardUtils = DashboardUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardUtils;
}
