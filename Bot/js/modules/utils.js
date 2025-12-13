const forbiddenWords = [
    "Fuck", "Shit", "Ass", "Bitch", "Damn", "Hell", "Dick", "Cunt", "Pussy", 
    "Cock", "Tits", "Bastard", "Motherfucker", "Asshole", "Son of a bitch", 
    "Goddammit", "Piss", "Crap", "Fart", "Wanker"
];

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
// proxy1 → анкеты 1-10, proxy2 → анкеты 11-20, и т.д.
function getProxyForAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber < 1) return null;

    // Определяем какой прокси использовать (1-10 → proxy1, 11-20 → proxy2, ...)
    const proxyIndex = Math.ceil(accountNumber / 10);

    // Максимум 6 прокси
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
    console.log(`%c[Proxy DEBUG] setWebviewProxy вызван для botId: ${botId}`, 'color: blue; font-weight: bold');

    const accountNumber = getAccountNumber(botId);
    console.log(`[Proxy DEBUG] Номер анкеты: ${accountNumber}`);

    const proxyString = getProxyForAccountNumber(accountNumber);
    console.log(`[Proxy DEBUG] Прокси строка: "${proxyString}"`);

    // Дополнительная отладка - выводим все прокси из globalSettings
    console.log(`[Proxy DEBUG] globalSettings.proxy1: "${globalSettings.proxy1}"`);
    console.log(`[Proxy DEBUG] globalSettings.proxy2: "${globalSettings.proxy2}"`);
    console.log(`[Proxy DEBUG] globalSettings.proxy3: "${globalSettings.proxy3}"`);

    try {
        // 1. Устанавливаем прокси для webview сессии бота
        console.log(`[Proxy DEBUG] Вызываю IPC set-session-proxy для ${botId}...`);
        const result = await ipcRenderer.invoke('set-session-proxy', { botId, proxyString });
        console.log(`[Proxy DEBUG] Результат IPC set-session-proxy:`, result);

        if (result.success) {
            console.log(`%c[Proxy] Бот ${botId} (анкета #${accountNumber}): ${proxyString || 'без прокси'}`, 'color: green; font-weight: bold');
        } else {
            console.error(`[Proxy] Ошибка для ${botId}:`, result.error);
        }

        // 2. Устанавливаем прокси для default session (для axios запросов)
        // Устанавливаем при первом боте с прокси (для всех последующих axios запросов)
        if (!defaultProxySet && proxyString) {
            try {
                console.log(`[Proxy DEBUG] Вызываю IPC set-default-session-proxy...`);
                const defaultResult = await ipcRenderer.invoke('set-default-session-proxy', { proxyString });
                console.log(`[Proxy DEBUG] Результат IPC set-default-session-proxy:`, defaultResult);

                if (defaultResult.success) {
                    defaultProxySet = true;
                    console.log(`%c[Proxy Default] Установлен глобальный прокси: ${proxyString}`, 'color: green; font-weight: bold');
                } else {
                    console.error(`[Proxy Default] Ошибка:`, defaultResult.error);
                }
            } catch (e) {
                console.error('[Proxy Default] IPC ошибка:', e);
            }
        } else if (defaultProxySet) {
            console.log(`[Proxy DEBUG] Default session прокси уже установлен`);
        } else {
            console.log(`[Proxy DEBUG] Нет прокси для установки в default session`);
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

function showToast(text) {
    const t = document.getElementById('error-toast');
    document.getElementById('error-toast-text').innerText = text;
    t.classList.add('show');
    if(t.hideTimer) clearTimeout(t.hideTimer);
    t.hideTimer = setTimeout(() => { t.classList.remove('show'); }, 3000);
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
