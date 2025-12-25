// ========== JWT Decode ==========
// Декодирует JWT токен и возвращает payload
// Используется для получения реального AccountId из токена авторизации
function decodeJwtPayload(token) {
    try {
        // JWT структура: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.error('[JWT] Неверный формат токена');
            return null;
        }

        // Декодируем payload (вторая часть)
        const payload = parts[1];
        // Base64Url -> Base64
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        // Декодируем
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );

        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('[JWT] Ошибка декодирования:', error.message);
        return null;
    }
}

// Получает реальный AccountId из JWT токена
function getAccountIdFromToken(token) {
    const payload = decodeJwtPayload(token);
    if (!payload) return null;

    // LadaDate использует unique_name для AccountId
    return payload.unique_name || payload.sub || payload.userId || payload.accountId || null;
}

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

    console.log(`\n%c════════════════════════════════════════════════════`, 'color: #00bcd4');
    console.log(`%c[Proxy Setup] Бот: ${botId} (анкета #${accountNumber})`, 'color: #00bcd4; font-weight: bold');
    console.log(`%c[Proxy Setup] Прокси: ${proxyString ? proxyString.replace(/:[^:]+$/, ':***') : 'НЕТ'}`, 'color: #00bcd4');
    console.log(`%c════════════════════════════════════════════════════\n`, 'color: #00bcd4');

    try {
        // 1. Устанавливаем прокси для API сессии бота (partition: persist:${botId})
        const result = await ipcRenderer.invoke('set-session-proxy', { botId, proxyString });

        if (result.success) {
            console.log(`%c[Proxy API] ✅ Бот ${botId}: прокси для API установлен`, 'color: green');
        } else {
            console.error(`[Proxy API] ❌ Ошибка для ${botId}:`, result.error);
        }

        // 2. ВАЖНО: Устанавливаем прокси для WebView сессии (partition: persist:wv_${botId})
        // Это критично для быстрой загрузки при заблокированном IP!
        try {
            const wvResult = await ipcRenderer.invoke('set-webview-proxy', { botId, proxyString });

            if (wvResult.success) {
                console.log(`%c[Proxy WebView] ✅ Бот ${botId}: прокси для WebView установлен`, 'color: green; font-weight: bold');
                console.log(`%c[Proxy WebView] Partition: ${wvResult.partition}`, 'color: green');
            } else {
                console.error(`[Proxy WebView] ❌ Ошибка для ${botId}:`, wvResult.error);
            }
        } catch (wvErr) {
            console.error('[Proxy WebView] ❌ IPC ошибка:', wvErr);
        }

        // 3. Сохраняем прокси для API запросов через main процесс
        try {
            // Устанавливаем прокси для конкретного бота (для IPC api-request)
            await ipcRenderer.invoke('set-bot-proxy', { botId, proxyString });

            // Также устанавливаем как default если это первый бот с прокси
            if (!defaultProxySet && proxyString) {
                await ipcRenderer.invoke('set-bot-proxy', { botId: 'default', proxyString });
                defaultProxySet = true;
                console.log(`%c[Proxy Default] ✅ Установлен глобальный прокси: ${proxyString.replace(/:[^:]+$/, ':***')}`, 'color: green; font-weight: bold');
            }
        } catch (e) {
            console.error('[Proxy] IPC ошибка:', e);
        }

        console.log(`%c[Proxy Setup] ✅ Настройка завершена для ${botId}\n`, 'color: #00bcd4; font-weight: bold');
        return result;
    } catch (err) {
        console.error(`[Proxy] ❌ IPC ошибка для ${botId}:`, err);
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

// ========== MD5 Hash Function ==========
// Вычисляет MD5 хеш из ArrayBuffer (для фото вложений)
function calculateMD5(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);

    function md5cycle(x, k) {
        let a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    }

    function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }

    function add32(a, b) {
        return (a + b) & 0xFFFFFFFF;
    }

    function md5blk(s) {
        const md5blks = [];
        for (let i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s[i] + (s[i + 1] << 8) + (s[i + 2] << 16) + (s[i + 3] << 24);
        }
        return md5blks;
    }

    function rhex(n) {
        const hex_chr = '0123456789abcdef';
        let s = '';
        for (let j = 0; j < 4; j++) {
            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
        }
        return s;
    }

    // Padding
    const n = bytes.length;
    let state = [1732584193, -271733879, -1732584194, 271733878];
    let tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let i;

    for (i = 64; i <= n; i += 64) {
        md5cycle(state, md5blk(bytes.subarray(i - 64, i)));
    }

    const remaining = bytes.subarray(i - 64);
    const len = remaining.length;
    tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    for (i = 0; i < len; i++) {
        tail[i >> 2] |= remaining[i] << ((i % 4) << 3);
    }
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);

    if (i > 55) {
        md5cycle(state, tail);
        tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    tail[14] = n * 8;
    md5cycle(state, tail);

    return rhex(state[0]) + rhex(state[1]) + rhex(state[2]) + rhex(state[3]);
}
