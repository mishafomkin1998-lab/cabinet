# MODULE_MAP.md - Карта модулей Lababot v10

## Обзор рефакторинга

**Исходный файл:** `Bot/js/bot.js` (~4650 строк, ~243KB)

**Результат:** 11 модулей в `Bot/js/modules/`

**Дата:** 2025-12-09

---

## Структура модулей

```
Bot/js/modules/
├── config.js        # Константы и глобальное состояние
├── utils.js         # Вспомогательные функции
├── api.js           # API коммуникация с сервером
├── logger.js        # Система логирования и уведомлений
├── ui.js            # UI компоненты (модалки, toast, tooltips)
├── settings.js      # Управление настройками
├── templates.js     # Работа с шаблонами
├── ai.js            # Интеграция с OpenAI
├── miniChat.js      # Функционал быстрого чата
├── AccountBot.js    # Главный класс бота
├── main.js          # Точка входа и инициализация
└── MODULE_MAP.md    # Этот файл
```

---

## Порядок загрузки (ВАЖНО!)

Модули загружаются в строгом порядке из-за зависимостей:

```html
<script src="js/modules/config.js"></script>      <!-- 1. Базовые константы -->
<script src="js/modules/utils.js"></script>       <!-- 2. Утилиты -->
<script src="js/modules/api.js"></script>         <!-- 3. API функции -->
<script src="js/modules/logger.js"></script>      <!-- 4. Логгер -->
<script src="js/modules/ui.js"></script>          <!-- 5. UI компоненты -->
<script src="js/modules/settings.js"></script>    <!-- 6. Настройки -->
<script src="js/modules/templates.js"></script>   <!-- 7. Шаблоны -->
<script src="js/modules/ai.js"></script>          <!-- 8. AI функции -->
<script src="js/modules/miniChat.js"></script>    <!-- 9. MiniChat -->
<script src="js/modules/AccountBot.js"></script>  <!-- 10. Класс бота -->
<script src="js/modules/main.js"></script>        <!-- 11. Инициализация -->
```

---

## Детальное описание модулей

### 1. config.js (~150 строк)

**Назначение:** Константы, глобальные переменные, базовая конфигурация

**Содержит:**
| Элемент | Тип | Описание |
|---------|-----|----------|
| `LABABOT_SERVER` | const | URL сервера статистики |
| `LADADATE_API_BASE` | const | URL API LadaDate |
| `OPENAI_API_ENDPOINT` | const | URL OpenAI API |
| `audioFiles` | object | Звуковые файлы для уведомлений |
| `KEEP_ALIVE_SCRIPT` | const | Скрипт поддержания сессии в WebView |
| `bots` | let | Хранилище всех ботов |
| `botTemplates` | let | Шаблоны по аккаунтам |
| `accountPreferences` | let | Настройки по аккаунтам |
| `globalSettings` | let | Глобальные настройки приложения |
| `globalMode` | let | Текущий режим (mail/chat) |
| `activeTabId` | let | ID активной вкладки |
| `shiftWasPressed` | let | Флаг Shift для массовых действий |
| `playSound()` | function | Воспроизведение звука уведомления |

**Исходные строки в bot.js:** 1-50, 531-556

---

### 2. utils.js (~200 строк)

**Назначение:** Вспомогательные функции общего назначения

**Содержит:**
| Функция | Описание |
|---------|----------|
| `parseProxyUrl(url)` | Парсинг прокси в формате URL |
| `parseSimpleProxy(str)` | Парсинг прокси ip:port:user:pass |
| `getProxyForPosition(pos)` | Получение прокси по позиции |
| `generateConvId()` | Генерация ID диалога |
| `generateBotId()` | Генерация ID бота |
| `millisecondsToInterval(ms)` | Конвертация мс в читаемый интервал |
| `formatElapsedTime(start)` | Форматирование прошедшего времени |
| `generateTemplateName()` | Генерация имени шаблона |
| `checkDuplicate(login)` | Проверка дубликата аккаунта |
| `validateInput(login, pass)` | Валидация логина/пароля |
| `getBotTemplates(login, mode)` | Получение шаблонов аккаунта |
| `updateBotCount()` | Обновление счётчика ботов |
| `debounce(func, wait)` | Debounce функция |

**Исходные строки в bot.js:** 1145-1240, частично из разных мест

---

### 3. api.js (~400 строк)

**Назначение:** Все API функции для коммуникации с серверами

**Содержит:**
| Функция | Описание |
|---------|----------|
| `makeApiRequest(url, method, body, token)` | Основной запрос к LadaDate API |
| `sendMessageToLababot(params)` | Отправка статистики сообщения |
| `sendIncomingMessageToLababot(params)` | Входящее сообщение от мужчины |
| `sendHeartbeatToLababot(botId, displayId, status)` | Heartbeat онлайн статуса |
| `sendErrorToLababot(params)` | Отправка ошибки на сервер |
| `checkProfileStatus(profileId)` | Проверка статуса профиля |
| `checkProfilePaymentStatus(profileId)` | Проверка оплаты анкеты |
| `checkProfileAIEnabled(profileId)` | Проверка разрешения AI |
| `activateTrialForProfile(profileId)` | Активация trial периода |
| `loadBotDataFromServer(displayId)` | Загрузка данных бота с сервера |
| `saveTemplatesToServer(displayId, templates)` | Сохранение шаблонов |
| `saveBlacklistToServer(displayId, blacklist)` | Сохранение blacklist |
| `resetStatsOnServer(displayId)` | Сброс статистики |
| `loadMiniChatHistory(profileId, partnerId)` | Загрузка истории MiniChat |

**Исходные строки в bot.js:** 52-476, 1294-1355

---

### 4. logger.js (~250 строк)

**Назначение:** Система логирования и уведомлений

**Содержит:**
| Элемент | Тип | Описание |
|---------|-----|----------|
| `Logger` | object | Основной объект логгера |
| `Logger.logs` | array | Массив логов |
| `Logger.add()` | method | Добавление записи |
| `Logger.playNotificationSound()` | method | Воспроизведение звука |
| `Logger.render()` | method | Отрисовка логов в UI |
| `Logger.onLogClick()` | method | Обработка клика по логу |
| `Logger.updateBadge()` | method | Обновление счётчика |
| `Logger.clear()` | method | Очистка логов |
| `toggleLogger()` | function | Переключение видимости |
| `toggleStatusGroup()` | function | Переключение группы статусов |
| `initLoggerDrag()` | function | Drag & drop для окна |

**Исходные строки в bot.js:** 574-651, 1093-1143

---

### 5. ui.js (~350 строк)

**Назначение:** UI компоненты - модальные окна, уведомления, tooltips

**Содержит:**
| Функция | Описание |
|---------|----------|
| `openModal(id)` | Открытие модального окна |
| `closeModal(id)` | Закрытие модального окна |
| `closeAllModals()` | Закрытие всех модалок |
| `showToast(msg, type, duration)` | Toast уведомление |
| `showBulkNotification(msg, count)` | Уведомление массовых действий |
| `initTooltips()` | Инициализация tooltips |
| `showTooltip(e)` | Показать tooltip |
| `hideTooltip()` | Скрыть tooltip |
| `showPaymentDialog(profileId, canTrial)` | Диалог оплаты |
| `checkVarTrigger(textarea, dropdownId)` | Триггер переменных |
| `applyVar(textareaId, varName, dropdownId)` | Применение переменной |
| `showTabLoading(botId)` | Индикатор загрузки вкладки |
| `hideTabLoading(botId)` | Скрытие индикатора |
| `initUI()` | Инициализация UI |

**Исходные строки в bot.js:** 1853-1860, разбросаны по файлу

---

### 6. settings.js (~320 строк)

**Назначение:** Управление настройками приложения

**Содержит:**
| Функция | Описание |
|---------|----------|
| `loadSettings()` | Загрузка из localStorage |
| `saveSettings()` | Сохранение в localStorage |
| `applySettings()` | Применение настроек к UI |
| `applyTheme(theme)` | Применение темы |
| `toggleTheme()` | Переключение темы |
| `toggleExtendedFeatures()` | Вкл/выкл расширенных функций |
| `updateSettings(botId, type, val)` | Обновление настроек бота |
| `handleAutoChange(botId)` | Обработчик Auto (+ Shift) |
| `setAutoForAll(isChecked)` | Auto для всех анкет |
| `handleSpeedChange(botId, val)` | Обработчик скорости (+ Shift) |
| `setSpeedForAll(val)` | Скорость для всех |
| `updateChatRotation(botId)` | Настройки ротации чата |
| `toggleGlobalMode()` | Переключение Mail/Chat |
| `setGlobalTarget(target)` | Установка категории всем |
| `openSettingsModal()` | Открытие окна настроек |
| `saveSettingsFromModal()` | Сохранение из модалки |

**Исходные строки в bot.js:** 1568-1811, 3491-3579

---

### 7. templates.js (~350 строк)

**Назначение:** Работа с шаблонами сообщений

**Содержит:**
| Функция | Описание |
|---------|----------|
| `addTemplateInline(botId, event)` | Создание шаблона (+ Shift) |
| `addTemplateToAll()` | Добавление шаблона всем |
| `deleteTemplate(botId, event)` | Удаление шаблона (+ Shift) |
| `deleteTemplateFromAll()` | Удаление шаблона у всех |
| `openTemplateModal(botId)` | Открытие модалки редактирования |
| `saveTemplateFromModal()` | Сохранение из модалки |
| `onTemplateSelect(botId)` | Обработчик выбора шаблона |
| `updateTemplateDropdown(botId, selectIdx)` | Обновление выпадающего списка |
| `autoSaveTemplateText(botId)` | Автосохранение (debounce) |
| `saveTemplateTextNow(botId)` | Немедленное сохранение |
| `toggleTemplateFavorite(login, idx, mode, btn)` | Избранные шаблоны |

**Исходные строки в bot.js:** 3713-3915, 4028-4085

---

### 8. ai.js (~360 строк)

**Назначение:** Интеграция с OpenAI для генерации текста

**Содержит:**
| Функция | Описание |
|---------|----------|
| `toggleAI(botId)` | Переключение AI меню |
| `handleAIAction(botId, action, event)` | Обработка AI действий |
| `generateAIForAll(action)` | AI для всех анкет |
| `callOpenAI(systemPrompt, userPrompt)` | Вызов OpenAI API |
| `generateTemplateWithAI()` | Генерация шаблона через AI |
| `generateMiniChatAIReply()` | AI ответ в MiniChat |

**Исходные строки в bot.js:** 1374-1522, часть из MiniChat

---

### 9. miniChat.js (~200 строк)

**Назначение:** Быстрый чат в боковой панели

**Содержит:**
| Элемент | Тип | Описание |
|---------|-----|----------|
| `miniChatBotId` | let | ID текущего бота |
| `miniChatPartnerId` | let | ID собеседника |
| `miniChatPartnerName` | let | Имя собеседника |
| `openMiniChat()` | function | Открытие MiniChat |
| `closeMiniChat()` | function | Закрытие MiniChat |
| `loadMiniChatHistoryUI()` | function | Загрузка истории в UI |
| `sendMiniChatMessage()` | function | Отправка сообщения |
| `escapeHtml(str)` | function | Экранирование HTML |
| `handleMiniChatKeyPress(e)` | function | Обработка Enter |
| `refreshMiniChat()` | function | Обновление чата |

**Исходные строки в bot.js:** 654-1092

---

### 10. AccountBot.js (~500 строк)

**Назначение:** Главный класс бота - ядро приложения

**Содержит:**
| Метод | Описание |
|-------|----------|
| `constructor()` | Инициализация свойств |
| `createWebview()` | Создание WebView для сессии |
| `startHeartbeat()` | Запуск heartbeat |
| `sendHeartbeat()` | Отправка heartbeat |
| `keepAlive()` | Поддержание сессии |
| `startMonitoring()` | Запуск мониторинга |
| `checkChatSync()` | Проверка новых чатов |
| `checkNewMails()` | Проверка новых писем |
| `checkVipStatus()` | Проверка VIP онлайн |
| `startMail(text)` | Запуск Mail режима |
| `stopMail()` | Остановка Mail |
| `processMailUser()` | Обработка Mail отправки |
| `startChat(text)` | Запуск Chat режима |
| `stopChat()` | Остановка Chat |
| `processChatUser()` | Обработка Chat отправки |
| `replaceMacros(text, user)` | Замена макросов |
| `trackConversation(userId, isFirst, isLast)` | Отслеживание диалога |
| `updateUI()` | Обновление интерфейса |
| `loadFromServerData(data)` | Загрузка данных с сервера |

**Исходные строки в bot.js:** 1863-3293

---

### 11. main.js (~600 строк)

**Назначение:** Точка входа, инициализация, управление интерфейсом

**Содержит:**
| Функция | Категория | Описание |
|---------|-----------|----------|
| `createInterface(bot)` | Interface | Создание UI для бота |
| `updateInterfaceForMode(botId)` | Interface | Обновление UI под режим |
| `selectTab(id)` | Tabs | Выбор вкладки |
| `closeTab(e, id)` | Tabs | Закрытие вкладки |
| `onTabRightClick(e, id)` | Tabs | Контекстное меню |
| `initTabDragDrop()` | Tabs | Drag & drop вкладок |
| `toggleBot(botId)` | Bot Control | Старт/стоп бота |
| `startAll()` | Bot Control | Запуск всех ботов |
| `stopAll()` | Bot Control | Остановка всех |
| `clearAllStats()` | Bot Control | Сброс статистики |
| `saveBlacklistID(event)` | Blacklist | Добавление в ЧС |
| `removeSelectedBlacklist(botId)` | Blacklist | Удаление из ЧС |
| `toggleVipStatus(botId)` | Blacklist | VIP статус |
| `renderBlacklist(botId)` | Blacklist | Отрисовка списка |
| `openPhotoManager(botId)` | Photos | Менеджер фото |
| `openStatsModal(botId)` | Stats | Окно статистики |
| `openAccountManager()` | Account | Менеджер аккаунтов |
| `handleLoginOrUpdate()` | Auth | Обработка логина |
| `performLogin(login, pass)` | Auth | Выполнение логина |
| `reloginBot(botId)` | Auth | Перелогин бота |
| `saveSession()` | Session | Сохранение сессии |
| `restoreSession()` | Session | Восстановление сессии |
| `exportAllData()` | Export/Import | Экспорт данных |
| `handleUniversalImport(input)` | Export/Import | Импорт данных |
| `initHotkeys()` | Init | Инициализация hotkeys |
| `window.onload` | Init | Точка входа |

**Исходные строки в bot.js:** 1255-1279, 3295-3437, 4139-4647

---

## Зависимости между модулями

```
config.js ─────────┬─────────────────────────────────────────────────┐
                   │                                                 │
utils.js ──────────┼──────────────────────────────────────┐         │
                   │                                      │         │
api.js ────────────┼───────────────────┐                  │         │
                   │                   │                  │         │
logger.js ─────────┼─────────┐         │                  │         │
                   │         │         │                  │         │
ui.js ─────────────┼────┐    │         │                  │         │
                   │    │    │         │                  │         │
settings.js ───────┼────┤    │         │                  │         │
                   │    │    │         │                  │         │
templates.js ──────┤    │    │         │                  │         │
                   │    │    │         │                  │         │
ai.js ─────────────┤    │    │         │                  │         │
                   │    │    │         │                  │         │
miniChat.js ───────┤    │    │         │                  │         │
                   │    │    │         │                  │         │
AccountBot.js ─────┴────┴────┴─────────┴──────────────────┴─────────┤
                                                                    │
main.js ────────────────────────────────────────────────────────────┘
```

---

## Глобальные переменные (доступны везде)

| Переменная | Модуль | Используется в |
|------------|--------|----------------|
| `bots` | config.js | Все модули |
| `botTemplates` | config.js | templates.js, main.js |
| `globalSettings` | config.js | Все модули |
| `globalMode` | config.js | Все модули |
| `activeTabId` | config.js | main.js, templates.js |
| `Logger` | logger.js | AccountBot.js, main.js |
| `audioFiles` | config.js | logger.js |

---

## Как добавить новую функцию

1. **Определите категорию:** UI, API, настройки, бот и т.д.
2. **Выберите модуль:** Добавьте функцию в соответствующий модуль
3. **Проверьте зависимости:** Убедитесь что нужные переменные доступны
4. **Обновите документацию:** Добавьте функцию в таблицу модуля

---

## Тестирование

После рефакторинга проверьте:

- [ ] Логин в аккаунт работает
- [ ] Переключение Mail/Chat работает
- [ ] Отправка писем работает
- [ ] Отправка чатов работает
- [ ] Шаблоны создаются/удаляются
- [ ] Blacklist работает
- [ ] AI генерация работает
- [ ] Звуки уведомлений играют
- [ ] MiniChat открывается и работает
- [ ] Настройки сохраняются
- [ ] Сессия восстанавливается после перезапуска
- [ ] Экспорт/Импорт работает

---

## История изменений

| Дата | Изменение |
|------|-----------|
| 2025-12-09 | Первоначальное разделение bot.js на 11 модулей |

---

## Резервная копия

Оригинальный файл `Bot/js/bot.js` сохранён и может быть использован для отката при необходимости.
