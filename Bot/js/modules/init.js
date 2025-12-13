window.onload = async function() {
    restoreSession();
    loadGlobalSettingsUI();
    toggleExtendedFeatures();
    initHotkeys();
    initTooltips();
    initFocusProtection(); // КРИТИЧНО: Защита от потери фокуса
    updateDisabledStatusesUI(); // Отображаем отключенные статусы
    startGlobalMenOnlineUpdater(); // Запускаем обновление "Мужчины онлайн"

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
    document.addEventListener('focusin', (e) => {
        // Если фокус ушёл на кнопку, webview или другой не-input элемент
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'WEBVIEW') {
            console.warn('[Focus Protection] ⚠️ ФОКУС УКРАДЕН элементом:', {
                tag: e.target.tagName,
                id: e.target.id || 'БЕЗ ID',
                className: e.target.className || 'без класса',
                text: e.target.innerText?.substring(0, 20) || ''
            });

            // Возвращаем фокус на последний активный input
            if (lastActiveInput && document.body.contains(lastActiveInput)) {
                e.preventDefault();
                e.stopPropagation();

                // Небольшая задержка чтобы не конфликтовать с кликом
                setTimeout(() => {
                    lastActiveInput.focus();
                    console.log('[Focus Protection] ✅ Фокус возвращён на:', lastActiveInput.id || lastActiveInput.className);
                }, 10);
            } else {
                console.error('[Focus Protection] ❌ Нет lastActiveInput для возврата фокуса!');
            }
        }
    }, true);

    console.log('%c[Focus Protection] Защита от потери фокуса активирована + MutationObserver', 'color: green; font-weight: bold');
}

function setGlobalTarget(targetType) {
    Object.values(bots).forEach(bot => {
        if(globalMode === 'mail') bot.mailSettings.target = targetType;
        else bot.chatSettings.target = targetType;
        if(activeTabId === bot.id) {
            const sel = document.getElementById(`target-select-${bot.id}`);
            if(sel) sel.value = targetType;
        }
    });
    saveSession();
    showToast(`Всем установлен: ${targetType.toUpperCase()}`);
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
            } else {
                opt.classList.remove('status-disabled-option');
                opt.style.color = '';
            }
        });
    });
}

// Получить следующий активный статус (пропуская отключенные)
function getNextActiveStatus(currentStatus) {
    const statusOrder = ['payers', 'my-favorites', 'favorites', 'inbox', 'online'];
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
        showToast('Введите хотя бы один ID');
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

// Сбросить отправленные Custom IDs (начать заново)
function resetCustomIdsSent(botId) {
    const bot = bots[botId];
    if (!bot) return;
    bot.customIdsSent = [];
    updateCustomIdsRemaining(botId);
    console.log(`🔄 Custom IDs сброшены для ${botId}`);
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
    let config = {
        method: method,
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        data: data,
        withCredentials: true // Для сохранения и отправки cookies (нужно для /chat-* эндпоинтов)
    };
    if (bot && bot.token) config.headers.Authorization = `Bearer ${bot.token}`;

    // ВАЖНО: Прокси применяется через Electron defaultSession (устанавливается в setWebviewProxy)
    // config.proxy НЕ работает в browser контексте Electron!
    // Запросы автоматически идут через прокси настроенный в defaultSession

    try {
        return await axios(config);
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
