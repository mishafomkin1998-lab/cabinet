function createInterface(bot) {
    const tab = document.createElement('div');
    tab.className = 'tab-item';
    tab.id = `tab-${bot.id}`;
    tab.onclick = () => selectTab(bot.id);
    tab.oncontextmenu = (e) => onTabRightClick(e, bot.id);
    
    // ОБНОВЛЕНИЕ 2: Привязка нового события DragNDrop
    tab.onmousedown = (e) => startTabDrag(e, tab);

    tab.innerHTML = `<div class="status-dot online"></div><span class="tab-id">${bot.displayId}</span><span class="tab-spinner"><i class="fa fa-sync fa-spin"></i></span><span class="tab-close" onclick="closeTab(event, '${bot.id}')"><i class="fa fa-times"></i></span>`;
    document.getElementById('tabs-bar').appendChild(tab);

    const ws = document.createElement('div');
    ws.className = 'workspace';
    ws.id = `ws-${bot.id}`;
    const row = document.createElement('div'); row.className = 'row h-100 g-2';
    
    // Col 1
    const col1 = document.createElement('div'); col1.className='col-3';
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

            <!-- Кнопка SHARE MY CAM (только в режиме Chat) -->
            <button class="btn btn-share-cam w-100 mb-2 hide-in-mail" id="btn-share-cam-${bot.id}" onclick="openVideoChatWindow('${bot.id}')">
                <i class="fa fa-video-camera"></i> SHARE MY CAM
            </button>

            <!-- Секция автоответов (только для Chat режима) -->
            <div class="auto-reply-section hide-in-mail" id="auto-reply-section-${bot.id}">
                <div class="auto-reply-header">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="auto-reply-enabled-${bot.id}" onchange="toggleAutoReply('${bot.id}')">
                        <label class="form-check-label" for="auto-reply-enabled-${bot.id}">
                            <i class="fa fa-robot"></i> Автоответы
                        </label>
                    </div>
                </div>
                <div class="auto-reply-list" id="auto-reply-list-${bot.id}">
                    <!-- Автоответы будут добавляться динамически -->
                </div>
                <button class="btn btn-sm btn-outline-success w-100 mt-2" onclick="addAutoReply('${bot.id}')">
                    <i class="fa fa-plus"></i> Добавить автоответ
                </button>
            </div>
        </div>`;
    row.appendChild(col1);

    // Col 2
    const col2 = document.createElement('div'); col2.className='col-4';
    col2.innerHTML = `
        <div class="panel-col">
            <div class="col-title">
                <span id="title-text-${bot.id}">Письмо</span>
                <div class="ai-container ${globalSettings.extendedFeatures ? '' : 'ai-hidden'}">
                    <button class="btn-ai-main" onclick="toggleAI('${bot.id}')"><i class="fa fa-magic"></i> AI</button>
                    <div class="ai-options" id="ai-options-${bot.id}">
                        <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'improve', event)" title="Shift=всем"><i class="fa fa-check"></i> Improve</button>
                        <button class="btn-ai-sub" onclick="handleAIAction('${bot.id}', 'generate', event)" title="Shift=всем"><i class="fa fa-pencil"></i> Generate</button>
                        <div class="btn-ai-sub-with-submenu" id="btn-myprompt-${bot.id}" onmouseenter="showPromptSubmenu('${bot.id}')" onmouseleave="hidePromptSubmenuDelayed('${bot.id}')">
                            <span class="btn-ai-sub-trigger"><i class="fa fa-user"></i> <span class="myprompt-label">My Prompt</span> <i class="fa fa-caret-right submenu-arrow"></i></span>
                            <div class="prompt-submenu" id="prompt-submenu-${bot.id}" onmouseenter="cancelHidePromptSubmenu('${bot.id}')" onmouseleave="hidePromptSubmenuDelayed('${bot.id}')"></div>
                        </div>
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

    // Col 3
    const col3 = document.createElement('div'); col3.className='col-3';
    col3.innerHTML = `
        <div class="panel-col">
            <div class="col-title">Настройки</div>
            <select id="target-select-${bot.id}" class="form-select form-select-sm mb-1" onchange="updateSettings('${bot.id}'); toggleCustomIdsField('${bot.id}')">
                <option value="online">Online</option>
                <option value="favorites">I am a favorite of</option>
                <option value="my-favorites">My favorite</option>
                <option value="inbox">Inbox (Unreplied)</option>
                <option value="payers">Payers</option>
                <option value="custom-ids">Custom IDs</option>
            </select>
            <div id="custom-ids-field-${bot.id}" class="custom-ids-field mb-1" style="display: none;">
                <textarea id="custom-ids-input-${bot.id}" class="form-control form-control-sm" rows="2" placeholder="ID через запятую, пробел или в столбик" onchange="saveCustomIds('${bot.id}')"></textarea>
                <small class="text-muted">Осталось: <span id="custom-ids-remaining-${bot.id}">0</span></small>
            </div>

            <div class="d-flex align-items-center gap-2 mb-2">
                <select class="form-select form-select-sm" id="speed-select-${bot.id}" style="width: 100px;" onmousedown="shiftWasPressed=event.shiftKey" onchange="handleSpeedChange('${bot.id}', this.value)" title="Скорость отправки (Shift=всем)">
                    <option value="smart" selected>Smart</option>
                    <option value="15">15s</option>
                    <option value="30">30s</option>
                </select>
                <div class="form-check small m-0 hide-in-chat" title="Auto: Payers -> My Favorite -> Favorites -> Inbox -> Online (Shift=всем)">
                    <input class="form-check-input" type="checkbox" id="auto-check-${bot.id}" onmousedown="shiftWasPressed=event.shiftKey" onchange="handleAutoChange('${bot.id}')">
                    <label class="form-check-label text-muted" for="auto-check-${bot.id}">Auto</label>
                </div>
                <div class="form-check small m-0 hide-in-chat" title="Отправлять только пользователям с фото">
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
                <div class="stat-waiting-row">
                    <span id="stat-ignored-${bot.id}" class="stat-ignored-text" onclick="openIgnoredModal('${bot.id}')" title="Пользователи в игноре (клик для управления)">Игнор: 0</span>
                    <span id="stat-wait-${bot.id}" class="stat-waiting-text">Ожидают: 0</span>
                </div>
            </div>
            <div id="log-${bot.id}" class="action-log mt-2" style="flex-grow: 1;"></div>
        </div>`;
    row.appendChild(col3);

    // Col 4
    const col4 = document.createElement('div'); col4.className='col-2';
    col4.innerHTML = `
        <div class="panel-col">
            <div class="col-title">Blacklist</div>
            <div id="bl-list-${bot.id}" class="scroll-list"></div>
            <div class="bl-input-row">
                <input type="text" id="bl-input-${bot.id}" class="form-control form-control-sm" placeholder="ID..." onkeydown="handleBlacklistKeydown(event, '${bot.id}')">
                <button class="btn btn-success btn-sm" onclick="addBlacklistFromInput('${bot.id}')" title="1 ID = этому боту, несколько = всем">+</button>
            </div>
            <div class="bl-actions">
                <button class="btn btn-outline-danger btn-sm flex-fill" onclick="removeSelectedBlacklist('${bot.id}')" data-tip="Удалить выбранные"><i class="fa fa-trash"></i></button>
                <button class="btn btn-outline-warning btn-sm flex-fill" onclick="toggleVipStatus('${bot.id}')" data-tip="VIP Клиент (Отслеживать онлайн)"><i class="fa fa-star"></i></button>
            </div>
        </div>`;
    row.appendChild(col4);
    ws.appendChild(row);
    document.getElementById('panels-container').appendChild(ws);
    updateInterfaceForMode(bot.id);
    updateBotCount();
    
    toggleExtendedFeatures();
}

function getBotTemplates(login) {
     if(!botTemplates[login]) botTemplates[login] = { mail: [], chat: [] };
     return botTemplates[login];
}

function updateInterfaceForMode(botId) {
    const isChat = globalMode === 'chat';
    const bot = bots[botId];
    document.getElementById(`title-tpl-${botId}`).innerText = isChat ? "Шаблоны ЧАТА" : "Шаблоны ПИСЕМ";
    document.getElementById(`title-text-${botId}`).innerText = isChat ? "Сообщения (разд. __)" : "Текст письма";
    document.getElementById(`chat-hint`).style.display = isChat ? 'block' : 'none';

    // Обновляем текст кнопки My Prompt в зависимости от режима
    const myPromptLabel = document.querySelector(`#btn-myprompt-${botId} .myprompt-label`);
    if (myPromptLabel) {
        myPromptLabel.innerText = isChat ? "My Prompt (Chat)" : "My Prompt";
    }
    const ws = document.getElementById(`ws-${botId}`);
    const targetSelect = document.getElementById(`target-select-${botId}`);

    if(isChat) {
        ws.querySelectorAll('.hide-in-chat').forEach(el => el.style.display = 'none');
        ws.querySelectorAll('.hide-in-mail').forEach(el => el.style.display = 'block');

        Array.from(targetSelect.options).forEach(opt => {
            // Скрываем опции недоступные в Chat режиме (включая custom-ids)
            if (['favorites', 'my-favorites', 'inbox', 'custom-ids'].includes(opt.value)) { opt.style.display = 'none'; }
            else { opt.style.display = 'block'; }
        });
        targetSelect.value = bot.chatSettings.target;

        // Скрываем поле Custom IDs в Chat режиме
        const customIdsField = document.getElementById(`custom-ids-field-${botId}`);
        if (customIdsField) customIdsField.style.display = 'none';

        document.getElementById(`rot-time-${botId}`).value = bot.chatSettings.rotationHours;
        document.getElementById(`rot-cyclic-${botId}`).checked = bot.chatSettings.cyclic;
    } else {
        ws.querySelectorAll('.hide-in-chat').forEach(el => { if(el.classList.contains('photo-block')) el.style.display = 'flex'; else el.style.display = 'block'; });
        ws.querySelectorAll('.hide-in-chat.d-none').forEach(el => el.style.display = 'none');
        ws.querySelectorAll('.hide-in-mail').forEach(el => el.style.display = 'none');

        Array.from(targetSelect.options).forEach(opt => opt.style.display = 'block');
        targetSelect.value = bot.mailSettings.target;

        // Показываем поле Custom IDs если выбран этот режим
        toggleCustomIdsField(botId);

        document.getElementById(`auto-check-${botId}`).checked = bot.mailSettings.auto;
    }
    
    let lastIdx = isChat ? bot.lastTplChat : bot.lastTplMail;
    if (lastIdx === null || lastIdx === undefined || lastIdx === "") {
        if(accountPreferences[bot.login]) {
            lastIdx = isChat ? accountPreferences[bot.login].chatTpl : accountPreferences[bot.login].mailTpl;
            if(lastIdx !== undefined) {
                 if(isChat) bot.lastTplChat = lastIdx; else bot.lastTplMail = lastIdx;
            }
        }
    }

    updateTemplateDropdown(botId, lastIdx);
    renderBlacklist(botId);

    // Инициализация UI автоответов при переключении в Chat режим
    if (isChat) {
        initAutoRepliesUI(botId);
    }

    bot.updateUI();
}

function updateSettings(botId, type, val) {
    const isChat = globalMode === 'chat';
    const bot = bots[botId];
    const set = isChat ? bot.chatSettings : bot.mailSettings;
    if (type === 'speed') set.speed = val;
    else {
        set.target = document.getElementById(`target-select-${botId}`).value;
        if(!isChat) {
            set.photoOnly = document.getElementById(`check-photo-${botId}`).checked;
            bot.mailSettings.auto = document.getElementById(`auto-check-${botId}`).checked;
        }
    }
    saveSession();
}

// Обработчик Auto с поддержкой Shift
function handleAutoChange(botId) {
    const checkbox = document.getElementById(`auto-check-${botId}`);
    const isChecked = checkbox.checked;

    if (shiftWasPressed) {
        // Shift был зажат при клике - применяем ко всем анкетам
        setAutoForAll(isChecked);
        shiftWasPressed = false; // Сбрасываем
    } else {
        // Обычное поведение - только для этой анкеты
        const bot = bots[botId];
        bot.mailSettings.auto = isChecked;
        saveSession();
    }
}

// Установить Auto для ВСЕХ анкет
function setAutoForAll(isChecked) {
    const botIds = Object.keys(bots);
    let count = 0;

    for (const botId of botIds) {
        const bot = bots[botId];
        bot.mailSettings.auto = isChecked;

        const checkbox = document.getElementById(`auto-check-${botId}`);
        if (checkbox) checkbox.checked = isChecked;
        count++;
    }

    saveSession();
    showBulkNotification(isChecked ? 'Auto включён для всех' : 'Auto выключен для всех', count);
}

// Обработчик скорости с поддержкой Shift
function handleSpeedChange(botId, val) {
    if (shiftWasPressed) {
        // Shift был зажат при клике - применяем ко всем анкетам
        setSpeedForAll(val);
        shiftWasPressed = false; // Сбрасываем
    } else {
        // Обычное поведение
        updateSettings(botId, 'speed', val);
    }
}

// Установить скорость для ВСЕХ анкет
function setSpeedForAll(val) {
    const isChat = globalMode === 'chat';
    const botIds = Object.keys(bots);
    let count = 0;

    for (const botId of botIds) {
        const bot = bots[botId];
        const set = isChat ? bot.chatSettings : bot.mailSettings;
        set.speed = val;

        const selector = document.getElementById(`speed-select-${botId}`);
        if (selector) selector.value = val;
        count++;
    }

    saveSession();
    const speedLabel = val === 'smart' ? 'Smart' : `${val}s`;
    showBulkNotification(`Скорость ${speedLabel} установлена всем`, count);
}

function updateChatRotation(botId) {
    const bot = bots[botId];
    bot.chatSettings.rotationHours = parseInt(document.getElementById(`rot-time-${botId}`).value);
    bot.chatSettings.cyclic = document.getElementById(`rot-cyclic-${botId}`).checked;
    saveSession();
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
function checkDuplicate(login, displayId) {
    return !!Object.values(bots).find(b => b.login.toLowerCase() === login.toLowerCase() || b.displayId.toLowerCase() === displayId.toLowerCase());
}
function renderManagerList() {
    const list = document.getElementById('manager-list'); list.innerHTML = '';
    Object.values(bots).forEach(b => {
        const row = document.createElement('div'); row.className = 'acc-row';
        row.innerHTML = `<div><b>${b.displayId}</b> (${b.login})</div>
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" onclick="editAccount('${b.id}')"><i class="fa fa-pencil"></i></button>
                <button class="btn btn-outline-danger" onclick="closeTab(event, '${b.id}'); renderManagerList()"><i class="fa fa-trash"></i></button>
            </div>`;
        list.appendChild(row);
    });
}
function exportAccounts() {
    const blob = new Blob([localStorage.getItem('savedBots') || '[]'], {type: 'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'lababot_accounts.json'; a.click(); URL.revokeObjectURL(url);
}
// Функция показа красивого модального окна результатов импорта
function showImportResult(successList, duplicateList, errorList) {
    let html = '';

    // Успешные
    if (successList.length > 0) {
        html += `<div class="import-section import-success">
            <div class="import-section-header">
                <i class="fa fa-check-circle"></i> Успешно добавлены <span class="import-count">${successList.length}</span>
            </div>
            <div class="import-section-list">
                ${successList.map(item => `<div class="import-item"><span class="import-id">${item.displayId}</span> ${item.login}</div>`).join('')}
            </div>
        </div>`;
    }

    // Дубликаты
    if (duplicateList.length > 0) {
        html += `<div class="import-section import-duplicate">
            <div class="import-section-header">
                <i class="fa fa-clone"></i> Пропущены (дубли) <span class="import-count">${duplicateList.length}</span>
            </div>
            <div class="import-section-list">
                ${duplicateList.map(item => `<div class="import-item"><span class="import-id">${item.displayId}</span> ${item.login}</div>`).join('')}
            </div>
        </div>`;
    }

    // Ошибки
    if (errorList.length > 0) {
        html += `<div class="import-section import-error">
            <div class="import-section-header">
                <i class="fa fa-times-circle"></i> Ошибки входа <span class="import-count">${errorList.length}</span>
            </div>
            <div class="import-section-list">
                ${errorList.map(item => `<div class="import-item"><span class="import-id">${item.displayId}</span> ${item.login}</div>`).join('')}
            </div>
        </div>`;
    }

    // Если всё пусто
    if (successList.length === 0 && duplicateList.length === 0 && errorList.length === 0) {
        html = '<div class="text-center text-muted p-3"><i class="fa fa-info-circle"></i> Нет данных для импорта</div>';
    }

    document.getElementById('import-result-content').innerHTML = html;
    openModal('import-result-modal');
}

async function handleUniversalImport(input) {
    if (!input.files.length) return;
    const file = input.files[0];
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
        // JSON - полный импорт
        if (!confirm('Внимание! Импорт JSON перезапишет существующие данные. Продолжить?')) {
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);
                const successList = [], duplicateList = [], errorList = [];

                if (data.bots && Array.isArray(data.bots)) {
                    for (const botData of data.bots) {
                        if (botData.login && botData.displayId) {
                            if (checkDuplicate(botData.login, botData.displayId)) {
                                duplicateList.push({ login: botData.login, displayId: botData.displayId });
                                continue;
                            }
                            const success = await performLogin(botData.login, botData.pass || 'password', botData.displayId);
                            if (success) {
                                successList.push({ login: botData.login, displayId: botData.displayId });
                            } else {
                                errorList.push({ login: botData.login, displayId: botData.displayId });
                            }
                            await new Promise(r => setTimeout(r, 100));
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

                showImportResult(successList, duplicateList, errorList);
                renderManagerList();
            } catch (error) {
                showImportResult([], [], [{ login: 'JSON Error', displayId: error.message }]);
            }
            input.value = '';
        };
        reader.readAsText(file);

    } else if (fileName.endsWith('.txt')) {
        // TXT - только анкеты (ID Логин Пароль)
        const reader = new FileReader();
        reader.onload = async function(e) {
            const lines = e.target.result.split('\n');
            const successList = [], duplicateList = [], errorList = [];

            for (let line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    const [displayId, login, pass] = parts;
                    if (checkDuplicate(login, displayId)) {
                        duplicateList.push({ login, displayId });
                        continue;
                    }
                    const success = await performLogin(login, pass, displayId);
                    if (success) {
                        successList.push({ login, displayId });
                    } else {
                        errorList.push({ login, displayId });
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            showImportResult(successList, duplicateList, errorList);
            input.value = '';
            renderManagerList();
        };
        reader.readAsText(file);

    } else {
        showImportResult([], [], [{ login: 'Файл', displayId: 'Неподдерживаемый формат. Используйте .txt или .json' }]);
        input.value = '';
    }
}
function editAccount(id) {
    const bot = bots[id];
    if(!bot) return;
    editingBotId = id;
    document.getElementById('add-modal-title').innerHTML = '<i class="fa fa-pencil text-warning"></i> Изменить анкету';
    document.getElementById('newLogin').value = bot.login; document.getElementById('newPass').value = bot.pass; document.getElementById('newId').value = bot.displayId;
    document.getElementById('btnLoginText').innerText = "Сохранить"; document.getElementById('loginError').innerText = "";
}
function openAddModal() {
    editingBotId = null;
    document.getElementById('add-modal-title').innerHTML = '<i class="fa fa-plus text-success"></i> Добавить анкету';
    document.getElementById('newLogin').value = ""; document.getElementById('newPass').value = ""; document.getElementById('newId').value = "";
    document.getElementById('btnLoginText').innerText = "Добавить"; document.getElementById('loginError').innerText = "";
    renderManagerList();
    openModal('add-modal');
}
function openStatsModal(botId, type) {
    currentModalBotId = botId; currentStatsType = type;
    document.getElementById('stats-title').innerText = (type === 'sent') ? "Отправленные" : "Ошибки";
    renderStatsList(); openModal('stats-modal');
}
function renderStatsList() {
    const list = document.getElementById('stats-list-content'); list.innerHTML = '';
    const isChat = globalMode === 'chat';
    const data = isChat ? bots[currentModalBotId].chatHistory[currentStatsType] : bots[currentModalBotId].mailHistory[currentStatsType];
    if(!data.length) list.innerHTML = '<div class="text-center text-muted p-2">Пусто</div>';
    else data.forEach(item => { const d = document.createElement('div'); d.className = 'list-item'; d.innerText = item; list.appendChild(d); });
}
function copyStats() { navigator.clipboard.writeText((globalMode==='chat' ? bots[currentModalBotId].chatHistory[currentStatsType] : bots[currentModalBotId].mailHistory[currentStatsType]).join('\n')); }
function clearStats() { if(confirm("Очистить?")){ const b = bots[currentModalBotId]; if(globalMode==='chat') { b.chatHistory[currentStatsType]=[]; b.chatStats[currentStatsType]=0; } else { b.mailHistory[currentStatsType]=[]; b.mailStats[currentStatsType]=0; } b.updateUI(); renderStatsList(); } }

// Генерация имени шаблона на основе даты
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

// Красивое уведомление для массовых действий
function showBulkNotification(message, count) {
    const existing = document.getElementById('bulk-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'bulk-notification';
    notification.innerHTML = `<i class="fa fa-check-circle"></i> ${message} <b>(${count})</b>`;
    notification.style.cssText = `
        position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #28a745, #20c997); color: white;
        padding: 12px 24px; border-radius: 25px; font-size: 14px; font-weight: 500;
        box-shadow: 0 4px 15px rgba(40, 167, 69, 0.4); z-index: 10000;
        animation: bulkNotifIn 0.3s ease-out;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'bulkNotifOut 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Инлайн добавление нового шаблона (без модалки)
async function addTemplateInline(botId, event) {
    // Shift + клик = добавить всем анкетам
    if (event && event.shiftKey) {
        await addTemplateToAll();
        return;
    }

    const bot = bots[botId];
    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';
    const tpls = getBotTemplates(bot.login)[type];

    const newName = generateTemplateName(tpls);
    const newTemplate = { name: newName, text: '', favorite: false };
    tpls.push(newTemplate);

    localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
    await saveTemplatesToServer(bot.displayId, type, tpls);

    const newIdx = tpls.length - 1;
    updateTemplateDropdown(botId, newIdx);

    const textarea = document.getElementById(`msg-${botId}`);
    if (textarea) {
        textarea.value = '';
        textarea.focus();
    }

    console.log(`➕ Создан новый шаблон "${newName}" для ${bot.displayId}`);
}

// Добавить шаблон ВСЕМ анкетам
async function addTemplateToAll() {
    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';
    const botIds = Object.keys(bots);
    let count = 0;

    for (const botId of botIds) {
        const bot = bots[botId];
        const tpls = getBotTemplates(bot.login)[type];
        const newName = generateTemplateName(tpls);
        const newTemplate = { name: newName, text: '', favorite: false };
        tpls.push(newTemplate);

        localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
        await saveTemplatesToServer(bot.displayId, type, tpls);

        const newIdx = tpls.length - 1;
        updateTemplateDropdown(botId, newIdx);
        count++;
    }

    showBulkNotification('Шаблон добавлен всем анкетам', count);
}

// Модальное окно теперь только для редактирования (переименования) шаблона
function openTemplateModal(botId, isEdit) {
    currentModalBotId = botId;
    const bot = bots[botId];
    const isChat = globalMode === 'chat';
    const tpls = getBotTemplates(bot.login)[isChat ? 'chat' : 'mail'];

    // Модалка только для редактирования
    const idx = document.getElementById(`tpl-select-${botId}`).value;
    if(idx === "") return alert("Выберите шаблон для редактирования");

    editingTemplateIndex = idx;
    document.getElementById('tpl-modal-title').innerText = "Редактировать шаблон";
    document.getElementById('tpl-modal-name').value = tpls[idx].name;
    document.getElementById('tpl-modal-text').value = tpls[idx].text;
    openModal('tpl-modal');
}

// Генерация текста шаблона с помощью AI
async function generateTemplateWithAI() {
    const promptInput = document.getElementById('tpl-ai-prompt');
    const textArea = document.getElementById('tpl-modal-text');
    const btn = document.getElementById('tpl-ai-btn');
    const userPrompt = promptInput.value.trim();

    if (!userPrompt) {
        alert('Опишите какой текст нужно сгенерировать');
        promptInput.focus();
        return;
    }

    if (!globalSettings.apiKey) {
        alert('Добавьте OpenAI API Key в настройках (вкладка AI функции)');
        return;
    }

    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Проверка...';
    btn.disabled = true;

    // Проверяем разрешение AI для активной анкеты
    const bot = activeTabId ? bots[activeTabId] : null;
    if (bot && bot.displayId) {
        const aiStatus = await checkProfileAIEnabled(bot.displayId);
        if (!aiStatus.enabled) {
            btn.innerHTML = originalBtnHtml;
            btn.disabled = false;
            const reason = aiStatus.reason === 'disabled_by_admin'
                ? 'AI отключен администратором для этой анкеты'
                : aiStatus.reason === 'no_translator'
                ? 'Анкете не назначен переводчик'
                : 'AI недоступен для этой анкеты';
            alert(`⚠️ ${reason}`);
            return;
        }
    }

    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Генерация...';

    try {
        const isChat = globalMode === 'chat';
        const systemPrompt = isChat
            ? `You are an expert at writing romantic chat invitations for a dating site. Write in English. The message should be friendly, intriguing and make the person want to respond. Use {Name} placeholder for recipient's name if appropriate. Keep it short (2-3 sentences). Do not use emojis.`
            : `You are an expert at writing romantic letters for a dating site. Write in English. The letter should be warm, personal and engaging. Use {Name} placeholder for recipient's name, {City} for their city, {Age} for their age if appropriate. Keep it medium length (3-5 sentences). Do not use emojis.`;

        const config = {
            headers: {
                'Authorization': `Bearer ${globalSettings.apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        if (globalSettings.proxyAI) {
            const proxyConfig = parseProxyUrl(globalSettings.proxyAI);
            if (proxyConfig) config.proxy = proxyConfig;
        }

        const response = await axios.post(OPENAI_API_ENDPOINT, {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Write a ${isChat ? 'chat invitation' : 'letter'} with this style/theme: ${userPrompt}` }
            ],
            temperature: 0.8,
            max_tokens: 300
        }, config);

        const generatedText = response.data.choices[0].message.content.trim();
        textArea.value = generatedText;

        // Очищаем поле промпта после успешной генерации
        promptInput.value = '';

    } catch (error) {
        console.error('AI Generation error:', error);
        const errorMsg = error.response?.data?.error?.message || error.message || 'Неизвестная ошибка';
        alert(`Ошибка генерации: ${errorMsg}`);
    } finally {
        btn.innerHTML = originalBtnHtml;
        btn.disabled = false;
    }
}

// Таймеры для debounce автосохранения текста
const autoSaveTimers = {};

// Автосохранение текста шаблона (debounce 3 сек)
function autoSaveTemplateText(botId) {
    if (autoSaveTimers[botId]) clearTimeout(autoSaveTimers[botId]);
    autoSaveTimers[botId] = setTimeout(() => {
        saveTemplateTextNow(botId);
    }, 3000);
}

// Немедленное сохранение текста шаблона (при blur или по таймеру)
async function saveTemplateTextNow(botId) {
    const bot = bots[botId];
    if (!bot) return;

    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';
    const sel = document.getElementById(`tpl-select-${botId}`);
    const textarea = document.getElementById(`msg-${botId}`);

    if (!sel || !textarea || sel.value === '') return;

    const idx = parseInt(sel.value);
    const tpls = getBotTemplates(bot.login)[type];

    if (tpls[idx]) {
        // Обновляем текст в шаблоне
        tpls[idx].text = textarea.value;

        // Сохраняем в localStorage
        localStorage.setItem('botTemplates', JSON.stringify(botTemplates));

        // Сохраняем на сервер
        await saveTemplatesToServer(bot.displayId, type, tpls);
        console.log(`💾 Текст шаблона автосохранён для ${bot.displayId}`);
    }
}

async function saveTemplateFromModal() {
    const name = document.getElementById('tpl-modal-name').value;
    const text = document.getElementById('tpl-modal-text').value;
    if (!name) return;

    const bot = bots[currentModalBotId];
    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';

    try {
        // 1. Сохраняем в localStorage
        let tpls = getBotTemplates(bot.login)[type];

        if (editingTemplateIndex !== null) {
            const fav = tpls[editingTemplateIndex]?.favorite || false;
            tpls[editingTemplateIndex] = { name, text, favorite: fav };
        } else {
            tpls.push({ name, text, favorite: false });
            editingTemplateIndex = tpls.length - 1;
        }

        // 2. Сохраняем в localStorage (для обратной совместимости)
        localStorage.setItem('botTemplates', JSON.stringify(botTemplates));

        // 3. ВАЖНО: Сохраняем на сервер
        await saveTemplatesToServer(bot.displayId, type, tpls);

        updateTemplateDropdown(bot.id, editingTemplateIndex);
        closeModal('tpl-modal');

    } catch (error) {
        console.error('Error saving template:', error);
        alert('Ошибка сохранения шаблона');
    }
}

function updateTemplateDropdown(botId, forceSelectIndex = null) {
    const sel=document.getElementById(`tpl-select-${botId}`); if(!sel) return;
    const bot = bots[botId];
    const isChat = globalMode === 'chat';
    const tpls = getBotTemplates(bot.login)[isChat ? 'chat' : 'mail'];

    // Сохраняем текущий текст textarea перед обновлением
    const area = document.getElementById(`msg-${botId}`);
    const currentText = area ? area.value : '';

    // Исправлено: проверяем и на null, и на undefined
    let val = (forceSelectIndex !== null && forceSelectIndex !== undefined) ? forceSelectIndex : sel.value;

    // Приводим к числу если это строка
    if (typeof val === 'string' && val !== '') {
        val = parseInt(val);
    }

    // Если val пустой/null/undefined или выходит за границы массива - выбираем первый шаблон
    if ((val === null || val === "" || val === undefined || isNaN(val) || val >= tpls.length) && tpls.length > 0) {
        val = 0;
    }

    sel.innerHTML='<option value="">-- Выберите --</option>';
    tpls.forEach((t,i)=> sel.innerHTML+=`<option value="${i}">${t.favorite?'❤ ':''}${t.name}</option>`);

    const btnFav = document.getElementById(`btn-fav-${botId}`);
    if(val !== null && val !== "" && val !== undefined && !isNaN(val) && tpls[val]) {
         sel.value = val;
         area.disabled=false;
         area.value=tpls[val].text;
         if(isChat) bots[botId].lastTplChat = val; else bots[botId].lastTplMail = val;

         // Сохраняем выбор шаблона
         if(!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
         if(isChat) accountPreferences[bot.login].chatTpl = val;
         else accountPreferences[bot.login].mailTpl = val;
         localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
         saveSession();

         if(btnFav) { if(tpls[val].favorite) { btnFav.classList.add('btn-heart-active','btn-danger'); btnFav.classList.remove('btn-outline-danger'); } else { btnFav.classList.remove('btn-heart-active','btn-danger'); btnFav.classList.add('btn-outline-danger'); } }
         validateInput(area);
    } else {
         sel.value="";
         // НЕ блокируем textarea если в ней есть текст
         if (currentText && currentText.trim() !== '') {
             area.disabled = false;
             area.value = currentText;
         } else {
             area.disabled = true;
             area.value = "";
         }
         if(btnFav) btnFav.classList.remove('btn-heart-active');
         bots[botId].updateUI();
    }
}

function onTemplateSelect(botId) {
    const idx = document.getElementById(`tpl-select-${botId}`).value;
    const bot = bots[botId];
    const isChat = globalMode === 'chat';

    if(!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
    if(isChat) accountPreferences[bot.login].chatTpl = idx;
    else accountPreferences[bot.login].mailTpl = idx;
    localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
    
    saveSession();
    updateTemplateDropdown(botId, idx);
}

async function toggleTemplateFavorite(botId) {
    const idx = document.getElementById(`tpl-select-${botId}`).value;
    if(idx === "") return;
    const bot = bots[botId];
    const tpls = getBotTemplates(bot.login)['mail'];
    if(tpls[idx]) {
        const wasNotFavorite = !tpls[idx].favorite;
        tpls[idx].favorite = wasNotFavorite;
        localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
        updateTemplateDropdown(botId, idx);

        // Синхронизируем с сервером
        try {
            if (wasNotFavorite) {
                // Добавляем в избранное на сервере
                await fetch(`${LABABOT_SERVER}/api/favorite_template`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: bot.displayId,
                        botId: bot.id,
                        templateName: tpls[idx].name,
                        templateText: tpls[idx].text,
                        type: 'mail'
                    })
                });
                console.log(`❤️ Шаблон "${tpls[idx].name}" добавлен в избранное на сервере`);
            } else {
                // Удаляем из избранного на сервере
                await fetch(`${LABABOT_SERVER}/api/favorite_template`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: bot.displayId,
                        templateText: tpls[idx].text
                    })
                });
                console.log(`💔 Шаблон "${tpls[idx].name}" удалён из избранного на сервере`);
            }
        } catch(e) {
            console.error('Ошибка синхронизации избранного:', e);
        }
    }
}

async function deleteTemplate(botId, event) {
    // Shift + клик = удалить выбранный шаблон у всех
    if (event && event.shiftKey) {
        await deleteTemplateFromAll();
        return;
    }

    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';
    const bot = bots[botId];
    let tpls = getBotTemplates(bot.login)[type];
    const idx = document.getElementById(`tpl-select-${botId}`).value;
    if (idx !== "" && (globalSettings.skipDeleteConfirm || confirm("Удалить?"))) {
        const idxNum = parseInt(idx);
        tpls.splice(idxNum, 1);
        localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
        await saveTemplatesToServer(bot.displayId, type, tpls);

        // Выбираем предыдущий шаблон (или последний доступный)
        const newIdx = tpls.length > 0 ? Math.min(idxNum, tpls.length - 1) : null;
        updateTemplateDropdown(botId, newIdx);
    }
}

// Удалить выбранный шаблон у ВСЕХ анкет
async function deleteTemplateFromAll() {
    if (!globalSettings.skipDeleteConfirm && !confirm("Удалить выбранный шаблон у ВСЕХ анкет?")) return;

    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';
    const botIds = Object.keys(bots);
    let count = 0;

    for (const botId of botIds) {
        const bot = bots[botId];
        const tpls = getBotTemplates(bot.login)[type];
        const sel = document.getElementById(`tpl-select-${botId}`);
        const idx = sel ? sel.value : "";

        if (idx !== "" && tpls[idx]) {
            const idxNum = parseInt(idx);
            tpls.splice(idxNum, 1);
            localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
            await saveTemplatesToServer(bot.displayId, type, tpls);

            // Выбираем предыдущий шаблон (или последний доступный)
            const newIdx = tpls.length > 0 ? Math.min(idxNum, tpls.length - 1) : null;
            updateTemplateDropdown(botId, newIdx);
            count++;
        }
    }

    showBulkNotification('Шаблон удалён у всех анкет', count);
}

// Обработка Enter в поле ввода blacklist
function handleBlacklistKeydown(event, botId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addBlacklistFromInput(botId);
    }
}

// Добавить ID из inline поля
// 1 ID = добавить этому боту, несколько ID = добавить всем анкетам
async function addBlacklistFromInput(botId) {
    const input = document.getElementById(`bl-input-${botId}`);
    const val = input.value.trim();
    if (!val) return;

    // Поддержка нескольких ID через запятую, пробел или перенос строки
    const ids = val.split(/[\s,]+/).filter(id => id.length > 0);

    if (ids.length > 1) {
        // Несколько ID = добавить всем анкетам
        for (const id of ids) {
            await addBlacklistToAll(id);
        }
    } else {
        // Один ID = добавить только этому боту
        const bot = bots[botId];
        const isChat = globalMode === 'chat';
        const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;

        if (!list.includes(ids[0])) {
            list.push(ids[0]);
            renderBlacklist(botId);
            await saveBlacklistToServer(bot.displayId, isChat ? 'chat' : 'mail', list);
        }
    }

    input.value = '';
    input.focus();
}

// Добавить в ЧС для ВСЕХ анкет
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

// Хранение последнего выбранного индекса для Shift-выбора
let lastSelectedBlacklistIndex = {};

function renderBlacklist(botId) {
    const listEl=document.getElementById(`bl-list-${botId}`); listEl.innerHTML="";
    const bot = bots[botId];
    const data = globalMode === 'chat' ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;

    // Инициализируем массив выбранных если нет
    if (!bot.selectedBlacklistIds) bot.selectedBlacklistIds = [];

    data.forEach((id, index) => {
        const d=document.createElement('div');
        d.className='list-item';
        d.dataset.index = index;
        d.innerText=id;

        if (bot.vipList.includes(id)) {
            d.classList.add('is-vip');
            d.innerHTML = `<i class="fa fa-star text-warning me-2"></i> ${id}`;
        }

        // Восстанавливаем выбор если элемент был выбран
        if (bot.selectedBlacklistIds.includes(id)) {
            d.classList.add('selected');
        }

        d.onclick=(e)=>{
            if (e.shiftKey && lastSelectedBlacklistIndex[botId] !== undefined) {
                // Shift+клик - выбрать диапазон
                const start = Math.min(lastSelectedBlacklistIndex[botId], index);
                const end = Math.max(lastSelectedBlacklistIndex[botId], index);

                // Снимаем старый выбор
                listEl.querySelectorAll('.list-item').forEach(i=>i.classList.remove('selected'));
                bot.selectedBlacklistIds = [];

                // Выбираем диапазон
                for (let i = start; i <= end; i++) {
                    const item = listEl.querySelector(`[data-index="${i}"]`);
                    if (item) {
                        item.classList.add('selected');
                        bot.selectedBlacklistIds.push(data[i]);
                    }
                }
            } else if (e.ctrlKey || e.metaKey) {
                // Ctrl+клик - добавить/убрать из выбора
                d.classList.toggle('selected');
                if (d.classList.contains('selected')) {
                    if (!bot.selectedBlacklistIds.includes(id)) bot.selectedBlacklistIds.push(id);
                } else {
                    bot.selectedBlacklistIds = bot.selectedBlacklistIds.filter(x => x !== id);
                }
                lastSelectedBlacklistIndex[botId] = index;
            } else {
                // Обычный клик - выбрать только один
                listEl.querySelectorAll('.list-item').forEach(i=>i.classList.remove('selected'));
                d.classList.add('selected');
                bot.selectedBlacklistIds = [id];
                lastSelectedBlacklistIndex[botId] = index;
            }
        };
        listEl.appendChild(d);
    });
}

async function removeSelectedBlacklist(botId) {
    const bot = bots[botId];
    const selected = bot.selectedBlacklistIds || [];

    if (selected.length > 0) {
        const isChat = globalMode === 'chat';

        // Удаляем все выбранные
        for (const s of selected) {
            if(isChat) bot.chatSettings.blacklist = bot.chatSettings.blacklist.filter(x=>x!==s);
            else bot.mailSettings.blacklist = bot.mailSettings.blacklist.filter(x=>x!==s);
            bot.vipList = bot.vipList.filter(x=>x!==s);
        }

        bot.selectedBlacklistIds = [];
        lastSelectedBlacklistIndex[botId] = undefined;
        renderBlacklist(botId);

        // Сохраняем на сервер
        const list = isChat ? bot.chatSettings.blacklist : bot.mailSettings.blacklist;
        await saveBlacklistToServer(bot.displayId, isChat ? 'chat' : 'mail', list);
    }
}

function toggleVipStatus(botId) {
    const bot = bots[botId];
    const selected = bot.selectedBlacklistIds || [];

    if (selected.length === 0) return alert("Выберите ID из списка");

    for (const s of selected) {
        if(bot.vipList.includes(s)) {
            bot.vipList = bot.vipList.filter(x=>x!==s);
        } else {
            bot.vipList.push(s);
        }
    }

    saveSession();
    renderBlacklist(botId);
}

function onPhotoSelect(botId) {
    const fi=document.getElementById(`photo-input-${botId}`);
    if(fi.files.length) {
        bots[botId].photoName=fi.files[0].name; document.getElementById(`photo-name-${botId}`).innerText=fi.files[0].name; document.getElementById(`photo-label-${botId}`).classList.add('file-selected');
        const r=new FileReader(); r.onload=e=>{ document.getElementById(`preview-img-${botId}`).src=e.target.result; document.getElementById(`preview-box-${botId}`).classList.add('has-img'); }; r.readAsDataURL(fi.files[0]);
    }
}
function removePhoto(botId) {
    document.getElementById(`photo-input-${botId}`).value=""; document.getElementById(`photo-name-${botId}`).innerText="Прикрепить фото"; document.getElementById(`preview-box-${botId}`).classList.remove('has-img'); document.getElementById(`photo-label-${botId}`).classList.remove('file-selected'); bots[botId].photoName=null;
}

async function handleLoginOrUpdate() {
    const l=document.getElementById('newLogin').value.trim(); const p=document.getElementById('newPass').value.trim(); const i=document.getElementById('newId').value.trim()||'ID';
    document.getElementById('loginError').innerText = "";
    if(editingBotId) {
        const bot = bots[editingBotId];
        if(bot) { bot.login = l; bot.pass = p; bot.displayId = i; document.getElementById(`tab-${bot.id}`).innerHTML = `<div class="status-dot online"></div> ${i} <span class="tab-close" onclick="closeTab(event, '${bot.id}')"><i class="fa fa-times"></i></span>`; saveSession(); }
        closeModal('add-modal'); return;
    }
    if(checkDuplicate(l, i)) { document.getElementById('loginError').innerText = "Этот аккаунт уже добавлен"; return; }
    if(await performLogin(l,p,i)) { document.getElementById('newLogin').value=''; document.getElementById('newPass').value=''; closeModal('add-modal'); }
}

async function performLogin(login, pass, displayId) {
    const e=document.getElementById('loginError'); const s=document.getElementById('loginSpinner'); if(s) s.style.display='inline-block';
    try {
        const res = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: login, Password: pass });

        if(res.data.Token) {
            const bid = 'bot_' + Date.now() + Math.floor(Math.random()*1000);
            const bot = new AccountBot(bid, login, pass, displayId, res.data.Token);
            bots[bid] = bot; // СНАЧАЛА добавляем в объект bots

            // Загружаем игнор-листы из localStorage (сохраняются навсегда, по displayId, раздельно для Mail и Chat)
            bot.ignoredUsersMail = loadIgnoredUsersFromStorage(displayId, 'mail');
            bot.ignoredUsersChat = loadIgnoredUsersFromStorage(displayId, 'chat');
            console.log(`[IgnoredUsers] Загружено: ${bot.ignoredUsersMail.length} (письма), ${bot.ignoredUsersChat.length} (чаты) для анкеты ${displayId}`);

            // ТЕПЕРЬ устанавливаем прокси (после добавления в bots чтобы getAccountNumber работал)
            await setWebviewProxy(bid);

            // Показываем UI и создаём WebView
            createInterface(bot); selectTab(bid); saveSession();

            // Создаём WebView (синхронно, прокси уже настроен на partition)
            bot.createWebview();

            // Загружаем данные с сервера (шаблоны, blacklist, статистику)
            const serverData = await loadBotDataFromServer(displayId);
            if (serverData) {
                bot.loadFromServerData(serverData);
                bot.updateUI();
                updateTemplateDropdown(bid);
                renderBlacklist(bid);
                console.log(`✅ Данные загружены с сервера для ${displayId}`);
            }

            // Отправляем первый heartbeat после создания бота
            setTimeout(() => sendHeartbeatToLababot(bid, displayId, 'online'), 2000);
            return true;
        }
    } catch(err) {
        if(e) e.innerText = err.response ? (err.response.data.Error || `Ошибка входа: ${err.response.status}`) : "Ошибка входа. Проверьте Proxy для Ladadate.";
    }
    finally { if(s) s.style.display='none'; }
    return false;
}

// === Функции для работы с игнор-листом (раздельно для Mail и Chat) ===
function saveIgnoredUsersToStorage(displayId, type, ignoredUsers) {
    try {
        const storageKey = `ignoredUsers_${type}`; // ignoredUsers_mail или ignoredUsers_chat
        const allIgnored = JSON.parse(localStorage.getItem(storageKey) || '{}');
        allIgnored[displayId] = ignoredUsers;
        localStorage.setItem(storageKey, JSON.stringify(allIgnored));
        console.log(`[IgnoredUsers] Сохранено ${ignoredUsers.length} пользователей (${type}) для анкеты ${displayId}`);
    } catch (e) {
        console.error('Ошибка сохранения ignoredUsers:', e);
    }
}

function loadIgnoredUsersFromStorage(displayId, type) {
    try {
        const storageKey = `ignoredUsers_${type}`; // ignoredUsers_mail или ignoredUsers_chat
        const allIgnored = JSON.parse(localStorage.getItem(storageKey) || '{}');
        return allIgnored[displayId] || [];
    } catch (e) {
        console.error('Ошибка загрузки ignoredUsers:', e);
        return [];
    }
}

function clearIgnoredUsers(botId, type) {
    try {
        const bot = bots[botId];
        if (bot) {
            if (type === 'mail') {
                bot.ignoredUsersMail = [];
                saveIgnoredUsersToStorage(bot.displayId, 'mail', []);
            } else {
                bot.ignoredUsersChat = [];
                saveIgnoredUsersToStorage(bot.displayId, 'chat', []);
            }
            bot.updateUI();
        }
    } catch (e) {
        console.error('Ошибка очистки ignoredUsers:', e);
    }
}

function openIgnoredModal(botId) {
    const bot = bots[botId];
    if (!bot) return;

    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';
    const typeName = isChat ? 'чатов' : 'писем';
    const list = isChat ? (bot.ignoredUsersChat || []) : (bot.ignoredUsersMail || []);
    const count = list.length;

    // Создаём содержимое модалки
    const listHtml = list.length > 0
        ? list.map(id => `<div class="ignored-item">${id}</div>`).join('')
        : '<div class="text-muted">Список пуст</div>';

    const modalContent = `
        <div class="modal-header">
            <h5>Игнор-лист ${typeName} (${count})</h5>
            <button type="button" class="btn-close" onclick="closeModal('ignored-modal')"></button>
        </div>
        <div class="modal-body">
            <div class="ignored-list-container">${listHtml}</div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline-secondary btn-sm" onclick="copyIgnoredList('${botId}')">
                <i class="fa fa-copy"></i> Копировать
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmClearIgnored('${botId}', '${type}')">
                <i class="fa fa-trash"></i> Очистить всё
            </button>
        </div>
    `;

    // Удаляем старую модалку и создаём заново (чтобы обработчики работали)
    let modal = document.getElementById('ignored-modal');
    if (modal) {
        modal.remove();
    }

    modal = document.createElement('div');
    modal.id = 'ignored-modal';
    modal.className = 'custom-modal';
    modal.innerHTML = `<div class="modal-backdrop"></div><div class="modal-content">${modalContent}</div>`;
    document.body.appendChild(modal);

    // Закрытие только по клику на backdrop (не на content)
    modal.querySelector('.modal-backdrop').onclick = () => closeModal('ignored-modal');
    modal.querySelector('.modal-content').onclick = (e) => e.stopPropagation();

    modal.classList.add('show');
}

function copyIgnoredList(botId) {
    const bot = bots[botId];
    if (!bot) return;

    const isChat = globalMode === 'chat';
    const list = isChat ? (bot.ignoredUsersChat || []) : (bot.ignoredUsersMail || []);

    if (list.length === 0) {
        showToast('Список пуст');
        return;
    }

    const text = list.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Скопировано ${list.length} ID`);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showToast('Ошибка копирования');
    });
}

function confirmClearIgnored(botId, type) {
    const typeName = type === 'chat' ? 'чатов' : 'писем';
    if (confirm(`Очистить игнор-лист ${typeName}? Это действие нельзя отменить.`)) {
        clearIgnoredUsers(botId, type);
        closeModal('ignored-modal');
        showToast(`Игнор-лист ${typeName} очищен`);
    }
}

async function saveSession() {
    try {
        // Сохраняем порядок вкладок в localStorage
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
                vipList: b.vipList,
                customIdsList: b.customIdsList || [],
                customIdsSent: b.customIdsSent || [],
                // Автоответы
                autoReplies: b.chatSettings.autoReplies || [],
                autoReplyEnabled: b.chatSettings.autoReplyEnabled || false,
                // Blacklist (локальное сохранение)
                mailBlacklist: b.mailSettings.blacklist || [],
                chatBlacklist: b.chatSettings.blacklist || []
            };
        }).filter(item => item !== null);

        localStorage.setItem('savedBots', JSON.stringify(localStorageData));

    } catch (error) {
        console.error('Error saving session:', error);
        // Падаем обратно на localStorage при ошибке
        const fallbackData = Array.from(document.querySelectorAll('.tab-item')).map(t => {
            const b = bots[t.id.replace('tab-', '')];
            return b ? {
                login: b.login,
                pass: b.pass,
                displayId: b.displayId
            } : null;
        }).filter(Boolean);
        localStorage.setItem('savedBots', JSON.stringify(fallbackData));
    }
}

async function restoreSession() {
    try {
        // Загружаем из localStorage
        const s = JSON.parse(localStorage.getItem('savedBots') || '[]');
        document.getElementById('restore-status').innerText = s.length ? `Загрузка ${s.length} из кэша...` : "";

        for (const a of s) {
            const ok = await performLogin(a.login, a.pass, a.displayId);
            if (ok && bots[Object.keys(bots).pop()]) {
                const botId = Object.keys(bots).pop();
                const bot = bots[botId];

                // Восстанавливаем остальные настройки из localStorage
                bot.lastTplMail = a.lastTplMail;
                bot.lastTplChat = a.lastTplChat;

                if (a.chatRotationHours) bot.chatSettings.rotationHours = a.chatRotationHours;
                if (a.chatCyclic !== undefined) bot.chatSettings.cyclic = a.chatCyclic;
                if (a.chatCurrentIndex) bot.chatSettings.currentInviteIndex = a.chatCurrentIndex;
                if (a.chatStartTime) bot.chatSettings.rotationStartTime = a.chatStartTime;
                if (a.mailAuto !== undefined) bot.mailSettings.auto = a.mailAuto;
                if (a.mailTarget) bot.mailSettings.target = a.mailTarget;
                if (a.vipList) bot.vipList = a.vipList;
                if (a.customIdsList) bot.customIdsList = a.customIdsList;
                if (a.customIdsSent) bot.customIdsSent = a.customIdsSent;
                // Восстанавливаем автоответы
                if (a.autoReplies) bot.chatSettings.autoReplies = a.autoReplies;
                if (a.autoReplyEnabled !== undefined) bot.chatSettings.autoReplyEnabled = a.autoReplyEnabled;
                // Восстанавливаем blacklist из localStorage (будет перезаписан сервером если доступен)
                if (a.mailBlacklist && a.mailBlacklist.length > 0) bot.mailSettings.blacklist = a.mailBlacklist;
                if (a.chatBlacklist && a.chatBlacklist.length > 0) bot.chatSettings.blacklist = a.chatBlacklist;

                updateInterfaceForMode(bot.id);
                // Показываем поле Custom IDs если выбран этот режим
                if (a.mailTarget === 'custom-ids') {
                    toggleCustomIdsField(bot.id);
                }
            }
            await new Promise(r => setTimeout(r, 500));
        }
        
        document.getElementById('restore-status').innerText = "";
        document.getElementById('restore-status').innerText = "";
        document.getElementById('welcome-screen').style.display = Object.keys(bots).length > 0 ? 'none' : 'flex';
        
        // Сохраняем порядок вкладок
        const tempBots = { ...bots };
        bots = {};
        const keys = Array.from(document.querySelectorAll('.tab-item')).map(t => t.id.replace('tab-', ''));
        keys.forEach(id => {
            if (tempBots[id]) bots[id] = tempBots[id];
        });
        
    } catch (error) {
        console.error('Error restoring session:', error);
        document.getElementById('restore-status').innerText = "Ошибка загрузки. Используется кэш.";
        document.getElementById('welcome-screen').style.display = Object.keys(bots).length > 0 ? 'none' : 'flex';
    }
}

function selectTab(id) {
    // ВАЖНО: Сохраняем текст текущей вкладки перед переключением
    if (activeTabId && bots[activeTabId]) {
        saveTemplateTextNow(activeTabId);
    }

    document.querySelectorAll('.tab-item').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.workspace').forEach(w=>w.classList.remove('active'));
    // ВАЖНО: Деактивируем/Активируем webview, но они остаются за экраном
    document.querySelectorAll('webview').forEach(wv => wv.classList.remove('active'));

    const t=document.getElementById(`tab-${id}`); const w=document.getElementById(`ws-${id}`);
    const wv=document.getElementById(`webview-${id}`);

    if(t&&w) {
        t.classList.add('active');
        w.classList.add('active');
        activeTabId=id;
        updateInterfaceForMode(id);
    }
    
    if(wv) wv.classList.add('active'); // Активируем процесс (попадает под стили position: fixed)
    
    document.getElementById('welcome-screen').style.display = 'none';
}

function closeTab(e, id) {
    e.stopPropagation();
    if(globalSettings.confirmTabClose && !confirm(`Закрыть вкладку ${bots[id].displayId}?`)) return;
    
    if(bots[id]) { 
        bots[id].stopMail(); bots[id].stopChat(); 
        bots[id].stopMonitoring();
        clearInterval(bots[id].keepAliveTimer); 
        clearInterval(bots[id].heartbeatInterval); // Останавливаем heartbeat
        
        // === ВАЖНОЕ ДОБАВЛЕНИЕ: Удаляем webview ===
        const wv = document.getElementById(`webview-${id}`);
        if(wv) wv.remove();
        
        delete bots[id]; 
    }
    document.getElementById(`tab-${id}`).remove(); document.getElementById(`ws-${id}`).remove();

    if(activeTabId === id) {
        const remainingIds = Object.keys(bots);
        if(remainingIds.length > 0) {
            const firstTab = document.querySelector('.tab-item');
            if (firstTab) selectTab(firstTab.id.replace('tab-', ''));
            else { activeTabId = null; document.getElementById('welcome-screen').style.display = 'flex'; }
        } else {
            activeTabId = null;
            document.getElementById('welcome-screen').style.display = 'flex';
        }
    }

    saveSession(); updateBotCount();
}

function toggleBot(id) {
    const bot = bots[id];
    const text = document.getElementById(`msg-${id}`).value;
    if (globalMode === 'chat') { if(bot.isChatRunning) bot.stopChat(); else bot.startChat(text); } 
    else { if(bot.isMailRunning) bot.stopMail(); else bot.startMail(text); }
}
function startAll() {
    Object.values(bots).forEach(b => {
        const text = document.getElementById(`msg-${b.id}`).value;
        if (globalMode === 'chat') { if(!b.isChatRunning) b.startChat(text); } else { if(!b.isMailRunning) b.startMail(text); }
    });
}
function stopAll() { Object.values(bots).forEach(b => { if (globalMode === 'chat') b.stopChat(); else b.stopMail(); }); }
async function clearAllStats() {
    if(!confirm("Очистить статистику на ВСЕХ анкетах?")) return;
    const type = globalMode === 'chat' ? 'chat' : 'mail';
    for (const b of Object.values(bots)) {
        if (globalMode === 'chat') {
            b.chatStats = {sent:0, errors:0, waiting:0};
            b.chatHistory = {sent:[], errors:[], waiting:[]};
        } else {
            b.mailStats = {sent:0, errors:0, waiting:0};
            b.mailHistory = {sent:[], errors:[], waiting:[]};
        }
        b.updateUI();
        // Сбрасываем на сервере
        await resetStatsOnServer(b.displayId, type);
    }
}
// Показать загрузку на вкладке
function showTabLoading(botId) {
    const tab = document.getElementById(`tab-${botId}`);
    if (tab) tab.classList.add('tab-loading');
}

// Скрыть загрузку на вкладке
function hideTabLoading(botId) {
    const tab = document.getElementById(`tab-${botId}`);
    if (tab) tab.classList.remove('tab-loading');
}

// Перелогинить одну анкету
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
    if(!confirm("Перезайти во все анкеты?")) return;
    const botIds = Object.keys(bots);
    if(botIds.length === 0) return;

    const btn = document.querySelector('.btn-refresh');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    btn.disabled = true;

    // Показываем загрузку на всех вкладках
    botIds.forEach(id => showTabLoading(id));

    for(const id of botIds) {
        await reloginBot(id);
        await new Promise(r => setTimeout(r, 300));
    }

    btn.innerHTML = orig;
    btn.disabled = false;
}

async function exportAllData() {
    try {
        const data = {
            bots: [],
            templates: botTemplates,
            accountPreferences: accountPreferences,
            globalSettings: globalSettings,
            exportDate: new Date().toISOString()
        };

        // Сохраняем данные ботов
        Object.values(bots).forEach(bot => {
            data.bots.push({
                id: bot.id,
                login: bot.login,
                displayId: bot.displayId,
                token: bot.token ? '[HIDDEN]' : null,
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

// ОБНОВЛЕННАЯ ФУНКЦИЯ handleFullImport
async function handleFullImport(input) {
    if (!input.files.length) return;

    if (!confirm('Внимание! Импорт перезапишет существующие данные. Продолжить?')) {
        input.value = '';
        return;
    }

    const btn = input.parentElement.querySelector('button');
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Импорт...';
    btn.disabled = true;

    try {
        const reader = new FileReader();

        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);

                // Импортируем ботов
                if (data.bots && Array.isArray(data.bots)) {
                    for (const botData of data.bots) {
                        if (botData.login && botData.displayId) {
                            await performLogin(botData.login, botData.pass || 'password', botData.displayId);
                        }
                    }
                }

                // Импортируем шаблоны
                if (data.templates) {
                    botTemplates = data.templates;
                    localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
                }

                // Импортируем настройки
                if (data.accountPreferences) {
                    accountPreferences = data.accountPreferences;
                    localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
                }

                if (data.globalSettings) {
                    globalSettings = { ...globalSettings, ...data.globalSettings };
                    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
                }

                alert('Данные успешно импортированы! Перезагрузите приложение.');
                setTimeout(() => location.reload(), 1000);

            } catch (error) {
                console.error('Import error:', error);
                alert('Ошибка импорта: ' + error.message);
            } finally {
                btn.innerHTML = origText;
                btn.disabled = false;
                input.value = '';
            }
        };

        reader.onerror = function(error) {
            alert('Ошибка чтения файла');
            btn.innerHTML = origText;
            btn.disabled = false;
            input.value = '';
        };

        reader.readAsText(input.files[0]);

    } catch (error) {
        console.error('Import error:', error);
        alert('Ошибка импорта: ' + error.message);
        btn.innerHTML = origText;
        btn.disabled = false;
        input.value = '';
    }
}

// =====================================================
// === АВТООТВЕТЫ НА ВХОДЯЩИЕ ЧАТЫ ===
// =====================================================

// Переключить автоответы
function toggleAutoReply(botId) {
    const bot = bots[botId];
    if (!bot) return;

    const checkbox = document.getElementById(`auto-reply-enabled-${botId}`);
    bot.chatSettings.autoReplyEnabled = checkbox.checked;

    saveSession();
    saveAutoRepliesToServer(botId);

    console.log(`[AutoReply] ${bot.displayId}: автоответы ${checkbox.checked ? 'включены' : 'выключены'}`);
}

// Добавить новый автоответ
function addAutoReply(botId) {
    const bot = bots[botId];
    if (!bot) return;

    // Добавляем пустой автоответ с дефолтной задержкой
    bot.chatSettings.autoReplies.push({
        text: '',
        delay: 60 // 60 секунд по умолчанию
    });

    renderAutoReplies(botId);
    saveSession();
}

// Удалить автоответ
function removeAutoReply(botId, index) {
    const bot = bots[botId];
    if (!bot) return;

    bot.chatSettings.autoReplies.splice(index, 1);

    renderAutoReplies(botId);
    saveSession();
    saveAutoRepliesToServer(botId);
}

// Обновить текст автоответа
function updateAutoReplyText(botId, index, text) {
    const bot = bots[botId];
    if (!bot || !bot.chatSettings.autoReplies[index]) return;

    bot.chatSettings.autoReplies[index].text = text;

    // Debounced сохранение
    clearTimeout(bot._autoReplyTextTimer);
    bot._autoReplyTextTimer = setTimeout(() => {
        saveSession();
        saveAutoRepliesToServer(botId);
    }, 1000);
}

// Обновить задержку автоответа
function updateAutoReplyDelay(botId, index, delay) {
    const bot = bots[botId];
    if (!bot || !bot.chatSettings.autoReplies[index]) return;

    const delayNum = parseInt(delay) || 60;
    bot.chatSettings.autoReplies[index].delay = delayNum;

    saveSession();
    saveAutoRepliesToServer(botId);
}

// Отрисовать список автоответов
function renderAutoReplies(botId) {
    const bot = bots[botId];
    if (!bot) return;

    const listEl = document.getElementById(`auto-reply-list-${botId}`);
    if (!listEl) return;

    const autoReplies = bot.chatSettings.autoReplies || [];

    if (autoReplies.length === 0) {
        listEl.innerHTML = '<div class="text-muted small text-center p-2">Нет автоответов</div>';
        return;
    }

    listEl.innerHTML = autoReplies.map((reply, idx) => `
        <div class="auto-reply-item" data-index="${idx}">
            <div class="auto-reply-item-header">
                <span class="auto-reply-number">#${idx + 1}</span>
                <div class="auto-reply-delay-group">
                    <label>Через:</label>
                    <input type="number" class="form-control form-control-sm auto-reply-delay"
                           value="${reply.delay}"
                           min="5" max="3600"
                           onchange="updateAutoReplyDelay('${botId}', ${idx}, this.value)">
                    <span>сек</span>
                </div>
                <button class="btn btn-sm btn-outline-danger auto-reply-delete"
                        onclick="removeAutoReply('${botId}', ${idx})"
                        title="Удалить">
                    <i class="fa fa-trash"></i>
                </button>
            </div>
            <textarea class="form-control form-control-sm auto-reply-text"
                      rows="2"
                      placeholder="Текст автоответа..."
                      oninput="updateAutoReplyText('${botId}', ${idx}, this.value)">${reply.text || ''}</textarea>
        </div>
    `).join('');
}

// Сохранить автоответы на сервер
async function saveAutoRepliesToServer(botId) {
    const bot = bots[botId];
    if (!bot) return;

    try {
        const response = await fetch(`${LABABOT_SERVER}/api/bot-data/${encodeURIComponent(bot.displayId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autoReplies: bot.chatSettings.autoReplies,
                autoReplyEnabled: bot.chatSettings.autoReplyEnabled
            })
        });

        if (response.ok) {
            console.log(`[AutoReply] Автоответы сохранены на сервер для ${bot.displayId}`);
        }
    } catch (error) {
        console.error(`[AutoReply] Ошибка сохранения:`, error);
    }
}

// Загрузить автоответы с сервера (вызывается при загрузке бота)
function loadAutoRepliesFromServerData(bot, serverData) {
    if (!serverData) return;

    if (serverData.autoReplies && Array.isArray(serverData.autoReplies)) {
        bot.chatSettings.autoReplies = serverData.autoReplies;
    }
    if (serverData.autoReplyEnabled !== undefined) {
        bot.chatSettings.autoReplyEnabled = serverData.autoReplyEnabled;
    }

    // Обновляем UI
    const checkbox = document.getElementById(`auto-reply-enabled-${bot.id}`);
    if (checkbox) {
        checkbox.checked = bot.chatSettings.autoReplyEnabled;
    }
    renderAutoReplies(bot.id);
}

// Инициализация UI автоответов при переключении режима
function initAutoRepliesUI(botId) {
    const bot = bots[botId];
    if (!bot) return;

    // Устанавливаем чекбокс
    const checkbox = document.getElementById(`auto-reply-enabled-${botId}`);
    if (checkbox) {
        checkbox.checked = bot.chatSettings.autoReplyEnabled || false;
    }

    // Отрисовываем список
    renderAutoReplies(botId);
}

// === ВИДЕОЧАТ (SHARE MY CAM) ===

// Хранение открытых окон видеочата и сохранённых камер
const videoChatWindows = new Map();
let savedCameras = JSON.parse(localStorage.getItem('savedCameras')) || {};

// Открыть видеочат - показать модальное окно выбора камеры
async function openVideoChatWindow(botId) {
    const bot = bots[botId];
    if (!bot) return;

    // Проверяем, есть ли сохранённая камера для этой анкеты
    const savedCamera = savedCameras[bot.displayId];
    if (savedCamera) {
        // Сразу открываем с сохранённой камерой
        launchVideoChatWindow(botId, savedCamera);
        return;
    }

    // Показываем модальное окно выбора камеры
    document.getElementById('camera-select-bot-id').value = botId;
    document.getElementById('camera-remember-choice').checked = false;

    // Загружаем список камер
    await loadAvailableCameras();

    openModal('camera-select-modal');
}

// Загрузить список доступных камер
async function loadAvailableCameras() {
    const select = document.getElementById('camera-select-list');
    select.innerHTML = '<option value="">Загрузка...</option>';

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices.length === 0) {
            select.innerHTML = '<option value="">Камеры не найдены</option>';
            return;
        }

        select.innerHTML = '';
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Камера ${index + 1}`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Ошибка получения списка камер:', error);
        select.innerHTML = '<option value="">Ошибка доступа к камерам</option>';
    }
}

// Подтвердить выбор камеры и открыть видеочат
function confirmCameraSelection() {
    const botId = document.getElementById('camera-select-bot-id').value;
    const cameraId = document.getElementById('camera-select-list').value;
    const remember = document.getElementById('camera-remember-choice').checked;

    if (!cameraId) {
        alert('Выберите камеру');
        return;
    }

    const bot = bots[botId];
    if (!bot) return;

    // Запоминаем выбор если нужно
    if (remember) {
        savedCameras[bot.displayId] = cameraId;
        localStorage.setItem('savedCameras', JSON.stringify(savedCameras));
    }

    closeModal('camera-select-modal');
    launchVideoChatWindow(botId, cameraId);
}

// Запустить окно видеочата
async function launchVideoChatWindow(botId, cameraId) {
    const bot = bots[botId];
    if (!bot) return;

    // Проверяем, есть ли уже открытое окно
    if (videoChatWindows.has(botId)) {
        // Фокусируем существующее окно
        const { ipcRenderer } = require('electron');
        ipcRenderer.invoke('focus-video-chat-window', { botId });
        return;
    }

    try {
        const { ipcRenderer } = require('electron');

        // Открываем окно видеочата
        const result = await ipcRenderer.invoke('open-video-chat-window', {
            botId: botId,
            displayId: bot.displayId,
            login: bot.login,
            pass: bot.pass,
            cameraId: cameraId
        });

        if (result.success) {
            videoChatWindows.set(botId, true);

            // Меняем стиль кнопки на "активный"
            const btn = document.getElementById(`btn-share-cam-${botId}`);
            if (btn) btn.classList.add('cam-active');

            console.log(`✅ Видеочат открыт для ${bot.displayId}`);
        }
    } catch (error) {
        console.error('Ошибка открытия видеочата:', error);
        alert('Ошибка открытия видеочата: ' + error.message);
    }
}

// Обработчик закрытия окна видеочата (вызывается из main process)
if (typeof require !== 'undefined') {
    const { ipcRenderer } = require('electron');

    ipcRenderer.on('video-chat-window-closed', (event, botId) => {
        videoChatWindows.delete(botId);

        // Убираем стиль "активный" с кнопки
        const btn = document.getElementById(`btn-share-cam-${botId}`);
        if (btn) btn.classList.remove('cam-active');

        console.log(`📹 Видеочат закрыт для ${botId}`);
    });

    // Обработчик уведомления о камере мужчины
    ipcRenderer.on('video-chat-man-camera', (event, data) => {
        const { botId, manName, manId, type } = data;
        const bot = bots[botId];
        if (!bot) return;

        let message = '';
        if (type === 'camera_on') {
            message = `${manName} (${manId}) включил камеру`;
        } else if (type === 'watching') {
            message = `${manName} (${manId}) смотрит вашу камеру`;
        }

        if (message) {
            // Звук
            playSound('chat');

            // Toast уведомление
            showCameraToast(message, bot.displayId);

            // Мигание вкладки
            flashTab(botId);
        }
    });
}

// Показать toast уведомление о камере
function showCameraToast(message, displayId) {
    // Удаляем старый toast если есть
    const existingToast = document.querySelector('.camera-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'camera-toast';
    toast.innerHTML = `
        <i class="fa fa-video-camera"></i>
        <span><b>[${displayId}]</b> ${message}</span>
    `;
    document.body.appendChild(toast);

    // Показываем
    setTimeout(() => toast.classList.add('show'), 10);

    // Убираем через 5 секунд
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Мигание вкладки
function flashTab(botId) {
    const tab = document.getElementById(`tab-${botId}`);
    if (!tab) return;

    let flashes = 0;
    const maxFlashes = 6;
    const interval = setInterval(() => {
        tab.style.backgroundColor = flashes % 2 === 0 ? '#dc3545' : '';
        flashes++;
        if (flashes >= maxFlashes) {
            clearInterval(interval);
            tab.style.backgroundColor = '';
        }
    }, 300);
}
