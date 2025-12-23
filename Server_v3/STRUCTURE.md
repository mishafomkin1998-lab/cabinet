# Структура Server_v2

Express сервер для личного кабинета Novabot CRM.

## Дерево папок

```
Server_v2/
├── config/                 # Конфигурация
│   └── database.js         # Подключение к PostgreSQL
│
├── middleware/             # Middleware Express
│   ├── index.js            # Экспорт всех middleware
│   └── auth.js             # Авторизация, роли, rate-limit
│
├── migrations/             # Миграции базы данных
│   ├── index.js            # Основные миграции (главный файл)
│   ├── add_performance_indexes.js
│   ├── create_profile_bot_data.js
│   └── create_prompt_templates.js
│
├── routes/                 # API маршруты
│   ├── index.js            # Экспорт всех роутов
│   ├── auth.js             # Аутентификация (/api/login)
│   ├── activity.js         # Активность бота (heartbeat, messages)
│   ├── bots.js             # Статус ботов
│   ├── billing.js          # Биллинг и оплата
│   ├── botData.js          # Данные бота (шаблоны, blacklist)
│   ├── dashboard.js        # API для дашборда
│   ├── favoriteTemplates.js
│   ├── profiles.js         # Управление анкетами
│   ├── promptTemplates.js  # Шаблоны промптов AI
│   └── team.js             # Команда (админы, переводчики)
│
├── utils/                  # Утилиты
│   └── helpers.js          # Вспомогательные функции
│
├── views/                  # HTML страницы
│   ├── index.html          # Главная страница
│   ├── login.html          # Страница входа
│   ├── register.html       # Регистрация
│   ├── dashboard.html      # Личный кабинет (основной)
│   ├── upload.html         # Загрузка файлов
│   └── fileupload.html     # Загрузка файлов (альт.)
│
├── public/                 # Статические файлы
│   ├── css/                # Стили
│   │   ├── common.css      # Общие стили
│   │   └── dashboard.css   # Стили дашборда
│   ├── js/                 # JavaScript
│   │   ├── api.js          # API клиент
│   │   ├── config.js       # Конфигурация клиента
│   │   ├── dashboard.js    # Логика дашборда
│   │   ├── locales.js      # Локализация (ru/en)
│   │   └── types.js        # Типы данных
│   ├── images/             # Изображения
│   │   ├── logo.png
│   │   └── nova.png
│   ├── videos/             # Видео файлы
│   └── download/           # Файлы для скачивания
│
├── docs/                   # Документация
│   ├── BOT_INTEGRATION_GUIDE.md   # API интеграции бота
│   └── README_BOT_SETUP.md        # Настройка бота
│
├── scripts/                # Утилиты и скрипты
│   ├── check_data.js       # Проверка данных в БД
│   ├── cleanup_old_bots.js # Очистка старых ботов
│   ├── migration_heartbeats.js  # Миграция heartbeats
│   ├── test_bot_endpoints.js    # Тесты API
│   └── upgrade_database1.js     # Обновление БД
│
├── services/               # Бизнес-логика (TODO)
│
├── server.js               # Точка входа
├── package.json            # Зависимости npm
└── STRUCTURE.md            # Этот файл
```

## Компоненты

### config/database.js

Подключение к PostgreSQL:
```javascript
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'novabot',  // или ladabot_stats
    password: '...',
    port: 5432
});
```

### middleware/auth.js

| Функция | Описание |
|---------|----------|
| `requireAuth` | Проверка авторизации (userId) |
| `requireDirector` | Только директор |
| `requireAdmin` | Админ или директор |
| `validateFields(fields)` | Валидация обязательных полей |
| `rateLimit(max, window)` | Rate limiting |

### routes/

| Файл | Префикс | Описание |
|------|---------|----------|
| auth.js | `/` | Логин, профиль |
| activity.js | `/api`, `/api/activity` | Активность бота |
| bots.js | `/api/bots` | Статус ботов |
| billing.js | `/api/billing` | Оплата |
| botData.js | `/api/bot-data` | Данные бота |
| dashboard.js | `/api/dashboard` | Сводка |
| profiles.js | `/api/profiles` | Анкеты |
| team.js | `/api/team`, `/api/users` | Команда |

### utils/helpers.js

| Функция | Описание |
|---------|----------|
| `asyncHandler(fn)` | Обёртка для async роутов |
| `errorHandler` | Глобальный обработчик ошибок |
| `buildRoleFilter(role, userId, opts)` | SQL-фильтр по роли |
| `logError(...)` | Логирование ошибок в БД |
| `PRICE_LETTER` | Цена письма ($1.5) |
| `PRICE_CHAT` | Цена чата ($0.15) |

## API Endpoints

### Бот → Сервер

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/bot/heartbeat` | Heartbeat статуса |
| POST | `/api/heartbeat` | Heartbeat (legacy) |
| POST | `/api/message_sent` | Отправка сообщения |
| POST | `/api/profile/status` | Статус профиля |
| POST | `/api/error` | Логирование ошибки |

### Личный кабинет

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/login` | Вход |
| GET | `/api/dashboard` | Сводка |
| GET | `/api/profiles` | Список анкет |
| GET | `/api/bots/status` | Статус ботов |
| GET | `/api/team` | Команда |

## База данных

### Основные таблицы

| Таблица | Описание |
|---------|----------|
| `users` | Пользователи (директор, админы, переводчики) |
| `allowed_profiles` | Анкеты |
| `messages` | Сообщения |
| `message_content` | Контент сообщений |
| `heartbeats` | Heartbeats ботов |
| `error_logs` | Логи ошибок |
| `daily_stats` | Ежедневная статистика |
| `activity_log` | Лог активности |

### Связи

```
users (1) ──< allowed_profiles (N)
    assigned_translator_id → users.id
    assigned_admin_id → users.id

allowed_profiles (1) ──< messages (N)
    profile_id/account_id → allowed_profiles.profile_id

messages (1) ──< message_content (1)
    message_content_id → message_content.id
```

## Запуск

```bash
# Установка зависимостей
npm install

# Запуск сервера
npm start
# или
node server.js

# Тесты API бота
node scripts/test_bot_endpoints.js
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | 3000 | Порт сервера |
| `DB_HOST` | localhost | Хост БД |
| `DB_USER` | postgres | Пользователь БД |
| `DB_NAME` | novabot | Имя БД |

## Роли пользователей

| Роль | Права |
|------|-------|
| `director` | Полный доступ |
| `admin` | Свои переводчики + анкеты |
| `translator` | Только свои анкеты |

---

**Версия:** v7.0 (Модульная архитектура)
**Дата:** 2025-12-22
