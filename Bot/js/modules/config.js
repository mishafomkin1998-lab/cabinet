/**
 * config.js - Константы и глобальные переменные
 * Модуль содержит все глобальные настройки, константы и переменные состояния
 */

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

// URL серверов
const LABABOT_SERVER = 'http://188.137.253.169:3000';
const LADADATE_API_BASE = 'https://ladadate.com';
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Аудио файлы для уведомлений
const audioFiles = {
    online: new Audio('Sound/Online.mp3'),
    message: new Audio('Sound/Message.mp3'),
    chat: new Audio('Sound/Chat.mp3')
};

// Скрипт для поддержания онлайн статуса в WebView
const KEEP_ALIVE_SCRIPT = `
    (function() {
        // Устанавливаем keep-alive интервал
        if (window.__keepAliveStarted) return;
        window.__keepAliveStarted = true;

        // Предотвращаем переход в спящий режим
        setInterval(() => {
            // Имитация активности - небольшой scroll для предотвращения idle
            const scrollPos = window.scrollY;
            window.scrollTo(0, scrollPos + 1);
            window.scrollTo(0, scrollPos);

            // Вызываем событие для предотвращения timeout
            document.dispatchEvent(new Event('mousemove'));
        }, 30000);

        // Также предотвращаем закрытие сессии при неактивности
        let lastActivity = Date.now();
        const resetTimer = () => { lastActivity = Date.now(); };

        ['mousemove', 'keypress', 'click', 'scroll'].forEach(event => {
            document.addEventListener(event, resetTimer, { passive: true });
        });

        // Периодическая проверка (каждые 5 минут)
        setInterval(() => {
            if (Date.now() - lastActivity > 300000) {
                // Если пользователь неактивен 5+ минут - имитируем активность
                document.dispatchEvent(new MouseEvent('mousemove', {
                    bubbles: true, cancelable: true, clientX: Math.random() * 100, clientY: Math.random() * 100
                }));
            }
        }, 60000);

        console.log('[Lababot] Keep-alive script started');
    })();
`;

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ
// ============================================================================

// Главный объект - все боты хранятся здесь
let bots = {};  // { 'bot_1234567890': AccountBot instance }

// Шаблоны по логинам аккаунтов
let botTemplates = JSON.parse(localStorage.getItem('botTemplates') || '{}');

// Предпочтения аккаунтов (выбранные шаблоны)
let accountPreferences = JSON.parse(localStorage.getItem('accountPreferences') || '{}');

// Глобальные настройки (сохраняются в localStorage)
let globalSettings = {
    lang: 'ru',
    theme: 'light',
    soundsEnabled: true,
    apiKey: '',
    translatorId: null,
    proxy1: '',
    proxy2: '',
    proxy3: '',
    proxy4: '',
    proxy5: '',
    proxy6: '',
    proxyAI: '',
    extendedFeatures: false,
    skipDeleteConfirm: false,
    confirmTabClose: true
};

// Текущий режим работы
let globalMode = 'mail';  // 'mail' или 'chat'

// ID активной вкладки
let activeTabId = null;

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ UI
// ============================================================================

// Для модальных окон
let currentModalBotId = null;
let currentStatsType = null;
let editingBotId = null;
let editingTemplateIndex = null;

// Для Shift-операций
let shiftWasPressed = false;

// Для таймеров автосохранения
const autoSaveTimers = {};

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ НАСТРОЕК ИЗ localStorage
// ============================================================================

(function initGlobalSettings() {
    const saved = localStorage.getItem('globalSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            globalSettings = { ...globalSettings, ...parsed };
        } catch (e) {
            console.error('Error loading globalSettings:', e);
        }
    }
})();

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ СО ЗВУКОМ
// ============================================================================

/**
 * Воспроизведение звука уведомления
 * @param {string} type - Тип звука: 'online', 'message', 'chat'
 */
function playSound(type) {
    if (!globalSettings.soundsEnabled) return;

    const audio = audioFiles[type];
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio play error:', e));
    }
}

console.log('[Lababot] config.js loaded');
