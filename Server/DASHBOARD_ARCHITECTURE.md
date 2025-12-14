# Dashboard Architecture - Архитектура личного кабинета Nova

> **Версия:** 2.0 (Модульная архитектура)
> **Дата рефакторинга:** 2025-12-14

## Обзор изменений

Проведён полный рефакторинг монолитного `dashboard.js` (3200+ строк) в модульную архитектуру с разделением ответственности.

### До рефакторинга
```
Server/public/js/
├── api.js           # API модуль (не использовался)
└── dashboard.js     # Монолит 3200+ строк
```

### После рефакторинга
```
Server/public/js/
├── api.js           # API модуль (базовый)
└── dashboard/       # Модульная архитектура
    ├── index.js     # Точка входа, объединение компонентов
    ├── state.js     # Управление состоянием
    ├── utils.js     # Утилиты и хелперы
    └── components/  # Компоненты по функциональности
        ├── stats.js     # Статистика
        ├── profiles.js  # Анкеты (профили)
        ├── team.js      # Команда (админы, переводчики)
        ├── billing.js   # Финансы и оплата
        ├── bots.js      # Управление ботами
        └── settings.js  # Настройки пользователя
```

---

## Структура модулей

### 1. `utils.js` - Утилиты

Общие функции, используемые во всех компонентах.

| Функция | Описание |
|---------|----------|
| `formatDateToISO(date)` | Форматирование даты в YYYY-MM-DD |
| `formatDateTime(date, lang)` | Форматирование даты и времени |
| `formatRelativeTime(timestamp, translations, lang)` | Относительное время ("5 мин назад") |
| `formatBotLogTime(timestamp)` | Время для логов ботов |
| `formatUptime(seconds)` | Uptime в часах и минутах |
| `getQuickDateRange(range)` | Получить диапазон дат (today, week, month) |
| `getCalendarDays(year, month)` | Генерация дней для календаря |
| `getStatusClass(status)` | CSS класс для статуса |
| `getAdminColor(adminId, adminName)` | Стабильный цвет для админа |
| `getPaymentStatusClass(account)` | CSS класс статуса оплаты |
| `getPaymentStatusText(account)` | Текст статуса оплаты |
| `exportStats(stats, filter)` | Экспорт статистики в CSV |
| `exportFavoriteTemplates(templates)` | Экспорт избранных шаблонов |
| `exportLastResponses(responses)` | Экспорт последних ответов |
| `exportSentLettersGrouped(letters)` | Экспорт писем |
| `exportAiUsage(activities)` | Экспорт использования AI |
| `combineFinanceHistory(...)` | Объединение истории финансов |

**Использование:**
```javascript
const formattedDate = DashboardUtils.formatDateTime(date, 'ru');
const cssClass = DashboardUtils.getStatusClass('online');
```

---

### 2. `state.js` - Управление состоянием

Централизованное хранилище состояния приложения.

#### Функции

| Функция | Описание |
|---------|----------|
| `getInitialState()` | Возвращает начальное состояние |
| `resetUserSettings(state)` | Сброс настроек пользователя |
| `resetAdminForm(state)` | Сброс формы админа |
| `resetTranslatorForm(state)` | Сброс формы переводчика |
| `resetFinanceForms(state)` | Сброс форм финансов |

#### Computed Properties

| Свойство | Описание |
|----------|----------|
| `getFilteredAccounts(state)` | Отфильтрованные аккаунты |
| `getCombinedFinanceHistory(state)` | Объединённая история финансов |
| `getFinanceAdminsTotalBalance(state)` | Общий баланс админов |
| `getFilteredMailingProfiles(state)` | Фильтрованные профили рассылки |
| `getTranslatorsForAdmin(state)` | Переводчики для админа |

**Использование:**
```javascript
const state = DashboardState.getInitialState();
const filtered = DashboardState.computed.getFilteredAccounts(state);
```

---

### 3. `components/stats.js` - Статистика

Загрузка и обработка статистики.

| Функция | Описание |
|---------|----------|
| `loadDashboardStats(context, withFilters)` | Загрузить основную статистику |
| `loadHourlyActivity(context)` | Загрузить почасовую активность |
| `loadLastResponses(context)` | Загрузить последние ответы |
| `loadSentLettersGrouped(context)` | Загрузить сгруппированные письма |
| `loadAiUsage(context)` | Загрузить использование AI |
| `loadRecentActivity(context)` | Загрузить последнюю активность |
| `applyStatsFilter(context)` | Применить фильтры |
| `setQuickDateRange(context, range)` | Установить быстрый диапазон |
| `getDateRangeText(context)` | Получить текст диапазона |
| `selectCalendarDate(context, date)` | Выбрать дату в календаре |
| `getMonitoringTitle(func)` | Получить заголовок мониторинга |
| `getActivityLevel(hourlyActivity, hour)` | Уровень активности для часа |
| `getActivityColor(level)` | Цвет активности |

---

### 4. `components/profiles.js` - Анкеты

Управление анкетами (профилями).

| Функция | Описание |
|---------|----------|
| `loadAccounts(context)` | Загрузить список аккаунтов |
| `toggleAccountAccess(context, account)` | Пауза/возобновление |
| `deleteAccount(context, account)` | Удалить аккаунт |
| `saveAccounts(context)` | Сохранить новые аккаунты |
| `assignSelectedToAdmin(context, adminId)` | Назначить админу |
| `assignSelectedToTranslator(context, translatorId)` | Назначить переводчику |
| `toggleProfileSelection(context, profileId, checked)` | Переключить выбор |
| `toggleSelectAllProfiles(context, checked)` | Выбрать/снять все |
| `sortAccounts(context, field)` | Сортировка |
| `loadProfileHistory(context)` | История изменений |
| `setHistoryQuickRange(context, range)` | Быстрый диапазон истории |
| `toggleProfileMailing(context, profile)` | Переключить рассылку |

**Оптимизация N+1:**
Теперь используется batch endpoint `/api/billing/profiles-status` для получения статусов оплаты всех профилей одним запросом вместо отдельного запроса на каждый профиль.

---

### 5. `components/team.js` - Команда

Управление админами и переводчиками.

| Функция | Описание |
|---------|----------|
| `loadTeam(context)` | Загрузить команду |
| `editAdmin(context, admin)` | Редактировать админа |
| `saveAdmin(context)` | Сохранить админа |
| `deleteAdmin(context, admin)` | Удалить админа |
| `toggleAiEnabled(context, user)` | Переключить AI |
| `toggleIsRestricted(context, admin)` | "Мой админ" |
| `openAddTranslatorModal(context)` | Открыть модал переводчика |
| `editTranslator(context, translator)` | Редактировать переводчика |
| `saveTranslator(context)` | Сохранить переводчика |
| `deleteTranslator(context, translator)` | Удалить переводчика |
| `assignAccountsToAdmin(context, admin)` | Открыть модал назначения |
| `assignAccountsToAdminConfirm(context)` | Подтвердить назначение |
| `openTranslatorProfilesModal(context, translator)` | Модал анкет переводчика |
| `toggleTranslatorProfile(context, profileId)` | Переключить анкету |
| `saveTranslatorProfiles(context)` | Сохранить анкеты переводчика |

---

### 6. `components/billing.js` - Финансы

Биллинг, оплата и балансы.

| Функция | Описание |
|---------|----------|
| `loadUserBalance(context)` | Загрузить баланс |
| `loadPricing(context)` | Загрузить тарифы |
| `openExtendModal(context, account)` | Модал продления |
| `extendProfile(context)` | Продлить анкету |
| `startTrial(context, account)` | Активировать trial |
| `paySelectedProfiles(context)` | Оплатить выбранные |
| `openTopupModal(context, userId)` | Модал пополнения |
| `topupBalance(context)` | Пополнить баланс |
| `loadFinanceData(context)` | Загрузить данные финансов |
| `submitFinanceTopup(context)` | Отправить пополнение |
| `submitProfilePayment(context)` | Оплатить анкету (директор) |
| `removeProfilePayment(context)` | Снять оплату (директор) |

---

### 7. `components/bots.js` - Боты

Управление ботами и рассылкой.

| Функция | Описание |
|---------|----------|
| `loadBotsStatus(context)` | Загрузить статус ботов |
| `toggleBotStatus(context, bot)` | Переключить статус бота |
| `saveBotName(context, bot)` | Сохранить имя бота |
| `syncPromptWithBots(context)` | Синхронизировать промпт |
| `loadSavedPrompt(context)` | Загрузить промпт |
| `loadControlSettings(context)` | Загрузить настройки |
| `toggleMailingEnabled(context)` | Переключить рассылку |
| `toggleStopSpam(context)` | Переключить стоп-спам |
| `saveControlSettings(context)` | Сохранить настройки |
| `activatePanicMode(context)` | Режим паники |
| `loadBotLogs(context, reset)` | Загрузить логи ботов |
| `loadMoreBotLogs(context)` | Ещё логи |
| `loadErrorLogs(context, reset)` | Загрузить логи ошибок |
| `refreshAllLogs(context)` | Обновить все логи |

---

### 8. `components/settings.js` - Настройки

Настройки пользователя.

| Функция | Описание |
|---------|----------|
| `resetUserSettings(context)` | Сброс настроек |
| `saveUserSettings(context)` | Сохранить настройки |
| `logout(context)` | Выйти из системы |
| `loadFavoriteTemplates(context)` | Загрузить избранные шаблоны |
| `changeLanguage(context, lang)` | Сменить язык |
| `toggleSidebar(context)` | Переключить сайдбар |
| `initSettings(context)` | Инициализация настроек |

---

### 9. `index.js` - Точка входа

Главный модуль, объединяющий все компоненты в функцию `dashboard()` для Alpine.js.

```javascript
function dashboard() {
    const state = DashboardState.getInitialState();

    return {
        ...state,

        // Computed properties
        get filteredAccounts() { ... },
        get combinedFinanceHistory() { ... },

        // Инициализация
        async init() { ... },

        // Методы (делегируют компонентам)
        async loadDashboardStats(withFilters) {
            await StatsComponent.loadDashboardStats(this, withFilters);
        },
        // ...
    };
}
```

---

## Серверные изменения

### Новый Batch Endpoint

**`POST /api/billing/profiles-status`**

Получает статусы оплаты для нескольких анкет одним запросом.

```javascript
// Запрос
{
    "profileIds": ["12345", "12346", "12347"]
}

// Ответ
{
    "success": true,
    "statuses": {
        "12345": { "isPaid": true, "daysLeft": 25, ... },
        "12346": { "isPaid": false, "canTrial": true, ... },
        "12347": { "isFree": true, ... }
    }
}
```

**Расположение:** `Server/routes/billing.js`

---

## Преимущества новой архитектуры

### 1. Разделение ответственности
- Каждый компонент отвечает за свою область
- Легче находить и исправлять ошибки
- Проще добавлять новую функциональность

### 2. Переиспользование кода
- Утилиты в `utils.js` используются везде
- Нет дублирования логики форматирования и фильтрации

### 3. Производительность
- Batch endpoint для статусов оплаты (100+ запросов → 1)
- Возможность ленивой загрузки компонентов

### 4. Тестируемость
- Компоненты можно тестировать изолированно
- Чистые функции легко покрыть unit-тестами

### 5. Поддерживаемость
- Новые разработчики быстрее разбираются в коде
- Изменения в одном компоненте не ломают другие

---

## Порядок подключения скриптов

```html
<!-- 1. API модуль -->
<script src="public/js/api.js"></script>

<!-- 2. Утилиты -->
<script src="public/js/dashboard/utils.js"></script>

<!-- 3. Состояние -->
<script src="public/js/dashboard/state.js"></script>

<!-- 4. Компоненты -->
<script src="public/js/dashboard/components/stats.js"></script>
<script src="public/js/dashboard/components/profiles.js"></script>
<script src="public/js/dashboard/components/team.js"></script>
<script src="public/js/dashboard/components/billing.js"></script>
<script src="public/js/dashboard/components/bots.js"></script>
<script src="public/js/dashboard/components/settings.js"></script>

<!-- 5. Главный модуль -->
<script src="public/js/dashboard/index.js"></script>
```

---

## Миграция

Старый `dashboard.js` сохранён и закомментирован в HTML. При необходимости можно быстро откатиться:

```html
<!-- Раскомментировать для отката -->
<script src="public/js/dashboard.js"></script>
```

---

## Глобальные объекты

После загрузки доступны:

| Объект | Описание |
|--------|----------|
| `DashboardUtils` | Утилиты и хелперы |
| `DashboardState` | Управление состоянием |
| `StatsComponent` | Компонент статистики |
| `ProfilesComponent` | Компонент анкет |
| `TeamComponent` | Компонент команды |
| `BillingComponent` | Компонент финансов |
| `BotsComponent` | Компонент ботов |
| `SettingsComponent` | Компонент настроек |
| `dashboard()` | Главная функция для Alpine.js |
| `clientsComponent()` | Компонент CRM клиентов |

---

## Версионирование

| Версия | Дата | Описание |
|--------|------|----------|
| 1.0 | - | Монолитный dashboard.js |
| 2.0 | 2025-12-14 | Модульная архитектура |

---

## Контакты

При вопросах по архитектуре обращайтесь к документации или изучайте исходный код модулей.
