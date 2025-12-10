const KEEP_ALIVE_SCRIPT = `
    console.log("%c[Lababot] Анти-сон активирован", "color: green; font-weight: bold");
    Object.defineProperty(document, 'hidden', { value: false, writable: false });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });

    setInterval(() => {
        const x = Math.floor(Math.random() * window.innerWidth);
        const y = Math.floor(Math.random() * window.innerHeight);
        const moveEvent = new MouseEvent('mousemove', {
            view: window, bubbles: true, cancelable: true, clientX: x, clientY: y
        });
        document.dispatchEvent(moveEvent);
        if (Math.random() > 0.8) {
            window.scrollBy(0, (Math.random() < 0.5 ? -10 : 10));
        }
    }, 10000 + Math.random() * 5000); 

    setInterval(() => {
        document.querySelectorAll('button, a').forEach(el => {
            if(el.innerText && (el.innerText.includes('Keep me logged in') || el.innerText.includes('Online'))) {
                el.click();
                console.log("[Lababot] Нажата кнопка подтверждения активности");
            }
        });
    }, 5000);
`;

// --- ОБНОВЛЕНИЕ 1: Функция для переключения группы кнопок ---
function toggleStatusGroup() {
    const container = document.getElementById('status-buttons-container');
    const toggleBtn = document.getElementById('btn-group-toggle');
    container.classList.toggle('show');
    toggleBtn.classList.toggle('open');
    // Меняем иконку для красоты (опционально, можно оставить только поворот)
    const icon = toggleBtn.querySelector('i');
    if (toggleBtn.classList.contains('open')) {
        icon.classList.remove('fa-caret-right');
        icon.classList.add('fa-caret-down');
    } else {
        icon.classList.remove('fa-caret-down');
        icon.classList.add('fa-caret-right');
    }
}
const Logger = {
    logs: [],
    add: function(text, type, botId, data = null) {
        const now = Date.now();
        const logItem = { id: now, text, type, botId, data, time: new Date() };
        
        this.logs.unshift(logItem); 
        
        if (this.logs.length > 300) {
            this.logs = this.logs.slice(0, 300);
        }

        this.render();
        
        const win = document.getElementById('logger-window');
        if(!win.classList.contains('show')) {
            document.getElementById('btn-logger-main').classList.add('blinking');
        }

        if (type === 'chat') playSound('chat');
        else if (type === 'chat-request') playSound('chat'); // Новый запрос на чат
        else if (type === 'mail') playSound('message');
        else if (type === 'bday') playSound('online');
        else if (type === 'vip-online') playSound('online'); 
    },
    render: function() {
        const container = document.getElementById('logger-content');
        if(!this.logs.length) { container.innerHTML = '<div class="text-center text-muted small mt-5">Событий пока нет...</div>'; return; }
        
        let html = '';
        const now = Date.now();
        
        this.logs.forEach(l => {
            const isFresh = (now - l.id) < 60000; 
            const timeStr = l.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const colorClass = isFresh ? 'fresh' : 'old';
            
            let content = ``;
            const partnerId = l.data && l.data.partnerId ? l.data.partnerId : '???';
            const partnerName = l.data && l.data.partnerName ? l.data.partnerName : `ID ${partnerId}`;
            const targetBotDisplayId = bots[l.botId] ? bots[l.botId].displayId : '???';
            
            let linkAction = '';
            let logClass = '';
            
            if (l.type === 'chat' || l.type === 'mail') {
                 linkAction = `openMiniChat('${l.botId}', '${partnerId}', '${partnerName}', '${l.type}')`;
                 content = `${l.type === 'chat' ? '💬' : '💌'} Новое ${l.type === 'chat' ? 'сообщение' : 'письмо'} от <b>${partnerName}</b> (ID ${partnerId})`;
            } else if (l.type === 'chat-request') {
                 // Новый запрос на чат с текстом сообщения
                 logClass = 'new-chat';
                 linkAction = `openMiniChat('${l.botId}', '${partnerId}', '${partnerName}', 'chat')`;
                 const msgBody = l.data && l.data.messageBody ? l.data.messageBody : '';
                 content = `🆕 Новый чат от <b>${partnerName}</b>: "${msgBody}"`;
            } else if (l.type === 'vip-online') {
                 logClass = 'vip';
                 linkAction = `openMiniChat('${l.botId}', '${partnerId}', '${partnerName}', 'mail')`;
                 content = `👑 VIP <b>${partnerName}</b> (ID ${partnerId}) теперь ONLINE!`;
            } else if (l.type === 'bday') {
                 linkAction = `selectTab('${l.botId}')`; 
                 content = l.text; 
            } else if (l.type === 'log') {
                content = l.text;
            }
            
            if(l.type !== 'log') {
                html += `<div class="log-entry ${colorClass} ${logClass}">
                    <span class="log-time">${timeStr} | Анкета ${targetBotDisplayId}</span><br>
                    <span class="log-link" onclick="${linkAction}">${content}</span>
                </div>`;
            } else {
                 html += `<div class="log-entry ${colorClass}">${l.text}</div>`;
            }
        });
        container.innerHTML = html;
    },
    cleanOld: function() { this.render(); }
};
setInterval(() => Logger.cleanOld(), 5000);
const loggerWin = document.getElementById('logger-window');
const loggerHead = document.getElementById('logger-header');
const resizeHandle = document.getElementById('logger-resize-handle');

let isDragging = false, dragOffset = {x:0, y:0};
loggerHead.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragOffset.x = e.clientX - loggerWin.offsetLeft;
    dragOffset.y = e.clientY - loggerWin.offsetTop;
    e.preventDefault();
});

let isResizing = false;
let startW = 0, startH = 0, startX = 0, startY = 0;

resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = parseInt(document.defaultView.getComputedStyle(loggerWin).width, 10);
    startH = parseInt(document.defaultView.getComputedStyle(loggerWin).height, 10);
    e.stopPropagation();
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if(isDragging) {
        loggerWin.style.left = (e.clientX - dragOffset.x) + 'px';
        loggerWin.style.top = (e.clientY - dragOffset.y) + 'px';
    }
    if(isResizing) {
        const newWidth = startW + (startX - e.clientX);
        const newHeight = startH + (e.clientY - startY);
        if(newWidth > 200 && newWidth < 1200) {
            loggerWin.style.width = newWidth + 'px';
            loggerWin.style.left = (e.clientX - newWidth) + 'px'; 
        }
        if(newHeight > 200 && newHeight < 1000) {
            loggerWin.style.height = newHeight + 'px';
        }
    }
});
document.addEventListener('mouseup', () => { isDragging = false; isResizing = false; });

function toggleLogger() {
    loggerWin.classList.toggle('show');
    if(loggerWin.classList.contains('show')) {
        document.getElementById('btn-logger-main').classList.remove('blinking');
    }
}
