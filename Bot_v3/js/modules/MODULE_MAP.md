# MODULE_MAP.md - Карта модулей Lababot v10

## Обзор рефакторинга

**Исходный файл:** `Bot/js/bot.js` (4647 строк, ~243KB)

**Результат:** 10 модулей в `Bot/js/modules/` (4638 строк)

**Дата:** 2025-12-09

---

## Структура модулей

```
Bot/js/modules/
├── config.js        # (60 строк) Глобальные переменные и константы
├── utils.js         # (152 строки) Утилиты, валидация, drag & drop
├── api.js           # (470 строк) API функции для Lababot сервера
├── logger.js        # (172 строки) Logger, KEEP_ALIVE_SCRIPT
├── minichat.js      # (439 строк) MiniChat функционал
├── ai.js            # (173 строки) AI генерация текста
├── settings.js      # (294 строки) Настройки приложения
├── AccountBot.js    # (1431 строка) Класс AccountBot
├── main.js          # (1353 строки) UI функции, основная логика
├── init.js          # (94 строки) Инициализация (window.onload)
└── MODULE_MAP.md    # Этот файл
```

---

## Порядок загрузки (КРИТИЧНО!)

Модули загружаются в строгом порядке из-за зависимостей:

```html
<script src="js/modules/config.js"></script>      <!-- 1. Глобальные переменные -->
<script src="js/modules/utils.js"></script>       <!-- 2. Утилиты -->
<script src="js/modules/api.js"></script>         <!-- 3. API функции -->
<script src="js/modules/logger.js"></script>      <!-- 4. Logger -->
<script src="js/modules/minichat.js"></script>    <!-- 5. MiniChat -->
<script src="js/modules/ai.js"></script>          <!-- 6. AI функции -->
<script src="js/modules/settings.js"></script>    <!-- 7. Настройки -->
<script src="js/modules/AccountBot.js"></script>  <!-- 8. Класс бота -->
<script src="js/modules/main.js"></script>        <!-- 9. UI и основная логика -->
<script src="js/modules/init.js"></script>        <!-- 10. Инициализация -->
```

---

## Детальное описание модулей

### 1. config.js (строки 1-60 из bot.js)

**Назначение:** Глобальные переменные, константы, базовая конфигурация

| Элемент | Тип | Описание |
|---------|-----|----------|
| `axios` | lib | HTTP клиент |
| `audioFiles` | object | Звуковые файлы уведомлений |
| `bots` | let | Хранилище всех ботов |
| `botTemplates` | let | Шаблоны по аккаунтам |
| `accountPreferences` | let | Настройки по аккаунтам |
| `defaultSettings` | const | Настройки по умолчанию |
| `globalSettings` | let | Глобальные настройки |
| `globalMode` | let | Текущий режим (mail/chat) |
| `activeTabId` | let | ID активной вкладки |
| `minichatBotId` | let | ID бота для MiniChat |
| `LABABOT_SERVER` | const | URL сервера статистики |
| `playSound(type)` | function | Воспроизведение звука |
| `generateConvId()` | function | Генерация ID диалога |

---

### 2. utils.js (строки 1145-1253, 1524-1566 из bot.js)

**Назначение:** Утилиты, валидация, drag & drop вкладок

| Элемент | Тип | Описание |
|---------|-----|----------|
| `LADADATE_BASE_URL` | const | https://ladadate.com |
| `OPENAI_API_ENDPOINT` | const | https://api.openai.com/v1/chat/completions |
| `forbiddenWords` | array | Запрещённые слова |
| `parseProxyUrl(url)` | function | Парсинг URL прокси |
| `parseSimpleProxy(str)` | function | Парсинг ip:port |
| `startTabDrag(e, tabEl)` | function | Начало перетаскивания |
| `handleTabMove(e)` | function | Обработка движения |
| `stopTabDrag()` | function | Завершение перетаскивания |
| `validateInput(textarea)` | function | Валидация текста |
| `showToast(text)` | function | Toast уведомление |
| `initTooltips()` | function | Инициализация тултипов |

---

### 3. api.js (строки 61-530 из bot.js)

**Назначение:** API функции для коммуникации с серверами

| Функция | Описание |
|---------|----------|
| `millisecondsToInterval(ms)` | Конвертация в PostgreSQL INTERVAL |
| `sendMessageToLababot(params)` | Отправка статистики сообщения |
| `sendIncomingMessageToLababot(params)` | Входящее сообщение |
| `sendHeartbeatToLababot()` | Heartbeat онлайн статуса |
| `sendErrorToLababot(params)` | Отправка ошибки |
| `checkProfileStatus(profileId)` | Проверка статуса профиля |
| `checkProfilePaymentStatus(profileId)` | Проверка оплаты |
| `showPaymentDialog()` | Диалог оплаты |
| `activateTrialPeriod(profileId)` | Активация trial |
| `loadBotDataFromServer(bot)` | Загрузка данных бота |
| `saveTemplatesToServer(bot)` | Сохранение шаблонов |
| `saveBlacklistToServer(bot)` | Сохранение blacklist |
| `resetStatsOnServer(bot, type)` | Сброс статистики |

---

### 4. logger.js (строки 531-652, 1094-1143 из bot.js)

**Назначение:** Логирование и уведомления

| Элемент | Тип | Описание |
|---------|-----|----------|
| `KEEP_ALIVE_SCRIPT` | const | Скрипт поддержания сессии |
| `Logger` | object | Объект логгера |
| `Logger.logs` | array | Массив записей |
| `Logger.add()` | method | Добавление записи |
| `Logger.render()` | method | Отрисовка логов |
| `toggleStatusGroup()` | function | Группа статусов |
| `toggleLogger()` | function | Вкл/выкл логгера |
| `showBulkNotification()` | function | Массовое уведомление |
| Drag/resize handlers | | Обработчики перетаскивания |

---

### 5. minichat.js (строки 654-1092 из bot.js)

**Назначение:** Быстрый чат для просмотра переписки

| Функция | Описание |
|---------|----------|
| `openMiniChat(botId, partnerId, name, type)` | Открытие чата |
| `closeMiniChat()` | Закрытие чата |
| `loadMiniChatHistory()` | Загрузка истории (mail) |
| `loadMiniChatHistoryForChat()` | Загрузка истории (chat) |
| `sendMiniChatMessage()` | Отправка сообщения |
| `generateMiniChatAIReply()` | AI генерация ответа |

---

### 6. ai.js (строки 1350-1522 из bot.js)

**Назначение:** Интеграция с OpenAI

| Функция | Описание |
|---------|----------|
| `toggleAI(botId)` | Показать/скрыть AI меню |
| `checkProfileAIEnabled(profileId)` | Проверка доступа AI |
| `handleAIAction(botId, action, event)` | Обработка AI действия |
| `generateAIForAll(action)` | AI для всех анкет |

---

### 7. settings.js (строки 1568-1861 из bot.js)

**Назначение:** Управление настройками

| Функция | Описание |
|---------|----------|
| `loadGlobalSettingsUI()` | Загрузка настроек в UI |
| `applyTheme(theme)` | Применение темы |
| `saveGlobalSettings()` | Сохранение настроек |
| `openGlobalSettings()` | Открыть модал настроек |
| `switchSettingsTab(tabName)` | Переключение вкладок |
| `testProxy(num)` | Тест прокси |
| `exportSettings()` | Экспорт настроек |
| `importSettings()` | Импорт настроек |
| `toggleExtendedFeatures()` | AI функции вкл/выкл |
| `initHotkeys()` | Горячие клавиши |
| `switchTabRelative(step)` | Переключение вкладок |
| `toggleGlobalMode()` | Mail/Chat переключение |
| `updateBotCount()` | Счётчик анкет |
| `openModal(id)` / `closeModal(id)` | Модальные окна |

---

### 8. AccountBot.js (строки 1863-3293 из bot.js)

**Назначение:** Главный класс бота - ядро приложения

| Метод | Описание |
|-------|----------|
| `constructor()` | Инициализация свойств |
| `createWebview()` | Создание WebView для сессии |
| `doActivity()` | Обновление активности |
| `startMonitoring()` | Запуск мониторинга |
| `checkChatSync()` | Проверка новых чатов |
| `checkNewMails()` | Проверка новых писем |
| `checkVipStatus()` | Проверка VIP онлайн |
| `startMail(text)` | Запуск Mail режима |
| `stopMail()` | Остановка Mail |
| `processMailUser()` | Отправка письма |
| `startChat(text)` | Запуск Chat режима |
| `stopChat()` | Остановка Chat |
| `processChatUser()` | Отправка чата |
| `replaceMacros(text, user)` | Замена {Name}, {City} |
| `updateUI()` | Обновление интерфейса |

---

### 9. main.js (строки 3295-4647 из bot.js)

**Назначение:** UI функции и основная логика

| Категория | Функции |
|-----------|---------|
| **Interface** | `createInterface()`, `updateInterfaceForMode()` |
| **Templates** | `addTemplateInline()`, `deleteTemplate()`, `updateTemplateDropdown()`, `saveTemplateTextNow()`, `autoSaveTemplateText()`, `generateTemplateWithAI()`, `saveTemplateFromModal()` |
| **Favorites** | `selectAsFavoriteTemplate()`, `setFavoriteTemplate()` |
| **Blacklist** | `openBlacklistModal()`, `saveBlacklistID()`, `removeSelectedBlacklist()`, `toggleVipStatus()`, `renderBlacklist()` |
| **Auth** | `handleLoginOrUpdate()`, `login()` |
| **Session** | `saveSession()`, `restoreSession()` |
| **Tabs** | `selectTab()`, `closeTab()` |
| **Control** | `startAll()`, `stopAll()`, `reloginAllBots()` |
| **Export** | `exportAllData()`, `handleUniversalImport()` |

---

### 10. init.js (строки 1255-1348 из bot.js)

**Назначение:** Инициализация при загрузке

| Функция | Описание |
|---------|----------|
| `window.onload` | Точка входа приложения |
| `setGlobalTarget(target)` | Установка категории всем |
| `makeApiRequest(path, options)` | Универсальный API запрос |

---

## Глобальные переменные

| Переменная | Модуль | Используется в |
|------------|--------|----------------|
| `bots` | config.js | Все модули |
| `botTemplates` | config.js | main.js |
| `globalSettings` | config.js | Все модули |
| `globalMode` | config.js | Все модули |
| `activeTabId` | config.js | main.js |
| `Logger` | logger.js | AccountBot.js, main.js |
| `LABABOT_SERVER` | config.js | api.js |
| `OPENAI_API_ENDPOINT` | utils.js | ai.js, main.js, minichat.js |
| `LADADATE_BASE_URL` | utils.js | init.js |

---

## Резервная копия

Оригинальный файл `Bot/js/bot.js` сохранён и может быть использован для отката.

---

## Тестирование

После рефакторинга проверьте:
- [ ] Логин в аккаунт
- [ ] Переключение Mail/Chat
- [ ] Отправка писем
- [ ] Отправка чатов
- [ ] Шаблоны (создание/удаление)
- [ ] Blacklist
- [ ] AI генерация
- [ ] Звуки уведомлений
- [ ] MiniChat
- [ ] Настройки
- [ ] Сессия после перезапуска
- [ ] Экспорт/Импорт

---

**Дата:** 2025-12-09
**Версия:** Bot Pro Ultimate v10
