/**
 * templates.js - Работа с шаблонами сообщений
 * CRUD операции для шаблонов Mail и Chat
 */

// ============================================================================
// ИНЛАЙН ОПЕРАЦИИ С ШАБЛОНАМИ
// ============================================================================

/**
 * Инлайн добавление нового шаблона (без модалки)
 * @param {string} botId - ID бота
 * @param {Event} event - Событие клика
 */
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

    console.log(`+ Создан новый шаблон "${newName}" для ${bot.displayId}`);
}

/**
 * Добавить шаблон ВСЕМ анкетам
 */
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

/**
 * Удалить шаблон
 * @param {string} botId - ID бота
 * @param {Event} event - Событие клика
 */
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
        tpls.splice(idx, 1);
        localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
        await saveTemplatesToServer(bot.displayId, type, tpls);
        updateTemplateDropdown(botId);
        onTemplateSelect(botId);
    }
}

/**
 * Удалить выбранный шаблон у ВСЕХ анкет
 */
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

// ============================================================================
// МОДАЛЬНОЕ ОКНО ШАБЛОНА
// ============================================================================

/**
 * Открыть модальное окно шаблона (для редактирования)
 * @param {string} botId - ID бота
 * @param {boolean} isEdit - Режим редактирования
 */
function openTemplateModal(botId, isEdit) {
    currentModalBotId = botId;
    const bot = bots[botId];
    const isChat = globalMode === 'chat';
    const tpls = getBotTemplates(bot.login)[isChat ? 'chat' : 'mail'];

    // Модалка только для редактирования
    const idx = document.getElementById(`tpl-select-${botId}`).value;
    if (idx === "") return alert("Выберите шаблон для редактирования");

    editingTemplateIndex = idx;
    document.getElementById('tpl-modal-title').innerText = "Редактировать шаблон";
    document.getElementById('tpl-modal-name').value = tpls[idx].name;
    document.getElementById('tpl-modal-text').value = tpls[idx].text;
    openModal('tpl-modal');
}

/**
 * Сохранить шаблон из модального окна
 */
async function saveTemplateFromModal() {
    const name = document.getElementById('tpl-modal-name').value;
    const text = document.getElementById('tpl-modal-text').value;
    if (!name) return;

    const bot = bots[currentModalBotId];
    const isChat = globalMode === 'chat';
    const type = isChat ? 'chat' : 'mail';

    try {
        let tpls = getBotTemplates(bot.login)[type];

        if (editingTemplateIndex !== null) {
            const fav = tpls[editingTemplateIndex]?.favorite || false;
            tpls[editingTemplateIndex] = { name, text, favorite: fav };
        } else {
            tpls.push({ name, text, favorite: false });
            editingTemplateIndex = tpls.length - 1;
        }

        localStorage.setItem('botTemplates', JSON.stringify(botTemplates));
        await saveTemplatesToServer(bot.displayId, type, tpls);

        updateTemplateDropdown(bot.id, editingTemplateIndex);
        closeModal('tpl-modal');

    } catch (error) {
        console.error('Error saving template:', error);
        alert('Ошибка сохранения шаблона');
    }
}

// ============================================================================
// ВЫБОР И ОБНОВЛЕНИЕ ШАБЛОНОВ
// ============================================================================

/**
 * Обработчик выбора шаблона
 * @param {string} botId - ID бота
 */
function onTemplateSelect(botId) {
    const idx = document.getElementById(`tpl-select-${botId}`).value;
    const bot = bots[botId];
    const isChat = globalMode === 'chat';

    if (!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
    if (isChat) accountPreferences[bot.login].chatTpl = idx;
    else accountPreferences[bot.login].mailTpl = idx;
    localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));

    saveSession();
    updateTemplateDropdown(botId, idx);
}

/**
 * Обновить dropdown шаблонов
 * @param {string} botId - ID бота
 * @param {number|null} forceSelectIndex - Индекс для принудительного выбора
 */
function updateTemplateDropdown(botId, forceSelectIndex = null) {
    const sel = document.getElementById(`tpl-select-${botId}`);
    if (!sel) return;

    const bot = bots[botId];
    const isChat = globalMode === 'chat';
    const tpls = getBotTemplates(bot.login)[isChat ? 'chat' : 'mail'];

    let val = (forceSelectIndex !== null) ? forceSelectIndex : sel.value;
    sel.innerHTML = '<option value="">-- Выберите --</option>';
    tpls.forEach((t, i) => sel.innerHTML += `<option value="${i}">${t.favorite ? '❤ ' : ''}${t.name}</option>`);

    const btnFav = document.getElementById(`btn-fav-${botId}`);
    if (val !== null && val !== "" && val !== undefined && tpls[val]) {
        sel.value = val;
        const area = document.getElementById(`msg-${botId}`);
        area.disabled = false;
        area.value = tpls[val].text;
        if (isChat) bots[botId].lastTplChat = val; else bots[botId].lastTplMail = val;

        // Сохраняем выбор шаблона
        if (!accountPreferences[bot.login]) accountPreferences[bot.login] = {};
        if (isChat) accountPreferences[bot.login].chatTpl = val;
        else accountPreferences[bot.login].mailTpl = val;
        localStorage.setItem('accountPreferences', JSON.stringify(accountPreferences));
        saveSession();

        if (btnFav) {
            if (tpls[val].favorite) {
                btnFav.classList.add('btn-heart-active', 'btn-danger');
                btnFav.classList.remove('btn-outline-danger');
            } else {
                btnFav.classList.remove('btn-heart-active', 'btn-danger');
                btnFav.classList.add('btn-outline-danger');
            }
        }
        validateInput(area);
    } else {
        sel.value = "";
        const area = document.getElementById(`msg-${botId}`);
        area.disabled = true;
        area.value = "";
        if (btnFav) btnFav.classList.remove('btn-heart-active');
        bots[botId].updateUI();
    }
}

// ============================================================================
// АВТОСОХРАНЕНИЕ ШАБЛОНОВ
// ============================================================================

/**
 * Автосохранение текста шаблона (debounce 3 сек)
 * @param {string} botId - ID бота
 */
function autoSaveTemplateText(botId) {
    if (autoSaveTimers[botId]) clearTimeout(autoSaveTimers[botId]);
    autoSaveTimers[botId] = setTimeout(() => {
        saveTemplateTextNow(botId);
    }, 3000);
}

/**
 * Немедленное сохранение текста шаблона (при blur или по таймеру)
 * @param {string} botId - ID бота
 */
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
        console.log(`Текст шаблона автосохранён для ${bot.displayId}`);
    }
}

// ============================================================================
// ИЗБРАННЫЕ ШАБЛОНЫ
// ============================================================================

/**
 * Переключить статус избранного для шаблона
 * @param {string} botId - ID бота
 */
async function toggleTemplateFavorite(botId) {
    const idx = document.getElementById(`tpl-select-${botId}`).value;
    if (idx === "") return;

    const bot = bots[botId];
    const tpls = getBotTemplates(bot.login)['mail'];

    if (tpls[idx]) {
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
                console.log(`Шаблон "${tpls[idx].name}" добавлен в избранное на сервере`);
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
                console.log(`Шаблон "${tpls[idx].name}" удалён из избранного на сервере`);
            }
        } catch (e) {
            console.error('Ошибка синхронизации избранного:', e);
        }
    }
}

console.log('[Lababot] templates.js loaded');
