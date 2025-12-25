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
    }
});

console.log('[LababotAI] Preload loaded - AI functions available');
