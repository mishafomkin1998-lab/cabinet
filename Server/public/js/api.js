/* ============================================
   API MODULE - Nova Dashboard
   Централизованный модуль для API запросов
   ============================================ */

const api = {
    /**
     * Получить токен из localStorage
     */
    getToken() {
        return localStorage.getItem('authToken');
    },

    /**
     * Сохранить токен в localStorage
     */
    setToken(token) {
        if (token) {
            localStorage.setItem('authToken', token);
        } else {
            localStorage.removeItem('authToken');
        }
    },

    /**
     * Получить заголовки с авторизацией
     */
    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    /**
     * Обработка ответа (проверка на истёкший токен)
     */
    async handleResponse(res, endpoint) {
        const data = await res.json();

        // Если токен истёк или невалидный - разлогиниваем
        if (res.status === 401 && data.code === 'INVALID_TOKEN') {
            console.warn('🔒 Токен истёк, требуется повторный вход');
            this.setToken(null);
            localStorage.removeItem('user');
            window.location.href = '/login.html';
            return { success: false, error: 'Сессия истекла' };
        }

        return data;
    },

    /**
     * GET запрос
     * @param {string} endpoint - путь API (например '/api/profiles')
     * @param {object} params - query параметры
     * @returns {Promise<object>} - JSON ответ
     */
    async get(endpoint, params = {}) {
        const url = new URL(`${API_BASE}${endpoint}`);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });

        try {
            const res = await fetch(url, {
                headers: this.getHeaders()
            });
            return await this.handleResponse(res, endpoint);
        } catch (e) {
            console.error(`API GET ${endpoint} error:`, e);
            return { success: false, error: e.message };
        }
    },

    /**
     * POST запрос
     * @param {string} endpoint - путь API
     * @param {object} data - данные для отправки
     * @returns {Promise<object>} - JSON ответ
     */
    async post(endpoint, data = {}) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            return await this.handleResponse(res, endpoint);
        } catch (e) {
            console.error(`API POST ${endpoint} error:`, e);
            return { success: false, error: e.message };
        }
    },

    /**
     * PUT запрос
     * @param {string} endpoint - путь API
     * @param {object} data - данные для обновления
     * @returns {Promise<object>} - JSON ответ
     */
    async put(endpoint, data = {}) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            return await this.handleResponse(res, endpoint);
        } catch (e) {
            console.error(`API PUT ${endpoint} error:`, e);
            return { success: false, error: e.message };
        }
    },

    /**
     * DELETE запрос
     * @param {string} endpoint - путь API
     * @returns {Promise<object>} - JSON ответ
     */
    async delete(endpoint) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await this.handleResponse(res, endpoint);
        } catch (e) {
            console.error(`API DELETE ${endpoint} error:`, e);
            return { success: false, error: e.message };
        }
    },

    // ============================================
    // PROFILES API
    // ============================================

    profiles: {
        async list(userId, role) {
            return api.get('/api/profiles', { userId, role });
        },

        async toggleAccess(profileId, userId) {
            return api.post('/api/profiles/toggle-access', { profileId, userId });
        },

        async delete(profileId) {
            return api.delete(`/api/profiles/${encodeURIComponent(profileId)}`);
        },

        async assignToAdmin(profileIds, adminId, userId) {
            return api.post('/api/profiles/assign-admin', { profileIds, adminId, userId });
        },

        async assignToTranslator(profileIds, translatorId, userId) {
            return api.post('/api/profiles/assign-translator', { profileIds, translatorId, userId });
        },

        async getPaymentStatus(profileId) {
            return api.get(`/api/billing/profile-status/${encodeURIComponent(profileId)}`);
        }
    },

    // ============================================
    // TEAM API
    // ============================================

    team: {
        async list(userId, role) {
            return api.get('/api/team', { userId, role });
        },

        async getProfiles(memberId) {
            return api.get(`/api/team/${memberId}/profiles`);
        },

        async setProfiles(memberId, profileIds) {
            return api.put(`/api/team/${memberId}/profiles`, { profileIds });
        },

        async delete(memberId) {
            return api.delete(`/api/team/${memberId}`);
        },

        async getTranslatorProfiles(translatorId) {
            return api.get(`/api/team/translator/${translatorId}/profiles`);
        },

        async setTranslatorProfiles(translatorId, profileIds) {
            return api.put(`/api/team/translator/${translatorId}/profiles`, { profileIds });
        }
    },

    // ============================================
    // USERS API
    // ============================================

    users: {
        async create(data) {
            return api.post('/api/users', data);
        },

        async update(userId, data) {
            return api.put(`/api/users/${userId}`, data);
        },

        async delete(userId) {
            return api.delete(`/api/users/${userId}`);
        }
    },

    // ============================================
    // BOTS API
    // ============================================

    bots: {
        async status(userId, role) {
            return api.get('/api/bots/status', { userId, role });
        },

        async toggle(botId, enabled) {
            return api.post(`/api/bots/${botId}/toggle`, { enabled });
        },

        async updateName(botId, name) {
            return api.put(`/api/bots/${botId}/name`, { name });
        },

        async updateAll(settings) {
            return api.put('/api/bots/update-all', settings);
        },

        async syncPrompt(prompt) {
            return api.post('/api/bots/sync-prompt', { prompt });
        }
    },

    // ============================================
    // STATS API
    // ============================================

    stats: {
        async dashboard(userId, role, params = {}) {
            return api.get('/api/stats/dashboard', { userId, role, ...params });
        },

        async hourlyActivity(userId, role, days = 7) {
            return api.get('/api/stats/hourly-activity', { userId, role, days });
        },

        async translators(userId, role) {
            return api.get('/api/stats/translators', { userId, role });
        }
    },

    // ============================================
    // ACTIVITY API
    // ============================================

    activity: {
        async recent(userId, role, limit = 20) {
            return api.get('/api/activity/recent', { userId, role, limit });
        },

        async history(userId, role, limit = 50) {
            return api.get('/api/history', { userId, role, limit });
        }
    },

    // ============================================
    // BILLING API
    // ============================================

    billing: {
        async getProfileStatus(profileId) {
            return api.get(`/api/billing/profile-status/${encodeURIComponent(profileId)}`);
        }
    },

    // ============================================
    // TEMPLATES API
    // ============================================

    templates: {
        async favorites(userId, role) {
            return api.get('/api/favorite-templates', { userId, role });
        }
    }
};

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
