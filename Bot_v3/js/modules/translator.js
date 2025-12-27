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

async function translateText(text, targetLang, sourceLang = 'auto') {
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

    // Выбираем сервис перевода
    const deeplKey = globalSettings.deeplKey;

    let result;
    if (deeplKey) {
        result = await translateWithDeepL(text, targetLang, sourceLang, deeplKey);
    } else {
        result = await translateWithMyMemory(text, targetLang, sourceLang);
    }

    // Сохраняем в кеш при успехе
    if (result.success) {
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
// === DeepL API ===
// =====================================================

async function translateWithDeepL(text, targetLang, sourceLang, apiKey) {
    try {
        // DeepL Free API использует api-free.deepl.com
        const isFreeKey = apiKey.endsWith(':fx');
        const baseUrl = isFreeKey
            ? 'https://api-free.deepl.com/v2/translate'
            : 'https://api.deepl.com/v2/translate';

        const params = new URLSearchParams();
        params.append('text', text);
        params.append('target_lang', targetLang);
        if (sourceLang && sourceLang !== 'auto') {
            params.append('source_lang', sourceLang);
        }

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Translator] DeepL error:', response.status, errorText);

            if (response.status === 403) {
                return { success: false, error: 'Неверный API ключ DeepL' };
            }
            if (response.status === 456) {
                return { success: false, error: 'Превышен лимит DeepL' };
            }

            // Fallback на MyMemory при ошибке DeepL
            console.log('[Translator] Fallback на MyMemory...');
            return await translateWithMyMemory(text, targetLang, sourceLang);
        }

        const data = await response.json();
        const translatedText = data.translations?.[0]?.text;

        if (translatedText) {
            return {
                success: true,
                text: translatedText,
                detectedLang: data.translations?.[0]?.detected_source_language,
                service: 'DeepL'
            };
        }

        return { success: false, error: 'Нет результата от DeepL' };

    } catch (error) {
        console.error('[Translator] DeepL exception:', error);
        // Fallback на MyMemory
        return await translateWithMyMemory(text, targetLang, sourceLang);
    }
}

// =====================================================
// === MyMemory API (бесплатный) ===
// =====================================================

async function translateWithMyMemory(text, targetLang, sourceLang) {
    try {
        // MyMemory использует формат "en|ru"
        const langPair = sourceLang === 'auto'
            ? `autodetect|${targetLang.toLowerCase()}`
            : `${sourceLang.toLowerCase()}|${targetLang.toLowerCase()}`;

        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

        const response = await fetch(url);

        if (!response.ok) {
            return { success: false, error: `MyMemory HTTP ${response.status}` };
        }

        const data = await response.json();

        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            let translatedText = data.responseData.translatedText;

            // MyMemory иногда возвращает HTML entities
            translatedText = decodeHTMLEntities(translatedText);

            return {
                success: true,
                text: translatedText,
                service: 'MyMemory'
            };
        }

        // Проверяем лимит
        if (data.responseStatus === 429 || data.responseDetails?.includes('LIMIT')) {
            return { success: false, error: 'Превышен лимит MyMemory (5000 слов/день)' };
        }

        // Ошибка одинаковых языков - текст уже на целевом языке
        if (data.responseDetails?.includes('PLEASE SELECT TWO DISTINCT LANGUAGES') ||
            data.responseDetails?.includes('SAME LANGUAGE')) {
            return {
                success: true,
                text: text, // Возвращаем оригинальный текст
                service: 'MyMemory',
                sameLanguage: true
            };
        }

        return { success: false, error: data.responseDetails || 'Ошибка MyMemory' };

    } catch (error) {
        console.error('[Translator] MyMemory exception:', error);
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

    // Позиционирование
    document.body.appendChild(popup);

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
        // Проверяем включён ли переводчик
        if (!globalSettings.translatorEnabled) return;

        // Проверяем что не в процессе захвата горячей клавиши (переменная из settings.js)
        if (typeof capturingHotkey !== 'undefined' && capturingHotkey) return;

        const hotkeyTranslate = globalSettings.hotkeyTranslate || 'Ctrl+Q';
        const hotkeyReplace = globalSettings.hotkeyReplace || 'Ctrl+S';

        const pressedCombo = getKeyCombo(e);

        // Ctrl+Q - показать перевод
        if (pressedCombo === hotkeyTranslate) {
            e.preventDefault();
            e.stopPropagation();
            await handleTranslateHotkey(e);
        }
        // Ctrl+S - заменить текст переводом
        else if (pressedCombo === hotkeyReplace) {
            e.preventDefault();
            e.stopPropagation();
            await handleReplaceHotkey();
        }
    }, true);
}

function getKeyCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    let key = e.key.toUpperCase();
    if (key === ' ') key = 'Space';
    if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
        parts.push(key);
    }

    return parts.join('+');
}

async function handleTranslateHotkey(e) {
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

    const result = await translateText(selectedText, targetLang, sourceLang);

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
}

async function handleReplaceHotkey() {
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

    const result = await translateText(selectedText, targetLang, sourceLang);

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
}

function getSelectedText() {
    const activeElement = document.activeElement;

    // Для input/textarea
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        if (start !== end) {
            return activeElement.value.substring(start, end);
        }
    }

    // Для contenteditable и обычного выделения
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
        return selection.toString().trim();
    }

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

        const { text, x, y, mode } = data;

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
                    replaceSelectedText(result.text);
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
