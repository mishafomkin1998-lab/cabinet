/**
 * Dashboard Profiles Component - Анкеты
 *
 * @module dashboard/components/profiles
 * @description Функции управления анкетами (профилями)
 */

const ProfilesComponent = {
    /**
     * Загрузить список аккаунтов
     * @param {Object} context - Контекст Alpine.js
     */
    async loadAccounts(context) {
        try {
            const url = `${API_BASE}/api/profiles?userId=${context.currentUser.id}&role=${context.currentUser.role}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.success && data.list) {
                // Загружаем статусы оплаты пачкой
                const profileIds = data.list.map(p => p.profile_id).filter(Boolean);

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
                            paymentStatuses = payData.statuses || {};
                        }
                    } catch (e) {
                        console.error('Batch payment status error:', e);
                    }
                }

                // Обогащаем данные статусами оплаты
                context.accounts = data.list.map(p => {
                    const pay = paymentStatuses[p.profile_id] || {};
                    return {
                        id: p.profile_id,
                        profile_id: p.profile_id,
                        login: p.login,
                        status: p.status || 'offline',
                        lastOnline: p.last_online,
                        incoming: p.incoming || 0,
                        admin: p.admin_name,
                        adminId: p.admin_id,
                        adminIsRestricted: p.admin_is_restricted,
                        translatorId: p.translator_id,
                        translatorName: p.translator_name,
                        paused: p.paused,
                        addedDate: p.added_date,
                        // Оплата
                        isPaid: pay.isPaid || false,
                        isFree: pay.isFree || false,
                        isTrial: pay.isTrial || false,
                        canTrial: pay.canTrial || false,
                        trialUsed: pay.trialUsed || false,
                        daysLeft: pay.daysLeft || 0
                    };
                });
            }
        } catch (e) {
            console.error('loadAccounts error:', e);
        }
    },

    /**
     * Переключить доступ к аккаунту (пауза/возобновление)
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} account - Аккаунт
     */
    async toggleAccountAccess(context, account) {
        const newPaused = !account.paused;
        const profileId = account.profile_id || account.id;

        try {
            const res = await fetch(`${API_BASE}/api/profiles/toggle-access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId,
                    paused: newPaused,
                    role: context.currentUser.role
                })
            });
            const data = await res.json();

            if (data.success) {
                const idx = context.accounts.findIndex(a => a.id === account.id);
                if (idx > -1) {
                    context.accounts[idx].paused = newPaused;
                }
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось изменить статус'));
            }
        } catch (e) {
            console.error('toggleAccountAccess error:', e);
            alert('Ошибка при изменении статуса анкеты');
        }
    },

    /**
     * Удалить аккаунт
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} account - Аккаунт
     */
    async deleteAccount(context, account) {
        const confirmText = context.t?.('messages.deleteConfirm') || 'Удалить анкету';
        if (!confirm(`${confirmText} ${account.login}?`)) return;

        try {
            const profileId = account.profile_id || account.id;
            const params = new URLSearchParams({
                role: context.currentUser.role,
                userId: context.currentUser.id,
                userName: context.currentUser.username
            });
            const res = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(profileId)}?${params}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();

            if (data.success) {
                context.accounts = context.accounts.filter(a => a.id !== account.id);
            } else {
                alert('Ошибка удаления: ' + (data.error || 'Неизвестная ошибка'));
            }
        } catch (e) {
            console.error('deleteAccount error:', e);
            alert('Ошибка при удалении анкеты');
        }
    },

    /**
     * Сохранить новые аккаунты
     * @param {Object} context - Контекст Alpine.js
     */
    async saveAccounts(context) {
        if (!context.newAccountIds.trim()) {
            alert('Введите ID анкет');
            return;
        }

        const ids = context.newAccountIds.split(/[\s,]+/).filter(id => id.trim().length >= 3);

        if (ids.length === 0) {
            alert('Введите корректные ID анкет');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/profiles/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profiles: ids,
                    note: context.newAccountComment || '',
                    adminId: context.currentUser.role === 'director' ? null : context.currentUser.id,
                    userId: context.currentUser.id,
                    userName: context.currentUser.username,
                    role: context.currentUser.role
                })
            });
            const data = await res.json();

            if (data.success) {
                context.newAccountIds = '';
                context.newAccountComment = '';
                context.showAddAccountModal = false;
                alert(`Добавлено ${ids.length} анкет`);
                await this.loadAccounts(context);
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось добавить анкеты'));
            }
        } catch (e) {
            console.error('saveAccounts error:', e);
            alert('Ошибка сети при добавлении анкет');
        }
    },

    /**
     * Назначить выбранные анкеты админу
     * @param {Object} context - Контекст Alpine.js
     * @param {string|number} adminId - ID админа
     */
    async assignSelectedToAdmin(context, adminId) {
        if (context.selectedProfileIds.length === 0) return;

        const admin = context.admins.find(a => a.id === adminId);
        const adminName = admin ? admin.name : null;

        try {
            const res = await fetch(`${API_BASE}/api/profiles/assign-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileIds: context.selectedProfileIds,
                    adminId,
                    adminName,
                    userId: context.currentUser.id,
                    userName: context.currentUser.username,
                    role: context.currentUser.role
                })
            });
            const data = await res.json();

            if (data.success) {
                context.selectedProfileIds = [];
                await this.loadAccounts(context);
                if (typeof context.loadProfileHistory === 'function') {
                    await context.loadProfileHistory();
                }
                alert(adminId ? 'Анкеты назначены админу' : 'Назначение снято');
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось назначить'));
            }
        } catch (e) {
            console.error('assignSelectedToAdmin error:', e);
            alert('Ошибка сети');
        }
    },

    /**
     * Назначить выбранные анкеты переводчику
     * @param {Object} context - Контекст Alpine.js
     * @param {string|number} translatorId - ID переводчика
     */
    async assignSelectedToTranslator(context, translatorId) {
        if (context.selectedProfileIds.length === 0) return;

        const translator = context.myTranslators?.find(t => t.id === translatorId) ||
            context.allTranslators?.find(t => t.id === translatorId);
        const translatorName = translator ? translator.name : null;

        try {
            const res = await fetch(`${API_BASE}/api/profiles/assign-translator`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileIds: context.selectedProfileIds,
                    translatorId,
                    translatorName,
                    userId: context.currentUser.id,
                    userName: context.currentUser.username,
                    role: context.currentUser.role
                })
            });
            const data = await res.json();

            if (data.success) {
                context.selectedProfileIds = [];
                await this.loadAccounts(context);
                if (typeof context.loadTeam === 'function') {
                    await context.loadTeam();
                }
                if (typeof context.loadProfileHistory === 'function') {
                    await context.loadProfileHistory();
                }
                alert(translatorId ? 'Анкеты назначены переводчику' : 'Назначение снято');
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось назначить'));
            }
        } catch (e) {
            console.error('assignSelectedToTranslator error:', e);
            alert('Ошибка сети');
        }
    },

    /**
     * Переключить выбор профиля
     * @param {Object} context - Контекст Alpine.js
     * @param {string} profileId - ID профиля
     * @param {boolean} checked - Состояние чекбокса
     */
    toggleProfileSelection(context, profileId, checked) {
        const id = String(profileId);
        if (checked) {
            if (!context.selectedProfileIds.includes(id)) {
                context.selectedProfileIds.push(id);
            }
        } else {
            context.selectedProfileIds = context.selectedProfileIds.filter(pid => pid !== id);
        }
    },

    /**
     * Выбрать/снять выбор со всех профилей
     * @param {Object} context - Контекст Alpine.js
     * @param {boolean} checked - Состояние
     */
    toggleSelectAllProfiles(context, checked) {
        if (checked) {
            const filtered = DashboardState.computed.getFilteredAccounts(context);
            context.selectedProfileIds = filtered.map(a => String(a.id));
        } else {
            context.selectedProfileIds = [];
        }
    },

    /**
     * Сортировать аккаунты
     * @param {Object} context - Контекст Alpine.js
     * @param {string} field - Поле сортировки
     */
    sortAccounts(context, field) {
        if (context.sortBy === field) {
            context.sortDirection = context.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            context.sortBy = field;
            context.sortDirection = 'asc';
        }
    },

    /**
     * Загрузить историю изменений профилей
     * @param {Object} context - Контекст Alpine.js
     */
    async loadProfileHistory(context) {
        try {
            let url = `${API_BASE}/api/profile-history?userId=${context.currentUser.id}&role=${context.currentUser.role}`;

            if (context.historyFilter.dateFrom) {
                url += `&dateFrom=${context.historyFilter.dateFrom}`;
            }
            if (context.historyFilter.dateTo) {
                url += `&dateTo=${context.historyFilter.dateTo}`;
            }
            if (context.historyFilter.admin) {
                url += `&adminId=${context.historyFilter.admin}`;
            }
            if (context.historyFilter.profileId) {
                url += `&profileId=${context.historyFilter.profileId}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                context.profileHistory = data.history || [];
            } else {
                context.profileHistory = [];
            }
        } catch (e) {
            console.error('loadProfileHistory error:', e);
            context.profileHistory = [];
        }
    },

    /**
     * Установить быстрый диапазон дат для истории
     * @param {Object} context - Контекст Alpine.js
     * @param {string} range - Тип диапазона
     */
    setHistoryQuickRange(context, range) {
        const { dateFrom, dateTo } = DashboardUtils.getQuickDateRange(range);

        context.historyFilter.dateFrom = dateFrom;
        context.historyFilter.dateTo = dateTo;
        context.showHistoryCalendar = false;

        this.loadProfileHistory(context);
    },

    /**
     * Получить текст диапазона дат для истории
     * @param {Object} context - Контекст Alpine.js
     * @returns {string} Текст диапазона
     */
    getHistoryDateRangeText(context) {
        if (context.historyFilter.dateFrom && context.historyFilter.dateTo) {
            const from = new Date(context.historyFilter.dateFrom);
            const to = new Date(context.historyFilter.dateTo);
            return `${from.toLocaleDateString('ru-RU')} - ${to.toLocaleDateString('ru-RU')}`;
        }
        return 'Выбрать период';
    },

    /**
     * Переключить рассылку для профиля
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} profile - Профиль
     */
    async toggleProfileMailing(context, profile) {
        try {
            const newStatus = !profile.mailingEnabled;
            const res = await fetch(`${API_BASE}/api/profiles/${profile.profileId}/mailing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: newStatus,
                    userId: context.currentUser.id
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
    }
};

// Экспорт
if (typeof window !== 'undefined') {
    window.ProfilesComponent = ProfilesComponent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfilesComponent;
}
