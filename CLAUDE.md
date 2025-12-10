# CLAUDE.md - Документация для Claude Code

## Обзор проекта

**Lababot** - CRM система для управления анкетами на платформе знакомств LadaDate.

### Структура проекта
```
/home/user/cabinet/
├── Bot/                    # Electron приложение (клиент)
│   ├── js/bot.js          # Основная логика (4647 строк)
│   ├── css/bot.css        # Стили + темы
│   ├── index.html         # UI интерфейс
│   ├── main.js            # Electron main process
│   └── Sound/             # Звуки уведомлений
│
├── Server/                 # Express сервер + личный кабинет
│   ├── server.js          # Точка входа
│   ├── routes/            # API маршруты
│   ├── config/database.js # PostgreSQL
│   ├── public/            # Frontend статика
│   └── dashboard.html     # Веб-интерфейс кабинета
│
└── CLAUDE.md              # Этот файл
```

---

## БОТ (Bot/js/bot.js)

### Критически важные глобальные переменные

```javascript
// ГЛАВНЫЙ ОБЪЕКТ - все боты хранятся здесь
let bots = {};  // { 'bot_1234567890': AccountBot instance }

// Шаблоны по логинам аккаунтов
let botTemplates = {};  // { 'email@mail.com': { mail: [], chat: [] } }

// Глобальные настройки (localStorage)
let globalSettings = {
    lang: 'ru',
    theme: 'light',           // 'light', 'dark', 'ladadate'
    soundsEnabled: true,
    apiKey: '',               // OpenAI API key
    translatorId: null,       // ID переводчика для статистики
    proxy1-6: '',             // Прокси для анкет по позициям
    // ...
};

// Текущий режим работы
let globalMode = 'mail';      // 'mail' или 'chat' - ВАЖНО!

// ID активной вкладки
let activeTabId = null;       // 'bot_1234567890'

// URL сервера статистики
const LABABOT_SERVER = 'http://188.137.253.169:3000';
```

### Класс AccountBot (строки 1863-3293)

**Это ядро бота!** Каждая анкета = экземпляр AccountBot.

```javascript
class AccountBot {
    constructor(id, login, pass, displayId, token) {
        this.id = id;              // 'bot_1234567890'
        this.login = login;        // email
        this.pass = pass;          // пароль
        this.displayId = displayId; // ID анкеты (напр. "12345")
        this.token = token;        // Bearer token для API

        // Настройки Mail режима
        this.mailSettings = {
            target: 'online',      // 'online', 'favorites', 'my-favorites', 'inbox', 'payers'
            speed: 'smart',        // 'smart', '15', '30' (секунды)
            blacklist: [],
            photoOnly: false,
            auto: false            // Автопереключение категорий
        };

        // Настройки Chat режима
        this.chatSettings = {
            target: 'payers',
            speed: 'smart',
            blacklist: [],
            rotationHours: 3,      // Смена инвайта каждые N часов
            cyclic: false,         // Циклическая ротация
            currentInviteIndex: 0
        };

        // Статистика
        this.mailStats = { sent: 0, errors: 0, waiting: 0 };
        this.chatStats = { sent: 0, errors: 0, waiting: 0 };

        // WebView для сессии (cookies)
        this.webview = null;

        // Флаг использования AI (для статистики)
        this.usedAi = false;
    }
}
```

### Ключевые методы AccountBot

| Метод | Строки | Описание |
|-------|--------|----------|
| `createWebview()` | 2053-2126 | Создаёт скрытый WebView для сессии cookies |
| `startMail(text)` | 2460-2503 | Запуск Mail режима (проверяет оплату!) |
| `stopMail()` | 2505-2511 | Остановка Mail |
| `processMailUser()` | 2540-2848 | Отправка одного письма |
| `startChat(text)` | 2850-2895 | Запуск Chat режима |
| `stopChat()` | 2897-2903 | Остановка Chat |
| `processChatUser()` | 2931-3237 | Отправка одного чата |
| `checkChatSync()` | 2213-2399 | Проверка новых чатов (уведомления!) |
| `checkNewMails()` | 2402-2443 | Проверка новых писем |
| `updateUI()` | 3255-3292 | Обновление интерфейса |

### API функции для сервера Lababot

```javascript
// Отправка статистики сообщения (строки 75-142)
async function sendMessageToLababot(params) {
    // params: botId, accountDisplayId, recipientId, type, textContent,
    //         status, responseTime, isFirst, isLast, convId, usedAi
    // type: 'outgoing' (письмо $1.5) или 'chat_msg' (чат $0.15)
}

// Входящее сообщение от мужчины (строки 144-172)
async function sendIncomingMessageToLababot(params)

// Heartbeat онлайн статуса (строки 174-204)
async function sendHeartbeatToLababot(botId, displayId, status)

// Проверка статуса профиля (строки 418-433)
async function checkProfileStatus(profileId)
// Возвращает: { paused, exists, allowed }

// Проверка оплаты (строки 441-460)
async function checkProfilePaymentStatus(profileId)
// Возвращает: { isPaid, isFree, isTrial, canTrial, daysLeft }
```

---

## UI Функции

### Основные функции интерфейса

| Функция | Строки | Описание |
|---------|--------|----------|
| `createInterface(bot)` | 3295-3437 | Создаёт UI для бота (вкладка + панель) |
| `selectTab(id)` | 4389-4413 | Переключение вкладки |
| `closeTab(e, id)` | 4415-4446 | Закрытие вкладки |
| `toggleGlobalMode()` | 1838-1850 | Переключение Mail/Chat |
| `updateInterfaceForMode(botId)` | 3444-3489 | Обновление UI под режим |
| `openModal(id)` / `closeModal(id)` | 1853-1854 | Модальные окна |

### Шаблоны

| Функция | Описание |
|---------|----------|
| `addTemplateInline(botId, event)` | Создать новый шаблон (Shift = всем) |
| `deleteTemplate(botId, event)` | Удалить шаблон (Shift = всем) |
| `updateTemplateDropdown(botId, idx)` | Обновить выпадающий список |
| `saveTemplateTextNow(botId)` | Сохранить текст шаблона |
| `autoSaveTemplateText(botId)` | Автосохранение (debounce 3 сек) |

### Blacklist

| Функция | Описание |
|---------|----------|
| `saveBlacklistID(event)` | Добавить в ЧС (Shift = всем) |
| `removeSelectedBlacklist(botId)` | Удалить из ЧС |
| `toggleVipStatus(botId)` | Пометить как VIP |
| `renderBlacklist(botId)` | Отрисовать список |

---

## AI Функции

### Генерация текста

```javascript
// Обработка AI действий (строки 1374-1454)
async function handleAIAction(botId, action, event) {
    // action: 'improve', 'generate', 'myprompt'
    // Shift + клик = для всех анкет
}

// AI для всех анкет (строки 1456-1522)
async function generateAIForAll(action)

// AI ответ в MiniChat (строки 839-966)
async function generateMiniChatAIReply()

// Генерация шаблона через AI (строки 3831-3915)
async function generateTemplateWithAI()
```

### Проверка AI доступа

```javascript
// Проверка разрешения AI для анкеты (строки 1357-1372)
async function checkProfileAIEnabled(profileId)
// Возвращает: { enabled, reason, translatorName }
```

---

## Система уведомлений

### Logger (строки 574-651)

```javascript
const Logger = {
    logs: [],
    add: function(text, type, botId, data) {
        // type: 'chat', 'chat-request', 'mail', 'vip-online', 'bday', 'log'
        // Автоматически воспроизводит звук!
    }
};
```

### Звуки

```javascript
const audioFiles = {
    online: new Audio('Sound/Online.mp3'),   // VIP онлайн
    message: new Audio('Sound/Message.mp3'), // Новое письмо
    chat: new Audio('Sound/Chat.mp3')        // Новый чат
};

function playSound(type) {
    if(!globalSettings.soundsEnabled) return;
    // 'online', 'message', 'chat'
}
```

---

## Сессия и данные

### Сохранение/Восстановление

```javascript
// Сохранение сессии в localStorage (строки 4301-4339)
async function saveSession()
// Сохраняет: bots, шаблоны, настройки

// Восстановление при запуске (строки 4341-4387)
async function restoreSession()
// Перелогинивает все анкеты

// Экспорт всех данных (строки 4532-4569)
async function exportAllData()
// JSON файл с полным бекапом

// Импорт данных (строки 4571-4647)
async function handleUniversalImport(input)
// Поддерживает .json и .txt форматы
```

---

## Важные особенности

### WebView для cookies

Каждый бот создаёт скрытый WebView (строки 2053-2126):
- Используется для `/chat-sync`, `/chat-messages`, `/chat-send`
- Хранит session cookies LadaDate
- **НЕ ТРОГАТЬ** логику создания/авторизации WebView!

### Система повторов (Retry Queue)

```javascript
// Для Mail (строки 1905-1910)
this.mailRetryQueue = [];      // Очередь повторов
this.mailContactedUsers = new Set(); // Уже отправленные
this.maxRetries = 3;
this.retryCooldownMs = 60000;  // 1 минута

// Аналогично для Chat
```

### Защита от дублирования уведомлений (строки 2267-2391)

```javascript
// checkChatSync() использует:
this.chatNotifyTimes = {};        // Время последнего уведомления
this.chatRequestNotified = {};    // Уведомлённые ChatRequests
this.activeChatSoundTimes = {};   // Время последнего звука

const NOTIFY_COOLDOWN = 30000;    // 30 сек между уведомлениями
const ACTIVE_CHAT_SOUND_INTERVAL = 15000; // 15 сек повторный звук
```

---

## Частые проблемы и решения

### 1. Дублирование уведомлений
**Причина:** checkChatSync вызывается каждые 3-7 сек
**Решение:** Используются cooldown таймеры и tracking объекты

### 2. Chat не отправляется
**Причина:** WebView не авторизован или нет cookies
**Решение:** Проверить createWebview() и скрипт авто-логина

### 3. "Анкета не оплачена"
**Причина:** checkProfilePaymentStatus возвращает isPaid=false
**Решение:** Проверить billing на сервере

### 4. AI не работает
**Причина:** Нет API key или AI отключен для анкеты
**Решение:** Проверить globalSettings.apiKey и checkProfileAIEnabled

---

## Правила для Claude

### НЕ ТРОГАТЬ без крайней необходимости:

1. **WebView логика** (строки 2053-2126) - критична для сессии
2. **checkChatSync** (строки 2213-2399) - хрупкая система уведомлений
3. **KEEP_ALIVE_SCRIPT** (строки 531-556) - поддержание онлайна
4. **Порядок вызовов в processMailUser/processChatUser** - важна последовательность API

### При изменении кода:

1. Всегда проверять `globalMode` ('mail' или 'chat')
2. Сохранять на сервер через `saveTemplatesToServer`, `saveBlacklistToServer`
3. Обновлять UI через `bot.updateUI()` после изменений
4. Использовать `saveSession()` после изменения настроек бота

### Типичные ID:

- `bot.id` = 'bot_1234567890' (внутренний ID)
- `bot.displayId` = '12345' (ID анкеты на платформе)
- `bot.login` = 'email@mail.com'

---

## Структура HTML элементов

```
#tabs-bar                    - Панель вкладок
  .tab-item#tab-{botId}      - Вкладка бота
    .status-dot              - Индикатор статуса
    .tab-close               - Кнопка закрытия

#panels-container            - Контейнер рабочих областей
  .workspace#ws-{botId}      - Рабочая область бота
    #tpl-select-{botId}      - Выбор шаблона
    #msg-{botId}             - Текст сообщения (textarea)
    #btn-start-{botId}       - Кнопка Старт/Стоп
    #stat-sent-{botId}       - Счётчик отправленных
    #stat-err-{botId}        - Счётчик ошибок
    #bl-list-{botId}         - Список blacklist

#browsers-container          - Скрытые WebView (position: fixed, left: -9999px)
  webview#webview-{botId}    - WebView для каждого бота
```

---

## Быстрая навигация по bot.js

| Строки | Содержимое |
|--------|------------|
| 1-50 | Глобальные переменные |
| 52-476 | API функции для Lababot сервера |
| 530-556 | KEEP_ALIVE_SCRIPT |
| 574-651 | Logger (уведомления) |
| 654-1092 | MiniChat (история, отправка) |
| 1145-1193 | Парсинг прокси |
| 1255-1279 | window.onload, инициализация |
| 1294-1348 | makeApiRequest (все HTTP запросы) |
| 1374-1522 | AI функции |
| 1568-1811 | Настройки (load, save, apply) |
| 1863-3293 | **Класс AccountBot** |
| 3295-3437 | createInterface |
| 3439-3489 | updateInterfaceForMode |
| 3491-3579 | Настройки бота (speed, auto, target) |
| 3713-3915 | Шаблоны (add, edit, delete, AI) |
| 4028-4085 | Избранные шаблоны |
| 4139-4240 | Blacklist |
| 4253-4298 | Login |
| 4301-4387 | Session (save/restore) |
| 4389-4446 | Tab management |
| 4448-4476 | Start/Stop all |
| 4489-4530 | Relogin |
| 4532-4647 | Export/Import |

---

## Версия документации

- **Дата создания:** 2025-12-09
- **Версия бота:** v10 (Bot Pro Ultimate)
- **Автор:** Claude Code
