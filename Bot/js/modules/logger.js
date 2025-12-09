/**
 * logger.js - Система логирования и уведомлений
 * Управление уведомлениями, логами, звуками
 */

// ============================================================================
// ОБЪЕКТ LOGGER
// ============================================================================

const Logger = {
    logs: [],
    maxLogs: 100, // Максимум логов в памяти
    isVisible: false,

    /**
     * Добавить запись в лог
     * @param {string} text - Текст сообщения
     * @param {string} type - Тип: 'chat', 'chat-request', 'mail', 'vip-online', 'bday', 'log'
     * @param {string} botId - ID бота (опционально)
     * @param {Object} data - Дополнительные данные (partnerId, partnerName и т.д.)
     */
    add: function(text, type, botId, data = {}) {
        const entry = {
            text,
            type,
            botId,
            data,
            time: new Date(),
            id: Date.now() + Math.random()
        };

        // Добавляем в начало массива
        this.logs.unshift(entry);

        // Ограничиваем размер
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }

        // Воспроизводим звук в зависимости от типа
        this.playNotificationSound(type);

        // Обновляем UI
        this.render();

        // Показываем счетчик
        this.updateBadge();

        console.log(`[Logger] ${type}: ${text}`, data);
    },

    /**
     * Воспроизведение звука уведомления
     * @param {string} type - Тип уведомления
     */
    playNotificationSound: function(type) {
        if (!globalSettings.soundsEnabled) return;

        switch(type) {
            case 'chat':
            case 'chat-request':
                playSound('chat');
                break;
            case 'mail':
                playSound('message');
                break;
            case 'vip-online':
                playSound('online');
                break;
            // 'bday' и 'log' без звука
        }
    },

    /**
     * Отрисовка логов в UI
     */
    render: function() {
        const container = document.getElementById('logger-content');
        if (!container) return;

        container.innerHTML = this.logs.map(log => {
            const timeStr = log.time.toLocaleTimeString();
            const botInfo = log.botId && bots[log.botId]
                ? `<span class="log-bot">[${bots[log.botId].displayId}]</span>`
                : '';

            return `
                <div class="log-entry log-${log.type}" data-log-id="${log.id}" onclick="Logger.onLogClick('${log.id}')">
                    <span class="log-time">${timeStr}</span>
                    ${botInfo}
                    <span class="log-text">${log.text}</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Обработка клика по логу
     * @param {string} logId - ID лога
     */
    onLogClick: function(logId) {
        const log = this.logs.find(l => l.id == logId);
        if (!log) return;

        // Если есть данные партнера - открываем MiniChat
        if (log.data && log.data.partnerId && log.botId) {
            openMiniChat(log.botId, log.data.partnerId, log.data.partnerName);
        }

        // Если есть botId - переключаемся на эту вкладку
        if (log.botId && bots[log.botId]) {
            selectTab(log.botId);
        }
    },

    /**
     * Обновление badge счетчика
     */
    updateBadge: function() {
        const badge = document.getElementById('logger-badge');
        if (!badge) return;

        // Считаем непрочитанные за последние 5 минут
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const unread = this.logs.filter(l =>
            l.time.getTime() > fiveMinutesAgo &&
            ['chat', 'chat-request', 'mail', 'vip-online'].includes(l.type)
        ).length;

        if (unread > 0) {
            badge.textContent = unread > 99 ? '99+' : unread;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    },

    /**
     * Очистка всех логов
     */
    clear: function() {
        this.logs = [];
        this.render();
        this.updateBadge();
    },

    /**
     * Получить логи по типу
     * @param {string} type - Тип лога
     * @returns {Array} - Отфильтрованные логи
     */
    getByType: function(type) {
        return this.logs.filter(l => l.type === type);
    },

    /**
     * Получить логи по боту
     * @param {string} botId - ID бота
     * @returns {Array} - Отфильтрованные логи
     */
    getByBot: function(botId) {
        return this.logs.filter(l => l.botId === botId);
    }
};

// ============================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ LOGGER UI
// ============================================================================

/**
 * Переключение видимости logger
 */
function toggleLogger() {
    const container = document.getElementById('logger-container');
    if (!container) return;

    Logger.isVisible = !Logger.isVisible;

    if (Logger.isVisible) {
        container.classList.add('show');
        Logger.render();
    } else {
        container.classList.remove('show');
    }
}

/**
 * Переключение группы статусов в logger
 * @param {string} group - Название группы
 */
function toggleStatusGroup(group) {
    const content = document.getElementById(`status-${group}`);
    const icon = document.querySelector(`[onclick="toggleStatusGroup('${group}')"] i`);

    if (content) {
        content.classList.toggle('collapsed');
    }
    if (icon) {
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-right');
    }
}

// ============================================================================
// DRAG & DROP ДЛЯ LOGGER
// ============================================================================

let loggerDragOffset = { x: 0, y: 0 };
let isLoggerDragging = false;

/**
 * Начало перетаскивания logger
 * @param {MouseEvent} e - Событие мыши
 */
function startLoggerDrag(e) {
    const container = document.getElementById('logger-container');
    if (!container || e.target.closest('.logger-content')) return;

    isLoggerDragging = true;
    const rect = container.getBoundingClientRect();
    loggerDragOffset.x = e.clientX - rect.left;
    loggerDragOffset.y = e.clientY - rect.top;

    document.addEventListener('mousemove', onLoggerDrag);
    document.addEventListener('mouseup', stopLoggerDrag);
}

/**
 * Перетаскивание logger
 * @param {MouseEvent} e - Событие мыши
 */
function onLoggerDrag(e) {
    if (!isLoggerDragging) return;

    const container = document.getElementById('logger-container');
    if (!container) return;

    const x = e.clientX - loggerDragOffset.x;
    const y = e.clientY - loggerDragOffset.y;

    // Ограничиваем позицию в пределах окна
    const maxX = window.innerWidth - container.offsetWidth;
    const maxY = window.innerHeight - container.offsetHeight;

    container.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    container.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
}

/**
 * Окончание перетаскивания logger
 */
function stopLoggerDrag() {
    isLoggerDragging = false;
    document.removeEventListener('mousemove', onLoggerDrag);
    document.removeEventListener('mouseup', stopLoggerDrag);
}

console.log('[Lababot] logger.js loaded');
