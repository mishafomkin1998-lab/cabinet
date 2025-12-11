# Nova Dashboard - Архитектура проекта

## Обзор

Nova Dashboard - это система управления анкетами для платформ знакомств (Nova/LadaDate).
Включает личный кабинет для директоров, админов и переводчиков.

## Структура проекта

```
cabinet/
├── Server/                    # Backend + Frontend
│   ├── server.js              # Точка входа Express сервера
│   ├── config/
│   │   └── database.js        # Подключение к PostgreSQL
│   ├── migrations/
│   │   └── index.js           # Миграции и создание таблиц БД
│   ├── routes/                # API маршруты
│   │   ├── auth.js            # Аутентификация
│   │   ├── profiles.js        # Управление анкетами
│   │   ├── team.js            # Управление командой (users)
│   │   ├── bots.js            # Управление ботами
│   │   ├── stats.js           # Статистика
│   │   ├── activity.js        # Логи активности
│   │   ├── billing.js         # Биллинг и оплата
│   │   └── favoriteTemplates.js
│   ├── public/                # Статические файлы
│   │   ├── css/
│   │   │   ├── common.css     # Общие стили
│   │   │   ├── dashboard.css  # Стили dashboard
│   │   │   └── admin.css      # Стили admin-dashboard
│   │   └── js/
│   │       ├── api.js         # Модуль API запросов
│   │       ├── dashboard.js   # Логика главного дашборда
│   │       └── admin.js       # Логика админ-панели
│   ├── dashboard.html         # Главный дашборд
│   ├── admin-dashboard.html   # Панель администратора
│   ├── login.html             # Страница входа
│   ├── register.html          # Страница регистрации
│   └── locales.js             # Локализация (ru/en/uk)
└── Bot/                       # Бот для работы с платформой
    ├── index.html             # Интерфейс бота
    └── main.js                # Логика бота
```

---

## Роли пользователей

### Director (Директор)
- **Создаёт**: Admin аккаунты
- **Видит**: Все анкеты, всех админов, всех переводчиков
- **Может**: Добавлять анкеты, назначать их админам, управлять биллингом
- **Доступ**: dashboard.html, admin-dashboard.html

### Admin (Админ)
- **Создаёт**: Translator аккаунты (свои переводчики)
- **Видит**: Только назначенные ему анкеты, только своих переводчиков
- **Может**: Распределять анкеты между переводчиками
- **Типы**:
  - **Обычный админ** (`is_restricted = false`) - платит за анкеты, имеет баланс
  - **Мой админ** (`is_restricted = true`) - анкеты бесплатно, без баланса
- **Доступ**: dashboard.html, admin-dashboard.html

### Translator (Переводчик)
- **Создаётся**: Админом
- **Видит**: Только назначенные ему анкеты
- **Может**: Работать с анкетами через бота
- **Доступ**: dashboard.html (ограниченный)

### Иерархия
```
Director
    └── Admin (owner_id = Director.id)
            └── Translator (owner_id = Admin.id)
```

---

## База данных (PostgreSQL)

### Таблица `users`
Все пользователи системы.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `username` | VARCHAR(100) | Имя пользователя (для отображения) |
| `login` | VARCHAR(100) | Логин для входа |
| `password_hash` | VARCHAR(255) | Хэш пароля (bcrypt) |
| `role` | VARCHAR(20) | Роль: 'director', 'admin', 'translator' |
| `owner_id` | INTEGER FK→users | ID владельца (для admin→director, translator→admin) |
| `salary` | DECIMAL(10,2) | Зарплата |
| `balance` | DECIMAL(10,2) | Баланс (для админов) |
| `is_restricted` | BOOLEAN | true = "мой админ" (анкеты бесплатно) |
| `ai_enabled` | BOOLEAN | Включен ли AI для переводчика |
| `avatar_url` | VARCHAR(500) | URL аватара |
| `created_at` | TIMESTAMP | Дата создания |

### Таблица `allowed_profiles`
Анкеты (профили) для работы.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `profile_id` | VARCHAR(100) UNIQUE | ID анкеты на платформе (например "nova_123456") |
| `login` | VARCHAR(100) | Логин анкеты на платформе |
| `password` | VARCHAR(100) | Пароль анкеты |
| `note` | TEXT | Заметка |
| `assigned_admin_id` | INTEGER FK→users | Назначенный админ |
| `assigned_translator_id` | INTEGER FK→users | Назначенный переводчик |
| `paused` | BOOLEAN | Приостановлена ли анкета |
| `status` | VARCHAR(20) | Статус: 'online', 'offline' |
| `last_online` | TIMESTAMP | Последний раз онлайн |
| `paid_until` | TIMESTAMP | Оплачено до (для биллинга) |
| `is_trial` | BOOLEAN | Пробный период |
| `trial_started_at` | TIMESTAMP | Начало пробного периода |
| `added_at` | TIMESTAMP | Дата добавления |

### Таблица `bots`
Запущенные боты.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `bot_id` | VARCHAR(100) UNIQUE | Идентификатор бота |
| `name` | VARCHAR(100) | Имя бота |
| `platform` | VARCHAR(100) | Платформа (Windows, etc.) |
| `ip` | VARCHAR(50) | IP адрес |
| `version` | VARCHAR(20) | Версия бота |
| `status` | VARCHAR(20) | Статус: 'online', 'offline' |
| `last_heartbeat` | TIMESTAMP | Последний heartbeat |
| `verified_profile_id` | VARCHAR(50) | Верифицированный ID анкеты |
| `profile_verified_at` | TIMESTAMP | Когда верифицирован |
| `created_at` | TIMESTAMP | Дата создания |

### Таблица `activity_log`
Лог активности (письма, чаты).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `profile_id` | VARCHAR(100) | ID анкеты |
| `bot_id` | VARCHAR(100) | ID бота |
| `admin_id` | INTEGER | ID админа |
| `translator_id` | INTEGER | ID переводчика |
| `action_type` | VARCHAR(50) | Тип: 'letter', 'chat', 'mail' |
| `man_id` | VARCHAR(100) | ID мужчины |
| `message_text` | TEXT | Текст сообщения |
| `response_time_sec` | INTEGER | Время ответа в секундах |
| `used_ai` | BOOLEAN | Использован ли AI |
| `income` | DECIMAL(10,2) | Доход |
| `created_at` | TIMESTAMP | Дата/время |

### Таблица `incoming_messages`
Входящие сообщения от мужчин.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `profile_id` | VARCHAR(100) | ID анкеты |
| `bot_id` | VARCHAR(100) | ID бота |
| `man_id` | VARCHAR(100) | ID мужчины |
| `man_name` | VARCHAR(255) | Имя мужчины |
| `platform_message_id` | VARCHAR(100) | ID сообщения на платформе |
| `type` | VARCHAR(20) | Тип: 'letter', 'chat' |
| `is_first_from_man` | BOOLEAN | Первое сообщение от мужчины |
| `admin_id` | INTEGER | ID админа |
| `translator_id` | INTEGER | ID переводчика |
| `created_at` | TIMESTAMP | Дата/время |

### Таблица `billing_history`
История пополнений баланса.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `admin_id` | INTEGER FK→users | ID админа |
| `amount` | DECIMAL(10,2) | Сумма |
| `by_user_id` | INTEGER FK→users | Кто пополнил |
| `note` | TEXT | Комментарий |
| `created_at` | TIMESTAMP | Дата |

### Таблица `profile_payment_history`
История оплаты анкет.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `profile_id` | VARCHAR(50) | ID анкеты |
| `days` | INTEGER | Дней оплачено |
| `action_type` | VARCHAR(20) | Тип: 'payment', 'trial', 'deletion_backup' |
| `by_user_id` | INTEGER FK→users | Кто оплатил |
| `note` | TEXT | Комментарий |
| `paid_until_backup` | TIMESTAMP | Бэкап даты оплаты (при удалении) |
| `created_at` | TIMESTAMP | Дата |

### Таблица `profile_actions`
История действий с анкетами.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `profile_id` | VARCHAR(100) | ID анкеты |
| `action_type` | VARCHAR(50) | Тип действия |
| `performed_by_id` | INTEGER | Кто выполнил |
| `performed_by_name` | VARCHAR(100) | Имя выполнившего |
| `details` | TEXT | Детали |
| `old_value` | TEXT | Старое значение |
| `new_value` | TEXT | Новое значение |
| `created_at` | TIMESTAMP | Дата |

### Таблица `daily_stats`
Ежедневная статистика по пользователям.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `user_id` | INTEGER FK→users | ID пользователя |
| `date` | DATE | Дата |
| `letters_count` | INTEGER | Количество писем |
| `chats_count` | INTEGER | Количество чатов |
| `unique_men` | INTEGER | Уникальных мужчин |
| `total_income` | DECIMAL(10,2) | Доход |
| `avg_response_time` | INTEGER | Среднее время ответа |
| `conversion_rate` | DECIMAL(5,2) | Конверсия |

### Таблица `settings`
Глобальные настройки.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PRIMARY KEY | Уникальный ID |
| `key` | VARCHAR(100) UNIQUE | Ключ настройки |
| `value` | TEXT | Значение |
| `updated_at` | TIMESTAMP | Дата обновления |

---

## API Endpoints

### Аутентификация (`/api/`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/login` | Вход в систему |
| PUT | `/api/user/profile` | Обновление профиля пользователя |
| GET | `/setup-director?user=&pass=` | Создание директора (для первого запуска) |

### Анкеты (`/api/profiles`)

| Метод | Путь | Описание | Параметры |
|-------|------|----------|-----------|
| GET | `/api/profiles` | Список анкет | `userId`, `role` |
| POST | `/api/profiles/bulk` | Массовое добавление | `profiles[]`, `note`, `adminId` |
| POST | `/api/profiles/assign` | Назначение анкет | `profileIds[]`, `targetUserId`, `roleTarget` |
| POST | `/api/profiles/assign-admin` | Назначить админу | `profileIds[]`, `adminId` |
| POST | `/api/profiles/assign-translator` | Назначить переводчику | `profileIds[]`, `translatorId` |
| POST | `/api/profiles/toggle-access` | Остановить/запустить | `profileId`, `paused` |
| DELETE | `/api/profiles/:profileId` | Удалить анкету | `userId`, `userName` |
| GET | `/api/profiles/:profileId/status` | Статус анкеты | - |
| GET | `/api/profiles/:profileId/ai-status` | Статус AI | - |
| GET | `/api/profiles/history` | История действий | `userId`, `role`, `limit` |

### Команда (`/api/team`)

| Метод | Путь | Описание | Параметры |
|-------|------|----------|-----------|
| GET | `/api/team` | Список команды | `userId`, `role` |
| POST | `/api/team` | Создать пользователя | `username`, `login`, `password`, `role`, `ownerId` |
| PUT | `/api/team/:id` | Редактировать | `username`, `password`, `salary` |
| DELETE | `/api/team/:id` | Удалить | - |
| GET | `/api/team/:id/profiles` | Анкеты админа | - |
| PUT | `/api/team/:id/profiles` | Назначить анкеты админу | `profileIds[]` |
| GET | `/api/team/translator/:id/profiles` | Анкеты переводчика | - |
| PUT | `/api/team/translator/:id/profiles` | Назначить переводчику | `profileIds[]` |

### Пользователи (`/api/users`)

| Метод | Путь | Описание | Параметры |
|-------|------|----------|-----------|
| POST | `/api/users` | Создать | `username`, `login`, `password`, `role`, `ownerId` |
| PUT | `/api/users/:id` | Редактировать | `username`, `password`, `salary` |
| DELETE | `/api/users/:id` | Удалить | - |

### Статистика (`/api/stats`)

| Метод | Путь | Описание | Параметры |
|-------|------|----------|-----------|
| GET | `/api/stats/dashboard` | Общая статистика | `userId`, `role`, `dateFrom`, `dateTo` |
| GET | `/api/stats/hourly-activity` | Почасовая активность | `userId`, `role`, `days` |
| GET | `/api/stats/translators` | Статистика переводчиков | `userId`, `role` |

### Боты (`/api/bots`)

| Метод | Путь | Описание | Параметры |
|-------|------|----------|-----------|
| GET | `/api/bots/status` | Статус всех ботов | `userId`, `role` |
| POST | `/api/bots/:id/toggle` | Вкл/выкл бота | `enabled` |
| PUT | `/api/bots/:id/name` | Изменить имя | `name` |
| PUT | `/api/bots/update-all` | Обновить все боты | настройки |
| POST | `/api/bots/sync-prompt` | Синхронизировать промпт | `prompt` |

### Активность (`/api/activity`)

| Метод | Путь | Описание | Параметры |
|-------|------|----------|-----------|
| GET | `/api/activity/recent` | Последняя активность | `userId`, `role`, `limit` |
| GET | `/api/history` | История | `userId`, `role`, `limit` |

### Биллинг (`/api/billing`)

| Метод | Путь | Описание | Параметры |
|-------|------|----------|-----------|
| GET | `/api/billing/profile-status/:profileId` | Статус оплаты анкеты | - |
| POST | `/api/billing/add-balance` | Пополнить баланс | `adminId`, `amount`, `note` |
| POST | `/api/billing/pay-profile` | Оплатить анкету | `profileId`, `days` |

---

## Frontend Architecture

### Страницы

1. **login.html** - Страница входа
2. **dashboard.html** - Главный дашборд (для всех ролей)
3. **admin-dashboard.html** - Панель администратора

### JavaScript Модули

#### api.js
Централизованный модуль для API запросов.

```javascript
// Использование
const data = await api.profiles.list(userId, role);
const result = await api.team.create({ username, login, password, role, ownerId });
await api.post('/api/custom-endpoint', { data });
```

#### dashboard.js / admin.js
Alpine.js компоненты с логикой страниц.

### CSS Структура

- **common.css** - Общие стили (glass, buttons, menu, dark theme)
- **dashboard.css** - Специфичные стили для dashboard
- **admin.css** - Специфичные стили для admin-dashboard

### Локализация

Файл `locales.js` содержит переводы на ru/en/uk.

```javascript
LOCALES.ru.menu.statistics // "Статистика"
LOCALES.en.menu.statistics // "Statistics"
```

---

## Потоки данных

### Добавление анкеты (Director)
```
1. Director вводит ID анкеты
2. POST /api/profiles/bulk
3. Создаётся запись в allowed_profiles
4. Логируется в profile_actions
```

### Назначение анкеты админу
```
1. Director выбирает анкеты
2. POST /api/profiles/assign-admin
3. UPDATE allowed_profiles SET assigned_admin_id = ?
4. Админ видит анкеты в своём dashboard
```

### Назначение анкеты переводчику
```
1. Admin выбирает анкеты
2. PUT /api/team/translator/:id/profiles
3. UPDATE allowed_profiles SET assigned_translator_id = ?
4. Переводчик видит анкеты в своём dashboard
```

### Heartbeat от бота
```
1. Бот отправляет POST /api/bot/heartbeat
2. Обновляется bots.last_heartbeat
3. Dashboard показывает бот как "online"
```

### Логирование активности
```
1. Бот отправляет POST /api/activity/log
2. Создаётся запись в activity_log
3. Обновляется статистика на dashboard
```

---

## Безопасность

### Аутентификация
- Пароли хэшируются bcrypt (10 rounds)
- Сессия хранится в localStorage/sessionStorage как `novaUser`
- При загрузке страницы проверяется `novaUser.loggedIn`

### Авторизация
- Роли проверяются на клиенте (x-show) и сервере (filter в SQL)
- Director видит всё
- Admin видит только свои анкеты (`assigned_admin_id = userId`)
- Translator видит только свои анкеты (`assigned_translator_id = userId`)

### Защита от подмены ID
- Бот верифицирует `profile_id` при первом запуске
- Хранится в `bots.verified_profile_id`
