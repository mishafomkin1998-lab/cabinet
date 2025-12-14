/**
 * Dashboard Bots Component - Управление ботами
 *
 * @module dashboard/components/bots
 * @description Функции управления ботами и их настройками
 */

const BotsComponent = {
    /**
     * Загрузить статус ботов
     * @param {Object} context - Контекст Alpine.js
     */
    async loadBotsStatus(context) {
        try {
            const url = `${API_BASE}/api/bots/status?userId=${context.currentUser.id}&role=${context.currentUser.role}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                // Используем botsSummary для статистики ПРОГРАММ-ботов
                context.botsStatus = data.botsSummary || { online: 0, offline: 0, total: 0 };

                // Маппинг данных ботов с сервера
                const rawBots = data.bots || [];
                context.bots = rawBots.map(b => ({
                    id: b.botId || b.bot_id,
                    name: b.name || DashboardUtils.formatBotName(b.botId || b.bot_id),
                    icon: b.platform?.includes('Windows') ? 'fas fa-desktop' : 'fas fa-laptop',
                    status: b.status === 'online' ? 'active' : 'inactive',
                    os: b.platform || 'Unknown',
                    ip: b.ip || '-',
                    version: b.version || '-',
                    lastHeartbeat: b.lastHeartbeat,
                    profilesCount: b.profilesCount || 0,
                    profilesRunning: b.profilesRunning || 0,
                    profilesStopped: b.profilesStopped || 0,
                    uptime: b.uptime || 0,
                    memoryUsage: b.memoryUsage || 0,
                    globalMode: b.globalMode || 'mail',
                    sessionStats: b.sessionStats || { letters: 0, chats: 0, errors: 0 }
                }));

                // Обновляем profiles с данными о ботах
                if (data.profiles && context.accounts) {
                    data.profiles.forEach(p => {
                        const acc = context.accounts.find(a =>
                            a.profile_id === p.profile_id || a.id === p.profile_id
                        );
                        if (acc) {
                            acc.botId = p.bot_id;
                            acc.heartbeatStatus = p.heartbeat_status;
                            acc.connectionStatus = p.connection_status;
                            acc.mailToday = p.mail_today || 0;
                            acc.mailHour = p.mail_hour || 0;
                            acc.chatToday = p.chat_today || 0;
                            acc.chatHour = p.chat_hour || 0;
                            acc.errorsToday = p.errors_today || 0;
                        }
                    });
                }
            }
        } catch (e) {
            console.error('loadBotsStatus error:', e);
        }
    },

    /**
     * Переключить статус бота
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} bot - Бот
     */
    async toggleBotStatus(context, bot) {
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
            console.error('toggleBotStatus error:', e);
        }
    },

    /**
     * Сохранить имя бота
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} bot - Бот
     */
    async saveBotName(context, bot) {
        try {
            const res = await fetch(`${API_BASE}/api/bots/${bot.id}/name`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: bot.name })
            });
            const data = await res.json();

            if (data.success) {
                const msg = context.t?.('messages.botNameSaved') || 'Имя бота сохранено';
                alert(msg);
            }
        } catch (e) {
            console.error('saveBotName error:', e);
        }
    },

    /**
     * Синхронизировать промпт с ботами
     * @param {Object} context - Контекст Alpine.js
     */
    async syncPromptWithBots(context) {
        try {
            const res = await fetch(`${API_BASE}/api/bots/sync-prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: context.generationPrompt,
                    userId: context.currentUser.id
                })
            });
            const data = await res.json();

            if (data.success) {
                const msg = context.t?.('messages.botsSynced') || 'Промпт синхронизирован';
                alert(msg);
            }
        } catch (e) {
            console.error('syncPromptWithBots error:', e);
        }
    },

    /**
     * Загрузить сохранённый промпт
     * @param {Object} context - Контекст Alpine.js
     */
    async loadSavedPrompt(context) {
        try {
            const res = await fetch(`${API_BASE}/api/bots/prompt`);
            const data = await res.json();
            if (data.success && data.prompt) {
                context.generationPrompt = data.prompt;
            }
        } catch (e) {
            console.error('loadSavedPrompt error:', e);
        }
    },

    // =====================================================
    // Настройки управления
    // =====================================================

    /**
     * Загрузить настройки управления
     * @param {Object} context - Контекст Alpine.js
     */
    async loadControlSettings(context) {
        try {
            const res = await fetch(`${API_BASE}/api/bots/control/settings?userId=${context.currentUser.id}`);
            const data = await res.json();
            if (data.success && data.settings) {
                context.controlSettings = data.settings;
            }
        } catch (e) {
            console.error('loadControlSettings error:', e);
        }
    },

    /**
     * Переключить рассылку
     * @param {Object} context - Контекст Alpine.js
     */
    async toggleMailingEnabled(context) {
        context.controlSettings.mailingEnabled = !context.controlSettings.mailingEnabled;
        await this.saveControlSettings(context);
    },

    /**
     * Переключить стоп-спам
     * @param {Object} context - Контекст Alpine.js
     */
    async toggleStopSpam(context) {
        context.controlSettings.stopSpam = !context.controlSettings.stopSpam;
        await this.saveControlSettings(context);
    },

    /**
     * Сохранить настройки управления
     * @param {Object} context - Контекст Alpine.js
     */
    async saveControlSettings(context) {
        try {
            const res = await fetch(`${API_BASE}/api/bots/control/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: context.currentUser.id,
                    settings: context.controlSettings
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

    /**
     * Активировать режим паники
     * @param {Object} context - Контекст Alpine.js
     */
    async activatePanicMode(context) {
        if (!confirm('ВНИМАНИЕ! Это остановит ВСЕ боты немедленно. Продолжить?')) {
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/bots/control/panic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: context.currentUser.id,
                    activate: !context.controlSettings.panicMode
                })
            });
            const data = await res.json();

            if (data.success) {
                context.controlSettings.panicMode = !context.controlSettings.panicMode;
                alert(data.message);
                await this.loadBotsStatus(context);
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось активировать panic mode'));
            }
        } catch (e) {
            console.error('activatePanicMode error:', e);
            alert('Ошибка сети');
        }
    },

    // =====================================================
    // Логи
    // =====================================================

    /**
     * Загрузить логи ботов
     * @param {Object} context - Контекст Alpine.js
     * @param {boolean} reset - Сбросить ли offset
     */
    async loadBotLogs(context, reset = true) {
        if (reset) {
            context.botLogsOffset = 0;
            context.botLogs = [];
        }
        try {
            let url = `${API_BASE}/api/bots/logs?userId=${context.currentUser.id}&role=${context.currentUser.role}&limit=30&offset=${context.botLogsOffset}`;
            if (context.botLogsFilter) {
                url += `&logType=${context.botLogsFilter}`;
            }
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                if (reset) {
                    context.botLogs = data.logs || [];
                } else {
                    context.botLogs = [...context.botLogs, ...(data.logs || [])];
                }
                context.botLogsHasMore = data.hasMore || false;
            }
        } catch (e) {
            console.error('loadBotLogs error:', e);
        }
    },

    /**
     * Загрузить ещё логи ботов
     * @param {Object} context - Контекст Alpine.js
     */
    async loadMoreBotLogs(context) {
        context.botLogsOffset += 30;
        await this.loadBotLogs(context, false);
    },

    /**
     * Загрузить логи ошибок
     * @param {Object} context - Контекст Alpine.js
     * @param {boolean} reset - Сбросить ли offset
     */
    async loadErrorLogs(context, reset = true) {
        if (reset) {
            context.errorLogsOffset = 0;
            context.errorLogs = [];
        }
        try {
            const res = await fetch(`${API_BASE}/api/activity/error_logs?userId=${context.currentUser.id}&limit=30&offset=${context.errorLogsOffset}`);
            const data = await res.json();

            if (data.success) {
                if (reset) {
                    context.errorLogs = data.logs || [];
                } else {
                    context.errorLogs = [...context.errorLogs, ...(data.logs || [])];
                }
            }
        } catch (e) {
            console.error('loadErrorLogs error:', e);
        }
    },

    /**
     * Загрузить ещё логи ошибок
     * @param {Object} context - Контекст Alpine.js
     */
    async loadMoreErrors(context) {
        context.errorLogsOffset += 30;
        await this.loadErrorLogs(context, false);
    },

    /**
     * Обновить все логи
     * @param {Object} context - Контекст Alpine.js
     */
    async refreshAllLogs(context) {
        await Promise.all([
            this.loadBotLogs(context),
            this.loadErrorLogs(context)
        ]);
    },

    // =====================================================
    // Управление рассылкой
    // =====================================================

    /**
     * Получить количество писем за сегодня
     * @param {Object} context - Контекст Alpine.js
     * @returns {number}
     */
    getTotalMailToday(context) {
        return context.stats?.today?.letters || 0;
    },

    /**
     * Получить количество чатов за сегодня
     * @param {Object} context - Контекст Alpine.js
     * @returns {number}
     */
    getTotalChatToday(context) {
        return context.stats?.today?.chats || 0;
    },

    /**
     * Получить количество онлайн профилей
     * @param {Object} context - Контекст Alpine.js
     * @returns {number}
     */
    getOnlineProfiles(context) {
        if (!context.profilesWithMailing || context.profilesWithMailing.length === 0) {
            return 0;
        }
        return context.profilesWithMailing.filter(p => p.isOnline).length;
    },

    /**
     * Обновить статистику профилей
     * @param {Object} context - Контекст Alpine.js
     */
    async refreshProfileStats(context) {
        context.refreshingStats = true;
        try {
            if (typeof context.loadDashboardStats === 'function') {
                await context.loadDashboardStats();
            }
        } finally {
            context.refreshingStats = false;
        }
    },

    /**
     * Обработчик изменения фильтра по админу
     * @param {Object} context - Контекст Alpine.js
     */
    onAdminFilterChange(context) {
        context.controlFilter.translatorId = '';
    }
};

// Экспорт
if (typeof window !== 'undefined') {
    window.BotsComponent = BotsComponent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BotsComponent;
}
