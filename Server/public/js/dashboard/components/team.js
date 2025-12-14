/**
 * Dashboard Team Component - Команда
 *
 * @module dashboard/components/team
 * @description Функции управления командой (админы и переводчики)
 */

const TeamComponent = {
    /**
     * Загрузить команду
     * @param {Object} context - Контекст Alpine.js
     */
    async loadTeam(context) {
        try {
            const url = `${API_BASE}/api/team?userId=${context.currentUser.id}&role=${context.currentUser.role}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                context.admins = (data.admins || []).map(a => ({
                    id: a.id,
                    name: a.username,
                    login: a.login,
                    initials: a.username?.substring(0, 2).toUpperCase(),
                    color: DashboardUtils.getAdminColor(a.id, a.username),
                    profileCount: a.profile_count || 0,
                    translatorCount: a.translator_count || 0,
                    isMyAdmin: a.is_restricted || false,
                    salary: a.salary,
                    aiEnabled: a.ai_enabled || false,
                    balance: a.balance || 0
                }));

                context.myTranslators = (data.translators || []).map(t => ({
                    id: t.id,
                    name: t.username,
                    login: t.login,
                    initials: t.username?.substring(0, 2).toUpperCase(),
                    profileCount: t.profile_count || 0,
                    adminId: t.owner_id,
                    adminName: t.admin_name,
                    aiEnabled: t.ai_enabled || false,
                    isOwnTranslator: t.is_own_translator !== false,
                    salary: t.salary
                }));

                context.translators = context.myTranslators;
                context.allTranslators = data.allTranslators || context.myTranslators;
            }
        } catch (e) {
            console.error('loadTeam error:', e);
        }
    },

    /**
     * Редактировать админа
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} admin - Админ
     */
    async editAdmin(context, admin) {
        let assignedIds = '';
        try {
            const res = await fetch(`${API_BASE}/api/team/${admin.id}/profiles`);
            const data = await res.json();
            if (data.success && data.profileIds) {
                assignedIds = data.profileIds.join(', ');
            }
        } catch (e) {
            console.error('Error loading admin profiles:', e);
        }

        context.newAdmin = {
            id: admin.id,
            name: admin.name,
            login: admin.login || '',
            password: '••••••••',
            initials: admin.initials || '',
            isMyAdmin: admin.isMyAdmin,
            salary: admin.salary !== null && admin.salary !== undefined ? admin.salary : '',
            aiEnabled: admin.aiEnabled || false,
            profileIds: assignedIds
        };
        context.showAddAdminModal = true;
    },

    /**
     * Сохранить админа (создание или редактирование)
     * @param {Object} context - Контекст Alpine.js
     */
    async saveAdmin(context) {
        const isEditing = !!context.newAdmin.id;
        const passwordChanged = context.newAdmin.password && context.newAdmin.password !== '••••••••';

        if (!context.newAdmin.name || !context.newAdmin.login) {
            alert('Заполните имя и логин');
            return;
        }

        if (!isEditing && !context.newAdmin.password) {
            alert('Введите пароль для нового админа');
            return;
        }

        if (!context.newAdmin.isMyAdmin && context.newAdmin.salary === '') {
            alert('Для не "моего админа" укажите сумму');
            return;
        }

        const profileIds = context.newAdmin.profileIds
            ? context.newAdmin.profileIds.split(/[\s,]+/).map(id => id.trim()).filter(id => id)
            : [];

        try {
            let adminId = context.newAdmin.id;

            if (isEditing) {
                const updateData = {
                    username: context.newAdmin.login,
                    salary: context.newAdmin.isMyAdmin ? null : parseFloat(context.newAdmin.salary),
                    isRestricted: context.newAdmin.isMyAdmin,
                    aiEnabled: context.newAdmin.aiEnabled
                };
                if (passwordChanged) {
                    updateData.password = context.newAdmin.password;
                }

                const res = await fetch(`${API_BASE}/api/users/${context.newAdmin.id}`, {
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
                const res = await fetch(`${API_BASE}/api/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: context.newAdmin.login,
                        password: context.newAdmin.password,
                        role: 'admin',
                        ownerId: context.currentUser.id,
                        salary: context.newAdmin.isMyAdmin ? null : parseFloat(context.newAdmin.salary),
                        isRestricted: context.newAdmin.isMyAdmin,
                        aiEnabled: context.newAdmin.aiEnabled
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    alert('Ошибка создания: ' + (data.error || 'Неизвестная ошибка'));
                    return;
                }
                adminId = data.userId;
            }

            // Назначаем анкеты админу
            if (adminId) {
                await fetch(`${API_BASE}/api/team/${adminId}/profiles`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileIds })
                });
            }

            await this.loadTeam(context);
            if (typeof context.loadAccounts === 'function') {
                await context.loadAccounts();
            }

            DashboardState.resetAdminForm(context);
            context.showAddAdminModal = false;
            alert('Администратор сохранен');
        } catch (e) {
            console.error('saveAdmin error:', e);
            alert('Ошибка сохранения администратора');
        }
    },

    /**
     * Удалить админа
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} admin - Админ
     */
    async deleteAdmin(context, admin) {
        if (!confirm(`Удалить админа "${admin.name}"? Все его анкеты будут откреплены.`)) return;

        try {
            const res = await fetch(`${API_BASE}/api/team/${admin.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                await this.loadTeam(context);
                if (typeof context.loadAccounts === 'function') {
                    await context.loadAccounts();
                }
                alert('Админ удалён');
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось удалить'));
            }
        } catch (e) {
            alert('Ошибка: ' + e.message);
        }
    },

    /**
     * Переключить AI для пользователя
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} user - Пользователь
     */
    async toggleAiEnabled(context, user) {
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
                await this.loadTeam(context);
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось обновить AI'));
            }
        } catch (e) {
            console.error('toggleAiEnabled error:', e);
            alert('Ошибка сети');
        }
    },

    /**
     * Переключить "Мой админ"
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} admin - Админ
     */
    async toggleIsRestricted(context, admin) {
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
                await this.loadTeam(context);
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось обновить'));
            }
        } catch (e) {
            console.error('toggleIsRestricted error:', e);
            alert('Ошибка сети');
        }
    },

    /**
     * Открыть модал добавления переводчика
     * @param {Object} context - Контекст Alpine.js
     */
    openAddTranslatorModal(context) {
        DashboardState.resetTranslatorForm(context);
        context.showAddTranslatorModal = true;
    },

    /**
     * Редактировать переводчика
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} translator - Переводчик
     */
    editTranslator(context, translator) {
        context.editingTranslator = translator;
        context.newTranslator = {
            id: translator.id,
            name: translator.name,
            login: translator.login,
            password: '••••••••',
            salary: translator.salary || '',
            aiEnabled: translator.aiEnabled || false,
            adminId: translator.adminId || '',
            isOwnTranslator: translator.isOwnTranslator !== false
        };
        context.showAddTranslatorModal = true;
    },

    /**
     * Сохранить переводчика
     * @param {Object} context - Контекст Alpine.js
     */
    async saveTranslator(context) {
        if (!context.newTranslator.name || !context.newTranslator.login) {
            alert('Заполните имя и логин');
            return;
        }

        const passwordChanged = context.newTranslator.password && context.newTranslator.password !== '••••••••';
        if (!context.editingTranslator && !context.newTranslator.password) {
            alert('Введите пароль для нового переводчика');
            return;
        }

        try {
            if (context.editingTranslator) {
                const body = {
                    username: context.newTranslator.name,
                    aiEnabled: context.newTranslator.aiEnabled
                };
                if (passwordChanged) {
                    body.password = context.newTranslator.password;
                }
                if (context.currentUser.role === 'director' && !context.newTranslator.adminId) {
                    body.isOwnTranslator = context.newTranslator.isOwnTranslator;
                    if (!context.newTranslator.isOwnTranslator && context.newTranslator.salary) {
                        body.salary = parseFloat(context.newTranslator.salary);
                    } else if (context.newTranslator.isOwnTranslator) {
                        body.salary = null;
                    }
                }

                const res = await fetch(`${API_BASE}/api/users/${context.editingTranslator.id}`, {
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
                let ownerId;
                if (context.currentUser.role === 'director') {
                    ownerId = context.newTranslator.adminId || context.currentUser.id;
                } else {
                    ownerId = context.currentUser.id;
                }

                const createData = {
                    username: context.newTranslator.name,
                    login: context.newTranslator.login,
                    password: context.newTranslator.password,
                    role: 'translator',
                    ownerId,
                    aiEnabled: context.newTranslator.aiEnabled
                };
                if (context.currentUser.role === 'director' && !context.newTranslator.adminId) {
                    createData.isOwnTranslator = context.newTranslator.isOwnTranslator;
                    if (!context.newTranslator.isOwnTranslator && context.newTranslator.salary) {
                        createData.salary = parseFloat(context.newTranslator.salary);
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

            await this.loadTeam(context);
            const wasEditing = !!context.editingTranslator;
            DashboardState.resetTranslatorForm(context);
            context.showAddTranslatorModal = false;
            alert(wasEditing ? 'Переводчик обновлен' : 'Переводчик добавлен');
        } catch (e) {
            console.error('saveTranslator error:', e);
            alert('Ошибка сохранения переводчика');
        }
    },

    /**
     * Удалить переводчика
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} translator - Переводчик
     */
    async deleteTranslator(context, translator) {
        if (!confirm(`Удалить переводчика "${translator.name}"? Его анкеты станут неназначенными.`)) {
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/users/${translator.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                await this.loadTeam(context);
                alert('Переводчик удален');
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось удалить'));
            }
        } catch (e) {
            console.error('deleteTranslator error:', e);
            alert('Ошибка сети');
        }
    },

    /**
     * Открыть модал назначения анкет админу
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} admin - Админ
     */
    assignAccountsToAdmin(context, admin) {
        context.selectedAdmin = admin;
        context.accountsToAssign = '';
        context.assignComment = '';
        context.selectedAccountIds = [];
        context.showAssignAccountsModal = true;
    },

    /**
     * Подтвердить назначение анкет админу
     * @param {Object} context - Контекст Alpine.js
     */
    async assignAccountsToAdminConfirm(context) {
        let ids = [...context.selectedAccountIds];

        if (context.accountsToAssign.trim()) {
            const manualIds = context.accountsToAssign.split(/[\s,]+/).filter(id => id.length >= 3);
            ids = [...ids, ...manualIds];
        }

        ids = [...new Set(ids)];

        if (ids.length === 0) {
            alert('Выберите или введите ID анкет');
            return;
        }

        try {
            const currentRes = await fetch(`${API_BASE}/api/team/${context.selectedAdmin.id}/profiles`);
            const currentData = await currentRes.json();
            const currentIds = currentData.success ? currentData.profileIds : [];
            const allIds = [...new Set([...currentIds, ...ids])];

            const res = await fetch(`${API_BASE}/api/team/${context.selectedAdmin.id}/profiles`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileIds: allIds })
            });
            const data = await res.json();

            if (data.success) {
                context.showAssignAccountsModal = false;
                context.selectedAccountIds = [];
                alert(`Назначено ${ids.length} анкет администратору ${context.selectedAdmin.name}`);
                if (typeof context.loadAccounts === 'function') {
                    await context.loadAccounts();
                }
                await this.loadTeam(context);
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось назначить анкеты'));
            }
        } catch (e) {
            console.error('assignAccountsToAdminConfirm error:', e);
            alert('Ошибка сети при назначении анкет');
        }
    },

    /**
     * Открыть модал назначения анкет переводчику
     * @param {Object} context - Контекст Alpine.js
     * @param {Object} translator - Переводчик
     */
    async openTranslatorProfilesModal(context, translator) {
        context.selectedTranslatorForProfiles = translator;
        context.selectedTranslatorProfileIds = [];

        try {
            const res = await fetch(`${API_BASE}/api/team/translator/${translator.id}/profiles`);
            const data = await res.json();
            if (data.success && data.profileIds) {
                context.selectedTranslatorProfileIds = data.profileIds.map(String);
            }
        } catch (e) {
            console.error('Error loading translator profiles:', e);
        }

        context.showTranslatorProfilesModal = true;
    },

    /**
     * Переключить выбор анкеты для переводчика
     * @param {Object} context - Контекст Alpine.js
     * @param {string} profileId - ID анкеты
     */
    toggleTranslatorProfile(context, profileId) {
        const id = String(profileId);
        const idx = context.selectedTranslatorProfileIds.indexOf(id);
        if (idx > -1) {
            context.selectedTranslatorProfileIds.splice(idx, 1);
        } else {
            context.selectedTranslatorProfileIds.push(id);
        }
    },

    /**
     * Сохранить назначенные анкеты переводчику
     * @param {Object} context - Контекст Alpine.js
     */
    async saveTranslatorProfiles(context) {
        if (!context.selectedTranslatorForProfiles) return;

        try {
            const res = await fetch(`${API_BASE}/api/team/translator/${context.selectedTranslatorForProfiles.id}/profiles`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileIds: context.selectedTranslatorProfileIds,
                    translatorName: context.selectedTranslatorForProfiles.name,
                    userId: context.currentUser.id,
                    userName: context.currentUser.username
                })
            });
            const data = await res.json();
            if (data.success) {
                context.showTranslatorProfilesModal = false;
                await this.loadTeam(context);
                if (typeof context.loadProfileHistory === 'function') {
                    await context.loadProfileHistory();
                }
                alert(`Анкеты назначены переводчику ${context.selectedTranslatorForProfiles.name}`);
            } else {
                alert('Ошибка: ' + (data.error || 'Не удалось назначить анкеты'));
            }
        } catch (e) {
            console.error('saveTranslatorProfiles error:', e);
            alert('Ошибка сети');
        }
    }
};

// Экспорт
if (typeof window !== 'undefined') {
    window.TeamComponent = TeamComponent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TeamComponent;
}
