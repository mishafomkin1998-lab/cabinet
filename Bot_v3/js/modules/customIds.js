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
