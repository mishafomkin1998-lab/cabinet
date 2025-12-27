// =====================================================
// === МОДУЛЬ ПЕРЕВОДЧИКА ===
// =====================================================
// Поддержка DeepL API и MyMemory (бесплатный fallback)

// Кеш переводов для экономии запросов
const translationCache = new Map();
const CACHE_MAX_SIZE = 500;

// Таймер автозакрытия popup
let autoCloseTimer = null;

// =====================================================
// === АВТО-ОПРЕДЕЛЕНИЕ ЯЗЫКА ===
// =====================================================

// Определяет язык текста по символам
function detectTextLanguage(text) {
    if (!text) return null;

    // Считаем кириллические и латинские символы
    let cyrillicCount = 0;
    let latinCount = 0;

    for (const char of text) {
        // Кириллица: U+0400–U+04FF
        if (/[\u0400-\u04FF]/.test(char)) {
            cyrillicCount++;
        }
        // Латиница: A-Z, a-z
        else if (/[A-Za-z]/.test(char)) {
            latinCount++;
        }
    }

    // Если больше кириллицы - русский
    if (cyrillicCount > latinCount) {
        return 'RU';
    }
    // Если больше латиницы - английский
    if (latinCount > cyrillicCount) {
        return 'EN';
    }

    return null; // Не удалось определить
}

// Получает целевой язык автоматически (противоположный исходному)
function getAutoTargetLang(text, defaultTarget) {
    const detectedLang = detectTextLanguage(text);

    if (detectedLang === 'RU') {
        return 'EN'; // Русский → Английский
    }
    if (detectedLang === 'EN') {
        return 'RU'; // Английский → Русский
    }

    return defaultTarget; // Fallback на настройки
}

// =====================================================
// === ОСНОВНАЯ ФУНКЦИЯ ПЕРЕВОДА ===
// =====================================================

// Получить текущий активный botId для использования прокси
function getCurrentBotId() {
    // Пытаемся получить ID активного бота из интерфейса
    if (typeof currentBotId !== 'undefined' && currentBotId) {
        return currentBotId;
    }
    // Альтернатива: проверить активную вкладку
    const activeTab = document.querySelector('.bot-tab.active');
    if (activeTab && activeTab.dataset.botId) {
        return activeTab.dataset.botId;
    }
    return null;
}

async function translateText(text, targetLang, sourceLang = 'auto', botId = null) {
    if (!text || !text.trim()) {
        return { success: false, error: 'Пустой текст' };
    }

    text = text.trim();

    // Проверяем кеш
    const cacheKey = `${sourceLang}:${targetLang}:${text}`;
    if (translationCache.has(cacheKey)) {
        console.log('[Translator] Из кеша');
        return { success: true, text: translationCache.get(cacheKey), fromCache: true };
    }

    // Определяем botId для прокси
    const effectiveBotId = botId || getCurrentBotId();

    // Выбираем сервис перевода с приоритетом: DeepL → Google API → Google Free
    const deeplKey = globalSettings.deeplKey;
    const googleKey = globalSettings.googleTranslateKey;

    let result;
    if (deeplKey) {
        // Приоритет 1: DeepL (платный, с ключом)
        console.log('[Translator] Используем DeepL');
        result = await translateWithIPC(text, targetLang, sourceLang, 'deepl', deeplKey, null, effectiveBotId);
    } else if (googleKey) {
        // Приоритет 2: Google Cloud API (платный, с ключом)
        console.log('[Translator] Используем Google Translate API');
        result = await translateWithIPC(text, targetLang, sourceLang, 'google', googleKey, null, effectiveBotId);
    } else {
        // Google Free (бесплатный, как в QTranslate) - работает без ключа!
        console.log('[Translator] Используем Google Free (как в QTranslate)');
        result = await translateWithIPC(text, targetLang, sourceLang, 'google-free', null, null, effectiveBotId);
    }

    // Сохраняем в кеш при успехе (кроме случая sameLanguage)
    if (result.success && !result.sameLanguage) {
        // Ограничиваем размер кеша
        if (translationCache.size >= CACHE_MAX_SIZE) {
            const firstKey = translationCache.keys().next().value;
            translationCache.delete(firstKey);
        }
        translationCache.set(cacheKey, result.text);
    }

    return result;
}

// =====================================================
// === ПЕРЕВОД ЧЕРЕЗ IPC (с поддержкой прокси) ===
// =====================================================

async function translateWithIPC(text, targetLang, sourceLang, service, apiKey, email, botId) {
    try {
        const { ipcRenderer } = require('electron');

        console.log(`[Translator] IPC запрос: ${service}, ${sourceLang} → ${targetLang}, botId: ${botId || 'none'}`);

        const result = await ipcRenderer.invoke('translate-request', {
            service: service,
            text: text,
            targetLang: targetLang,
            sourceLang: sourceLang,
            apiKey: apiKey,
            email: email,
            botId: botId
        });

        // Декодируем HTML entities для MyMemory
        if (result.success && result.service === 'MyMemory' && !result.sameLanguage) {
            result.text = decodeHTMLEntities(result.text);
        }

        return result;

    } catch (error) {
        console.error('[Translator] IPC ошибка:', error);
        return { success: false, error: error.message };
    }
}


// Декодирование HTML entities
function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// =====================================================
// === POPUP ОКНО ПЕРЕВОДА ===
// =====================================================

function showTranslationPopup(translatedText, originalText, x, y) {
    // Удаляем существующий popup
    hideTranslationPopup();

    const width = globalSettings.translateWidth || 350;
    const fontSize = globalSettings.translateFontSize || 14;
    const autoClose = globalSettings.translateAutoClose || 0;
    const isSticky = globalSettings.translatePopupSticky !== false; // default true

    // Создаём popup
    const popup = document.createElement('div');
    popup.id = 'translation-popup';
    popup.className = 'translation-popup';

    popup.innerHTML = `
        <div class="translation-popup-header">
            <span class="translation-popup-title"><i class="fa fa-language"></i> Перевод</span>
            <button class="translation-popup-close" onclick="hideTranslationPopup()"><i class="fa fa-times"></i></button>
        </div>
        <div class="translation-popup-content" style="font-size: ${fontSize}px">
            ${escapeHtml(translatedText)}
        </div>
        <div class="translation-popup-footer">
            <button class="btn btn-sm btn-outline-primary" onclick="copyTranslation()" title="Копировать перевод">
                <i class="fa fa-copy"></i> Копировать
            </button>
            <button class="btn btn-sm btn-outline-success translation-replace-btn" onclick="replaceWithTranslation()" title="Заменить выделенный текст переводом">
                <i class="fa fa-exchange-alt"></i>
            </button>
        </div>
    `;

    popup.style.width = width + 'px';

    // Позиционирование - добавляем в специальный контейнер поверх всего
    const container = document.getElementById('translator-popup-container') || document.body;
    container.appendChild(popup);

    // Добавляем tooltip для кнопки замены (появляется через 0.5сек)
    const replaceBtn = popup.querySelector('.translation-replace-btn');
    if (replaceBtn) {
        let tooltipTimeout = null;
        let tooltip = null;

        replaceBtn.addEventListener('mouseenter', () => {
            tooltipTimeout = setTimeout(() => {
                tooltip = document.createElement('div');
                tooltip.className = 'translation-btn-tooltip';
                tooltip.textContent = 'Заменить текст';
                tooltip.style.cssText = 'position:absolute;background:#333;color:white;padding:4px 8px;border-radius:4px;font-size:11px;white-space:nowrap;z-index:1000001;pointer-events:none;';

                const btnRect = replaceBtn.getBoundingClientRect();
                tooltip.style.left = btnRect.left + 'px';
                tooltip.style.top = (btnRect.top - 28) + 'px';
                document.body.appendChild(tooltip);
            }, 500);
        });

        replaceBtn.addEventListener('mouseleave', () => {
            if (tooltipTimeout) clearTimeout(tooltipTimeout);
            if (tooltip) { tooltip.remove(); tooltip = null; }
        });
    }

    // Корректируем позицию чтобы не выходил за экран
    const rect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = x;
    let posY = y + 10; // Немного ниже курсора

    if (posX + rect.width > viewportWidth - 10) {
        posX = viewportWidth - rect.width - 10;
    }
    if (posY + rect.height > viewportHeight - 10) {
        posY = y - rect.height - 10; // Показываем выше курсора
    }
    if (posX < 10) posX = 10;
    if (posY < 10) posY = 10;

    popup.style.left = posX + 'px';
    popup.style.top = posY + 'px';

    // Сохраняем текст для копирования и замены
    popup.dataset.text = translatedText;
    popup.dataset.original = originalText;

    // Sticky popup логика
    if (isSticky) {
        popup.dataset.sticky = 'true';
        popup.addEventListener('mouseenter', () => {
            popup.dataset.hovered = 'true';
            // Отменяем автозакрытие при наведении
            if (autoCloseTimer) {
                clearTimeout(autoCloseTimer);
                autoCloseTimer = null;
            }
        });
        popup.addEventListener('mouseleave', () => {
            popup.dataset.hovered = 'false';
        });
    }

    // Автозакрытие
    if (autoClose > 0) {
        autoCloseTimer = setTimeout(() => {
            hideTranslationPopup();
        }, autoClose * 1000);
    }

    // Закрытие по клику вне popup (с учётом sticky)
    setTimeout(() => {
        document.addEventListener('mousedown', handleOutsideClick);
    }, 100);
}

function hideTranslationPopup() {
    const popup = document.getElementById('translation-popup');
    if (popup) {
        popup.remove();
    }
    if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
    }
    document.removeEventListener('mousedown', handleOutsideClick);
}

function handleOutsideClick(e) {
    const popup = document.getElementById('translation-popup');
    if (popup && !popup.contains(e.target)) {
        // Если sticky и наведено - не закрываем
        if (popup.dataset.sticky === 'true' && popup.dataset.hovered === 'true') {
            return;
        }
        hideTranslationPopup();
    }
}

// Заменить выделенный текст переводом из popup
function replaceWithTranslation() {
    const popup = document.getElementById('translation-popup');
    if (!popup || !popup.dataset.text) {
        showToast('Нет текста для замены', 'warning');
        return;
    }

    const translatedText = popup.dataset.text;

    // Пытаемся заменить выделенный текст
    try {
        replaceSelectedText(translatedText);
        showToast('Текст заменён', 'success');
        hideTranslationPopup();
    } catch (err) {
        console.error('[Translator] Replace error:', err);
        showToast('Не удалось заменить текст', 'error');
    }
}

function copyTranslation() {
    const popup = document.getElementById('translation-popup');
    if (popup && popup.dataset.text) {
        navigator.clipboard.writeText(popup.dataset.text).then(() => {
            showToast('Перевод скопирован', 'success');
            hideTranslationPopup();
        }).catch(err => {
            console.error('[Translator] Copy error:', err);
            showToast('Ошибка копирования', 'error');
        });
    }
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// === ГОРЯЧИЕ КЛАВИШИ ПЕРЕВОДЧИКА ===
// =====================================================

// Флаг инициализации чтобы не добавлять обработчик повторно
let translatorHotkeysInitialized = false;

function initTranslatorHotkeys() {
    if (translatorHotkeysInitialized) {
        console.log('[Translator] Hotkeys уже инициализированы, пропускаем');
        return;
    }
    translatorHotkeysInitialized = true;

    document.addEventListener('keydown', async function translatorKeyHandler(e) {
        try {
            // Проверяем включён ли переводчик
            if (!globalSettings || !globalSettings.translatorEnabled) {
                return;
            }

            // Проверяем что не в процессе захвата горячей клавиши (переменная из settings.js)
            if (typeof capturingHotkey !== 'undefined' && capturingHotkey) return;

            const hotkeyTranslate = globalSettings.hotkeyTranslate || 'Ctrl+Q';
            const hotkeyReplace = globalSettings.hotkeyReplace || 'Ctrl+S';
            const hotkeyReplaceLang = globalSettings.hotkeyReplaceLang || 'Ctrl+Shift+S';

            const pressedCombo = getKeyCombo(e);

            // Ctrl+Q - показать перевод
            if (pressedCombo === hotkeyTranslate) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Translator] Hotkey: перевод');
                await handleTranslateHotkey(e);
            }
            // Ctrl+S - заменить текст переводом
            else if (pressedCombo === hotkeyReplace) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Translator] Hotkey: замена');
                await handleReplaceHotkey();
            }
            // Ctrl+Shift+S - заменить с выбором языка
            else if (pressedCombo === hotkeyReplaceLang) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Translator] Hotkey: замена с выбором языка');
                await handleReplaceWithLanguageChoice(e);
            }
        } catch (error) {
            console.error('[Translator] Ошибка в обработчике горячих клавиш:', error);
            if (typeof showToast === 'function') {
                showToast(`Ошибка переводчика: ${error.message}`, 'error');
            }
        }
    }, true);
}

function getKeyCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    // Используем e.code для независимости от раскладки клавиатуры
    // e.code возвращает физическую клавишу (KeyQ, KeyS) независимо от языка
    let key = '';
    if (e.code) {
        // Преобразуем код клавиши в читаемый формат
        if (e.code.startsWith('Key')) {
            key = e.code.replace('Key', ''); // KeyQ -> Q
        } else if (e.code.startsWith('Digit')) {
            key = e.code.replace('Digit', ''); // Digit1 -> 1
        } else if (e.code === 'Space') {
            key = 'Space';
        } else if (e.code === 'Escape') {
            key = 'Escape';
        } else if (e.code.startsWith('Arrow')) {
            key = e.code; // ArrowUp, ArrowDown и т.д.
        } else {
            key = e.code;
        }
    } else {
        // Fallback на e.key если e.code недоступен
        key = e.key.toUpperCase();
        if (key === ' ') key = 'Space';
    }

    if (!['CONTROL', 'SHIFT', 'ALT', 'META', 'CONTROLLEFT', 'CONTROLRIGHT', 'SHIFTLEFT', 'SHIFTRIGHT', 'ALTLEFT', 'ALTRIGHT'].includes(key.toUpperCase())) {
        parts.push(key.toUpperCase());
    }

    return parts.join('+');
}

async function handleTranslateHotkey(e) {
    try {
        // ВАЖНО: Сохраняем выделение и позицию ДО любых async операций
        const selectedText = getSelectedText();

        // Сохраняем позицию popup сразу
        let popupX = window.innerWidth / 2 - 175;
        let popupY = window.innerHeight / 2 - 100;

        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            try {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 || rect.height > 0) {
                    popupX = rect.left + rect.width / 2;
                    popupY = rect.bottom + 5;
                }
            } catch (err) {
                console.log('[Translator] Не удалось получить позицию выделения');
            }
        }

        if (!selectedText) {
            showToast('Выделите текст для перевода', 'warning');
            return;
        }

        console.log('[Translator] Текст для перевода:', selectedText.substring(0, 50) + '...');

        // Показываем индикатор загрузки
        showToast('Переводим...', 'info');

        // Авто-определение языка: русский↔английский
        const sourceLang = globalSettings.translateFrom || 'auto';
        let targetLang;

        if (sourceLang === 'auto') {
            // Автоматически определяем направление
            targetLang = getAutoTargetLang(selectedText, globalSettings.translateTo || 'RU');
        } else {
            targetLang = globalSettings.translateTo || 'RU';
        }

        console.log('[Translator] Направление:', sourceLang, '→', targetLang);

        const result = await translateText(selectedText, targetLang, sourceLang);

        console.log('[Translator] Результат:', result.success ? 'OK' : result.error);

        if (result.success) {
            // Если текст уже на целевом языке
            if (result.sameLanguage) {
                showToast('Текст уже на целевом языке', 'info');
                return;
            }

            showTranslationPopup(result.text, selectedText, popupX, popupY);
        } else {
            showToast(`Ошибка перевода: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[Translator] handleTranslateHotkey error:', error);
        showToast(`Ошибка: ${error.message}`, 'error');
    }
}

async function handleReplaceHotkey() {
    try {
        // ВАЖНО: Сохраняем activeElement и выделение ДО любых async операций
        const activeElement = document.activeElement;
        const selectedText = getSelectedText();

        // Сохраняем позиции выделения для input/textarea
        let selectionStart = null;
        let selectionEnd = null;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            selectionStart = activeElement.selectionStart;
            selectionEnd = activeElement.selectionEnd;
        }

        // Проверяем что фокус в текстовом поле
        if (!activeElement ||
            (activeElement.tagName !== 'INPUT' &&
             activeElement.tagName !== 'TEXTAREA' &&
             !activeElement.isContentEditable)) {
            showToast('Поставьте курсор в текстовое поле', 'warning');
            return;
        }

        if (!selectedText) {
            showToast('Выделите текст для замены', 'warning');
            return;
        }

        console.log('[Translator] Замена текста:', selectedText.substring(0, 50) + '...');

        showToast('Переводим...', 'info');

        // Авто-определение языка: русский↔английский
        const sourceLang = globalSettings.translateFrom || 'auto';
        let targetLang;

        if (sourceLang === 'auto') {
            // Автоматически определяем направление
            targetLang = getAutoTargetLang(selectedText, globalSettings.translateReplace || 'EN');
        } else {
            targetLang = globalSettings.translateReplace || 'EN';
        }

        console.log('[Translator] Направление замены:', sourceLang, '→', targetLang);

        const result = await translateText(selectedText, targetLang, sourceLang);

        console.log('[Translator] Результат замены:', result.success ? 'OK' : result.error);

        if (result.success) {
            // Если текст уже на целевом языке - не заменяем
            if (result.sameLanguage) {
                showToast('Текст уже на целевом языке', 'info');
                return;
            }

            // Восстанавливаем фокус и выделение перед заменой
            if (activeElement && document.body.contains(activeElement)) {
                activeElement.focus();
                if (selectionStart !== null && selectionEnd !== null) {
                    activeElement.selectionStart = selectionStart;
                    activeElement.selectionEnd = selectionEnd;
                }
            }

            replaceSelectedText(result.text);
            showToast('Текст заменён', 'success');
        } else {
            showToast(`Ошибка перевода: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[Translator] handleReplaceHotkey error:', error);
        showToast(`Ошибка: ${error.message}`, 'error');
    }
}

// Сохранить контекст выделения для последующей замены
function saveSelectionContext() {
    const activeEl = document.activeElement;

    // Для input/textarea
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== end) {
            return {
                type: 'input',
                element: activeEl,
                start: start,
                end: end
            };
        }
    }

    // Для contenteditable
    if (activeEl && activeEl.isContentEditable) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            return {
                type: 'contenteditable',
                element: activeEl,
                range: selection.getRangeAt(0).cloneRange()
            };
        }
    }

    // Для обычного выделения на странице (не заменяем, только показываем)
    return null;
}

// Заменить текст используя сохранённый контекст
function replaceWithSavedContext(ctx, newText) {
    if (!ctx) {
        console.log('[Translator] Нет сохранённого контекста - замена невозможна');
        return false;
    }

    try {
        if (ctx.type === 'input') {
            const el = ctx.element;
            const value = el.value;
            el.value = value.substring(0, ctx.start) + newText + value.substring(ctx.end);
            el.selectionStart = el.selectionEnd = ctx.start + newText.length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.focus();
            console.log('[Translator] Текст заменён в input/textarea');
            return true;
        }

        if (ctx.type === 'contenteditable') {
            ctx.element.focus();
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(ctx.range);
            document.execCommand('insertText', false, newText);
            console.log('[Translator] Текст заменён в contenteditable');
            return true;
        }
    } catch (err) {
        console.error('[Translator] Ошибка замены:', err);
    }

    return false;
}

// Ctrl+Shift+S - замена с выбором языка
async function handleReplaceWithLanguageChoice(e) {
    const selectedText = getSelectedText();
    if (!selectedText) {
        showToast('Выделите текст для перевода', 'warning');
        return;
    }

    // ВАЖНО: Сохраняем контекст ДО показа popup (потом фокус потеряется)
    const selectionContext = saveSelectionContext();
    if (!selectionContext) {
        showToast('Выделите текст в редактируемом поле', 'warning');
        return;
    }

    console.log('[Translator] Выбор языка для:', selectedText.substring(0, 30));

    // Показываем popup с выбором языка, передаём контекст
    showLanguagePickerPopup(e, selectedText, selectionContext);
}

// Popup с выбором языка для замены (все языки мира с поиском)
function showLanguagePickerPopup(e, textToTranslate, selectionContext) {
    // Удаляем существующий popup если есть
    const existingPopup = document.getElementById('laba-language-picker');
    if (existingPopup) existingPopup.remove();

    // Полный список языков (поддерживаемые Google/DeepL/MyMemory)
    const languages = [
        // Популярные (сверху)
        { code: 'EN', name: 'English', flag: '🇬🇧', popular: true },
        { code: 'RU', name: 'Русский', flag: '🇷🇺', popular: true },
        { code: 'DE', name: 'Deutsch', flag: '🇩🇪', popular: true },
        { code: 'FR', name: 'Français', flag: '🇫🇷', popular: true },
        { code: 'ES', name: 'Español', flag: '🇪🇸', popular: true },
        { code: 'IT', name: 'Italiano', flag: '🇮🇹', popular: true },
        { code: 'PT', name: 'Português', flag: '🇵🇹', popular: true },
        { code: 'ZH', name: '中文 (Chinese)', flag: '🇨🇳', popular: true },
        { code: 'JA', name: '日本語 (Japanese)', flag: '🇯🇵', popular: true },
        { code: 'KO', name: '한국어 (Korean)', flag: '🇰🇷', popular: true },
        { code: 'UK', name: 'Українська', flag: '🇺🇦', popular: true },
        { code: 'PL', name: 'Polski', flag: '🇵🇱', popular: true },
        // Остальные по алфавиту
        { code: 'AF', name: 'Afrikaans', flag: '🇿🇦' },
        { code: 'SQ', name: 'Albanian (Shqip)', flag: '🇦🇱' },
        { code: 'AM', name: 'Amharic (አማርኛ)', flag: '🇪🇹' },
        { code: 'AR', name: 'Arabic (العربية)', flag: '🇸🇦' },
        { code: 'HY', name: 'Armenian (Հայերdelays)', flag: '🇦🇲' },
        { code: 'AZ', name: 'Azerbaijani (Azərbaycan)', flag: '🇦🇿' },
        { code: 'EU', name: 'Basque (Euskara)', flag: '🏴' },
        { code: 'BE', name: 'Belarusian (Беларуская)', flag: '🇧🇾' },
        { code: 'BN', name: 'Bengali (বাংলা)', flag: '🇧🇩' },
        { code: 'BS', name: 'Bosnian (Bosanski)', flag: '🇧🇦' },
        { code: 'BG', name: 'Bulgarian (Български)', flag: '🇧🇬' },
        { code: 'CA', name: 'Catalan (Català)', flag: '🏴' },
        { code: 'HR', name: 'Croatian (Hrvatski)', flag: '🇭🇷' },
        { code: 'CS', name: 'Czech (Čeština)', flag: '🇨🇿' },
        { code: 'DA', name: 'Danish (Dansk)', flag: '🇩🇰' },
        { code: 'NL', name: 'Dutch (Nederlands)', flag: '🇳🇱' },
        { code: 'ET', name: 'Estonian (Eesti)', flag: '🇪🇪' },
        { code: 'FI', name: 'Finnish (Suomi)', flag: '🇫🇮' },
        { code: 'KA', name: 'Georgian (ქართული)', flag: '🇬🇪' },
        { code: 'EL', name: 'Greek (Ελληνικά)', flag: '🇬🇷' },
        { code: 'GU', name: 'Gujarati (ગુજરાતી)', flag: '🇮🇳' },
        { code: 'HT', name: 'Haitian Creole', flag: '🇭🇹' },
        { code: 'HA', name: 'Hausa', flag: '🇳🇬' },
        { code: 'HE', name: 'Hebrew (עברית)', flag: '🇮🇱' },
        { code: 'HI', name: 'Hindi (हिन्दी)', flag: '🇮🇳' },
        { code: 'HU', name: 'Hungarian (Magyar)', flag: '🇭🇺' },
        { code: 'IS', name: 'Icelandic (Íslenska)', flag: '🇮🇸' },
        { code: 'ID', name: 'Indonesian (Bahasa)', flag: '🇮🇩' },
        { code: 'GA', name: 'Irish (Gaeilge)', flag: '🇮🇪' },
        { code: 'KN', name: 'Kannada (ಕನ್ನಡ)', flag: '🇮🇳' },
        { code: 'KK', name: 'Kazakh (Қазақ)', flag: '🇰🇿' },
        { code: 'KM', name: 'Khmer (ខ្មែរ)', flag: '🇰🇭' },
        { code: 'KY', name: 'Kyrgyz (Кыргызча)', flag: '🇰🇬' },
        { code: 'LO', name: 'Lao (ລາວ)', flag: '🇱🇦' },
        { code: 'LA', name: 'Latin', flag: '🏛️' },
        { code: 'LV', name: 'Latvian (Latviešu)', flag: '🇱🇻' },
        { code: 'LT', name: 'Lithuanian (Lietuvių)', flag: '🇱🇹' },
        { code: 'MK', name: 'Macedonian (Македонски)', flag: '🇲🇰' },
        { code: 'MS', name: 'Malay (Bahasa Melayu)', flag: '🇲🇾' },
        { code: 'ML', name: 'Malayalam (മലയാളം)', flag: '🇮🇳' },
        { code: 'MT', name: 'Maltese (Malti)', flag: '🇲🇹' },
        { code: 'MR', name: 'Marathi (मराठी)', flag: '🇮🇳' },
        { code: 'MN', name: 'Mongolian (Монгол)', flag: '🇲🇳' },
        { code: 'MY', name: 'Myanmar (မြန်မာ)', flag: '🇲🇲' },
        { code: 'NE', name: 'Nepali (नेपाली)', flag: '🇳🇵' },
        { code: 'NO', name: 'Norwegian (Norsk)', flag: '🇳🇴' },
        { code: 'PS', name: 'Pashto (پښتو)', flag: '🇦🇫' },
        { code: 'FA', name: 'Persian (فارسی)', flag: '🇮🇷' },
        { code: 'PA', name: 'Punjabi (ਪੰਜਾਬੀ)', flag: '🇮🇳' },
        { code: 'RO', name: 'Romanian (Română)', flag: '🇷🇴' },
        { code: 'SR', name: 'Serbian (Српски)', flag: '🇷🇸' },
        { code: 'SI', name: 'Sinhala (සිංහල)', flag: '🇱🇰' },
        { code: 'SK', name: 'Slovak (Slovenčina)', flag: '🇸🇰' },
        { code: 'SL', name: 'Slovenian (Slovenščina)', flag: '🇸🇮' },
        { code: 'SO', name: 'Somali (Soomaali)', flag: '🇸🇴' },
        { code: 'SW', name: 'Swahili (Kiswahili)', flag: '🇰🇪' },
        { code: 'SV', name: 'Swedish (Svenska)', flag: '🇸🇪' },
        { code: 'TL', name: 'Tagalog (Filipino)', flag: '🇵🇭' },
        { code: 'TG', name: 'Tajik (Тоҷикӣ)', flag: '🇹🇯' },
        { code: 'TA', name: 'Tamil (தமிழ்)', flag: '🇮🇳' },
        { code: 'TE', name: 'Telugu (తెలుగు)', flag: '🇮🇳' },
        { code: 'TH', name: 'Thai (ไทย)', flag: '🇹🇭' },
        { code: 'TR', name: 'Turkish (Türkçe)', flag: '🇹🇷' },
        { code: 'TK', name: 'Turkmen (Türkmen)', flag: '🇹🇲' },
        { code: 'UR', name: 'Urdu (اردو)', flag: '🇵🇰' },
        { code: 'UZ', name: 'Uzbek (Oʻzbek)', flag: '🇺🇿' },
        { code: 'VI', name: 'Vietnamese (Tiếng Việt)', flag: '🇻🇳' },
        { code: 'CY', name: 'Welsh (Cymraeg)', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
        { code: 'YI', name: 'Yiddish (ייִדיש)', flag: '🕎' },
        { code: 'ZU', name: 'Zulu (isiZulu)', flag: '🇿🇦' }
    ];

    const popup = document.createElement('div');
    popup.id = 'laba-language-picker';

    // Создаём HTML с поиском
    popup.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 10px; color: #667eea;">🌐 Выберите язык перевода</div>
        <input type="text" id="lang-search" placeholder="🔍 Поиск языка..." style="
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            margin-bottom: 10px;
            font-size: 14px;
            box-sizing: border-box;
        ">
        <div id="lang-list" style="
            max-height: 350px;
            overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
        "></div>
    `;

    Object.assign(popup.style, {
        position: 'fixed',
        zIndex: '999999',
        background: 'white',
        padding: '15px',
        borderRadius: '10px',
        boxShadow: '0 4px 25px rgba(0,0,0,0.25)',
        width: '380px',
        maxWidth: '90vw',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px'
    });

    document.body.appendChild(popup);

    const langList = popup.querySelector('#lang-list');
    const searchInput = popup.querySelector('#lang-search');

    // Функция отрисовки языков
    function renderLanguages(filter = '') {
        const filterLower = filter.toLowerCase();
        const filtered = languages.filter(lang =>
            lang.name.toLowerCase().includes(filterLower) ||
            lang.code.toLowerCase().includes(filterLower)
        );

        // Сортируем: сначала популярные, потом остальные
        filtered.sort((a, b) => {
            if (a.popular && !b.popular) return -1;
            if (!a.popular && b.popular) return 1;
            return 0;
        });

        langList.innerHTML = filtered.map(lang => `
            <button class="lang-btn" data-lang="${lang.code}" style="
                padding: 8px 10px;
                border: 1px solid #ddd;
                border-radius: 6px;
                background: ${lang.popular ? '#f8f9ff' : 'white'};
                cursor: pointer;
                font-size: 12px;
                transition: all 0.15s;
                display: flex;
                align-items: center;
                gap: 6px;
                text-align: left;
            ">${lang.flag} ${lang.name}</button>
        `).join('');

        // Обработчики для кнопок
        langList.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                btn.style.color = 'white';
                btn.style.borderColor = '#667eea';
            });
            btn.addEventListener('mouseleave', () => {
                const isPopular = languages.find(l => l.code === btn.dataset.lang)?.popular;
                btn.style.background = isPopular ? '#f8f9ff' : 'white';
                btn.style.color = 'black';
                btn.style.borderColor = '#ddd';
            });
            btn.addEventListener('click', async () => {
                const targetLang = btn.dataset.lang;
                popup.remove();

                showToast(`Перевод на ${targetLang}...`, 'info');

                try {
                    const sourceLang = globalSettings.translateFrom || 'auto';
                    const result = await translateText(textToTranslate, targetLang, sourceLang);

                    if (result.success && !result.sameLanguage) {
                        // Используем сохранённый контекст для замены
                        const replaced = replaceWithSavedContext(selectionContext, result.text);
                        if (replaced) {
                            showToast('Текст заменён', 'success');
                        } else {
                            showToast('Не удалось заменить текст', 'warning');
                        }
                    } else if (result.sameLanguage) {
                        showToast('Текст уже на этом языке', 'info');
                    } else {
                        showToast(`Ошибка: ${result.error}`, 'error');
                    }
                } catch (err) {
                    showToast(`Ошибка: ${err.message}`, 'error');
                }
            });
        });
    }

    // Первоначальная отрисовка
    renderLanguages();

    // Поиск
    searchInput.addEventListener('input', (e) => {
        renderLanguages(e.target.value);
    });

    // Фокус на поиске
    setTimeout(() => searchInput.focus(), 100);

    // Позиционируем popup
    const rect = popup.getBoundingClientRect();
    let x = (e.clientX || window.innerWidth / 2) - rect.width / 2;
    let y = (e.clientY || window.innerHeight / 2) - rect.height / 2;

    if (x + rect.width > window.innerWidth - 10) {
        x = window.innerWidth - rect.width - 10;
    }
    if (y + rect.height > window.innerHeight - 10) {
        y = window.innerHeight - rect.height - 10;
    }
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    popup.style.left = x + 'px';
    popup.style.top = y + 'px';

    // Закрытие по клику вне popup
    setTimeout(() => {
        document.addEventListener('mousedown', function closePopup(ev) {
            if (!popup.contains(ev.target)) {
                popup.remove();
                document.removeEventListener('mousedown', closePopup);
            }
        });
    }, 100);

    // Закрытие по Escape
    document.addEventListener('keydown', function escHandler(ev) {
        if (ev.key === 'Escape') {
            popup.remove();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function getSelectedText() {
    const activeElement = document.activeElement;

    console.log('[Translator] getSelectedText - activeElement:', activeElement?.tagName, activeElement?.id || activeElement?.className);

    // Для input/textarea
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        console.log('[Translator] Input selection:', start, '-', end, 'value length:', activeElement.value?.length);
        if (start !== end) {
            const selected = activeElement.value.substring(start, end);
            console.log('[Translator] Selected from input:', selected.substring(0, 30));
            return selected;
        }
    }

    // Для contenteditable и обычного выделения
    const selection = window.getSelection();
    console.log('[Translator] window.getSelection:', selection?.toString()?.substring(0, 30));
    if (selection && selection.toString().trim()) {
        return selection.toString().trim();
    }

    console.log('[Translator] Нет выделенного текста');
    return '';
}

function replaceSelectedText(newText) {
    const activeElement = document.activeElement;

    // Для input/textarea
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const value = activeElement.value;

        activeElement.value = value.substring(0, start) + newText + value.substring(end);
        activeElement.selectionStart = activeElement.selectionEnd = start + newText.length;

        // Триггерим событие input для реактивности
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    // Для contenteditable
    if (activeElement && activeElement.isContentEditable) {
        document.execCommand('insertText', false, newText);
        return;
    }

    // Fallback - просто заменяем выделение
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(newText));
    }
}

// =====================================================
// === IPC ОБРАБОТЧИКИ (из контекстного меню) ===
// =====================================================

function initTranslatorIPC() {
    const { ipcRenderer } = require('electron');

    // Обработка перевода из контекстного меню
    ipcRenderer.on('translate-selection', async (event, data) => {
        if (!globalSettings.translatorEnabled) {
            showToast('Переводчик выключен в настройках', 'warning');
            return;
        }

        const { text, x, y, mode, botId } = data;

        if (!text || !text.trim()) {
            showToast('Нет текста для перевода', 'warning');
            return;
        }

        if (mode === 'show') {
            // Показать popup с переводом
            showToast('Переводим...', 'info');

            // Авто-определение языка: русский↔английский
            const sourceLang = globalSettings.translateFrom || 'auto';
            let targetLang;
            if (sourceLang === 'auto') {
                targetLang = getAutoTargetLang(text, globalSettings.translateTo || 'RU');
            } else {
                targetLang = globalSettings.translateTo || 'RU';
            }

            const result = await translateText(text, targetLang, sourceLang);

            if (result.success) {
                if (result.sameLanguage) {
                    showToast('Текст уже на целевом языке', 'info');
                } else {
                    showTranslationPopup(result.text, text, x, y);
                }
            } else {
                showToast(`Ошибка перевода: ${result.error}`, 'error');
            }
        } else if (mode === 'replace') {
            // Заменить выделенный текст переводом
            showToast('Переводим...', 'info');

            // Авто-определение языка: русский↔английский
            const sourceLang = globalSettings.translateFrom || 'auto';
            let targetLang;
            if (sourceLang === 'auto') {
                targetLang = getAutoTargetLang(text, globalSettings.translateReplace || 'EN');
            } else {
                targetLang = globalSettings.translateReplace || 'EN';
            }

            const result = await translateText(text, targetLang, sourceLang);

            if (result.success) {
                if (result.sameLanguage) {
                    showToast('Текст уже на целевом языке', 'info');
                } else {
                    // Если это замена в webview - отправляем через IPC
                    if (botId) {
                        ipcRenderer.send('replace-text-in-webview', {
                            botId: botId,
                            text: result.text
                        });
                    } else {
                        replaceSelectedText(result.text);
                    }
                    showToast('Текст заменён', 'success');
                }
            } else {
                showToast(`Ошибка перевода: ${result.error}`, 'error');
            }
        }
    });

    // Обработка перевода для замены в response window
    ipcRenderer.on('translate-for-replace', async (event, data) => {
        if (!globalSettings.translatorEnabled) {
            return;
        }

        const { text, windowId } = data;

        // Авто-определение языка: русский↔английский
        const sourceLang = globalSettings.translateFrom || 'auto';
        let targetLang;
        if (sourceLang === 'auto') {
            targetLang = getAutoTargetLang(text, globalSettings.translateReplace || 'EN');
        } else {
            targetLang = globalSettings.translateReplace || 'EN';
        }

        const result = await translateText(text, targetLang, sourceLang);

        if (result.success) {
            if (result.sameLanguage) {
                showToast('Текст уже на целевом языке', 'info');
            } else {
                // Отправляем перевод обратно в main для вставки в response window
                ipcRenderer.send('insert-translation-to-window', {
                    windowId: windowId,
                    text: result.text
                });
                showToast('Текст заменён', 'success');
            }
        } else {
            showToast(`Ошибка перевода: ${result.error}`, 'error');
        }
    });

    // Обработка замены текста в webview
    ipcRenderer.on('do-replace-in-webview', async (event, { botId, text }) => {
        try {
            // Находим webview по botId
            const webview = document.getElementById(`webview-${botId}`);
            if (webview) {
                // Экранируем текст для безопасной вставки в JS
                const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

                // Выполняем замену выделенного текста в webview
                await webview.executeJavaScript(`
                    (function() {
                        const selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            const activeElement = document.activeElement;

                            // Если фокус в input/textarea
                            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                                const start = activeElement.selectionStart;
                                const end = activeElement.selectionEnd;
                                const value = activeElement.value;
                                activeElement.value = value.substring(0, start) + '${escapedText}' + value.substring(end);
                                activeElement.selectionStart = activeElement.selectionEnd = start + '${escapedText}'.length;
                                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            // Если contenteditable
                            else if (activeElement && activeElement.isContentEditable) {
                                document.execCommand('insertText', false, '${escapedText}');
                            }
                            // Иначе пробуем обычную замену
                            else {
                                range.deleteContents();
                                range.insertNode(document.createTextNode('${escapedText}'));
                            }
                        }
                    })();
                `);
                console.log('[Translator] Текст заменён в webview', botId);
            } else {
                console.error('[Translator] WebView не найден:', botId);
            }
        } catch (err) {
            console.error('[Translator] Ошибка замены в webview:', err);
        }
    });

    console.log('[Translator] IPC обработчики инициализированы');
}

// =====================================================
// === ИНИЦИАЛИЗАЦИЯ ===
// =====================================================

// Инициализируем сразу (скрипт загружается после DOM)
(function initTranslator() {
    // Проверяем готовность DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initTranslatorHotkeys();
            initTranslatorIPC();
            console.log('[Translator] Модуль переводчика инициализирован (DOMContentLoaded)');
        });
    } else {
        // DOM уже готов
        initTranslatorHotkeys();
        initTranslatorIPC();
        console.log('[Translator] Модуль переводчика инициализирован (DOM ready)');
    }
})();
