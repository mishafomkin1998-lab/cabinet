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

// Парсинг простого формата ip:port
function parseSimpleProxy(proxyString) {
    if (!proxyString) return null;
    const trimmed = proxyString.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(':');
    if (parts.length !== 2) return null;

    const [host, portStr] = parts;
    const port = parseInt(portStr);

    // Проверка валидности
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(host) || isNaN(port) || port < 1 || port > 65535) {
        return null;
    }

    return {
        host: host,
        port: port,
        protocol: 'http'
    };
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
