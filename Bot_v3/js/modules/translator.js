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

    // Выбираем сервис перевода с приоритетом: DeepL → Google → MyMemory
    const deeplKey = globalSettings.deeplKey;
    const googleKey = globalSettings.googleTranslateKey;
    const mymemoryEmail = globalSettings.mymemoryEmail;

    let result;
    if (deeplKey) {
        // Приоритет 1: DeepL
        console.log('[Translator] Используем DeepL');
        result = await translateWithIPC(text, targetLang, sourceLang, 'deepl', deeplKey, null, effectiveBotId);
    } else if (googleKey) {
        // Приоритет 2: Google Translate
        console.log('[Translator] Используем Google Translate');
        result = await translateWithIPC(text, targetLang, sourceLang, 'google', googleKey, null, effectiveBotId);
    } else {
        // Приоритет 3: MyMemory (бесплатный)
        console.log('[Translator] Используем MyMemory' + (mymemoryEmail ? ' (с email)' : ''));
        result = await translateWithIPC(text, targetLang, sourceLang, 'mymemory', null, mymemoryEmail, effectiveBotId);
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
            <button class="btn btn-sm btn-outline-primary" onclick="copyTranslation()">
                <i class="fa fa-copy"></i> Копировать
            </button>
        </div>
    `;

    popup.style.width = width + 'px';

    // Позиционирование - добавляем в специальный контейнер поверх всего
    const container = document.getElementById('translator-popup-container') || document.body;
    container.appendChild(popup);

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

    // Сохраняем текст для копирования
    popup.dataset.text = translatedText;

    // Автозакрытие
    if (autoClose > 0) {
        autoCloseTimer = setTimeout(() => {
            hideTranslationPopup();
        }, autoClose * 1000);
    }

    // Закрытие по клику вне popup
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
        hideTranslationPopup();
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
            else if (pressedCombo === 'Ctrl+Shift+S') {
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

// Ctrl+Shift+S - замена с выбором языка
async function handleReplaceWithLanguageChoice(e) {
    const selectedText = getSelectedText();
    if (!selectedText) {
        showToast('Выделите текст для перевода', 'warning');
        return;
    }

    console.log('[Translator] Выбор языка для:', selectedText.substring(0, 30));

    // Показываем popup с выбором языка
    showLanguagePickerPopup(e, selectedText);
}

// Popup с выбором языка для замены
function showLanguagePickerPopup(e, textToTranslate) {
    // Удаляем существующий popup если есть
    const existingPopup = document.getElementById('laba-language-picker');
    if (existingPopup) existingPopup.remove();

    const languages = [
        { code: 'EN', name: 'English', flag: '🇬🇧' },
        { code: 'RU', name: 'Русский', flag: '🇷🇺' },
        { code: 'DE', name: 'Deutsch', flag: '🇩🇪' },
        { code: 'FR', name: 'Français', flag: '🇫🇷' },
        { code: 'ES', name: 'Español', flag: '🇪🇸' },
        { code: 'IT', name: 'Italiano', flag: '🇮🇹' },
        { code: 'PT', name: 'Português', flag: '🇵🇹' },
        { code: 'PL', name: 'Polski', flag: '🇵🇱' },
        { code: 'UK', name: 'Українська', flag: '🇺🇦' },
        { code: 'ZH', name: '中文', flag: '🇨🇳' },
        { code: 'JA', name: '日本語', flag: '🇯🇵' },
        { code: 'KO', name: '한국어', flag: '🇰🇷' }
    ];

    const popup = document.createElement('div');
    popup.id = 'laba-language-picker';
    popup.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 10px; color: #667eea;">🌐 Выберите язык перевода</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
            ${languages.map(lang => `
                <button class="lang-btn" data-lang="${lang.code}" style="
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    background: white;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.15s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">${lang.flag} ${lang.name}</button>
            `).join('')}
        </div>
    `;

    Object.assign(popup.style, {
        position: 'fixed',
        zIndex: '999999',
        background: 'white',
        padding: '15px',
        borderRadius: '10px',
        boxShadow: '0 4px 25px rgba(0,0,0,0.25)',
        maxWidth: '320px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px'
    });

    document.body.appendChild(popup);

    // Позиционируем popup
    const rect = popup.getBoundingClientRect();
    let x = e.clientX || window.innerWidth / 2;
    let y = e.clientY || window.innerHeight / 2;

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

    // Обработчики для кнопок
    popup.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            btn.style.color = 'white';
            btn.style.borderColor = '#667eea';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'white';
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
                    replaceSelectedText(result.text);
                    showToast('Текст заменён', 'success');
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
