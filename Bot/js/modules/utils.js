/**
 * utils.js - Вспомогательные функции
 * Общие утилиты, парсинг прокси, генерация ID, форматирование
 */

// ============================================================================
// ПАРСИНГ ПРОКСИ
// ============================================================================

/**
 * Парсинг прокси URL в формат для axios
 * @param {string} proxyUrl - URL прокси (http://user:pass@host:port)
 * @returns {Object|null} - Конфиг для axios или null
 */
function parseProxyUrl(proxyUrl) {
    if (!proxyUrl || proxyUrl.trim() === '') return null;

    try {
        const url = new URL(proxyUrl);
        return {
            host: url.hostname,
            port: parseInt(url.port) || 80,
            auth: url.username ? {
                username: url.username,
                password: url.password || ''
            } : undefined,
            protocol: url.protocol.replace(':', '')
        };
    } catch (e) {
        // Попробуем простой формат host:port:user:pass
        return parseSimpleProxy(proxyUrl);
    }
}

/**
 * Парсинг простого формата прокси (host:port:user:pass или host:port)
 * @param {string} proxyStr - Строка прокси
 * @returns {Object|null} - Конфиг для axios или null
 */
function parseSimpleProxy(proxyStr) {
    if (!proxyStr || proxyStr.trim() === '') return null;

    const parts = proxyStr.split(':');
    if (parts.length >= 2) {
        const config = {
            host: parts[0],
            port: parseInt(parts[1]) || 80,
            protocol: 'http'
        };
        if (parts.length >= 4) {
            config.auth = {
                username: parts[2],
                password: parts[3]
            };
        }
        return config;
    }
    return null;
}

/**
 * Получить прокси для бота по позиции
 * @param {number} position - Позиция анкеты (1-6)
 * @returns {Object|null} - Конфиг прокси или null
 */
function getProxyForPosition(position) {
    const proxyKey = `proxy${position}`;
    const proxyStr = globalSettings[proxyKey];
    return parseProxyUrl(proxyStr);
}

// ============================================================================
// ГЕНЕРАЦИЯ ID
// ============================================================================

/**
 * Генерация уникального ID диалога
 * @param {string} botId - ID бота
 * @param {string} recipientId - ID получателя
 * @returns {string} - Уникальный ID диалога
 */
function generateConvId(botId, recipientId) {
    return `conv_${botId}_${recipientId}`;
}

/**
 * Генерация уникального ID бота
 * @returns {string} - Уникальный ID
 */
function generateBotId() {
    return 'bot_' + Date.now() + Math.floor(Math.random() * 1000);
}

// ============================================================================
// ФОРМАТИРОВАНИЕ
// ============================================================================

/**
 * Конвертация миллисекунд в PostgreSQL interval
 * @param {number} ms - Миллисекунды
 * @returns {string} - Строка интервала (HH:MM:SS)
 */
function millisecondsToInterval(ms) {
    if (!ms || ms < 0) return null;

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Форматирование времени для отображения
 * @param {number} startTime - Время начала (timestamp)
 * @returns {string} - Отформатированное время (HH:MM:SS)
 */
function formatElapsedTime(startTime) {
    if (!startTime) return '';

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Генерация имени шаблона на основе даты
 * @param {Array} tpls - Массив существующих шаблонов
 * @returns {string} - Уникальное имя шаблона
 */
function generateTemplateName(tpls) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const baseName = `${day}.${month}.${year}`;

    // Проверяем уникальность
    if (!tpls.some(t => t.name === baseName)) {
        return baseName;
    }

    // Добавляем номер если такая дата уже есть
    let num = 2;
    while (tpls.some(t => t.name === `${baseName} (${num})`)) {
        num++;
    }
    return `${baseName} (${num})`;
}

// ============================================================================
// ПРОВЕРКИ
// ============================================================================

/**
 * Проверка дубликата аккаунта
 * @param {string} login - Логин
 * @param {string} displayId - ID анкеты
 * @returns {boolean} - true если дубликат
 */
function checkDuplicate(login, displayId) {
    return !!Object.values(bots).find(b =>
        b.login.toLowerCase() === login.toLowerCase() ||
        b.displayId.toLowerCase() === displayId.toLowerCase()
    );
}

/**
 * Валидация input поля (подсветка если пусто)
 * @param {HTMLElement} textarea - Элемент textarea
 */
function validateInput(textarea) {
    if (!textarea) return;

    if (textarea.value.trim() === '') {
        textarea.classList.add('is-invalid');
    } else {
        textarea.classList.remove('is-invalid');
    }
}

// ============================================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С ШАБЛОНАМИ
// ============================================================================

/**
 * Получить шаблоны для логина
 * @param {string} login - Логин аккаунта
 * @returns {Object} - { mail: [], chat: [] }
 */
function getBotTemplates(login) {
    if (!botTemplates[login]) {
        botTemplates[login] = { mail: [], chat: [] };
    }
    return botTemplates[login];
}

// ============================================================================
// ПРОЧИЕ УТИЛИТЫ
// ============================================================================

/**
 * Обновление счетчика ботов в header
 */
function updateBotCount() {
    const count = Object.keys(bots).length;
    const el = document.getElementById('bot-count');
    if (el) {
        el.textContent = count;
    }
}

/**
 * Debounce функция
 * @param {Function} func - Функция для debounce
 * @param {number} wait - Время ожидания в мс
 * @returns {Function} - Debounced функция
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

console.log('[Lababot] utils.js loaded');
