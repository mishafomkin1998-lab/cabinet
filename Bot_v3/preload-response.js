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

// Получить стили для темы
function getThemeStyles(theme) {
    const themes = {
        light: {
            bg: '#ffffff',
            headerBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            headerBorder: '#667eea',
            contentColor: '#333',
            footerBg: '#f8f9fa',
            footerBorder: '#eee',
            shadow: '0 4px 20px rgba(0,0,0,0.25)',
            border: 'none',
            copyBtnBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
            closeColor: 'rgba(255,255,255,0.8)'
        },
        dark: {
            bg: '#161616',
            headerBg: 'linear-gradient(90deg, #0d0d0d 0%, #1a1a1a 100%)',
            headerBorder: '#00ff88',
            contentColor: '#f0f0f0',
            footerBg: '#0d0d0d',
            footerBorder: '#333',
            shadow: '0 8px 32px rgba(0,255,136,0.2)',
            border: '1px solid #00ff88',
            copyBtnBg: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
            closeColor: '#00ff88'
        },
        ladadate: {
            bg: '#1a1025',
            headerBg: 'linear-gradient(90deg, #2d1f3d 0%, #3d2850 100%)',
            headerBorder: '#ec4899',
            contentColor: '#f0d0f0',
            footerBg: '#2d1f3d',
            footerBorder: '#4a3660',
            shadow: '0 8px 32px rgba(236,72,153,0.3)',
            border: '1px solid #ec4899',
            copyBtnBg: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            closeColor: '#ec4899'
        },
        novabot: {
            bg: '#0a1929',
            headerBg: 'linear-gradient(90deg, #0d2137 0%, #1a3a5f 100%)',
            headerBorder: '#2196f3',
            contentColor: '#b0d4f1',
            footerBg: '#0d2137',
            footerBorder: '#1e3a5f',
            shadow: '0 8px 32px rgba(33,150,243,0.3)',
            border: '1px solid #2196f3',
            copyBtnBg: 'linear-gradient(135deg, #2196f3 0%, #1565c0 100%)',
            replaceBtnBg: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
            closeColor: '#2196f3'
        }
    };
    return themes[theme] || themes.light;
}

// Слушаем событие показа popup с переводом
ipcRenderer.on('show-translation-popup', (event, { text, originalText, x, y, sticky, theme }) => {
    console.log('[LababotAI] Показываем popup с переводом, sticky:', sticky, 'theme:', theme);

    // Удаляем существующий popup
    const existingPopup = document.getElementById('laba-translation-popup');
    if (existingPopup) existingPopup.remove();

    const isSticky = sticky !== false; // default true
    const styles = getThemeStyles(theme || 'light');

    // Создаём popup
    const popup = document.createElement('div');
    popup.id = 'laba-translation-popup';
    popup.innerHTML = `
        <div id="laba-popup-header" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: ${styles.headerBg}; border-radius: 8px 8px 0 0; border-bottom: 1px solid ${styles.headerBorder};">
            <span style="font-weight: 600; color: white; font-size: 13px;">🌐 Перевод</span>
            <button id="laba-popup-close" style="background: none; border: none; cursor: pointer; font-size: 18px; color: ${styles.closeColor}; padding: 0 4px;">&times;</button>
        </div>
        <div class="laba-popup-content" style="line-height: 1.5; color: ${styles.contentColor}; padding: 12px 15px; max-height: 50vh; overflow-y: auto;">${escapeHtml(text)}</div>
        <div style="padding: 10px 15px; background: ${styles.footerBg}; border-top: 1px solid ${styles.footerBorder}; border-radius: 0 0 8px 8px; display: flex; gap: 8px; justify-content: flex-end;">
            <button id="laba-popup-replace" style="background: ${styles.replaceBtnBg}; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;" title="Заменить выделенный текст переводом">🔄</button>
            <button id="laba-popup-copy" style="background: ${styles.copyBtnBg}; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 Копировать</button>
        </div>
    `;

    // Стили popup (адаптивный для длинных текстов)
    Object.assign(popup.style, {
        position: 'fixed',
        zIndex: '999999',
        background: styles.bg,
        padding: '0',
        borderRadius: '8px',
        boxShadow: styles.shadow,
        border: styles.border,
        maxWidth: '500px',
        minWidth: '250px',
        maxHeight: '70vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif'
    });

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
