/**
 * api.js - API функции для работы с сервером Lababot и Ladadate
 * Все HTTP запросы к серверам проходят через этот модуль
 */

// ============================================================================
// ОСНОВНОЙ API ЗАПРОС К LADADATE
// ============================================================================

/**
 * Универсальная функция для API запросов к Ladadate
 * @param {Object|null} bot - Объект бота (или null для запросов без авторизации)
 * @param {string} method - HTTP метод (GET, POST, PUT, DELETE)
 * @param {string} path - Путь API
 * @param {Object} data - Данные для отправки
 * @returns {Promise<Object>} - Ответ от API
 */
async function makeApiRequest(bot, method, path, data = null) {
    const config = {
        method: method,
        url: LADADATE_API_BASE + path,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        withCredentials: true
    };

    if (bot && bot.token) {
        config.headers['Authorization'] = `Bearer ${bot.token}`;
    }

    if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
    }

    // Прокси для бота (по позиции)
    if (bot && bot.proxyPosition) {
        const proxy = getProxyForPosition(bot.proxyPosition);
        if (proxy) {
            config.proxy = proxy;
        }
    }

    return axios(config);
}

// ============================================================================
// API ФУНКЦИИ ДЛЯ СЕРВЕРА LABABOT (СТАТИСТИКА)
// ============================================================================

/**
 * Отправка статистики сообщения на сервер Lababot
 * @param {Object} params - Параметры сообщения
 * @returns {Promise<Object>} - Результат отправки
 */
async function sendMessageToLababot(params) {
    const {
        botId,
        accountDisplayId,
        recipientId,
        type,
        textContent,
        status,
        responseTime,
        isFirst,
        isLast,
        convId,
        mediaUrl,
        fileName,
        translatorId,
        errorReason,
        usedAi
    } = params;

    try {
        const payload = {
            profile_id: accountDisplayId,
            man_id: recipientId,
            type: type,
            text_content: textContent,
            status: status || 'success',
            response_time: responseTime,
            is_first: isFirst || false,
            is_last: isLast || false,
            conv_id: convId,
            media_url: mediaUrl,
            file_name: fileName,
            translator_id: translatorId || globalSettings.translatorId,
            error_reason: errorReason,
            used_ai: usedAi || false
        };

        const response = await fetch(`${LABABOT_SERVER}/api/activity/message_sent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        return { success: true, data: result };

    } catch (error) {
        console.error('[Lababot API] sendMessageToLababot error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Отправка входящего сообщения на сервер Lababot
 * @param {Object} params - Параметры входящего сообщения
 * @returns {Promise<Object>} - Результат отправки
 */
async function sendIncomingMessageToLababot(params) {
    const { botId, profileId, manId, manName, messageId, type } = params;

    try {
        const payload = {
            profile_id: profileId,
            man_id: manId,
            man_name: manName,
            message_id: messageId,
            type: type // 'letter' или 'chat'
        };

        const response = await fetch(`${LABABOT_SERVER}/api/activity/incoming_message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return { success: true };

    } catch (error) {
        console.error('[Lababot API] sendIncomingMessageToLababot error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Отправка heartbeat (онлайн статус) на сервер Lababot
 * @param {string} botId - ID бота
 * @param {string} displayId - ID анкеты
 * @param {string} status - Статус ('online' или 'offline')
 * @returns {Promise<Object>} - Результат отправки
 */
async function sendHeartbeatToLababot(botId, displayId, status) {
    try {
        const bot = bots[botId];
        const payload = {
            profile_id: displayId,
            status: status,
            bot_name: bot ? `Lababot v10 [${bot.login}]` : 'Lababot v10',
            bot_version: '10.0'
        };

        const response = await fetch(`${LABABOT_SERVER}/api/bots/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return { success: true };

    } catch (error) {
        // Не логируем каждую ошибку heartbeat чтобы не засорять консоль
        return { success: false, error: error.message };
    }
}

/**
 * Отправка ошибки на сервер Lababot
 * @param {string} botId - ID бота
 * @param {string} displayId - ID анкеты
 * @param {string} errorType - Тип ошибки
 * @param {string} errorMessage - Сообщение об ошибке
 * @returns {Promise<Object>} - Результат отправки
 */
async function sendErrorToLababot(botId, displayId, errorType, errorMessage) {
    try {
        const payload = {
            profile_id: displayId,
            error_type: errorType,
            error_message: errorMessage,
            timestamp: new Date().toISOString()
        };

        const response = await fetch(`${LABABOT_SERVER}/api/activity/error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        return { success: response.ok };

    } catch (error) {
        console.error('[Lababot API] sendErrorToLababot error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// API ФУНКЦИИ ДЛЯ ПРОВЕРКИ СТАТУСА ПРОФИЛЯ
// ============================================================================

/**
 * Проверка статуса профиля на сервере
 * @param {string} profileId - ID анкеты
 * @returns {Promise<Object>} - { paused, exists, allowed }
 */
async function checkProfileStatus(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/profiles/${profileId}/status`);

        if (!response.ok) {
            if (response.status === 404) {
                return { paused: false, exists: false, allowed: false };
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return {
            paused: data.paused || false,
            exists: true,
            allowed: data.allowed !== false
        };

    } catch (error) {
        console.error('[Lababot API] checkProfileStatus error:', error);
        // По умолчанию разрешаем работу если сервер недоступен
        return { paused: false, exists: true, allowed: true };
    }
}

/**
 * Проверка статуса оплаты профиля
 * @param {string} profileId - ID анкеты
 * @returns {Promise<Object>} - { isPaid, isFree, isTrial, canTrial, daysLeft }
 */
async function checkProfilePaymentStatus(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/profiles/${profileId}/payment-status`);

        if (!response.ok) {
            if (response.status === 404) {
                return { isPaid: false, isFree: false, isTrial: false, canTrial: false, daysLeft: 0 };
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return {
            isPaid: data.is_paid || false,
            isFree: data.is_free || false,
            isTrial: data.is_trial || false,
            canTrial: data.can_trial || false,
            daysLeft: data.days_left || 0
        };

    } catch (error) {
        console.error('[Lababot API] checkProfilePaymentStatus error:', error);
        // По умолчанию считаем оплаченным если сервер недоступен
        return { isPaid: true, isFree: false, isTrial: false, canTrial: false, daysLeft: 30 };
    }
}

/**
 * Проверка разрешения AI для профиля
 * @param {string} profileId - ID анкеты
 * @returns {Promise<Object>} - { enabled, reason, translatorName }
 */
async function checkProfileAIEnabled(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/profiles/${profileId}/ai-status`);

        if (!response.ok) {
            return { enabled: true, reason: null, translatorName: null };
        }

        const data = await response.json();
        return {
            enabled: data.ai_enabled !== false,
            reason: data.disabled_reason || null,
            translatorName: data.translator_name || null
        };

    } catch (error) {
        console.error('[Lababot API] checkProfileAIEnabled error:', error);
        return { enabled: true, reason: null, translatorName: null };
    }
}

/**
 * Активация trial периода для профиля
 * @param {string} profileId - ID анкеты
 * @returns {Promise<Object>} - Результат активации
 */
async function activateTrialForProfile(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/profiles/${profileId}/activate-trial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return { success: true };

    } catch (error) {
        console.error('[Lababot API] activateTrialForProfile error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// API ФУНКЦИИ ДЛЯ РАБОТЫ С ДАННЫМИ БОТА
// ============================================================================

/**
 * Загрузка данных бота с сервера
 * @param {string} profileId - ID анкеты
 * @returns {Promise<Object|null>} - Данные бота или null
 */
async function loadBotDataFromServer(profileId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${profileId}`);

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('[Lababot API] loadBotDataFromServer error:', error);
        return null;
    }
}

/**
 * Сохранение шаблонов на сервер
 * @param {string} profileId - ID анкеты
 * @param {string} type - Тип шаблона ('mail' или 'chat')
 * @param {Array} templates - Массив шаблонов
 * @returns {Promise<Object>} - Результат сохранения
 */
async function saveTemplatesToServer(profileId, type, templates) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${profileId}/templates`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, templates })
        });

        return { success: response.ok };

    } catch (error) {
        console.error('[Lababot API] saveTemplatesToServer error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Сохранение blacklist на сервер
 * @param {string} profileId - ID анкеты
 * @param {string} type - Тип blacklist ('mail' или 'chat')
 * @param {Array} blacklist - Массив ID в blacklist
 * @returns {Promise<Object>} - Результат сохранения
 */
async function saveBlacklistToServer(profileId, type, blacklist) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${profileId}/blacklist`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, blacklist })
        });

        return { success: response.ok };

    } catch (error) {
        console.error('[Lababot API] saveBlacklistToServer error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Сброс статистики на сервере
 * @param {string} profileId - ID анкеты
 * @param {string} type - Тип статистики ('mail' или 'chat')
 * @returns {Promise<Object>} - Результат сброса
 */
async function resetStatsOnServer(profileId, type) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${profileId}/reset-stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        });

        return { success: response.ok };

    } catch (error) {
        console.error('[Lababot API] resetStatsOnServer error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// API ФУНКЦИИ ДЛЯ MINICHAT
// ============================================================================

/**
 * Загрузка истории MiniChat
 * @param {string} profileId - ID анкеты
 * @param {string} partnerId - ID партнера
 * @returns {Promise<Array>} - Массив сообщений
 */
async function loadMiniChatHistory(profileId, partnerId) {
    try {
        const response = await fetch(`${LABABOT_SERVER}/api/chat-history/${profileId}/${partnerId}`);

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return data.messages || [];

    } catch (error) {
        console.error('[Lababot API] loadMiniChatHistory error:', error);
        return [];
    }
}

console.log('[Lababot] api.js loaded');
