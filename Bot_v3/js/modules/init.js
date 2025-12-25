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
    startMemoryCleanup(); // Периодическая очистка памяти
    startPromptSync(); // Синхронизация промпта для генерации с сервером
    startBatchSync(); // ОПТИМИЗАЦИЯ: Batch sync вместо индивидуальных heartbeat

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

// Получить первый включённый статус сверху (по порядку в списке)
function getFirstEnabledStatus() {
    // Порядок статусов сверху вниз в выпадающем списке
    const statusOrder = ['online-smart', 'shared-online', 'online', 'favorites', 'my-favorites', 'inbox', 'payers', 'custom-ids'];

    for (const status of statusOrder) {
        if (!globalSettings.disabledStatuses || !globalSettings.disabledStatuses.includes(status)) {
            return status;
        }
    }

    // Fallback: online-smart всегда доступен
    return 'online-smart';
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

    // 2. Обновляем опции в select для всех ботов - СКРЫВАЕМ отключённые
    const selects = document.querySelectorAll('[id^="target-select-"]');
    selects.forEach(select => {
        Array.from(select.options).forEach(opt => {
            const optValue = opt.value;
            if (globalSettings.disabledStatuses && globalSettings.disabledStatuses.includes(optValue)) {
                opt.style.display = 'none'; // Скрываем из списка
            } else {
                opt.style.display = ''; // Показываем
            }
        });
    });

    // 3. Проверяем всех ботов - если их текущий статус отключён, переключаем
    const firstEnabled = getFirstEnabledStatus();
    Object.values(bots).forEach(bot => {
        const currentTarget = globalMode === 'mail' ? bot.mailSettings.target : bot.chatSettings.target;

        // Если текущий статус отключён
        if (globalSettings.disabledStatuses && globalSettings.disabledStatuses.includes(currentTarget)) {
            console.log(`[Status] Бот ${bot.id}: статус "${currentTarget}" отключён, переключаю на "${firstEnabled}"`);

            // Обновляем настройки бота
            if (globalMode === 'mail') {
                bot.mailSettings.target = firstEnabled;
            } else {
                bot.chatSettings.target = firstEnabled;
            }

            // Обновляем UI
            const sel = document.getElementById(`target-select-${bot.id}`);
            if (sel) sel.value = firstEnabled;

            // Обновляем видимость поля Custom IDs
            if (typeof toggleCustomIdsField === 'function') {
                toggleCustomIdsField(bot.id);
            }
        }
    });

    // 4. Сохраняем сессию
    if (typeof saveSession === 'function') {
        saveSession();
    }
}

// Получить следующий активный статус (пропуская отключенные)
// Порядок снизу вверх по списку: Payers → Inbox → My favorite → I am a favorite of → Online/Shared/Smart
function getNextActiveStatus(currentStatus) {
    const statusOrder = ['payers', 'inbox', 'my-favorites', 'favorites'];
    const onlineStatuses = ['online', 'shared-online', 'online-smart'];
    const currentIdx = statusOrder.indexOf(currentStatus);

    // Если текущий статус - один из онлайнов, остаёмся на нём
    if (onlineStatuses.includes(currentStatus)) {
        return currentStatus;
    }

    // Ищем следующий не отключенный статус
    for (let i = currentIdx + 1; i < statusOrder.length; i++) {
        const nextStatus = statusOrder[i];
        if (!globalSettings.disabledStatuses || !globalSettings.disabledStatuses.includes(nextStatus)) {
            return nextStatus;
        }
    }

    // После favorites переключаемся на первый доступный онлайн
    for (const onlineStatus of onlineStatuses) {
        if (!globalSettings.disabledStatuses || !globalSettings.disabledStatuses.includes(onlineStatus)) {
            return onlineStatus;
        }
    }

    // Fallback: online-smart (всегда доступен)
    return 'online-smart';
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



