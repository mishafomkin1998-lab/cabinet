# CLAUDE.md - Документация для Claude Code

---

## ⛔ КРИТИЧЕСКИЕ ПРАВИЛА РАЗРАБОТКИ ⛔

### ЗАПРЕЩЕНО РЕДАКТИРОВАТЬ (PRODUCTION):
```
/home/user/cabinet/Bot/        ← НЕ ТРОГАТЬ!
/home/user/cabinet/Server/     ← НЕ ТРОГАТЬ!
```

### РАЗРЕШЕНО РЕДАКТИРОВАТЬ (DEVELOPMENT):
```
/home/user/cabinet/Bot_v2/     ← Работаем здесь
/home/user/cabinet/Server_v2/  ← Работаем здесь
```

**Перед любым Edit/Write проверяй путь! Если путь содержит `/Bot/` или `/Server/` (без _v2) - ОТКАЗАТЬСЯ от редактирования!**

Подробности: см. файл `DEVELOPMENT_RULES.md`

---

## Обзор проекта

**Novabot** - Electron приложение для управления анкетами на платформе LadaDate.
Позволяет автоматически отправлять письма (Mail) и сообщения в чат (Chat) от имени женских анкет.

---

## Структура проекта

```
/home/user/cabinet/
├── Bot/                        # Electron приложение (клиент)
│   ├── main.js                 # Electron main process (прокси, IPC, окна)
│   ├── index.html              # UI интерфейс (HTML + inline стили)
│   ├── package.json            # Зависимости npm
│   ├── css/bot.css             # Стили + темы (light, dark, ladadate)
│   ├── Sound/                  # Звуки уведомлений
│   │   ├── Online.mp3          # VIP пользователь онлайн
│   │   ├── Message.mp3         # Новое входящее письмо
│   │   └── Chat.mp3            # Новый чат/сообщение
│   └── js/modules/             # ✅ ВСЯ ЛОГИКА БОТА ЗДЕСЬ!
│       ├── config.js           # Глобальные переменные и константы
│       ├── utils.js            # Утилиты (parseProxy, debounce, toast)
│       ├── api.js              # API функции для сервера статистики
│       ├── logger.js           # Logger уведомлений + KEEP_ALIVE_SCRIPT
│       ├── minichat.js         # MiniChat (история переписки)
│       ├── ai.js               # AI генерация текста (OpenAI)
│       ├── settings.js         # Глобальные настройки + промпты
│       ├── AccountBot.js       # Класс AccountBot (ЯДРО ЛОГИКИ!)
│       ├── main.js             # UI функции, логин, импорт/экспорт
│       └── init.js             # Инициализация при загрузке
│
├── Server/                     # Express сервер + личный кабинет
│   ├── server.js               # Точка входа
│   ├── routes/                 # API маршруты
│   ├── config/database.js      # PostgreSQL подключение
│   ├── public/                 # Frontend статика
│   └── dashboard.html          # Веб-интерфейс кабинета
│
└── CLAUDE.md                   # Этот файл
```

---

## Порядок загрузки модулей

Модули загружаются в `index.html` (строки 609-618) в строгом порядке:

```
1. config.js      → Глобальные переменные (bots, globalSettings, globalMode)
2. utils.js       → Утилиты (parseProxy, showToast, debounce)
3. api.js         → API для сервера статистики Lababot
4. logger.js      → Logger уведомлений + KEEP_ALIVE_SCRIPT
5. minichat.js    → MiniChat функции (история, отправка)
6. ai.js          → AI генерация через OpenAI
7. settings.js    → Настройки, темы, модальные окна
8. AccountBot.js  → Класс AccountBot (основная логика!)
9. main.js        → UI, логин, шаблоны, blacklist
10. init.js       → window.onload, инициализация
```

**ВАЖНО:** Порядок критичен! Каждый модуль зависит от предыдущих.

---

## Модули: подробное описание

### 1. config.js — Глобальные переменные

```javascript
// Главные объекты
let bots = {};                    // { 'bot_1234567890': AccountBot }
let botTemplates = {};            // { 'email@mail.com': { mail: [], chat: [] } }
let accountPreferences = {};      // Настройки по аккаунтам

// Режим работы
let globalMode = 'mail';          // 'mail' или 'chat'
let activeTabId = null;           // ID активной вкладки

// Настройки (localStorage)
let globalSettings = {
    lang: 'ru',
    theme: 'light',               // 'light', 'dark', 'ladadate'
    soundsEnabled: true,
    desktopNotifications: true,
    apiKey: '',                   // OpenAI API key
    translatorId: null,           // ID переводчика
    proxy1-6: '',                 // Прокси для анкет
    disabledStatuses: [],         // Отключенные статусы
    // ... и другие
};

// Константы
const LABABOT_SERVER = 'http://188.137.253.169:3000';
const LADADATE_BASE_URL = 'https://ladadate.com';
const APP_VERSION = '1.3.0';

// Переменные транскрипции для шаблонов
const TRANSCRIPTION_VARIABLES = [
    { name: '{name}', desc: 'Имя мужчины' },
    { name: '{age}', desc: 'Возраст' },
    { name: '{city}', desc: 'Город' },
    // ...
];
```

### 2. utils.js — Утилиты

| Функция | Описание |
|---------|----------|
| `parseProxy(str)` | Парсит строку прокси (ip:port:user:pass) |
| `showToast(msg, type)` | Показывает уведомление (success/warning/error) |
| `showBulkNotification(msg, count)` | Уведомление для bulk-операций |
| `debounce(func, wait)` | Debounce функция |
| `customConfirm(msg, options)` | Кастомный confirm диалог |
| `validateInput(value, type)` | Валидация ввода |

### 3. api.js — API для сервера статистики

| Функция | Описание |
|---------|----------|
| `sendMessageToLababot(params)` | Отправка статистики сообщения |
| `sendIncomingMessageToLababot(params)` | Входящее сообщение от мужчины |
| `sendHeartbeatToLababot(botId, displayId, status)` | Heartbeat онлайн статуса |
| `checkProfileStatus(profileId)` | Проверка статуса профиля (paused, exists, allowed) |
| `checkProfilePaymentStatus(profileId)` | Проверка оплаты (isPaid, isTrial, daysLeft) |
| `checkProfileAIEnabled(profileId)` | Проверка доступа к AI |
| `loadFromServerData(bot)` | Загрузка данных бота с сервера (шаблоны, blacklist) |
| `saveTemplatesToServer(login, templates)` | Сохранение шаблонов на сервер |
| `saveBlacklistToServer(login, blacklist, mode)` | Сохранение blacklist на сервер |

### 4. logger.js — Система уведомлений

```javascript
const Logger = {
    logs: [],
    maxLogs: 1000,
    add: function(text, type, botId, data) {
        // type: 'chat', 'chat-request', 'mail', 'vip-online', 'bday', 'log'
        // Автоматически воспроизводит звук и показывает в UI
    },
    render: function() { /* отрисовка списка */ }
};

// KEEP_ALIVE_SCRIPT — скрипт для WebView, поддерживает сессию активной
const KEEP_ALIVE_SCRIPT = `...`;

// Звуки
const audioFiles = {
    online: new Audio('Sound/Online.mp3'),
    message: new Audio('Sound/Message.mp3'),
    chat: new Audio('Sound/Chat.mp3')
};

function playSound(type) { /* воспроизведение */ }
```

### 5. minichat.js — MiniChat (история переписки)

| Функция | Описание |
|---------|----------|
| `loadMiniChatHistory(recipientId)` | Загрузка истории чата |
| `sendMiniChatMessage()` | Отправка сообщения |
| `generateMiniChatAIReply()` | AI ответ на последнее сообщение |
| `closeMiniChat()` | Закрытие окна |
| `renderMiniChatMessages(messages)` | Отрисовка сообщений |

### 6. ai.js — AI генерация текста

| Функция | Описание |
|---------|----------|
| `handleAIAction(botId, action, event)` | Обработка AI действий (improve/generate/myprompt) |
| `generateAIForAll(action)` | AI для всех анкет (Shift+клик) |
| `generateTemplateWithAI()` | Генерация шаблона через AI |
| `callOpenAI(prompt, systemPrompt)` | Вызов OpenAI API |

### 7. settings.js — Настройки

| Функция | Описание |
|---------|----------|
| `loadGlobalSettingsUI()` | Загрузка настроек в UI |
| `saveGlobalSettings()` | Сохранение настроек |
| `openGlobalSettings()` | Открыть модалку настроек |
| `applyTheme(theme)` | Применение темы |
| `testProxy(num)` | Тест прокси через main процесс |
| `toggleGlobalMode()` | Переключение Mail/Chat (+ сохранение шаблонов!) |
| `openModal(id)` / `closeModal(id)` | Модальные окна |
| `initHotkeys()` | Горячие клавиши |
| `exportSettings()` / `importSettings()` | Экспорт/импорт настроек |
| `loadPromptTemplates()` | Загрузка шаблонов промптов |
| `addPromptTemplate(type)` | Добавление шаблона промпта |
| `deletePromptTemplate(type)` | Удаление шаблона промпта |

### 8. AccountBot.js — ЯДРО ЛОГИКИ

```javascript
class AccountBot {
    constructor(id, login, pass, displayId, token) {
        this.id = id;                  // 'bot_1234567890'
        this.login = login;            // email аккаунта
        this.pass = pass;              // пароль
        this.displayId = displayId;    // ID анкеты на платформе
        this.token = token;            // Bearer token

        // Настройки Mail
        this.mailSettings = {
            target: 'online',          // online/favorites/my-favorites/inbox/payers/custom-ids
            speed: 'smart',            // smart/15/30
            blacklist: [],
            photoOnly: false,
            auto: false                // Авто-переключение категорий
        };

        // Настройки Chat
        this.chatSettings = {
            target: 'payers',
            speed: 'smart',
            blacklist: [],
            rotationHours: 3,
            cyclic: false,
            currentInviteIndex: 0,
            autoReplies: [],
            autoReplyEnabled: false
        };

        // Статистика
        this.mailStats = { sent: 0, errors: 0, waiting: 0 };
        this.chatStats = { sent: 0, errors: 0, waiting: 0 };

        // WebView для cookies
        this.webview = null;

        // Флаги
        this.mailRunning = false;
        this.chatRunning = false;
        this.usedAi = false;
    }
}
```

**Ключевые методы AccountBot:**

| Метод | Описание |
|-------|----------|
| `createWebview()` | Создаёт скрытый WebView для cookies сессии |
| `doActivity()` | Heartbeat + проверка новых сообщений (каждую минуту) |
| `startMail(text)` | Запуск рассылки писем |
| `stopMail()` | Остановка рассылки |
| `processMailUser()` | Обработка одного получателя письма |
| `scheduleNextMail()` | Планирование следующего письма |
| `startChat(text)` | Запуск рассылки чатов |
| `stopChat()` | Остановка чатов |
| `processChatUser()` | Обработка одного получателя чата |
| `scheduleNextChat()` | Планирование следующего чата |
| `checkChatSync()` | Проверка новых чатов (уведомления) |
| `checkNewMails()` | Проверка новых писем |
| `startMonitoring()` | Запуск мониторинга (checkChatSync каждые 5 сек) |
| `updateUI()` | Обновление интерфейса |
| `log(text, type)` | Лог в UI (авто-определение [MAIL]/[CHAT]) |

### 9. main.js — UI и основные функции

| Функция | Описание |
|---------|----------|
| `performLogin(login, pass, displayId)` | Логин аккаунта (возвращает botId!) |
| `createInterface(bot)` | Создание UI для бота (вкладка + панель) |
| `updateInterfaceForMode(botId)` | Обновление UI под текущий режим |
| `selectTab(id)` | Переключение вкладки |
| `closeTab(e, id)` | Закрытие вкладки |
| `startAllBots()` / `stopAllBots()` | Старт/стоп всех ботов |
| `reloginAllBots()` | Перелогин всех |
| `saveSession()` | Сохранение сессии в localStorage |
| `restoreSession()` | Восстановление сессии |
| `exportAllData()` | Экспорт всех данных в JSON |
| `handleUniversalImport(input)` | Импорт данных (.json/.txt) |
| `addTemplateInline(botId, event)` | Добавить шаблон (Shift = всем) |
| `deleteTemplate(botId, event)` | Удалить шаблон |
| `saveTemplateTextNow(botId)` | Сохранить текст шаблона немедленно |
| `autoSaveTemplateText(botId)` | Автосохранение (debounce 3 сек) |
| `saveBlacklistID(event)` | Добавить в blacklist |
| `removeSelectedBlacklist(botId)` | Удалить из blacklist |
| `renderBlacklist(botId)` | Отрисовка blacklist |
| `loadServerDataForAllBots()` | Загрузка данных всех ботов с сервера |

### 10. init.js — Инициализация

```javascript
window.onload = async function() {
    loadGlobalSettingsUI();           // Загрузка настроек
    toggleExtendedFeatures();         // AI функции
    await initDefaultProxy();         // Установка default прокси
    restoreSession();                 // Восстановление сессии
    initHotkeys();                    // Горячие клавиши
    initTooltips();                   // Подсказки
    initFocusProtection();            // Защита от потери фокуса
    initTranscriptionContextMenu();   // ПКМ меню переменных
    updateDisabledStatusesUI();       // Отключенные статусы
    startGlobalMenOnlineUpdater();    // Счётчик мужчин онлайн
};
```

**Дополнительные функции в init.js:**

| Функция | Описание |
|---------|----------|
| `initFocusProtection()` | Защита textarea от потери фокуса |
| `setGlobalTarget(target)` | Установка target всем ботам |
| `toggleStatusDisabled(status, e)` | ПКМ отключение статуса |
| `getNextActiveStatus(current)` | Следующий активный статус |
| `openGlobalCustomIdsModal()` | Модалка глобальных Custom IDs |
| `applyGlobalCustomIds()` | Применить Custom IDs всем |
| `saveCustomIds(botId)` | Сохранить Custom IDs бота |
| `getNextCustomId(botId)` | Получить следующий ID из списка |
| `markCustomIdSent(botId, id)` | Отметить ID как отправленный |
| `makeApiRequest(bot, method, path, data)` | HTTP запросы через main процесс |
| `checkAutoClearConditions(bot, mode)` | Проверка условий автоочистки |
| `performAutoClear(mode)` | Выполнить автоочистку ошибок |
| `initTranscriptionContextMenu()` | ПКМ меню для вставки переменных |

---

## Важные особенности

### Два режима работы: Mail и Chat

- **globalMode** определяет текущий режим ('mail' или 'chat')
- Mail и Chat работают **ПАРАЛЛЕЛЬНО** (можно запустить оба одновременно!)
- При переключении режима `toggleGlobalMode()`:
  1. Сначала сохраняет текст всех шаблонов
  2. Затем обновляет UI всех вкладок

### WebView для cookies

- Каждый бот создаёт скрытый WebView (`createWebview()`)
- WebView хранит session cookies LadaDate
- Используется для chat-sync, chat-messages, chat-send
- **НЕ ТРОГАТЬ** логику WebView без крайней необходимости!

### Blacklist

- Хранится отдельно для Mail и Chat
- Загружается с сервера при логине (`loadFromServerData`)
- `startMonitoring()` вызывается ПОСЛЕ загрузки данных сервера
- Входящие сообщения автоматически добавляются в blacklist

### Шаблоны

- Хранятся в `botTemplates[login]` по режимам (mail/chat)
- Автосохранение через 3 секунды после изменения
- При переключении режима шаблоны сохраняются немедленно
- Синхронизируются с сервером

### Система уведомлений

```javascript
// Cooldown защита от дублирования
this.chatNotifyTimes = {};           // Время последнего уведомления
this.chatRequestNotified = {};       // Уведомлённые ChatRequests
const NOTIFY_COOLDOWN = 30000;       // 30 сек между уведомлениями
```

---

## Структура HTML элементов

```
#tabs-bar                        - Панель вкладок
  .tab-item#tab-{botId}          - Вкладка бота
    .status-dot                  - Индикатор статуса
    .tab-close                   - Кнопка закрытия

#panels-container                - Контейнер рабочих областей
  .workspace#ws-{botId}          - Рабочая область бота
    #tpl-select-{botId}          - Выбор шаблона
    #msg-{botId}                 - Текст сообщения (textarea)
    #btn-start-{botId}           - Кнопка Старт/Стоп
    #stat-sent-{botId}           - Счётчик отправленных
    #stat-err-{botId}            - Счётчик ошибок
    #bl-list-{botId}             - Список blacklist
    #target-select-{botId}       - Выбор категории
    #custom-ids-field-{botId}    - Поле Custom IDs

#browsers-container              - Скрытые WebView
  webview#webview-{botId}        - WebView для каждого бота

#logger-list                     - Список уведомлений
#minichat-modal                  - Модалка MiniChat
#settings-modal                  - Модалка настроек
```

---

## Типичные ID

- `bot.id` = `'bot_1234567890'` — внутренний ID (timestamp создания)
- `bot.displayId` = `'12345'` — ID анкеты на платформе LadaDate
- `bot.login` = `'email@mail.com'` — логин аккаунта

---

## Правила для Claude

### НЕ ТРОГАТЬ без крайней необходимости:

1. **WebView логика** в AccountBot.js — критична для сессии
2. **checkChatSync()** — хрупкая система уведомлений с cooldown
3. **KEEP_ALIVE_SCRIPT** в logger.js — поддержание онлайна
4. **Порядок вызовов в processMailUser/processChatUser** — важна последовательность

### При внесении изменений:

1. Проверять `globalMode` ('mail' или 'chat')
2. Сохранять данные на сервер: `saveTemplatesToServer()`, `saveBlacklistToServer()`
3. Обновлять UI: `bot.updateUI()`
4. Сохранять сессию: `saveSession()`
5. Mail и Chat работают параллельно — не ломать это!

### Куда вносить изменения:

| Задача | Файл |
|--------|------|
| Логика отправки писем/чатов | `AccountBot.js` |
| API запросы к Lababot | `api.js` |
| UI, вкладки, интерфейс | `main.js` |
| Настройки, темы, модалки | `settings.js` |
| AI генерация | `ai.js` |
| Уведомления, логи | `logger.js` |
| Инициализация | `init.js` |
| Глобальные переменные | `config.js` |
| Утилиты | `utils.js` |
| MiniChat | `minichat.js` |

---

## Частые проблемы и решения

### 1. Текст чата отправляется в письмах (или наоборот)
**Причина:** При быстром переключении режима textarea не обновился
**Решение:** `toggleGlobalMode()` теперь сохраняет шаблоны и обновляет ВСЕ вкладки

### 2. Blacklist появляется на других анкетах
**Причина:** `restoreSession()` использовал неправильный botId
**Решение:** `performLogin()` возвращает botId, используется напрямую

### 3. Входящие письма не добавляются в blacklist
**Причина:** `startMonitoring()` вызывался до загрузки данных с сервера
**Решение:** `startMonitoring()` вызывается после `loadFromServerData()`

### 4. Chat не отправляется
**Причина:** WebView не авторизован или нет cookies
**Решение:** Проверить `createWebview()` и авто-логин

### 5. "Анкета не оплачена"
**Причина:** `checkProfilePaymentStatus()` возвращает `isPaid=false`
**Решение:** Проверить billing на сервере

### 6. AI не работает
**Причина:** Нет API key или AI отключен для анкеты
**Решение:** Проверить `globalSettings.apiKey` и `checkProfileAIEnabled()`

---

## Сборка приложения

### ⚠️ ПЕРЕД СБОРКОЙ — обновить версию!

**Изменить версию в 3 файлах:**

| Файл | Что изменить |
|------|--------------|
| `Bot/package.json` | `"version": "X.X.X"` (строка 3) |
| `Bot/js/modules/config.js` | `const APP_VERSION = 'X.X.X'` (строка 2) |
| `Bot/index.html` | `<title>Novabot vX.X.X</title>` (строка 5) |

**После загрузки сборки на сайт:**
- Обновить версию на сайте https://novabot.com.ua/download/

---

### Команды сборки

```bash
cd Bot
npm install
npm run build        # Сборка для текущей ОС
npm run build:mac    # Сборка для macOS
npm run build:win    # Сборка для Windows
npm run build:linux  # Сборка для Linux
```

Ключевые файлы для сборки:
- `package.json` — зависимости и скрипты
- `main.js` — Electron main process
- `index.html` — UI (загружает модули)
- `js/modules/*` — вся логика

---

## Версия документации

- **Дата обновления:** 2025-12-18
- **Версия бота:** v1.3.0 (Novabot)
- **Автор:** Claude Code
