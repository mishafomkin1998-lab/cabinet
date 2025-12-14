/**
 * Dashboard Settings Component - Настройки пользователя
 *
 * @module dashboard/components/settings
 * @description Функции настроек и профиля пользователя
 */

const SettingsComponent = {
    /**
     * Сбросить настройки пользователя
     * @param {Object} context - Контекст Alpine.js
     */
    resetUserSettings(context) {
        context.userSettings = {
            newUsername: '',
            newPassword: '',
            newPasswordConfirm: '',
            avatarUrl: ''
        };
    },

    /**
     * Сохранить настройки пользователя
     * @param {Object} context - Контекст Alpine.js
     */
    async saveUserSettings(context) {
        if (context.userSettings.newPassword && context.userSettings.newPassword !== context.userSettings.newPasswordConfirm) {
            alert('Пароли не совпадают');
            return;
        }

        context.settingsSaving = true;
        try {
            const updateData = {
                userId: context.currentUser.id
            };

            if (context.userSettings.newUsername) {
                updateData.username = context.userSettings.newUsername;
            }
            if (context.userSettings.newPassword) {
                updateData.password = context.userSettings.newPassword;
            }
            if (context.userSettings.avatarUrl) {
                updateData.avatarUrl = context.userSettings.avatarUrl;
            }

            const res = await fetch(`${API_BASE}/api/user/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });

            const data = await res.json();
            if (data.success) {
                if (updateData.username) {
                    context.currentUser.username = updateData.username;
                }
                if (updateData.avatarUrl) {
                    context.currentUser.avatar_url = updateData.avatarUrl;
                }

                // Сохраняем в storage
                const storage = localStorage.getItem('novaUser') ? localStorage : sessionStorage;
                storage.setItem('novaUser', JSON.stringify(context.currentUser));

                alert('Настройки сохранены');
                context.showSettingsModal = false;
                this.resetUserSettings(context);
            } else {
                alert(data.error || 'Ошибка сохранения');
            }
        } catch (e) {
            console.error('saveUserSettings error:', e);
            alert('Ошибка соединения');
        } finally {
            context.settingsSaving = false;
        }
    },

    /**
     * Выйти из системы
     * @param {Object} context - Контекст Alpine.js
     */
    logout(context) {
        localStorage.removeItem('novaUser');
        sessionStorage.removeItem('novaUser');
        window.location.href = 'login.html';
    },

    /**
     * Загрузить избранные шаблоны
     * @param {Object} context - Контекст Alpine.js
     */
    async loadFavoriteTemplates(context) {
        try {
            const res = await fetch(`${API_BASE}/api/favorite-templates?userId=${context.currentUser.id}&role=${context.currentUser.role}`);
            const data = await res.json();
            if (data.success) {
                context.favoriteTemplates = data.templates || [];
            }
        } catch (e) {
            console.error('loadFavoriteTemplates error:', e);
        }
    },

    /**
     * Изменить язык
     * @param {Object} context - Контекст Alpine.js
     * @param {string} lang - Код языка
     */
    changeLanguage(context, lang) {
        context.language = lang;
        localStorage.setItem('novaLanguage', lang);
    },

    /**
     * Переключить сайдбар
     * @param {Object} context - Контекст Alpine.js
     */
    toggleSidebar(context) {
        context.sidebarCollapsed = !context.sidebarCollapsed;
        localStorage.setItem('sidebarCollapsed', context.sidebarCollapsed);
    },

    /**
     * Инициализировать настройки из localStorage
     * @param {Object} context - Контекст Alpine.js
     */
    initSettings(context) {
        // Язык
        const savedLang = localStorage.getItem('novaLanguage');
        if (savedLang) {
            context.language = savedLang;
        }

        // Сайдбар
        const savedSidebar = localStorage.getItem('sidebarCollapsed');
        if (savedSidebar === 'true') {
            context.sidebarCollapsed = true;
        }
    }
};

// Экспорт
if (typeof window !== 'undefined') {
    window.SettingsComponent = SettingsComponent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsComponent;
}
