/**
 * Preload script для Response Windows
 * Обеспечивает безопасную связь между сайтом и main process для AI функций
 */

const { contextBridge, ipcRenderer } = require('electron');

// Экспонируем API для страницы
contextBridge.exposeInMainWorld('lababotAI', {
    // Генерация AI ответа
    generate: async (history, type, prompt) => {
        try {
            const result = await ipcRenderer.invoke('response-window-ai-generate', {
                history,
                type,
                prompt
            });
            return result;
        } catch (err) {
            console.error('[LababotAI] Error:', err);
            return { success: false, error: err.message };
        }
    },

    // Проверка доступности AI
    isAvailable: async () => {
        try {
            const result = await ipcRenderer.invoke('response-window-ai-check');
            return result.available;
        } catch (err) {
            return false;
        }
    },

    // Перевод текста (для плавающей кнопки - ЛКМ)
    translate: async (text, x, y) => {
        try {
            const result = await ipcRenderer.invoke('response-window-translate', {
                text,
                x,
                y
            });
            return result;
        } catch (err) {
            console.error('[LababotAI] Translate error:', err);
            return { success: false, error: err.message };
        }
    },

    // Перевод и замена текста (для горячей клавиши Shift+S)
    translateAndReplace: async (text) => {
        try {
            const result = await ipcRenderer.invoke('response-window-translate-replace', {
                text
            });
            return result;
        } catch (err) {
            console.error('[LababotAI] TranslateReplace error:', err);
            return { success: false, error: err.message };
        }
    },

    // Перевод на конкретный язык (для горячей клавиши Ctrl+Shift+S)
    translateToLang: async (text, targetLang) => {
        try {
            const result = await ipcRenderer.invoke('response-window-translate-to-lang', {
                text,
                targetLang
            });
            return result;
        } catch (err) {
            console.error('[LababotAI] TranslateToLang error:', err);
            return { success: false, error: err.message };
        }
    }
});

// Слушаем событие показа popup с переводом
ipcRenderer.on('show-translation-popup', (event, { text, originalText, x, y, sticky }) => {
    console.log('[LababotAI] Показываем popup с переводом, sticky:', sticky);

    // Удаляем существующий popup
    const existingPopup = document.getElementById('laba-translation-popup');
    if (existingPopup) existingPopup.remove();

    const isSticky = sticky !== false; // default true

    // Создаём popup
    const popup = document.createElement('div');
    popup.id = 'laba-translation-popup';
    popup.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">
            <span style="font-weight: 600; color: #667eea;">🌐 Перевод</span>
            <button id="laba-popup-close" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #999; padding: 0 4px;">&times;</button>
        </div>
        <div class="laba-popup-content" style="line-height: 1.5; color: #333;">${escapeHtml(text)}</div>
        <div style="margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end;">
            <button id="laba-popup-replace" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;" title="Заменить выделенный текст переводом">🔄</button>
            <button id="laba-popup-copy" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 Копировать</button>
        </div>
    `;

    // Стили popup (адаптивный для длинных текстов)
    Object.assign(popup.style, {
        position: 'fixed',
        zIndex: '999999',
        background: 'white',
        padding: '12px 15px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        maxWidth: '500px',
        minWidth: '250px',
        maxHeight: '70vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif'
    });

    // Делаем контент скроллируемым
    const contentDiv = popup.querySelector('.laba-popup-content');
    if (contentDiv) {
        contentDiv.style.cssText = 'line-height: 1.5; color: #333; max-height: 50vh; overflow-y: auto; padding-right: 5px;';
    }

    document.body.appendChild(popup);

    // Позиционируем
    const rect = popup.getBoundingClientRect();
    let posX = x;
    let posY = y + 10;

    if (posX + rect.width > window.innerWidth - 10) {
        posX = window.innerWidth - rect.width - 10;
    }
    if (posY + rect.height > window.innerHeight - 10) {
        posY = y - rect.height - 10;
    }
    if (posX < 10) posX = 10;
    if (posY < 10) posY = 10;

    popup.style.left = posX + 'px';
    popup.style.top = posY + 'px';

    // Sticky логика
    let isHovered = false;
    if (isSticky) {
        popup.addEventListener('mouseenter', () => { isHovered = true; });
        popup.addEventListener('mouseleave', () => { isHovered = false; });
    }

    // Tooltip для кнопки замены (появляется через 0.5сек)
    const replaceBtn = document.getElementById('laba-popup-replace');
    let tooltipTimeout = null;
    let tooltip = null;

    replaceBtn.addEventListener('mouseenter', () => {
        tooltipTimeout = setTimeout(() => {
            tooltip = document.createElement('div');
            tooltip.textContent = 'Заменить текст';
            tooltip.style.cssText = 'position:fixed;background:#333;color:white;padding:4px 8px;border-radius:4px;font-size:11px;white-space:nowrap;z-index:1000001;pointer-events:none;';
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

    // Обработчики кнопок
    document.getElementById('laba-popup-close').onclick = () => {
        if (tooltip) tooltip.remove();
        popup.remove();
    };

    document.getElementById('laba-popup-copy').onclick = () => {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('laba-popup-copy');
            btn.textContent = '✓ Скопировано';
            setTimeout(() => {
                if (tooltip) tooltip.remove();
                popup.remove();
            }, 800);
        });
    };

    // Кнопка замены текста
    replaceBtn.onclick = () => {
        try {
            const activeEl = document.activeElement;

            // Для input/textarea
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                const start = activeEl.selectionStart;
                const end = activeEl.selectionEnd;
                const value = activeEl.value;
                activeEl.value = value.substring(0, start) + text + value.substring(end);
                activeEl.selectionStart = activeEl.selectionEnd = start + text.length;
                activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                activeEl.focus();
            }
            // Для contenteditable
            else if (activeEl && activeEl.isContentEditable) {
                document.execCommand('insertText', false, text);
            }
            // Fallback
            else {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(text));
                }
            }

            console.log('[LababotAI] Текст заменён');
        } catch (err) {
            console.error('[LababotAI] Ошибка замены:', err);
        }

        if (tooltip) tooltip.remove();
        popup.remove();
    };

    // Закрытие по клику вне popup (с учётом sticky)
    setTimeout(() => {
        document.addEventListener('mousedown', function closePopup(e) {
            if (!popup.contains(e.target)) {
                // Если sticky и наведено - не закрываем
                if (isSticky && isHovered) {
                    return;
                }
                if (tooltip) tooltip.remove();
                popup.remove();
                document.removeEventListener('mousedown', closePopup);
            }
        });
    }, 100);

    // Автозакрытие через 30 секунд (увеличил т.к. sticky)
    setTimeout(() => {
        if (document.body.contains(popup) && !isHovered) {
            if (tooltip) tooltip.remove();
            popup.remove();
        }
    }, 30000);
});

// Слушаем событие замены выделенного текста
ipcRenderer.on('replace-selected-text', (event, { text }) => {
    console.log('[LababotAI] Замена текста:', text?.substring(0, 30));

    try {
        const activeEl = document.activeElement;

        // Для input/textarea
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            const start = activeEl.selectionStart;
            const end = activeEl.selectionEnd;
            const value = activeEl.value;

            activeEl.value = value.substring(0, start) + text + value.substring(end);
            activeEl.selectionStart = activeEl.selectionEnd = start + text.length;
            activeEl.dispatchEvent(new Event('input', { bubbles: true }));
            activeEl.focus();
            console.log('[LababotAI] Текст заменён в input/textarea');
            return;
        }

        // Для contenteditable
        if (activeEl && activeEl.isContentEditable) {
            document.execCommand('insertText', false, text);
            console.log('[LababotAI] Текст заменён в contenteditable');
            return;
        }

        // Fallback - просто заменяем выделение
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            console.log('[LababotAI] Текст заменён через selection');
        }
    } catch (err) {
        console.error('[LababotAI] Ошибка замены текста:', err);
    }
});

// Функция экранирования HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('[LababotAI] Preload loaded - AI & Translate functions available');
