window.onload = async function() {
    console.log(`%c[Novabot v${APP_VERSION}] 🚀 Запуск приложения...`, 'color: #4CAF50; font-weight: bold; font-size: 14px');

    // ВАЖНО: Сначала загружаем настройки
    loadGlobalSettingsUI();
    toggleExtendedFeatures();

    // КРИТИЧНО: Ждём установки default прокси ПЕРЕД любыми логинами!
    await initDefaultProxy();

    // Только после установки прокси - восстанавливаем сессию (логины)
    restoreSession();
    initHotkeys();
    initTooltips();
    initFocusProtection(); // КРИТИЧНО: Защита от потери фокуса
    initTranscriptionContextMenu(); // Контекстное меню с переменными транскрипции
    updateDisabledStatusesUI(); // Отображаем отключенные статусы
    startGlobalMenOnlineUpdater(); // Запускаем обновление "Мужчины онлайн"
    initUpdateHandlers(); // Обработчики обновлений приложения
    initQuitHandler(); // Сохранение сессии при закрытии

    // Глобальное отслеживание Shift для bulk-действий
    document.addEventListener('keydown', (e) => { if (e.key === 'Shift') isShiftPressed = true; });
    document.addEventListener('keyup', (e) => { if (e.key === 'Shift') isShiftPressed = false; });
    window.addEventListener('blur', () => { isShiftPressed = false; }); // Сброс при потере фокуса

    document.addEventListener('click', (e) => {
        if(!e.target.closest('.ai-container')) {
            document.querySelectorAll('.ai-options').forEach(el => el.classList.remove('show'));
        }
    });

    window.onclick = function(e) {
        if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
        if(!e.target.classList.contains('vars-item') && !e.target.classList.contains('form-control')) {
            document.querySelectorAll('.vars-dropdown').forEach(d=>d.style.display='none');
        }
    };
};

// ============= СОХРАНЕНИЕ СЕССИИ ПРИ ЗАКРЫТИИ =============
function initQuitHandler() {
    const { ipcRenderer } = require('electron');

    ipcRenderer.on('save-session-before-quit', async () => {
        console.log('[App] Получена команда сохранить сессию перед закрытием');
        try {
            await saveSession();
            console.log('[App] Сессия сохранена успешно');
        } catch (err) {
            console.error('[App] Ошибка сохранения сессии:', err);
        }
        // Сообщаем main процессу что сохранение завершено
        ipcRenderer.send('session-saved');
    });
}

// ============= ОБРАБОТЧИКИ ОБНОВЛЕНИЙ ПРИЛОЖЕНИЯ =============
let updateState = 'idle'; // idle, downloading, ready

function initUpdateHandlers() {
    const { ipcRenderer } = require('electron');

    // Доступно обновление
    ipcRenderer.on('update-available', (event, data) => {
        console.log('[Update] Доступно обновление:', data.newVersion);
        document.getElementById('update-new-version').textContent = data.newVersion;
        document.getElementById('update-current-version').textContent = data.currentVersion;
        document.getElementById('update-modal-title').textContent = 'Доступно обновление';
        document.getElementById('update-modal-content').style.display = 'block';
        document.getElementById('update-progress-container').style.display = 'none';
        document.getElementById('update-btn-primary').innerHTML = '<i class="fa fa-download"></i> Скачать';
        document.getElementById('update-btn-primary').onclick = () => handleUpdateAction('download');
        document.getElementById('update-btn-secondary').style.display = '';
        updateState = 'idle';
        openModal('update-modal');
    });

    // Началось скачивание
    ipcRenderer.on('update-downloading', (event, data) => {
        console.log('[Update] Скачивание началось');
        document.getElementById('update-modal-title').textContent = 'Скачивание обновления';
        document.getElementById('update-modal-content').style.display = 'none';
        document.getElementById('update-progress-container').style.display = 'block';
        document.getElementById('update-btn-primary').disabled = true;
        document.getElementById('update-btn-primary').innerHTML = '<i class="fa fa-spinner fa-spin"></i> Скачивание...';
        document.getElementById('update-btn-secondary').style.display = 'none';
        updateState = 'downloading';
    });

    // Прогресс скачивания
    ipcRenderer.on('update-progress', (event, data) => {
        document.getElementById('update-progress-bar').style.width = data.percent + '%';
        document.getElementById('update-progress-text').textContent = `Скачивание: ${data.percent}%`;
    });

    // Обновление скачано
    ipcRenderer.on('update-downloaded', (event, data) => {
        console.log('[Update] Обновление скачано:', data.version);
        document.getElementById('update-modal-title').textContent = 'Обновление готово!';
        document.getElementById('update-modal-content').innerHTML = `
            <p style="font-size: 16px; margin-bottom: 15px;">
                <i class="fa fa-check-circle" style="color: #28a745; font-size: 48px;"></i>
            </p>
            <p style="font-size: 16px;">Версия <strong>${data.version}</strong> готова к установке</p>
            <p style="color: #6c757d; font-size: 13px;">Перезапустить приложение сейчас?</p>
        `;
        document.getElementById('update-modal-content').style.display = 'block';
        document.getElementById('update-progress-container').style.display = 'none';
        document.getElementById('update-btn-primary').disabled = false;
        document.getElementById('update-btn-primary').innerHTML = '<i class="fa fa-refresh"></i> Перезапустить';
        document.getElementById('update-btn-primary').onclick = () => handleUpdateAction('install');
        document.getElementById('update-btn-secondary').style.display = '';
        updateState = 'ready';
    });
}

function handleUpdateAction(action) {
    const { ipcRenderer } = require('electron');

    if (action === 'download') {
        ipcRenderer.send('update-response', 'download');
    } else if (action === 'install') {
        ipcRenderer.send('update-install-response', 'install');
    } else if (action === 'later') {
        closeModal('update-modal');
    }
}

// ============= ЗАЩИТА ОТ ПОТЕРИ ФОКУСА =============
function initFocusProtection() {
    let lastActiveInput = null;

    // Функция для блокировки фокуса на кнопках
    function disableButtonFocus(button) {
        if (!button.hasAttribute('id') || button.id === '') {
            button.setAttribute('tabindex', '-1');
            // Запрещаем фокус через click тоже
            button.addEventListener('mousedown', (e) => {
                e.preventDefault();
            }, { passive: false });
        }
    }

    // Применяем ко всем существующим кнопкам
    document.querySelectorAll('button').forEach(disableButtonFocus);

    // MutationObserver для отслеживания новых кнопок (динамически создаваемых)
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    // Если это кнопка
                    if (node.tagName === 'BUTTON') {
                        disableButtonFocus(node);
                        console.log('[Focus Protection] Найдена новая кнопка без ID, заблокирована:', node.className || 'без класса');
                    }
                    // Если это контейнер с кнопками
                    if (node.querySelectorAll) {
                        node.querySelectorAll('button').forEach(disableButtonFocus);
                    }
                }
            });
        });
    });

    // Наблюдаем за изменениями в body
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Отслеживаем последний активный input/textarea
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            lastActiveInput = e.target;
            console.log('[Focus] Активный input:', e.target.id || e.target.className);
        }
    });

    // Блокируем кнопки и webview от получения фокуса
    // ТОЛЬКО если есть активный input для возврата фокуса
    document.addEventListener('focusin', (e) => {
        // Если нет активного input - не блокируем ничего
        if (!lastActiveInput || !document.body.contains(lastActiveInput)) {
            return;
        }

        // Исключаем важные кнопки которым нужен фокус для работы
        const allowedButtonPrefixes = ['btn-share-cam', 'btn-video', 'btn-open-'];
        const buttonId = e.target.id || '';
        const isAllowedButton = allowedButtonPrefixes.some(prefix => buttonId.startsWith(prefix));

        // Если фокус ушёл на кнопку, webview или другой не-input элемент
        if ((e.target.tagName === 'BUTTON' && !isAllowedButton) || e.target.tagName === 'WEBVIEW') {
            console.warn('[Focus Protection] ⚠️ ФОКУС УКРАДЕН элементом:', {
                tag: e.target.tagName,
                id: e.target.id || 'БЕЗ ID',
                className: e.target.className || 'без класса',
                text: e.target.innerText?.substring(0, 20) || ''
            });

            e.preventDefault();
            e.stopPropagation();

            // Небольшая задержка чтобы не конфликтовать с кликом
            setTimeout(() => {
                lastActiveInput.focus();
                console.log('[Focus Protection] ✅ Фокус возвращён на:', lastActiveInput.id || lastActiveInput.className);
            }, 10);
        }
    }, true);

    console.log('%c[Focus Protection] Защита от потери фокуса активирована + MutationObserver', 'color: green; font-weight: bold');
}

function setGlobalTarget(targetType) {
    // Проверяем, не отключен ли статус
    if (globalSettings.disabledStatuses && globalSettings.disabledStatuses.includes(targetType)) {
        showToast(`Статус ${targetType.toUpperCase()} отключен`, 'warning');
        return;
    }

    Object.values(bots).forEach(bot => {
        if(globalMode === 'mail') bot.mailSettings.target = targetType;
        else bot.chatSettings.target = targetType;

        const sel = document.getElementById(`target-select-${bot.id}`);
        if(sel) sel.value = targetType;

        // Обновляем видимость поля Custom IDs
        toggleCustomIdsField(bot.id);
    });
    saveSession();
    showToast(`Всем установлен: ${targetType.toUpperCase()}`, 'success');
}

// ============= ОТКЛЮЧЕНИЕ СТАТУСОВ (ПКМ) =============
// Переключение статуса вкл/выкл по правому клику
function toggleStatusDisabled(status, event) {
    event.preventDefault(); // Отменяем контекстное меню

    if (!globalSettings.disabledStatuses) {
        globalSettings.disabledStatuses = [];
    }

    const idx = globalSettings.disabledStatuses.indexOf(status);
    if (idx === -1) {
        // Добавляем в отключенные
        globalSettings.disabledStatuses.push(status);
        console.log(`🚫 Статус "${status}" отключен (пропускается в авто-режиме)`);
    } else {
        // Убираем из отключенных
        globalSettings.disabledStatuses.splice(idx, 1);
        console.log(`✅ Статус "${status}" включен`);
    }

    // Сохраняем и обновляем UI
    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
    updateDisabledStatusesUI();
}

// Обновление визуального отображения отключенных статусов
function updateDisabledStatusesUI() {
    // 1. Обновляем кнопки в верхней панели
    const buttons = document.querySelectorAll('.btn-status-circle[data-status]');
    buttons.forEach(btn => {
        const status = btn.getAttribute('data-status');
        if (globalSettings.disabledStatuses && globalSettings.disabledStatuses.includes(status)) {
            btn.classList.add('status-disabled');
        } else {
            btn.classList.remove('status-disabled');
        }
    });

    // 2. Обновляем опции в select для всех ботов
    const selects = document.querySelectorAll('[id^="target-select-"]');
    selects.forEach(select => {
        Array.from(select.options).forEach(opt => {
            const optValue = opt.value;
            if (globalSettings.disabledStatuses && globalSettings.disabledStatuses.includes(optValue)) {
                opt.classList.add('status-disabled-option');
                opt.style.color = '#999';
                opt.disabled = true; // Запрещаем выбор
            } else {
                opt.classList.remove('status-disabled-option');
                opt.style.color = '';
                opt.disabled = false;
            }
        });
    });
}

// Получить следующий активный статус (пропуская отключенные)
// Порядок снизу вверх по списку: Payers → Inbox → My favorite → I am a favorite of → Online
function getNextActiveStatus(currentStatus) {
    const statusOrder = ['payers', 'inbox', 'my-favorites', 'favorites', 'online'];
    const currentIdx = statusOrder.indexOf(currentStatus);

    // Ищем следующий не отключенный статус
    for (let i = currentIdx + 1; i < statusOrder.length; i++) {
        const nextStatus = statusOrder[i];
        if (!globalSettings.disabledStatuses || !globalSettings.disabledStatuses.includes(nextStatus)) {
            return nextStatus;
        }
    }

    // Если все следующие отключены, возвращаем online (он всегда доступен как fallback)
    return 'online';
}

// ============= CUSTOM IDS (Рассылка по конкретным ID) =============

// Открыть модалку Global Custom IDs
function openGlobalCustomIdsModal() {
    const input = document.getElementById('global-custom-ids-input');
    if (input) {
        input.value = '';
        input.oninput = updateGlobalCustomIdsCount;
    }
    updateGlobalCustomIdsCount();
    openModal('global-custom-ids-modal');
}

// Подсчёт ID в поле ввода
function updateGlobalCustomIdsCount() {
    const input = document.getElementById('global-custom-ids-input');
    const countEl = document.getElementById('global-custom-ids-count');
    if (input && countEl) {
        const ids = parseCustomIds(input.value);
        countEl.textContent = ids.length;
    }
}

// Очистить поле глобальных Custom IDs
function clearGlobalCustomIds() {
    const input = document.getElementById('global-custom-ids-input');
    if (input) {
        input.value = '';
        updateGlobalCustomIdsCount();
    }
}

// Применить Custom IDs ко ВСЕМ анкетам
function applyGlobalCustomIds() {
    const input = document.getElementById('global-custom-ids-input');
    if (!input) return;

    const ids = parseCustomIds(input.value);
    if (ids.length === 0) {
        showToast('Введите хотя бы один ID', 'warning');
        return;
    }

    const botIds = Object.keys(bots);
    let count = 0;

    for (const botId of botIds) {
        const bot = bots[botId];

        // Устанавливаем Custom IDs для бота
        bot.customIdsList = [...ids]; // Копируем массив
        bot.customIdsSent = []; // Сбрасываем отправленные

        // Переключаем режим на custom-ids
        if (globalMode === 'mail') {
            bot.mailSettings.target = 'custom-ids';
        }

        // Обновляем UI
        const targetSelect = document.getElementById(`target-select-${botId}`);
        if (targetSelect) {
            targetSelect.value = 'custom-ids';
        }
        toggleCustomIdsField(botId);

        // Обновляем поле ввода и счётчик для этого бота
        const botInput = document.getElementById(`custom-ids-input-${botId}`);
        if (botInput) {
            botInput.value = ids.join(', ');
        }
        updateCustomIdsRemaining(botId);

        // Сохраняем в accountPreferences
        if (!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
        accountPreferences[bot.login].customIds = ids;

        count++;
    }

    localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
    saveSession();
    closeModal('global-custom-ids-modal');

    showBulkNotification(`Custom IDs (${ids.length}) применены ко всем анкетам`, count);
    console.log(`✅ Custom IDs (${ids.length}) применены к ${count} анкетам`);
}

// Показать/скрыть поле ввода Custom IDs
function toggleCustomIdsField(botId) {
    const select = document.getElementById(`target-select-${botId}`);
    const field = document.getElementById(`custom-ids-field-${botId}`);
    if (select && field) {
        field.style.display = select.value === 'custom-ids' ? 'block' : 'none';
        if (select.value === 'custom-ids') {
            // Загружаем сохранённые ID
            const bot = bots[botId];
            if (bot && bot.customIdsList) {
                document.getElementById(`custom-ids-input-${botId}`).value = bot.customIdsList.join(', ');
                updateCustomIdsRemaining(botId);
            }
        }
    }
}

// Сохранить Custom IDs для бота
function saveCustomIds(botId) {
    const input = document.getElementById(`custom-ids-input-${botId}`);
    if (!input) return;

    const bot = bots[botId];
    if (!bot) return;

    // Парсим ID из текста (через запятую, пробел или перенос строки)
    const ids = parseCustomIds(input.value);
    bot.customIdsList = ids;
    bot.customIdsSent = bot.customIdsSent || []; // ID которым уже отправили

    // Сохраняем в accountPreferences
    if (!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
    accountPreferences[bot.login].customIds = ids;
    localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));

    updateCustomIdsRemaining(botId);
    console.log(`💾 Custom IDs сохранены для ${botId}: ${ids.length} ID`);
}

// Парсинг ID из строки (поддержка запятых, пробелов, переносов)
function parseCustomIds(text) {
    if (!text) return [];
    // Разбиваем по запятым, пробелам и переносам строк
    return text.split(/[\s,\n]+/)
        .map(id => id.trim())
        .filter(id => id && /^\d+$/.test(id)); // Только числовые ID
}

// Обновить счётчик оставшихся ID
function updateCustomIdsRemaining(botId) {
    const bot = bots[botId];
    if (!bot) return;

    const total = (bot.customIdsList || []).length;
    const sent = (bot.customIdsSent || []).length;
    const remaining = total - sent;

    const el = document.getElementById(`custom-ids-remaining-${botId}`);
    if (el) el.textContent = remaining;
}

// Получить следующий ID из списка Custom IDs
function getNextCustomId(botId) {
    const bot = bots[botId];
    if (!bot || !bot.customIdsList) return null;

    bot.customIdsSent = bot.customIdsSent || [];

    // Ищем первый ID который ещё не отправлен
    for (const id of bot.customIdsList) {
        if (!bot.customIdsSent.includes(id)) {
            return id;
        }
    }
    return null; // Все ID отправлены
}

// Отметить ID как отправленный
function markCustomIdSent(botId, id) {
    const bot = bots[botId];
    if (!bot) return;

    bot.customIdsSent = bot.customIdsSent || [];
    if (!bot.customIdsSent.includes(id)) {
        bot.customIdsSent.push(id);
    }
    updateCustomIdsRemaining(botId);
}

// ============= МУЖЧИНЫ ОНЛАЙН (ГЛОБАЛЬНО) =============
let globalMenOnlineInterval = null;

// Просто читаем кэшированное значение от ботов (они обновляют его в doActivity каждую минуту)
function updateGlobalMenOnline() {
    const el = document.getElementById('global-men-count');
    if (!el) return;

    const botIds = Object.keys(bots);
    if (botIds.length === 0) {
        el.textContent = '0';
        return;
    }

    // Ищем любого бота с lastOnlineCount
    for (const bid of botIds) {
        const bot = bots[bid];
        if (bot && bot.lastOnlineCount !== undefined && bot.lastOnlineCount > 0) {
            el.textContent = bot.lastOnlineCount;
            return;
        }
    }

    // Если ни у кого нет данных - оставляем текущее значение или 0
    if (el.textContent === '0' || el.textContent === '...') {
        el.textContent = '0';
    }
}

function startGlobalMenOnlineUpdater() {
    // Не запускаем сразу - подождём пока боты загрузятся и получат данные
    if (globalMenOnlineInterval) clearInterval(globalMenOnlineInterval);
    // Обновляем каждые 30 секунд (читаем кэш от ботов, не делаем своих запросов)
    globalMenOnlineInterval = setInterval(updateGlobalMenOnline, 30000);
}

async function makeApiRequest(bot, method, path, data = null, isRetry = false) {
    let endpoint = `${LADADATE_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

    // Собираем headers
    const headers = { 'Content-Type': 'application/json' };
    if (bot && bot.token) headers.Authorization = `Bearer ${bot.token}`;

    // Используем IPC для запросов через main процесс (с правильным прокси)
    const { ipcRenderer } = require('electron');

    console.log(`%c[API Request] ${method} ${path} (botId: ${bot ? bot.id : 'null'})`, 'color: blue');

    try {
        const result = await ipcRenderer.invoke('api-request', {
            method: method,
            url: endpoint,
            headers: headers,
            data: data,
            botId: bot ? bot.id : null
        });

        console.log(`%c[API Response] success=${result.success}, status=${result.status}`, result.success ? 'color: green' : 'color: red');
        if (!result.success) {
            console.error('[API Error]', result.error);
        }

        if (!result.success) {
            const error = new Error(result.error || 'Request failed');
            error.response = result.response;
            throw error;
        }

        // Возвращаем в формате совместимом с axios
        return { data: result.data, status: result.status, headers: result.headers };
    } catch (error) {
        if (error.response && error.response.status === 401 && bot && !isRetry) {
            console.log(`[Auto-Relogin] Token expired for ${bot.displayId}. Attempting silent relogin...`);
            try {
                const loginRes = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: bot.login, Password: bot.pass });

                if (loginRes.data.Token) {
                    console.log(`[Auto-Relogin] Success for ${bot.displayId}! Retrying original request...`);
                    bot.token = loginRes.data.Token;
                    return await makeApiRequest(bot, method, path, data, true);
                }
            } catch (loginErr) {
                console.error(`[Auto-Relogin] Failed for ${bot.displayId}`, loginErr);
            }
        }
        throw error;
    }
}

// ============= АВТООЧИСТКА ОШИБОК =============

// Открыть модалку настроек автоочистки (ПКМ на кнопке ластика)
function openAutoClearSettings(event) {
    event.preventDefault();

    // Определяем текущий режим (Mail/Chat)
    const isChat = globalMode === 'chat';

    // Инициализируем настройки ошибок если их нет
    if (isChat && !globalSettings.autoClearChat) {
        globalSettings.autoClearChat = { byTimeEnabled: false, byTimeMinutes: '', byErrorsEnabled: false, byErrorsCount: '' };
    } else if (!isChat && !globalSettings.autoClearMail) {
        globalSettings.autoClearMail = { byTimeEnabled: false, byTimeMinutes: '', byErrorsEnabled: false, byErrorsCount: '' };
    }

    // Инициализируем настройки отправленных если их нет
    if (isChat && !globalSettings.autoClearSentChat) {
        globalSettings.autoClearSentChat = { byTimeEnabled: false, byTimeMinutes: '', bySentEnabled: false, bySentCount: '' };
    } else if (!isChat && !globalSettings.autoClearSentMail) {
        globalSettings.autoClearSentMail = { byTimeEnabled: false, byTimeMinutes: '', bySentEnabled: false, bySentCount: '' };
    }

    const currentSettings = isChat ? globalSettings.autoClearChat : globalSettings.autoClearMail;
    const currentSentSettings = isChat ? globalSettings.autoClearSentChat : globalSettings.autoClearSentMail;

    // Обновляем UI модалки - секция Ошибки
    document.getElementById('auto-clear-mode-label').textContent = isChat ? 'Chat' : 'Mail';
    document.getElementById('auto-clear-by-time-enabled').checked = currentSettings.byTimeEnabled;
    document.getElementById('auto-clear-time-value').value = currentSettings.byTimeMinutes || '';
    document.getElementById('auto-clear-by-errors-enabled').checked = currentSettings.byErrorsEnabled;
    document.getElementById('auto-clear-errors-value').value = currentSettings.byErrorsCount || '';

    // Обновляем UI модалки - секция Отправленные
    document.getElementById('auto-clear-sent-by-time-enabled').checked = currentSentSettings?.byTimeEnabled || false;
    document.getElementById('auto-clear-sent-time-value').value = currentSentSettings?.byTimeMinutes || '';
    document.getElementById('auto-clear-sent-by-count-enabled').checked = currentSentSettings?.bySentEnabled || false;
    document.getElementById('auto-clear-sent-count-value').value = currentSentSettings?.bySentCount || '';

    openModal('auto-clear-modal');
}

// Сохранить настройки автоочистки
function saveAutoClearSettings() {
    const isChat = globalMode === 'chat';

    // Настройки ошибок
    const errorSettings = {
        byTimeEnabled: document.getElementById('auto-clear-by-time-enabled').checked,
        byTimeMinutes: document.getElementById('auto-clear-time-value').value ? parseInt(document.getElementById('auto-clear-time-value').value) : '',
        byErrorsEnabled: document.getElementById('auto-clear-by-errors-enabled').checked,
        byErrorsCount: document.getElementById('auto-clear-errors-value').value ? parseInt(document.getElementById('auto-clear-errors-value').value) : ''
    };

    // Настройки отправленных
    const sentSettings = {
        byTimeEnabled: document.getElementById('auto-clear-sent-by-time-enabled').checked,
        byTimeMinutes: document.getElementById('auto-clear-sent-time-value').value ? parseInt(document.getElementById('auto-clear-sent-time-value').value) : '',
        bySentEnabled: document.getElementById('auto-clear-sent-by-count-enabled').checked,
        bySentCount: document.getElementById('auto-clear-sent-count-value').value ? parseInt(document.getElementById('auto-clear-sent-count-value').value) : ''
    };

    if (isChat) {
        globalSettings.autoClearChat = errorSettings;
        globalSettings.autoClearSentChat = sentSettings;
    } else {
        globalSettings.autoClearMail = errorSettings;
        globalSettings.autoClearSentMail = sentSettings;
    }

    localStorage.setItem('globalSettings', JSON.stringify(globalSettings));
    console.log(`[AutoClear] Настройки ${isChat ? 'Chat' : 'Mail'} сохранены:`, { errors: errorSettings, sent: sentSettings });
}

// Проверка условий автоочистки для бота (вызывается в scheduleNextMail/scheduleNextChat)
function checkAutoClearConditions(bot, mode) {
    const isChat = mode === 'chat';
    const settings = isChat ? globalSettings.autoClearChat : globalSettings.autoClearMail;
    if (!settings) return false;

    const stats = isChat ? bot.chatStats : bot.mailStats;
    const startTime = isChat ? bot.chatStartTime : bot.mailStartTime;

    let shouldClear = false;

    // Условие 1: По времени
    if (settings.byTimeEnabled && startTime) {
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        if (elapsedMinutes >= settings.byTimeMinutes) {
            shouldClear = true;
            console.log(`[AutoClear] ${bot.displayId} - условие времени (${Math.floor(elapsedMinutes)} мин >= ${settings.byTimeMinutes} мин)`);
        }
    }

    // Условие 2: По количеству ошибок
    if (settings.byErrorsEnabled && stats.errors >= settings.byErrorsCount) {
        shouldClear = true;
        console.log(`[AutoClear] ${bot.displayId} - условие ошибок (${stats.errors} >= ${settings.byErrorsCount})`);
    }

    return shouldClear;
}

// Выполнить автоочистку для всех ботов
function performAutoClear(mode) {
    const isChat = mode === 'chat';
    let totalCleared = 0;

    Object.values(bots).forEach(bot => {
        const stats = isChat ? bot.chatStats : bot.mailStats;
        const history = isChat ? bot.chatHistory : bot.mailHistory;

        if (stats.errors > 0) {
            totalCleared += stats.errors;
            stats.errors = 0;
            if (history) history.errors = [];
            bot.updateUI();
        }

        // Сбрасываем время старта для отсчёта следующего интервала
        if (isChat) {
            bot.chatStartTime = Date.now();
        } else {
            bot.mailStartTime = Date.now();
        }
    });

    if (totalCleared > 0) {
        console.log(`[AutoClear] ${mode}: Очищено ${totalCleared} ошибок по всем анкетам`);
    }
}

// Проверка условий автоочистки отправленных для бота
function checkAutoClearSentConditions(bot, mode) {
    const isChat = mode === 'chat';
    const settings = isChat ? globalSettings.autoClearSentChat : globalSettings.autoClearSentMail;
    if (!settings) return false;

    const stats = isChat ? bot.chatStats : bot.mailStats;
    const startTime = isChat ? bot.chatStartTime : bot.mailStartTime;

    let shouldClear = false;

    // Условие 1: По времени
    if (settings.byTimeEnabled && settings.byTimeMinutes && startTime) {
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        if (elapsedMinutes >= settings.byTimeMinutes) {
            shouldClear = true;
            console.log(`[AutoClearSent] ${bot.displayId} - условие времени (${Math.floor(elapsedMinutes)} мин >= ${settings.byTimeMinutes} мин)`);
        }
    }

    // Условие 2: По количеству отправленных
    if (settings.bySentEnabled && settings.bySentCount && stats.sent >= settings.bySentCount) {
        shouldClear = true;
        console.log(`[AutoClearSent] ${bot.displayId} - условие отправленных (${stats.sent} >= ${settings.bySentCount})`);
    }

    return shouldClear;
}

// Выполнить автоочистку отправленных для всех ботов
function performAutoClearSent(mode) {
    const isChat = mode === 'chat';
    let totalCleared = 0;

    Object.values(bots).forEach(bot => {
        const stats = isChat ? bot.chatStats : bot.mailStats;
        const history = isChat ? bot.chatHistory : bot.mailHistory;

        if (stats.sent > 0) {
            totalCleared += stats.sent;
            stats.sent = 0;

            // Очищаем историю отправок (это и есть список контактов для фильтрации)
            if (history) history.sent = [];

            bot.updateUI();
        }

        // Сбрасываем время старта для отсчёта следующего интервала
        if (isChat) {
            bot.chatStartTime = Date.now();
        } else {
            bot.mailStartTime = Date.now();
        }
    });

    if (totalCleared > 0) {
        console.log(`[AutoClearSent] ${mode}: Очищено ${totalCleared} отправленных, история сброшена - бот сможет писать тем же людям`);
    }
}

// ============= КОНТЕКСТНОЕ МЕНЮ ТРАНСКРИПЦИИ =============

// Создание контекстного меню при загрузке
function createTranscriptionContextMenu() {
    // Удаляем старое меню если есть
    const existingMenu = document.getElementById('transcription-context-menu');
    if (existingMenu) existingMenu.remove();

    // Создаём новое меню
    const menu = document.createElement('div');
    menu.id = 'transcription-context-menu';
    menu.className = 'transcription-context-menu';

    // Заголовок
    const header = document.createElement('div');
    header.className = 'transcription-context-menu-header';
    header.textContent = 'Вставить переменную';
    menu.appendChild(header);

    // Пункты меню из TRANSCRIPTION_VARIABLES (определены в config.js)
    TRANSCRIPTION_VARIABLES.forEach(v => {
        const item = document.createElement('div');
        item.className = 'transcription-context-menu-item';
        item.innerHTML = `<span class="var-name">${v.name}</span><span class="var-desc">${v.desc}</span>`;
        item.onclick = () => insertTranscriptionVar(v.name);
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Закрытие меню при клике вне него
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.remove('show');
        }
    });

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            menu.classList.remove('show');
        }
    });
}

// Показ контекстного меню
function showTranscriptionContextMenu(e, textarea) {
    e.preventDefault();
    currentContextMenuTextarea = textarea;

    // Если меню ещё не создано - создаём
    let menu = document.getElementById('transcription-context-menu');
    if (!menu) {
        createTranscriptionContextMenu();
        menu = document.getElementById('transcription-context-menu');
    }
    if (!menu) return;

    // Позиционируем меню
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    // Проверяем границы экрана
    menu.classList.add('show');
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (e.clientY - rect.height) + 'px';
    }
}

// Вставка переменной в textarea
function insertTranscriptionVar(varName) {
    const menu = document.getElementById('transcription-context-menu');
    if (menu) menu.classList.remove('show');

    if (!currentContextMenuTextarea) return;

    const textarea = currentContextMenuTextarea;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // Вставляем переменную в позицию курсора
    textarea.value = text.substring(0, start) + varName + text.substring(end);

    // Устанавливаем курсор после вставленной переменной
    const newPos = start + varName.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();

    // Триггерим события для автосохранения
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Если есть botId, сохраняем шаблон
    const botIdMatch = textarea.id.match(/msg-(.+)/);
    if (botIdMatch && botIdMatch[1]) {
        autoSaveTemplateText(botIdMatch[1]);
    }
}

// Инициализация контекстного меню для всех textarea сообщений
function initTranscriptionContextMenu() {
    createTranscriptionContextMenu();

    // Добавляем обработчик на document для делегирования событий
    document.addEventListener('contextmenu', (e) => {
        const textarea = e.target.closest('.textarea-msg');
        if (textarea) {
            showTranscriptionContextMenu(e, textarea);
        }
    });

    console.log('✅ Контекстное меню транскрипции инициализировано');
}
