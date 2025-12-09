/**
 * main.js - Главный модуль приложения
 * Инициализация, управление вкладками, интерфейсом, сессией
 */

// ============================================================================
// СОЗДАНИЕ ИНТЕРФЕЙСА БОТА
// ============================================================================

function createInterface(bot) {
    const tab = document.createElement('div');
    tab.className = 'tab-item';
    tab.id = `tab-${bot.id}`;
    tab.onclick = () => selectTab(bot.id);
    tab.oncontextmenu = (e) => onTabRightClick(e, bot.id);
    tab.onmousedown = (e) => startTabDrag(e, tab);
    tab.innerHTML = `<div class="status-dot online"></div><span class="tab-id">${bot.displayId}</span><span class="tab-spinner"><i class="fa fa-sync fa-spin"></i></span><span class="tab-close" onclick="closeTab(event, '${bot.id}')"><i class="fa fa-times"></i></span>`;
    document.getElementById('tabs-bar').appendChild(tab);

    const ws = document.createElement('div');
    ws.className = 'workspace';
    ws.id = `ws-${bot.id}`;
    const row = document.createElement('div');
    row.className = 'row h-100 g-2';

    // Col 1 - Шаблоны
    const col1 = document.createElement('div');
    col1.className = 'col-3';
    col1.innerHTML = `
        <div class="panel-col">
            <div class="col-title" id="title-tpl-${bot.id}">Шаблоны Писем</div>
            <select id="tpl-select-${bot.id}" class="form-select mb-2" onchange="onTemplateSelect('${bot.id}')"><option value="">-- Выберите --</option></select>
            <div class="d-flex gap-1 mb-2">
                <button class="btn btn-sm btn-success btn-xs flex-fill" onclick="addTemplateInline('${bot.id}', event)" data-tip="Новый шаблон (Shift=всем)"><i class="fa fa-plus"></i></button>
                <button class="btn btn-sm btn-secondary btn-xs flex-fill" onclick="openTemplateModal('${bot.id}', true)" data-tip="Редактировать"><i class="fa fa-edit"></i></button>
                <button class="btn btn-sm btn-danger btn-xs flex-fill" onclick="deleteTemplate('${bot.id}', event)" data-tip="Удалить (Shift=всем)"><i class="fa fa-trash"></i></button>
                <button class="btn btn-sm btn-outline-danger btn-xs flex-fill hide-in-chat" id="btn-fav-${bot.id}" onclick="toggleTemplateFavorite('${bot.id}')" data-tip="В избранное"><i class="fa fa-heart"></i></button>
            </div>
            <div class="mt-2 text-center text-primary border-top pt-2"><small>Онлайн: <b id="online-${bot.id}" class="fs-6">...</b></small></div>
        </div>`;
    row.appendChild(col1);

    // Col 2 - Текст сообщения
    const col2 = document.createElement('div');
    col2.className = 'col-4';
    col2.innerHTML = `
        <div class="panel-col">
            <div class="col-title">
                <span id="title-text-${bot.id}">Письмо</span>
                <div class="ai-container ${globalSettings.extendedFeatures ? '' : 'ai-hidden'}">
                    <button class="btn-ai-main" onclick="toggleAI('${bot.id}')"><i class="fa fa-magic"></i> AI</button>
                    <div class="ai-options" id="ai-options-${bot.id}">
                        <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'improve', event)" title="Shift=всем"><i class="fa fa-check"></i> Improve</button>
                        <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'generate', event)" title="Shift=всем"><i class="fa fa-pencil"></i> Generate</button>
                        <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'myprompt', event)" title="Shift=всем"><i class="fa fa-user"></i> My Prompt</button>
                    </div>
                </div>
            </div>
            <div class="relative-box d-flex flex-column flex-grow-1">
                <textarea id="msg-${bot.id}" class="textarea-msg form-control" disabled placeholder="Текст..." onclick="this.focus()" oninput="checkVarTrigger(this, 'vars-dropdown-${bot.id}'); bots['${bot.id}'].updateUI(); validateInput(this); autoSaveTemplateText('${bot.id}')" onblur="saveTemplateTextNow('${bot.id}')"></textarea>
                <div id="vars-dropdown-${bot.id}" class="vars-dropdown">
                    <div class="vars-item" onclick="applyVar('msg-${bot.id}', '{City}', 'vars-dropdown-${bot.id}')"><b>{City}</b></div>
                    <div class="vars-item" onclick="applyVar('msg-${bot.id}', '{Name}', 'vars-dropdown-${bot.id}')"><b>{Name}</b></div>
                    <div class="vars-item" onclick="applyVar('msg-${bot.id}', '{Age}', 'vars-dropdown-${bot.id}')"><b>{Age}</b></div>
                </div>
            </div>
            <div id="active-invite-${bot.id}" class="active-invite-box hide-in-mail"></div>
            <div class="photo-block hide-in-chat">
                <div id="preview-box-${bot.id}" class="photo-preview-float"><img id="preview-img-${bot.id}"></div>
                <label id="photo-label-${bot.id}" class="photo-select-area">
                    <i class="fa fa-camera"></i> <span id="photo-name-${bot.id}" class="photo-name">Прикрепить фото</span>
                    <input type="file" id="photo-input-${bot.id}" hidden onchange="onPhotoSelect('${bot.id}')">
                </label>
                <button class="btn-remove-photo" onclick="removePhoto('${bot.id}')"><i class="fa fa-times"></i></button>
            </div>
        </div>`;
    row.appendChild(col2);

    // Col 3 - Настройки
    const col3 = document.createElement('div');
    col3.className = 'col-3';
    col3.innerHTML = `
        <div class="panel-col">
            <div class="col-title">Настройки</div>
            <select id="target-select-${bot.id}" class="form-select form-select-sm mb-1" onchange="updateSettings('${bot.id}')">
                <option value="online">Online</option>
                <option value="favorites">I am a favorite of</option>
                <option value="my-favorites">My favorite</option>
                <option value="inbox">Inbox (Unreplied)</option>
                <option value="payers">Payers</option>
            </select>
            <div class="d-flex align-items-center gap-2 mb-2">
                <select class="form-select form-select-sm" id="speed-select-${bot.id}" style="width: 100px;" onmousedown="shiftWasPressed=event.shiftKey" onchange="handleSpeedChange('${bot.id}', this.value)" title="Скорость (Shift=всем)">
                    <option value="smart" selected>Smart</option>
                    <option value="15">15s</option>
                    <option value="30">30s</option>
                </select>
                <div class="form-check small m-0 hide-in-chat" title="Auto">
                    <input class="form-check-input" type="checkbox" id="auto-check-${bot.id}" onmousedown="shiftWasPressed=event.shiftKey" onchange="handleAutoChange('${bot.id}')">
                    <label class="form-check-label text-muted" for="auto-check-${bot.id}">Auto</label>
                </div>
                <div class="form-check small m-0 hide-in-chat" title="Только с фото">
                    <input class="form-check-input" type="checkbox" id="check-photo-${bot.id}" onchange="updateSettings('${bot.id}')">
                    <label class="form-check-label text-muted" for="check-photo-${bot.id}">Photo</label>
                </div>
            </div>
            <div class="mb-2 hide-in-mail p-2 bg-light border rounded">
                <label class="form-label small mb-0 text-muted">Следующий инвайт через</label>
                <select class="form-select form-select-sm mb-1" id="rot-time-${bot.id}" onchange="updateChatRotation('${bot.id}')">
                    <option value="3">3 часа</option>
                    <option value="6">6 часов</option>
                    <option value="12">12 часа</option>
                    <option value="24">24 часа</option>
                </select>
                <div class="form-check small">
                    <input class="form-check-input" type="checkbox" id="rot-cyclic-${bot.id}" onchange="updateChatRotation('${bot.id}')">
                    <label class="form-check-label" for="rot-cyclic-${bot.id}">Циклично</label>
                </div>
            </div>
            <button id="btn-start-${bot.id}" class="btn btn-primary w-100 mb-2" onclick="toggleBot('${bot.id}')"><i class="fa fa-paper-plane"></i> Старт</button>
            <div class="border-top pt-2">
                <div class="stat-line text-success"><span>Отправлено:</span> <b id="stat-sent-${bot.id}" class="stat-val" onclick="openStatsModal('${bot.id}', 'sent')">0</b></div>
                <div class="stat-line text-danger"><span>Ошибки:</span> <b id="stat-err-${bot.id}" class="stat-val" onclick="openStatsModal('${bot.id}', 'errors')">0</b></div>
                <div id="stat-wait-${bot.id}" class="stat-waiting-text">Ожидают: 0</div>
            </div>
            <div id="log-${bot.id}" class="action-log mt-2" style="flex-grow: 1;"></div>
        </div>`;
    row.appendChild(col3);

    // Col 4 - Blacklist
    const col4 = document.createElement('div');
    col4.className = 'col-2';
    col4.innerHTML = `
        <div class="panel-col">
            <div class="col-title">Blacklist</div>
            <div id="bl-list-${bot.id}" class="scroll-list"></div>
            <button class="btn btn-success w-100 btn-sm" onclick="openBlacklistModal('${bot.id}')" data-tip="Добавить ID">+ Добавить ID</button>
            <div class="bl-actions">
                <button class="btn btn-outline-danger btn-sm flex-fill" onclick="removeSelectedBlacklist('${bot.id}')" data-tip="Удалить выбранный"><i class="fa fa-trash"></i></button>
                <button class="btn btn-vip btn-sm flex-fill" onclick="toggleVipStatus('${bot.id}')" data-tip="VIP Клиент"><i class="fa fa-star"></i></button>
            </div>
        </div>`;
    row.appendChild(col4);

    ws.appendChild(row);
    document.getElementById('panels-container').appendChild(ws);
    updateInterfaceForMode(bot.id);
    updateBotCount();
    toggleExtendedFeatures();
}

// ============================================================================
// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ДЛЯ РЕЖИМА
// ============================================================================

function updateInterfaceForMode(botId) {
    const isChat = globalMode === 'chat';
    const bot = bots[botId];

    document.getElementById(`title-tpl-${botId}`).innerText = isChat ? "Шаблоны ЧАТА" : "Шаблоны ПИСЕМ";
    document.getElementById(`title-text-${botId}`).innerText = isChat ? "Сообщения (разд. __)" : "Текст письма";

    const chatHint = document.getElementById('chat-hint');
    if (chatHint) chatHint.style.display = isChat ? 'block' : 'none';

    const ws = document.getElementById(`ws-${botId}`);
    const targetSelect = document.getElementById(`target-select-${botId}`);

    if (isChat) {
        ws.querySelectorAll('.hide-in-chat').forEach(el => el.style.display = 'none');
        ws.querySelectorAll('.hide-in-mail').forEach(el => el.style.display = 'block');
        Array.from(targetSelect.options).forEach(opt => {
            if (['favorites', 'my-favorites', 'inbox'].includes(opt.value)) opt.style.display = 'none';
            else opt.style.display = 'block';
        });
        targetSelect.value = bot.chatSettings.target;
        document.getElementById(`rot-time-${botId}`).value = bot.chatSettings.rotationHours;
        document.getElementById(`rot-cyclic-${botId}`).checked = bot.chatSettings.cyclic;
    } else {
        ws.querySelectorAll('.hide-in-chat').forEach(el => {
            if (el.classList.contains('photo-block')) el.style.display = 'flex';
            else el.style.display = 'block';
        });
        ws.querySelectorAll('.hide-in-mail').forEach(el => el.style.display = 'none');
        Array.from(targetSelect.options).forEach(opt => opt.style.display = 'block');
        targetSelect.value = bot.mailSettings.target;
        document.getElementById(`auto-check-${botId}`).checked = bot.mailSettings.auto;
    }

    let lastIdx = isChat ? bot.lastTplChat : bot.lastTplMail;
    if (lastIdx === null || lastIdx === undefined || lastIdx === "") {
        if (accountPreferences[bot.login]) {
            lastIdx = isChat ? accountPreferences[bot.login].chatTpl : accountPreferences[bot.login].mailTpl;
            if (lastIdx !== undefined) {
                if (isChat) bot.lastTplChat = lastIdx;
                else bot.lastTplMail = lastIdx;
            }
        }
    }

    updateTemplateDropdown(botId, lastIdx);
    renderBlacklist(botId);
    bot.updateUI();
}

// ============================================================================
// УПРАВЛЕНИЕ ВКЛАДКАМИ
// ============================================================================

function selectTab(id) {
    if (activeTabId && bots[activeTabId]) {
        saveTemplateTextNow(activeTabId);
    }

    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.workspace').forEach(w => w.classList.remove('active'));
    document.querySelectorAll('webview').forEach(wv => wv.classList.remove('active'));

    const t = document.getElementById(`tab-${id}`);
    const w = document.getElementById(`ws-${id}`);
    const wv = document.getElementById(`webview-${id}`);

    if (t && w) {
        t.classList.add('active');
        w.classList.add('active');
        activeTabId = id;
        updateInterfaceForMode(id);
    }
    if (wv) wv.classList.add('active');

    document.getElementById('welcome-screen').style.display = 'none';
}

function closeTab(e, id) {
    e.stopPropagation();
    if (globalSettings.confirmTabClose && !confirm(`Закрыть вкладку ${bots[id].displayId}?`)) return;

    if (bots[id]) {
        bots[id].stopMail();
        bots[id].stopChat();
        bots[id].stopMonitoring();
        clearInterval(bots[id].keepAliveTimer);
        clearInterval(bots[id].lababotHeartbeatTimer);

        const wv = document.getElementById(`webview-${id}`);
        if (wv) wv.remove();

        delete bots[id];
    }

    document.getElementById(`tab-${id}`).remove();
    document.getElementById(`ws-${id}`).remove();

    if (activeTabId === id) {
        const remainingIds = Object.keys(bots);
        if (remainingIds.length > 0) {
            const firstTab = document.querySelector('.tab-item');
            if (firstTab) selectTab(firstTab.id.replace('tab-', ''));
            else {
                activeTabId = null;
                document.getElementById('welcome-screen').style.display = 'flex';
            }
        } else {
            activeTabId = null;
            document.getElementById('welcome-screen').style.display = 'flex';
        }
    }

    saveSession();
    updateBotCount();
}

function onTabRightClick(e, botId) {
    e.preventDefault();
    const tab = document.getElementById(`tab-${botId}`);
    const bot = bots[botId];
    bot.tabColorState = (bot.tabColorState + 1) % 4;
    tab.classList.remove('tab-green', 'tab-yellow', 'tab-red');
    if (bot.tabColorState === 1) tab.classList.add('tab-green');
    else if (bot.tabColorState === 2) tab.classList.add('tab-yellow');
    else if (bot.tabColorState === 3) tab.classList.add('tab-red');
}

// ============================================================================
// DRAG & DROP ВКЛАДОК
// ============================================================================

let draggedTab = null;
let dragStartX = 0;

function startTabDrag(e, tab) {
    if (e.button !== 0) return;
    draggedTab = tab;
    dragStartX = e.clientX;
    tab.classList.add('dragging');
    document.addEventListener('mousemove', onTabDrag);
    document.addEventListener('mouseup', stopTabDrag);
}

function onTabDrag(e) {
    if (!draggedTab) return;
    const tabsBar = document.getElementById('tabs-bar');
    const tabs = Array.from(tabsBar.querySelectorAll('.tab-item:not(.dragging)'));
    const draggedRect = draggedTab.getBoundingClientRect();

    for (const tab of tabs) {
        const rect = tab.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
            tabsBar.insertBefore(draggedTab, tab);
            return;
        }
    }
    tabsBar.appendChild(draggedTab);
}

function stopTabDrag() {
    if (draggedTab) {
        draggedTab.classList.remove('dragging');
        draggedTab = null;
    }
    document.removeEventListener('mousemove', onTabDrag);
    document.removeEventListener('mouseup', stopTabDrag);
    saveSession();
}

// ============================================================================
// УПРАВЛЕНИЕ БОТАМИ
// ============================================================================

function toggleBot(id) {
    const bot = bots[id];
    const text = document.getElementById(`msg-${id}`).value;
    if (globalMode === 'chat') {
        if (bot.isChatRunning) bot.stopChat();
        else bot.startChat(text);
    } else {
        if (bot.isMailRunning) bot.stopMail();
        else bot.startMail(text);
    }
}

function startAll() {
    Object.values(bots).forEach(b => {
        const text = document.getElementById(`msg-${b.id}`).value;
        if (globalMode === 'chat') {
            if (!b.isChatRunning) b.startChat(text);
        } else {
            if (!b.isMailRunning) b.startMail(text);
        }
    });
}

function stopAll() {
    Object.values(bots).forEach(b => {
        if (globalMode === 'chat') b.stopChat();
        else b.stopMail();
    });
}

async function clearAllStats() {
    if (!confirm("Очистить статистику на ВСЕХ анкетах?")) return;
    const type = globalMode === 'chat' ? 'chat' : 'mail';
    for (const b of Object.values(bots)) {
        if (globalMode === 'chat') {
            b.chatStats = { sent: 0, errors: 0, waiting: 0 };
            b.chatHistory = { sent: [], errors: [], waiting: [] };
        } else {
            b.mailStats = { sent: 0, errors: 0, waiting: 0 };
            b.mailHistory = { sent: [], errors: [], waiting: [] };
        }
        b.updateUI();
        await resetStatsOnServer(b.displayId, type);
    }
}

// ============================================================================
// BLACKLIST
// ============================================================================

function openBlacklistModal(botId) {
    currentModalBotId = botId;
    document.getElementById('bl-modal-input').value = '';
    openModal('bl-modal');
}

async function saveBlacklistID(event) {
    const val = document.getElementById('bl-modal-input').value.trim();
    if (!val) {
        closeModal('bl-modal');
        return;
    }

    if (event && event.shiftKey) {
        await addBlacklistToAll(val);
        closeModal('bl-modal');
        return;
    }

    if (currentModalBotId) {
        const bot = bots[currentModalBotId];
        const isChat = globalMode === 'chat';
        const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;
        if (!list.includes(val)) {
            list.push(val);
            renderBlacklist(currentModalBotId);
            await saveBlacklistToServer(bot.displayId, isChat ? 'chat' : 'mail', list);
        }
    }
    closeModal('bl-modal');
}

async function addBlacklistToAll(val) {
    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';
    const botIds = Object.keys(bots);
    let count = 0;

    for (const botId of botIds) {
        const bot = bots[botId];
        const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;
        if (!list.includes(val)) {
            list.push(val);
            renderBlacklist(botId);
            await saveBlacklistToServer(bot.displayId, type, list);
            count++;
        }
    }
    showBulkNotification(`ID ${val} добавлен в ЧС всех анкет`, count);
}

function renderBlacklist(botId) {
    const listEl = document.getElementById(`bl-list-${botId}`);
    listEl.innerHTML = "";
    const bot = bots[botId];
    const data = globalMode === 'chat' ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;

    data.forEach(id => {
        const d = document.createElement('div');
        d.className = 'list-item';
        d.innerText = id;

        if (bot.vipList.includes(id)) {
            d.classList.add('is-vip');
            d.innerHTML = `<i class="fa fa-star text-warning me-2"></i> ${id}`;
        }

        d.onclick = () => {
            listEl.querySelectorAll('.list-item').forEach(i => i.classList.remove('selected'));
            d.classList.add('selected');
            bots[botId].selectedBlacklistId = id;
        };
        listEl.appendChild(d);
    });
}

async function removeSelectedBlacklist(botId) {
    const bot = bots[botId];
    const s = bot.selectedBlacklistId;
    if (s) {
        const isChat = globalMode === 'chat';
        if (isChat) bot.chatSettings.blacklist = bot.chatSettings.blacklist.filter(x => x !== s);
        else bot.mailSettings.blacklist = bot.mailSettings.blacklist.filter(x => x !== s);
        bot.vipList = bot.vipList.filter(x => x !== s);
        bot.selectedBlacklistId = null;
        renderBlacklist(botId);
        const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;
        await saveBlacklistToServer(bot.displayId, isChat ? 'chat' : 'mail', list);
    }
}

function toggleVipStatus(botId) {
    const bot = bots[botId];
    const s = bot.selectedBlacklistId;
    if (!s) return alert("Выберите ID из списка");

    if (bot.vipList.includes(s)) {
        bot.vipList = bot.vipList.filter(x => x !== s);
    } else {
        bot.vipList.push(s);
        alert(`ID ${s} отмечен как VIP.\nБот будет уведомлять о его Online/Offline статусе.`);
    }
    saveSession();
    renderBlacklist(botId);
}

// ============================================================================
// ФОТО
// ============================================================================

function onPhotoSelect(botId) {
    const fi = document.getElementById(`photo-input-${botId}`);
    if (fi.files.length) {
        bots[botId].photoName = fi.files[0].name;
        document.getElementById(`photo-name-${botId}`).innerText = fi.files[0].name;
        document.getElementById(`photo-label-${botId}`).classList.add('file-selected');
        const r = new FileReader();
        r.onload = e => {
            document.getElementById(`preview-img-${botId}`).src = e.target.result;
            document.getElementById(`preview-box-${botId}`).classList.add('has-img');
        };
        r.readAsDataURL(fi.files[0]);
    }
}

function removePhoto(botId) {
    document.getElementById(`photo-input-${botId}`).value = "";
    document.getElementById(`photo-name-${botId}`).innerText = "Прикрепить фото";
    document.getElementById(`preview-box-${botId}`).classList.remove('has-img');
    document.getElementById(`photo-label-${botId}`).classList.remove('file-selected');
    bots[botId].photoName = null;
}

// ============================================================================
// СТАТИСТИКА МОДАЛКИ
// ============================================================================

function openStatsModal(botId, type) {
    currentModalBotId = botId;
    currentStatsType = type;
    document.getElementById('stats-title').innerText = (type === 'sent') ? "Отправленные" : "Ошибки";
    renderStatsList();
    openModal('stats-modal');
}

function renderStatsList() {
    const list = document.getElementById('stats-list-content');
    list.innerHTML = '';
    const isChat = globalMode === 'chat';
    const data = isChat ? bots[currentModalBotId].chatHistory[currentStatsType] : bots[currentModalBotId].mailHistory[currentStatsType];
    if (!data.length) list.innerHTML = '<div class="text-center text-muted p-2">Пусто</div>';
    else data.forEach(item => {
        const d = document.createElement('div');
        d.className = 'list-item';
        d.innerText = item;
        list.appendChild(d);
    });
}

function copyStats() {
    navigator.clipboard.writeText((globalMode === 'chat' ? bots[currentModalBotId].chatHistory[currentStatsType] : bots[currentModalBotId].mailHistory[currentStatsType]).join('\n'));
}

function clearStats() {
    if (confirm("Очистить?")) {
        const b = bots[currentModalBotId];
        if (globalMode === 'chat') {
            b.chatHistory[currentStatsType] = [];
            b.chatStats[currentStatsType] = 0;
        } else {
            b.mailHistory[currentStatsType] = [];
            b.mailStats[currentStatsType] = 0;
        }
        b.updateUI();
        renderStatsList();
    }
}

// ============================================================================
// МЕНЕДЖЕР АККАУНТОВ
// ============================================================================

function renderManagerList() {
    const list = document.getElementById('manager-list');
    list.innerHTML = '';
    Object.values(bots).forEach(b => {
        const row = document.createElement('div');
        row.className = 'acc-row';
        row.innerHTML = `<div><b>${b.displayId}</b> (${b.login})</div>
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" onclick="editAccount('${b.id}')"><i class="fa fa-pencil"></i></button>
                <button class="btn btn-outline-danger" onclick="closeTab(event, '${b.id}'); renderManagerList()"><i class="fa fa-trash"></i></button>
            </div>`;
        list.appendChild(row);
    });
}

function editAccount(id) {
    const bot = bots[id];
    if (!bot) return;
    editingBotId = id;
    document.getElementById('add-modal-title').innerHTML = '<i class="fa fa-pencil text-warning"></i> Изменить анкету';
    document.getElementById('newLogin').value = bot.login;
    document.getElementById('newPass').value = bot.pass;
    document.getElementById('newId').value = bot.displayId;
    document.getElementById('btnLoginText').innerText = "Сохранить";
    document.getElementById('loginError').innerText = "";
}

function openAddModal() {
    editingBotId = null;
    document.getElementById('add-modal-title').innerHTML = '<i class="fa fa-plus text-success"></i> Добавить анкету';
    document.getElementById('newLogin').value = "";
    document.getElementById('newPass').value = "";
    document.getElementById('newId').value = "";
    document.getElementById('btnLoginText').innerText = "Добавить";
    document.getElementById('loginError').innerText = "";
    renderManagerList();
    openModal('add-modal');
}

// ============================================================================
// АВТОРИЗАЦИЯ
// ============================================================================

async function handleLoginOrUpdate() {
    const l = document.getElementById('newLogin').value.trim();
    const p = document.getElementById('newPass').value.trim();
    const i = document.getElementById('newId').value.trim() || 'ID';
    document.getElementById('loginError').innerText = "";

    if (editingBotId) {
        const bot = bots[editingBotId];
        if (bot) {
            bot.login = l;
            bot.pass = p;
            bot.displayId = i;
            document.getElementById(`tab-${bot.id}`).innerHTML = `<div class="status-dot online"></div> ${i} <span class="tab-close" onclick="closeTab(event, '${bot.id}')"><i class="fa fa-times"></i></span>`;
            saveSession();
        }
        closeModal('add-modal');
        return;
    }

    if (checkDuplicate(l, i)) {
        document.getElementById('loginError').innerText = "Этот аккаунт уже добавлен";
        return;
    }

    if (await performLogin(l, p, i)) {
        document.getElementById('newLogin').value = '';
        document.getElementById('newPass').value = '';
        closeModal('add-modal');
    }
}

async function performLogin(login, pass, displayId) {
    const e = document.getElementById('loginError');
    const s = document.getElementById('loginSpinner');
    if (s) s.style.display = 'inline-block';

    try {
        const res = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: login, Password: pass });

        if (res.data.Token) {
            const bid = generateBotId();
            const bot = new AccountBot(bid, login, pass, displayId, res.data.Token);
            bots[bid] = bot;
            createInterface(bot);
            selectTab(bid);
            saveSession();

            const serverData = await loadBotDataFromServer(displayId);
            if (serverData) {
                bot.loadFromServerData(serverData);
                bot.updateUI();
                updateTemplateDropdown(bid);
                renderBlacklist(bid);
            }

            setTimeout(() => sendHeartbeatToLababot(bid, displayId, 'online'), 2000);
            return true;
        }
    } catch (err) {
        if (e) e.innerText = err.response ? (err.response.data.Error || `Ошибка входа: ${err.response.status}`) : "Ошибка входа. Проверьте Proxy.";
    } finally {
        if (s) s.style.display = 'none';
    }
    return false;
}

async function reloginBot(botId) {
    const bot = bots[botId];
    if (!bot) return false;

    showTabLoading(botId);
    try {
        const res = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: bot.login, Password: bot.pass });
        if (res.data.Token) {
            bot.token = res.data.Token;
            bot.getProfileData();
            hideTabLoading(botId);
            return true;
        }
    } catch (e) {
        console.error(`Relogin error for ${bot.displayId}:`, e);
    }
    hideTabLoading(botId);
    return false;
}

async function reloginAllBots() {
    if (!confirm("Перезайти во все анкеты?")) return;
    const botIds = Object.keys(bots);
    if (botIds.length === 0) return;

    const btn = document.querySelector('.btn-refresh');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    btn.disabled = true;

    botIds.forEach(id => showTabLoading(id));

    for (const id of botIds) {
        await reloginBot(id);
        await new Promise(r => setTimeout(r, 300));
    }

    btn.innerHTML = orig;
    btn.disabled = false;
}

// ============================================================================
// СЕССИЯ
// ============================================================================

async function saveSession() {
    try {
        const currentTabOrder = Array.from(document.querySelectorAll('.tab-item')).map(t => t.id.replace('tab-', ''));
        const localStorageData = currentTabOrder.map(id => {
            const b = bots[id];
            if (!b) return null;
            return {
                login: b.login,
                pass: b.pass,
                displayId: b.displayId,
                lastTplMail: b.lastTplMail,
                lastTplChat: b.lastTplChat,
                chatRotationHours: b.chatSettings.rotationHours,
                chatCyclic: b.chatSettings.cyclic,
                chatCurrentIndex: b.chatSettings.currentInviteIndex,
                chatStartTime: b.chatSettings.rotationStartTime,
                mailAuto: b.mailSettings.auto,
                mailTarget: b.mailSettings.target,
                vipList: b.vipList
            };
        }).filter(item => item !== null);

        localStorage.setItem('savedBots', JSON.stringify(localStorageData));
    } catch (error) {
        console.error('Error saving session:', error);
    }
}

async function restoreSession() {
    try {
        const s = JSON.parse(localStorage.getItem('savedBots') || '[]');
        const statusEl = document.getElementById('restore-status');
        if (statusEl) statusEl.innerText = s.length ? `Загрузка ${s.length} из кэша...` : "";

        for (const a of s) {
            const ok = await performLogin(a.login, a.pass, a.displayId);
            if (ok && bots[Object.keys(bots).pop()]) {
                const botId = Object.keys(bots).pop();
                const bot = bots[botId];

                bot.lastTplMail = a.lastTplMail;
                bot.lastTplChat = a.lastTplChat;

                if (a.chatRotationHours) bot.chatSettings.rotationHours = a.chatRotationHours;
                if (a.chatCyclic !== undefined) bot.chatSettings.cyclic = a.chatCyclic;
                if (a.chatCurrentIndex) bot.chatSettings.currentInviteIndex = a.chatCurrentIndex;
                if (a.chatStartTime) bot.chatSettings.rotationStartTime = a.chatStartTime;
                if (a.mailAuto !== undefined) bot.mailSettings.auto = a.mailAuto;
                if (a.mailTarget) bot.mailSettings.target = a.mailTarget;
                if (a.vipList) bot.vipList = a.vipList;

                updateInterfaceForMode(bot.id);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        if (statusEl) statusEl.innerText = "";
        document.getElementById('welcome-screen').style.display = Object.keys(bots).length > 0 ? 'none' : 'flex';

    } catch (error) {
        console.error('Error restoring session:', error);
        document.getElementById('welcome-screen').style.display = Object.keys(bots).length > 0 ? 'none' : 'flex';
    }
}

// ============================================================================
// ЭКСПОРТ/ИМПОРТ
// ============================================================================

async function exportAllData() {
    try {
        const data = {
            bots: [],
            templates: botTemplates,
            accountPreferences: accountPreferences,
            globalSettings: globalSettings,
            exportDate: new Date().toISOString()
        };

        Object.values(bots).forEach(bot => {
            data.bots.push({
                id: bot.id,
                login: bot.login,
                displayId: bot.displayId,
                mailSettings: bot.mailSettings,
                chatSettings: bot.chatSettings,
                vipList: bot.vipList
            });
        });

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lababot_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('Error exporting data:', error);
        return false;
    }
}

function exportAccounts() {
    const blob = new Blob([localStorage.getItem('savedBots') || '[]'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lababot_accounts.json';
    a.click();
    URL.revokeObjectURL(url);
}

async function handleUniversalImport(input) {
    if (!input.files.length) return;
    const file = input.files[0];
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
        if (!confirm('Внимание! Импорт JSON перезапишет существующие данные. Продолжить?')) {
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.bots && Array.isArray(data.bots)) {
                    for (const botData of data.bots) {
                        if (botData.login && botData.displayId) {
                            await performLogin(botData.login, botData.pass || 'password', botData.displayId);
                        }
                    }
                }
                if (data.templates) {
                    botTemplates = data.templates;
                    localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                }
                if (data.accountPreferences) {
                    accountPreferences = data.accountPreferences;
                    localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
                }
                if (data.globalSettings) {
                    globalSettings = { ...globalSettings, ...data.globalSettings };
                    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
                }
                alert('Данные успешно импортированы!');
                renderManagerList();
            } catch (error) {
                alert('Ошибка импорта JSON: ' + error.message);
            }
            input.value = '';
        };
        reader.readAsText(file);

    } else if (fileName.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const lines = e.target.result.split('\n');
            let count = 0, skipped = 0, errors = 0;

            for (let line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    if (checkDuplicate(parts[1], parts[0])) {
                        skipped++;
                        continue;
                    }
                    if (await performLogin(parts[1], parts[2], parts[0])) count++;
                    else errors++;
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            alert(`Импорт TXT: Успешно ${count}, Дубли ${skipped}, Ошибки ${errors}`);
            input.value = '';
            renderManagerList();
        };
        reader.readAsText(file);
    } else {
        alert('Неподдерживаемый формат. Используйте .txt или .json');
        input.value = '';
    }
}

// ============================================================================
// ГОРЯЧИЕ КЛАВИШИ
// ============================================================================

function initHotkeys() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+S - сохранить
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (activeTabId) saveTemplateTextNow(activeTabId);
        }

        // Escape - закрыть модалки
        if (e.key === 'Escape') {
            closeAllModals();
        }

        // Ctrl+M - переключить режим
        if (e.ctrlKey && e.key === 'm') {
            e.preventDefault();
            toggleGlobalMode();
        }
    });
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

window.onload = async function() {
    console.log('[Lababot] Initializing...');

    // Инициализация UI
    initUI();
    initHotkeys();

    // Загрузка настроек
    loadSettings();

    // Восстановление сессии
    await restoreSession();

    console.log('[Lababot] Ready!');
};

console.log('[Lababot] main.js loaded');
