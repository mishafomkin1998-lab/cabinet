/**
 * Dashboard Billing Component - Финансы и оплата
 *
 * @module dashboard/components/billing
 * @description Функции управления биллингом, оплатой и балансами
 */

const BillingComponent = {
    /**
     * Загрузить баланс пользователя
     * @param {Object} context - Контекст Alpine.js
     */
    async loadUserBalance(context) {
        try {
            const res = await fetch(`${API_BASE}/api/billing/balance/${context.currentUser.id}`);
            const data = await res.json();
            if (data.success) {
                context.userBalance = data.balance || 0;
                context.isRestricted = data.isRestricted || false;
            }
        } catch (e) {
            console.error('loadUserBalance error:', e);
        }
    },

    /**
     * Загрузить прайс-лист
     * @param {Object} context - Контекст Alpine.js
     */
    async loadPricing(context) {
        try {
            const res = await fetch(`${API_BASE}/api/billing/pricing`);
            const data = await res.json();
            if (data.success) {
                context.pricing = data.pricing;
            }
        } catch (e) {
            console.error('loadPricing error:', e);
        }
    },

    /**
     * Открыть модал продления анкеты
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} account - Аккаунт
     */
    openExtendModal(context, account) {
        context.extendingProfile = account;
        context.selectedDays = 30;
        context.showExtendModal = true;
    },

    /**
     * Продлить анкету
     * @param {Object} context - Контекст Alpine.js
     */
    async extendProfile(context) {
        if (!context.extendingProfile) return;

        const cost = context.pricing[context.selectedDays] || 0;

        if (context.userBalance < cost && !context.isRestricted) {
            alert(`Недостаточно средств. Нужно: $${cost}, на балансе: $${context.userBalance.toFixed(2)}`);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/billing/extend-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: context.extendingProfile.profile_id,
                    days: context.selectedDays,
                    userId: context.currentUser.id
                })
            });
            const data = await res.json();

            if (data.success) {
                context.userBalance = data.newBalance;
                alert(`Анкета продлена на ${context.selectedDays} дней. Списано: $${data.cost}`);
                context.showExtendModal = false;
                if (typeof context.loadAccounts === 'function') {
                    await context.loadAccounts();
                }
            } else {
                alert(data.error || 'Ошибка продления');
            }
        } catch (e) {
            console.error('extendProfile error:', e);
            alert('Ошибка соединения');
        }
    },

    /**
     * Активировать тестовый период
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} account - Аккаунт
     */
    async startTrial(context, account) {
        try {
            const res = await fetch(`${API_BASE}/api/billing/start-trial`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: account.profile_id,
                    userId: context.currentUser.id
                })
            });
            const data = await res.json();

            if (data.success) {
                alert(`Тестовый период активирован (${data.trialDays || 2} дня)`);
                if (typeof context.loadAccounts === 'function') {
                    await context.loadAccounts();
                }
            } else {
                alert(data.error || 'Ошибка активации');
            }
        } catch (e) {
            console.error('startTrial error:', e);
            alert('Ошибка соединения');
        }
    },

    /**
     * Оплатить выбранные профили
     * @param {Object} context - Контекст Alpine.js
     */
    async paySelectedProfiles(context) {
        if (context.selectedProfileIds.length === 0) return;

        const selectedAccounts = context.accounts.filter(a => context.selectedProfileIds.includes(a.id));
        let totalCost = 0;
        for (const acc of selectedAccounts) {
            const cost = context.pricing[30] || 2;
            totalCost += cost;
        }

        if (context.userBalance < totalCost) {
            alert(`Недостаточно средств. Нужно: $${totalCost}, на балансе: $${context.userBalance.toFixed(2)}`);
            return;
        }

        if (!confirm(`Оплатить ${context.selectedProfileIds.length} анкет на 30 дней за $${totalCost}?`)) return;

        try {
            let successCount = 0;
            for (const profileId of context.selectedProfileIds) {
                const res = await fetch(`${API_BASE}/api/billing/pay`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId,
                        days: 30,
                        userId: context.currentUser.id
                    })
                });
                const data = await res.json();
                if (data.success) successCount++;
            }

            alert(`Оплачено ${successCount} из ${context.selectedProfileIds.length} анкет`);
            context.selectedProfileIds = [];
            if (typeof context.loadAccounts === 'function') {
                await context.loadAccounts();
            }
            await this.loadUserBalance(context);
        } catch (e) {
            console.error('paySelectedProfiles error:', e);
            alert('Ошибка оплаты');
        }
    },

    /**
     * Открыть модал пополнения баланса
     * @param {Object} context - Контекст Alpine.js
     * @param {string|number} userId - ID пользователя
     */
    openTopupModal(context, userId) {
        context.topupUserId = userId;
        context.topupAmount = 10;
        context.showTopupModal = true;
    },

    /**
     * Пополнить баланс пользователя
     * @param {Object} context - Контекст Alpine.js
     */
    async topupBalance(context) {
        if (!context.topupUserId || !context.topupAmount || context.topupAmount <= 0) return;

        try {
            const res = await fetch(`${API_BASE}/api/billing/topup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: context.topupUserId,
                    amount: context.topupAmount,
                    byUserId: context.currentUser.id
                })
            });
            const data = await res.json();

            if (data.success) {
                alert(`Баланс пополнен. Новый баланс: $${data.newBalance.toFixed(2)}`);
                context.showTopupModal = false;
                if (typeof context.loadTeam === 'function') {
                    await context.loadTeam();
                }
            } else {
                alert(data.error || 'Ошибка пополнения');
            }
        } catch (e) {
            console.error('topupBalance error:', e);
            alert('Ошибка соединения');
        }
    },

    // =====================================================
    // Финансы директора
    // =====================================================

    /**
     * Загрузить данные финансов (только для директора)
     * @param {Object} context - Контекст Alpine.js
     */
    async loadFinanceData(context) {
        if (context.currentUser.role !== 'director') return;

        try {
            // Загружаем список админов для пополнения
            const adminsRes = await fetch(`${API_BASE}/api/billing/admins?userId=${context.currentUser.id}`);
            const adminsData = await adminsRes.json();
            if (adminsData.success) {
                context.financeAdmins = adminsData.admins;
            }

            // Загружаем историю пополнений
            const historyRes = await fetch(`${API_BASE}/api/billing/history?userId=${context.currentUser.id}&limit=100`);
            const historyData = await historyRes.json();
            if (historyData.success) {
                context.financeHistory = historyData.history;
                context.financeTotalSum = historyData.totalSum;
            }

            // Загружаем историю оплаты анкет
            const profileHistoryRes = await fetch(`${API_BASE}/api/billing/profile-payment-history?userId=${context.currentUser.id}&limit=100`);
            const profileHistoryData = await profileHistoryRes.json();
            if (profileHistoryData.success) {
                context.profilePaymentHistory = profileHistoryData.history;
            }
        } catch (e) {
            console.error('loadFinanceData error:', e);
        }
    },

    /**
     * Отправить пополнение от директора
     * @param {Object} context - Контекст Alpine.js
     */
    async submitFinanceTopup(context) {
        if (!context.financeTopup.adminId || !context.financeTopup.amount || context.financeTopup.amount <= 0) {
            alert('Выберите админа и введите сумму');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/billing/topup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: context.financeTopup.adminId,
                    amount: context.financeTopup.amount,
                    byUserId: context.currentUser.id,
                    note: context.financeTopup.note || null
                })
            });
            const data = await res.json();

            if (data.success) {
                const admin = context.financeAdmins.find(a => a.id == context.financeTopup.adminId);
                const adminName = admin ? admin.name : 'Админ';
                alert(`Баланс ${adminName} пополнен на $${context.financeTopup.amount}.\nНовый баланс: $${data.newBalance.toFixed(2)}`);

                DashboardState.resetFinanceForms(context);
                await this.loadFinanceData(context);
                if (typeof context.loadTeam === 'function') {
                    await context.loadTeam();
                }
            } else {
                alert(data.error || 'Ошибка пополнения');
            }
        } catch (e) {
            console.error('submitFinanceTopup error:', e);
            alert('Ошибка соединения');
        }
    },

    /**
     * Оплатить анкету (директор)
     * @param {Object} context - Контекст Alpine.js
     */
    async submitProfilePayment(context) {
        if (!context.profilePayment.profileId || !context.profilePayment.days) {
            alert('Введите ID анкеты и выберите период');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/billing/pay-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: context.profilePayment.profileId,
                    days: context.profilePayment.days,
                    byUserId: context.currentUser.id,
                    note: context.profilePayment.note || null
                })
            });
            const data = await res.json();

            if (data.success) {
                alert(`Анкета ${context.profilePayment.profileId} оплачена на ${context.profilePayment.days} дней`);
                DashboardState.resetFinanceForms(context);
                await this.loadFinanceData(context);
                if (typeof context.loadAccounts === 'function') {
                    await context.loadAccounts();
                }
            } else {
                alert(data.error || 'Ошибка оплаты');
            }
        } catch (e) {
            console.error('submitProfilePayment error:', e);
            alert('Ошибка соединения');
        }
    },

    /**
     * Убрать оплату с анкеты (директор)
     * @param {Object} context - Контекст Alpine.js
     */
    async removeProfilePayment(context) {
        if (!context.profilePayment.profileId) {
            alert('Введите ID анкеты');
            return;
        }

        if (!confirm(`Убрать оплату с анкеты ${context.profilePayment.profileId}?`)) return;

        try {
            const res = await fetch(`${API_BASE}/api/billing/remove-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: context.profilePayment.profileId,
                    byUserId: context.currentUser.id
                })
            });
            const data = await res.json();

            if (data.success) {
                alert(`Оплата с анкеты ${context.profilePayment.profileId} снята`);
                DashboardState.resetFinanceForms(context);
                await this.loadFinanceData(context);
                if (typeof context.loadAccounts === 'function') {
                    await context.loadAccounts();
                }
            } else {
                alert(data.error || 'Ошибка');
            }
        } catch (e) {
            console.error('removeProfilePayment error:', e);
            alert('Ошибка соединения');
        }
    }
};

// Экспорт
if (typeof window !== 'undefined') {
    window.BillingComponent = BillingComponent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BillingComponent;
}
