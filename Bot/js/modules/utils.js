const forbiddenWords = [
    "Fuck", "Shit", "Ass", "Bitch", "Damn", "Hell", "Dick", "Cunt", "Pussy",
    "Cock", "Tits", "Bastard", "Motherfucker", "Asshole", "Son of a bitch",
    "Goddammit", "Piss", "Crap", "Fart", "Wanker"
];

// ========== Custom Confirm Modal ==========
// Заменяет стандартный confirm() на красивую модалку
// Использование: if (await customConfirm('Удалить?')) { ... }
// Опции: { type: 'warning'|'danger'|'info', okText: 'OK', cancelText: 'Отмена', okDanger: false }
function customConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const messageEl = document.getElementById('confirm-modal-message');
        const iconEl = document.getElementById('confirm-modal-icon');
        const okBtn = document.getElementById('confirm-modal-ok');
        const cancelBtn = document.getElementById('confirm-modal-cancel');

        const { type = 'warning', okText = 'OK', cancelText = 'Отмена', okDanger = false } = options;

        // Установка сообщения
        messageEl.textContent = message;

        // Установка иконки
        iconEl.className = 'confirm-modal-icon ' + type;
        iconEl.textContent = type === 'danger' ? '🗑️' : type === 'info' ? 'ℹ️' : '⚠️';

        // Установка текста кнопок
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        // Стиль кнопки OK
        okBtn.className = 'confirm-modal-btn ok' + (okDanger || type === 'danger' ? ' danger' : '');

        // Функции закрытия
        function closeAndResolve(result) {
            modal.classList.remove('show');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdrop);
            document.removeEventListener('keydown', handleKeydown);
            resolve(result);
        }

        function handleOk() { closeAndResolve(true); }
        function handleCancel() { closeAndResolve(false); }
        function handleBackdrop(e) { if (e.target === modal) closeAndResolve(false); }
        function handleKeydown(e) {
            if (e.key === 'Escape') closeAndResolve(false);
            if (e.key === 'Enter') closeAndResolve(true);
        }

        // Подписка на события
        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);
        document.addEventListener('keydown', handleKeydown);

        // Показ модалки
        modal.classList.add('show');
        okBtn.focus();
    });
}

function parseProxyUrl(proxyUrlString) {
    if (!proxyUrlString) return null;
    try {
        const url = new URL(proxyUrlString);
        const proxyConfig = {
            host: url.hostname,
            port: url.port,
            protocol: url.protocol.replace(':', '')
        };
        if (url.username && url.password) {
            proxyConfig.auth = { username: url.username, password: url.password };
        }
        return proxyConfig;
    } catch (e) { return null; }
}

// Парсинг простого формата ip:port или domain:port:user:pass
function parseSimpleProxy(proxyString) {
    if (!proxyString) return null;
    const trimmed = proxyString.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(':');

    // Поддерживаем форматы:
    // 1. ip:port
    // 2. domain:port
    // 3. ip:port:user:pass
    // 4. domain:port:user:pass
    if (parts.length !== 2 && parts.length !== 4) return null;

    const [host, portStr, username, password] = parts;
    const port = parseInt(portStr);

    // Проверка валидности порта
    if (isNaN(port) || port < 1 || port > 65535) {
        return null;
    }

    // Проверка хоста (IP или домен)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!ipRegex.test(host) && !domainRegex.test(host)) {
        return null;
    }

    const proxyConfig = {
        host: host,
        port: port,
        protocol: 'http'
    };

    // Если есть логин/пароль - добавляем
    if (parts.length === 4 && username && password) {
        proxyConfig.auth = {
            username: username,
            password: password
        };
    }

    return proxyConfig;
}

// ============= ПРОКСИ ДЛЯ WEBVIEW =============
// Получить прокси для анкеты по её номеру (порядку добавления)
// proxy1 → анкеты 1-25, proxy2 → анкеты 26-50, и т.д.
function getProxyForAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber < 1) return null;

    // Определяем какой прокси использовать (1-25 → proxy1, 26-50 → proxy2, ...)
    const proxyIndex = Math.ceil(accountNumber / 25);

    // Максимум 6 прокси (до 150 анкет)
    if (proxyIndex > 6) return null;

    const proxyKey = `proxy${proxyIndex}`;
    const proxyValue = globalSettings[proxyKey];

    if (!proxyValue || proxyValue.trim() === '') return null;

    return proxyValue.trim();
}

// Получить номер анкеты по её botId (порядок в объекте bots)
function getAccountNumber(botId) {
    const botIds = Object.keys(bots);
    const index = botIds.indexOf(botId);
    return index >= 0 ? index + 1 : null;
}

// Флаг - был ли установлен глобальный прокси для defaultSession
let defaultProxySet = false;

// Установить прокси для webview сессии бота
async function setWebviewProxy(botId) {
    const accountNumber = getAccountNumber(botId);
    const proxyString = getProxyForAccountNumber(accountNumber);

    try {
        // 1. Устанавливаем прокси для webview сессии бота
        const result = await ipcRenderer.invoke('set-session-proxy', { botId, proxyString });

        if (result.success) {
            console.log(`[Proxy] Бот ${botId} (анкета #${accountNumber}): ${proxyString || 'без прокси'}`);
        } else {
            console.error(`[Proxy] Ошибка для ${botId}:`, result.error);
        }

        // 2. Сохраняем прокси для API запросов через main процесс
        try {
            // Устанавливаем прокси для конкретного бота (для IPC api-request)
            await ipcRenderer.invoke('set-bot-proxy', { botId, proxyString });

            // Также устанавливаем как default если это первый бот с прокси
            if (!defaultProxySet && proxyString) {
                await ipcRenderer.invoke('set-bot-proxy', { botId: 'default', proxyString });
                defaultProxySet = true;
                console.log(`%c[Proxy Default] Установлен глобальный прокси: ${proxyString}`, 'color: green; font-weight: bold');
            }
        } catch (e) {
            console.error('[Proxy] IPC ошибка:', e);
        }

        return result;
    } catch (err) {
        console.error(`[Proxy] IPC ошибка для ${botId}:`, err);
        return { success: false, error: err.message };
    }
}

const LADADATE_BASE_URL = 'https://ladadate.com';
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// --- ОБНОВЛЕНИЕ 2: НОВАЯ ЛОГИКА Drag and Drop (Сортировка вместо плавания) ---
let draggingTabEl = null;

function startTabDrag(e, tabEl) {
    if (e.target.closest('.tab-close')) return; // Не перетаскивать, если клик на крестик
    
    draggingTabEl = tabEl;
    draggingTabEl.classList.add('dragging');
    
    document.addEventListener('mousemove', handleTabMove);
    document.addEventListener('mouseup', stopTabDrag);
}

function handleTabMove(e) {
    if (!draggingTabEl) return;
    e.preventDefault();

    const tabsContainer = document.getElementById('tabs-bar');
    const allTabs = Array.from(tabsContainer.children);
    
    // Находим элемент, над которым сейчас курсор
    const targetTab = allTabs.find(tab => {
        if (tab === draggingTabEl) return false;
        const rect = tab.getBoundingClientRect();
        return (e.clientX > rect.left && e.clientX < rect.right &&
                e.clientY > rect.top && e.clientY < rect.bottom);
    });

    if (targetTab) {
        // Определяем индекс текущего и целевого элемента
        const currentIndex = allTabs.indexOf(draggingTabEl);
        const targetIndex = allTabs.indexOf(targetTab);

        // Меняем местами в DOM (браузер сам анимирует сдвиг)
        if (currentIndex < targetIndex) {
            tabsContainer.insertBefore(draggingTabEl, targetTab.nextSibling);
        } else {
            tabsContainer.insertBefore(draggingTabEl, targetTab);
        }
    }
}

function stopTabDrag() {
    if (draggingTabEl) {
        draggingTabEl.classList.remove('dragging');
        draggingTabEl = null;
        
        // Пересохраняем порядок ботов
        const newOrderIds = Array.from(document.querySelectorAll('.tab-item')).map(t => t.id.replace('tab-', ''));
        const newBots = {};
        newOrderIds.forEach(id => {
            if(bots[id]) newBots[id] = bots[id];
        });
        bots = newBots; 
        saveSession();
    }
    document.removeEventListener('mousemove', handleTabMove);
    document.removeEventListener('mouseup', stopTabDrag);
}
function validateInput(textarea) {
    let val = textarea.value;
    let original = val;
    let errorMsg = null;
    for (let word of forbiddenWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(val)) { val = val.replace(regex, ''); errorMsg = "Запрещено использовать ругательство"; }
    }
    if (/\d{6,}/.test(val)) { val = val.replace(/\d{6,}/g, ''); errorMsg = "Запрещено вставлять ID"; }
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|ru|ua|io)\b)/gi;
    if (linkRegex.test(val)) { val = val.replace(linkRegex, ''); errorMsg = "Запрещено вставлять ссылки"; }
    if (val !== original) { textarea.value = val; if (errorMsg) showToast(errorMsg); }
}

function showToast(text, type = 'error') {
    const t = document.getElementById('error-toast');
    const icon = t.querySelector('i');
    document.getElementById('error-toast-text').innerText = text;

    // Убираем все классы типов
    t.classList.remove('toast-error', 'toast-success', 'toast-warning');

    // Добавляем нужный класс и иконку
    if (type === 'success') {
        t.classList.add('toast-success');
        icon.className = 'fa fa-check-circle';
    } else if (type === 'warning') {
        t.classList.add('toast-warning');
        icon.className = 'fa fa-exclamation-triangle';
    } else {
        t.classList.add('toast-error');
        icon.className = 'fa fa-exclamation-circle';
    }

    t.classList.add('show');
    if(t.hideTimer) clearTimeout(t.hideTimer);
    t.hideTimer = setTimeout(() => { t.classList.remove('show'); }, 3000);
}

// Извлечение реального сообщения об ошибке из API ответа
function extractApiError(response, defaultMessage = 'Неизвестная ошибка') {
    if (!response) return defaultMessage;

    const data = response.data;

    // Логируем полный ответ для отладки
    console.log('📋 API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        data: data,
        dataType: typeof data,
        dataKeys: data ? Object.keys(data) : []
    });

    if (!data) return `${defaultMessage} (${response.status})`;

    // Проверяем различные возможные поля с сообщением об ошибке
    const possibleFields = [
        'Error',           // LadaDate может использовать это
        'Message',         // Или это
        'error',           // Стандартное lowercase
        'message',         // Стандартное lowercase
        'ErrorMessage',    // Комбинированное
        'errorMessage',    // Комбинированное lowercase
        'reason',          // Причина
        'Reason',          // Причина с большой буквы
        'description',     // Описание
        'Description',     // Описание с большой буквы
        'detail',          // Детали
        'Detail',          // Детали с большой буквы
        'text',            // Текст
        'Text'             // Текст с большой буквы
    ];

    // Если data - строка, используем её напрямую
    if (typeof data === 'string') {
        return data || defaultMessage;
    }

    // Проверяем каждое возможное поле
    for (const field of possibleFields) {
        if (data[field]) {
            return data[field];
        }
    }

    // Проверяем вложенные объекты error/Error
    if (data.error && typeof data.error === 'object') {
        for (const field of possibleFields) {
            if (data.error[field]) {
                return data.error[field];
            }
        }
    }
    if (data.Error && typeof data.Error === 'object') {
        for (const field of possibleFields) {
            if (data.Error[field]) {
                return data.Error[field];
            }
        }
    }

    // Если ничего не нашли, возвращаем JSON данных или дефолт
    try {
        const jsonStr = JSON.stringify(data);
        if (jsonStr && jsonStr !== '{}' && jsonStr.length < 200) {
            return `${defaultMessage}: ${jsonStr}`;
        }
    } catch (e) { /* JSON.stringify может упасть на circular refs - игнорируем */ }

    return `${defaultMessage} (${response.status})`;
}

function initTooltips() {
    let tooltipTimeout;
    const popup = document.getElementById('tooltip-popup');
    document.addEventListener('mouseover', function(e) {
        const target = e.target.closest('[data-tip]');
        if (!target) return;
        const text = target.getAttribute('data-tip');
        tooltipTimeout = setTimeout(() => {
            popup.innerText = text;
            const rect = target.getBoundingClientRect();
            popup.style.top = (rect.bottom + 5) + 'px';
            popup.style.left = (rect.left + (rect.width/2) - (popup.offsetWidth/2)) + 'px';
            if(parseInt(popup.style.left) < 5) popup.style.left = '5px';
            popup.classList.add('show');
        }, 500);
    });
    document.addEventListener('mouseout', function(e) {
        if (e.target.closest('[data-tip]')) { clearTimeout(tooltipTimeout); popup.classList.remove('show'); }
    });
    document.addEventListener('mousedown', function() { clearTimeout(tooltipTimeout); popup.classList.remove('show'); });
}
