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

    // Выбираем сервис перевода
    const deeplKey = globalSettings.deeplKey;

    let result;
    if (deeplKey) {
        result = await translateWithIPC(text, targetLang, sourceLang, 'deepl', deeplKey, effectiveBotId);
    } else {
        result = await translateWithIPC(text, targetLang, sourceLang, 'mymemory', null, effectiveBotId);
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

async function translateWithIPC(text, targetLang, sourceLang, service, apiKey, botId) {
    try {
        const { ipcRenderer } = require('electron');

        console.log(`[Translator] IPC запрос: ${service}, ${sourceLang} → ${targetLang}, botId: ${botId || 'none'}`);

        const result = await ipcRenderer.invoke('translate-request', {
            service: service,
            text: text,
            targetLang: targetLang,
            sourceLang: sourceLang,
            apiKey: apiKey,
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
// === POPUP ОКНО ПЕРЕВОДА (отдельное BrowserWindow) ===
// =====================================================

function showTranslationPopup(translatedText, originalText, x, y) {
    const { ipcRenderer } = require('electron');

    const width = globalSettings.translateWidth || 350;
    const fontSize = globalSettings.translateFontSize || 14;

    // Отправляем в main процесс для создания отдельного окна
    // Это единственный способ показать popup поверх webview
    ipcRenderer.send('show-translation-popup', {
        translatedText: translatedText,
        x: x,
        y: y,
        width: width,
        fontSize: fontSize
    });

    console.log('[Translator] Запрос на показ popup окна');
}

function hideTranslationPopup() {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('hide-translation-popup');
}

// Обработчик toast уведомлений от popup окна
function initPopupToastHandler() {
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('show-toast', (event, { message, type }) => {
        if (typeof showToast === 'function') {
            showToast(message, type);
        }
    });
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
            initPopupToastHandler();
            console.log('[Translator] Модуль переводчика инициализирован (DOMContentLoaded)');
        });
    } else {
        // DOM уже готов
        initTranslatorHotkeys();
        initTranslatorIPC();
        initPopupToastHandler();
        console.log('[Translator] Модуль переводчика инициализирован (DOM ready)');
    }
})();
