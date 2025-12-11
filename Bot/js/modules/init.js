window.onload = async function() {
    restoreSession();
    loadGlobalSettingsUI();
    toggleExtendedFeatures();
    initHotkeys();
    initTooltips();
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
    alert(`Всем анкетам установлен статус: ${targetType.toUpperCase()}`);
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
    const buttons = document.querySelectorAll('.btn-status-circle[data-status]');
    buttons.forEach(btn => {
        const status = btn.getAttribute('data-status');
        if (globalSettings.disabledStatuses && globalSettings.disabledStatuses.includes(status)) {
            btn.classList.add('status-disabled');
        } else {
            btn.classList.remove('status-disabled');
        }
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

function updateGlobalMenOnline() {
    const botIds = Object.keys(bots);
    if (botIds.length === 0) {
        const el = document.getElementById('global-men-count');
        if (el) el.textContent = '0';
        return;
    }

    // Берём случайную анкету
    const randomBotId = botIds[Math.floor(Math.random() * botIds.length)];
    const bot = bots[randomBotId];

    if (bot && bot.lastOnlineCount !== undefined) {
        const el = document.getElementById('global-men-count');
        if (el) el.textContent = bot.lastOnlineCount || '0';
    }
}

function startGlobalMenOnlineUpdater() {
    updateGlobalMenOnline();
    if (globalMenOnlineInterval) clearInterval(globalMenOnlineInterval);
    globalMenOnlineInterval = setInterval(updateGlobalMenOnline, 30000); // Каждые 30 сек
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

    // Определяем прокси для запроса
    let proxyConfig = null;

    // 1. Сначала пробуем прокси по позиции бота (ip:port)
    if (bot && bot.id) {
        const positionProxy = getProxyForBot(bot.id);
        if (positionProxy) {
            proxyConfig = parseSimpleProxy(positionProxy);
            if (proxyConfig) {
                console.log(`🌐 Прокси для ${bot.displayId || bot.id}: ${positionProxy}`);
            }
        }
    }

    // 2. Если нет прокси по позиции, используем общий proxyURL (http://user:pass@ip:port)
    if (!proxyConfig && globalSettings.proxyURL) {
        proxyConfig = parseProxyUrl(globalSettings.proxyURL);
    }

    // 3. Применяем прокси если он есть (без прокси тоже работает)
    if (proxyConfig) {
        config.proxy = proxyConfig;
    }

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
