/**
 * ui.js - UI функции
 * Модальные окна, toast уведомления, tooltips, диалоги
 */

// ============================================================================
// МОДАЛЬНЫЕ ОКНА
// ============================================================================

/**
 * Открытие модального окна
 * @param {string} id - ID модального окна
 */
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('show');
        document.body.classList.add('modal-open');
    }
}

/**
 * Закрытие модального окна
 * @param {string} id - ID модального окна
 */
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('show');
        document.body.classList.remove('modal-open');
    }
}

/**
 * Закрытие всех модальных окон
 */
function closeAllModals() {
    document.querySelectorAll('.modal.show').forEach(modal => {
        modal.classList.remove('show');
    });
    document.body.classList.remove('modal-open');
}

// ============================================================================
// TOAST УВЕДОМЛЕНИЯ
// ============================================================================

/**
 * Показать toast уведомление
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Длительность показа в мс (по умолчанию 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
    // Удаляем существующий toast
    const existing = document.getElementById('toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = `toast toast-${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fa ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Анимация появления
    setTimeout(() => toast.classList.add('show'), 10);

    // Автоматическое скрытие
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Красивое уведомление для массовых действий
 * @param {string} message - Текст сообщения
 * @param {number} count - Количество затронутых элементов
 */
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

// ============================================================================
// TOOLTIPS
// ============================================================================

/**
 * Инициализация tooltips
 */
function initTooltips() {
    document.querySelectorAll('[data-tip]').forEach(el => {
        el.addEventListener('mouseenter', showTooltip);
        el.addEventListener('mouseleave', hideTooltip);
    });
}

/**
 * Показать tooltip
 * @param {MouseEvent} e - Событие мыши
 */
function showTooltip(e) {
    const tip = e.target.dataset.tip;
    if (!tip) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    tooltip.textContent = tip;
    tooltip.id = 'active-tooltip';

    document.body.appendChild(tooltip);

    const rect = e.target.getBoundingClientRect();
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
    tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
}

/**
 * Скрыть tooltip
 */
function hideTooltip() {
    const tooltip = document.getElementById('active-tooltip');
    if (tooltip) tooltip.remove();
}

// ============================================================================
// ДИАЛОГИ
// ============================================================================

/**
 * Показать диалог оплаты
 * @param {string} profileId - ID анкеты
 * @param {boolean} canTrial - Можно ли активировать trial
 * @returns {Promise<Object>} - { action: 'trial_activated' | 'cancelled' | 'error' }
 */
async function showPaymentDialog(profileId, canTrial) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.id = 'payment-dialog';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h5><i class="fa fa-credit-card text-warning"></i> Анкета не оплачена</h5>
                </div>
                <div class="modal-body text-center">
                    <p>Анкета <b>${profileId}</b> не оплачена.</p>
                    ${canTrial ? `
                        <p class="text-success">Вы можете активировать <b>пробный период</b> (3 дня)</p>
                        <button class="btn btn-success btn-lg" id="btn-trial">
                            <i class="fa fa-gift"></i> Активировать Trial
                        </button>
                    ` : `
                        <p class="text-muted">Обратитесь к администратору для оплаты.</p>
                    `}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="btn-cancel">Отмена</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчики
        const btnCancel = modal.querySelector('#btn-cancel');
        const btnTrial = modal.querySelector('#btn-trial');

        btnCancel.onclick = () => {
            modal.remove();
            resolve({ action: 'cancelled' });
        };

        if (btnTrial) {
            btnTrial.onclick = async () => {
                btnTrial.disabled = true;
                btnTrial.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Активация...';

                const result = await activateTrialForProfile(profileId);

                if (result.success) {
                    modal.remove();
                    showToast('Trial период активирован!', 'success');
                    resolve({ action: 'trial_activated' });
                } else {
                    btnTrial.disabled = false;
                    btnTrial.innerHTML = '<i class="fa fa-gift"></i> Активировать Trial';
                    showToast('Ошибка активации: ' + result.error, 'error');
                    resolve({ action: 'error', error: result.error });
                }
            };
        }
    });
}

// ============================================================================
// ПЕРЕМЕННЫЕ DROPDOWN
// ============================================================================

/**
 * Проверка триггера переменных в textarea
 * @param {HTMLElement} textarea - Элемент textarea
 * @param {string} dropdownId - ID dropdown меню
 */
function checkVarTrigger(textarea, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);

    // Проверяем, есть ли { перед курсором
    const lastBrace = textBeforeCursor.lastIndexOf('{');
    const lastCloseBrace = textBeforeCursor.lastIndexOf('}');

    if (lastBrace > lastCloseBrace && lastBrace >= 0) {
        // Показываем dropdown
        const rect = textarea.getBoundingClientRect();
        dropdown.style.display = 'block';
        dropdown.style.top = (rect.bottom + 5) + 'px';
        dropdown.style.left = rect.left + 'px';
    } else {
        dropdown.style.display = 'none';
    }
}

/**
 * Применить переменную из dropdown
 * @param {string} textareaId - ID textarea
 * @param {string} varName - Имя переменной ({City}, {Name} и т.д.)
 * @param {string} dropdownId - ID dropdown меню
 */
function applyVar(textareaId, varName, dropdownId) {
    const textarea = document.getElementById(textareaId);
    const dropdown = document.getElementById(dropdownId);

    if (!textarea) return;

    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const textAfterCursor = text.substring(cursorPos);

    // Находим позицию последней открывающей скобки
    const lastBrace = textBeforeCursor.lastIndexOf('{');

    if (lastBrace >= 0) {
        // Заменяем текст от { до курсора на переменную
        const newText = textBeforeCursor.substring(0, lastBrace) + varName + textAfterCursor;
        textarea.value = newText;
        textarea.focus();

        // Устанавливаем курсор после переменной
        const newPos = lastBrace + varName.length;
        textarea.setSelectionRange(newPos, newPos);
    }

    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// ============================================================================
// ЗАГРУЗКА НА ВКЛАДКЕ
// ============================================================================

/**
 * Показать загрузку на вкладке
 * @param {string} botId - ID бота
 */
function showTabLoading(botId) {
    const tab = document.getElementById(`tab-${botId}`);
    if (tab) tab.classList.add('tab-loading');
}

/**
 * Скрыть загрузку на вкладке
 * @param {string} botId - ID бота
 */
function hideTabLoading(botId) {
    const tab = document.getElementById(`tab-${botId}`);
    if (tab) tab.classList.remove('tab-loading');
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ UI
// ============================================================================

/**
 * Инициализация UI при загрузке страницы
 */
function initUI() {
    // Инициализируем tooltips
    initTooltips();

    // Закрытие модалок по клику на overlay
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
            document.body.classList.remove('modal-open');
        }
    });

    // Закрытие dropdown при клике вне его
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.vars-dropdown') && !e.target.closest('textarea')) {
            document.querySelectorAll('.vars-dropdown').forEach(d => d.style.display = 'none');
        }
    });

    console.log('[Lababot] UI initialized');
}

console.log('[Lababot] ui.js loaded');
