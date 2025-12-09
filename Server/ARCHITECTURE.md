# ARCHITECTURE.md - Документация структуры сервера

> **Версия**: 7.0 (Модульная архитектура)
> **Дата рефакторинга**: 2024-12-09
> **Node.js**: v22.21.1
> **Порт**: 3000

---

## СОДЕРЖАНИЕ

1. [Обзор структуры](#обзор-структуры)
2. [Файлы и их назначение](#файлы-и-их-назначение)
3. [Эндпоинты API](#эндпоинты-api)
4. [База данных](#база-данных)
5. [Константы и настройки](#константы-и-настройки)
6. [Как добавить новый функционал](#как-добавить-новый-функционал)
7. [Откат к старой версии](#откат-к-старой-версии)

---

## ОБЗОР СТРУКТУРЫ

```
Server/
├── server.js                 # Точка входа (77 строк)
├── server.js.backup          # Бэкап оригинального файла v6.0 (2224 строки)
├── ARCHITECTURE.md           # Этот файл - документация
│
├── config/
│   └── database.js           # Подключение к PostgreSQL
│
├── utils/
│   ├── prices.js             # Константы цен (PRICE_LETTER, PRICE_CHAT)
│   └── logger.js             # Функция logError для записи ошибок
│
├── models/
│   └── schema.js             # Инициализация всех таблиц БД (v6.0)
│
├── routes/
│   ├── auth.js               # Аутентификация (/api/login, /setup-director)
│   ├── team.js               # Управление командой (/api/team, /api/users)
│   ├── profiles.js           # Управление анкетами (/api/profiles)
│   ├── bot.js                # API для бота (heartbeat, messages, errors)
│   ├── stats.js              # Вся статистика (/api/stats/*)
│   ├── dashboard.js          # API личного кабинета (/api/dashboard, /api/bots)
│   └── utilities.js          # Утилиты (/reset-database, /recalculate-stats)
│
└── middleware/               # (зарезервировано для будущего)
```

---

## ФАЙЛЫ И ИХ НАЗНАЧЕНИЕ

### server.js (Точка входа)
**Строк**: ~77
**Что делает**: Инициализирует Express, подключает middleware, загружает все роуты.

```javascript
// Подключение:
const authRoutes = require('./routes/auth');
app.use(authRoutes);
```

---

### config/database.js
**Что делает**: Создает пул подключений к PostgreSQL.

```javascript
// Параметры подключения:
{
    user: 'postgres',
    host: 'localhost',
    database: 'ladabot_stats',
    password: 'mikmik98',
    port: 5432
}
```

**Экспортирует**: `pool` (pg.Pool)

---

### utils/prices.js
**Что делает**: Хранит константы цен для расчета дохода.

```javascript
const PRICE_LETTER = 1.5;   // Цена за письмо (outgoing)
const PRICE_CHAT = 0.15;    // Цена за сообщение в чат (chat_msg)
```

**Экспортирует**: `{ PRICE_LETTER, PRICE_CHAT }`

---

### utils/logger.js
**Что делает**: Записывает ошибки в таблицу `error_logs`.

```javascript
async function logError(endpoint, errorType, message, rawData, userId)
```

**Экспортирует**: `{ logError }`

---

### models/schema.js
**Что делает**: Создает все таблицы БД при запуске сервера.

**Таблицы**:
| Таблица | Назначение |
|---------|------------|
| `users` | Пользователи (директор, админ, переводчик) |
| `profiles` | Анкеты (новая схема) |
| `allowed_profiles` | Анкеты (legacy, основная) |
| `bots` | Информация о ботах |
| `bot_profiles` | Связь бота с анкетами |
| `activity_log` | Лог активности (ключевая таблица!) |
| `messages` | Сообщения (legacy) |
| `message_content` | Контент сообщений |
| `error_logs` | Логи ошибок |
| `heartbeats` | Heartbeat от ботов |
| `daily_stats` | Ежедневная статистика |

**Экспортирует**: `{ initDatabase }`

---

## ЭНДПОИНТЫ API

### routes/auth.js - Аутентификация

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/login` | Вход пользователя |
| GET | `/setup-director` | Создание директора (?user=&pass=) |
| GET | `/fix-password` | Сброс пароля на 12345 (?user=) |

---

### routes/team.js - Управление командой

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/team` | Список команды с статистикой |
| POST | `/api/users` | Создать пользователя |
| DELETE | `/api/users/:id` | Удалить пользователя |

---

### routes/profiles.js - Управление анкетами

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/profiles` | Список анкет с статистикой |
| POST | `/api/profiles/bulk` | Массовое добавление анкет |
| POST | `/api/profiles/assign` | Назначить анкеты пользователю |

---

### routes/bot.js - API для бота

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/message_sent` | Получить сообщение (legacy) |
| POST | `/api/heartbeat` | Heartbeat (legacy) |
| POST | `/api/error` | Логирование ошибок |
| POST | `/api/bot/heartbeat` | Heartbeat (новая схема) |
| POST | `/api/activity/log` | Логирование активности |
| POST | `/api/profile/status` | Обновить статус профиля |

---

### routes/stats.js - Статистика

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/stats/detailed` | Детальная статистика за 30 дней |
| GET | `/api/stats/daily` | Статистика по дням (для графиков) |
| GET | `/api/stats/top-profiles` | Топ анкет по доходу |
| GET | `/api/stats/translators` | Статистика переводчиков |
| GET | `/api/stats/admins` | Статистика админов |
| GET | `/api/stats/profile/:id` | Детали по конкретной анкете |
| GET | `/api/stats/forecast` | Прогноз дохода |
| GET | `/api/stats/hourly-activity` | Активность по часам (24 значения) |
| GET | `/api/stats/by-admin` | Статистика по админам |
| GET | `/api/stats/by-translator` | Статистика по переводчикам |

---

### routes/dashboard.js - Личный кабинет

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/dashboard` | Сводка для дашборда |
| GET | `/api/bots/status` | Статус всех ботов |
| GET | `/api/bots/:botId/stats` | Статистика конкретного бота |
| GET | `/api/activity/recent` | Последняя активность |
| GET | `/api/history` | История переписок |
| GET | `/api/error_logs` | Логи ошибок |

---

### routes/utilities.js - Утилиты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/reset-database` | СБРОС БАЗЫ ДАННЫХ (опасно!) |
| GET | `/recalculate-stats` | Пересчет ежедневной статистики |

---

## БАЗА ДАННЫХ

### Параметры подключения

```
Host: localhost
Port: 5432
Database: ladabot_stats
User: postgres
Password: mikmik98
```

### Схема таблиц

#### users
```sql
id SERIAL PRIMARY KEY
username VARCHAR(100) UNIQUE NOT NULL
password_hash VARCHAR(255) NOT NULL
login VARCHAR(100)
role VARCHAR(20) NOT NULL  -- 'director', 'admin', 'translator'
owner_id INTEGER REFERENCES users(id)
salary DECIMAL(10,2)
created_at TIMESTAMP
```

#### allowed_profiles
```sql
id SERIAL PRIMARY KEY
profile_id VARCHAR(100) UNIQUE NOT NULL
note TEXT
assigned_admin_id INTEGER
assigned_translator_id INTEGER
login VARCHAR(100)
password VARCHAR(100)
paused BOOLEAN DEFAULT FALSE
status VARCHAR(20) DEFAULT 'offline'
last_online TIMESTAMP
added_at TIMESTAMP
```

#### activity_log (ключевая таблица)
```sql
id SERIAL PRIMARY KEY
profile_id VARCHAR(100) NOT NULL
bot_id VARCHAR(100)
admin_id INTEGER
translator_id INTEGER
action_type VARCHAR(50) NOT NULL  -- 'letter', 'chat'
man_id VARCHAR(100)
message_text TEXT
response_time_sec INTEGER
used_ai BOOLEAN DEFAULT FALSE
income DECIMAL(10,2) DEFAULT 0
created_at TIMESTAMP
```

#### messages (legacy)
```sql
id SERIAL PRIMARY KEY
bot_id VARCHAR(50)
account_id VARCHAR(50)
type VARCHAR(20)  -- 'outgoing', 'chat_msg'
sender_id VARCHAR(50)
timestamp TIMESTAMP
response_time INTEGER
is_first_message BOOLEAN
is_last_message BOOLEAN
conversation_id VARCHAR(50)
message_length INTEGER
status VARCHAR(20) DEFAULT 'success'
message_content_id INTEGER
error_log_id INTEGER
```

#### heartbeats
```sql
id SERIAL PRIMARY KEY
bot_id VARCHAR(255) NOT NULL
account_display_id VARCHAR(255) NOT NULL
status VARCHAR(50)
ip VARCHAR(50)
version VARCHAR(50)
platform VARCHAR(100)
timestamp TIMESTAMP
created_at TIMESTAMP
```

---

## КОНСТАНТЫ И НАСТРОЙКИ

| Константа | Значение | Файл |
|-----------|----------|------|
| `PORT` | 3000 | server.js |
| `PRICE_LETTER` | 1.5 | utils/prices.js |
| `PRICE_CHAT` | 0.15 | utils/prices.js |
| `DB_HOST` | localhost | config/database.js |
| `DB_PORT` | 5432 | config/database.js |
| `DB_NAME` | ladabot_stats | config/database.js |
| `DB_USER` | postgres | config/database.js |
| `DB_PASS` | mikmik98 | config/database.js |

---

## КАК ДОБАВИТЬ НОВЫЙ ФУНКЦИОНАЛ

### Добавить новый эндпоинт

1. Определи, к какому модулю относится эндпоинт
2. Открой соответствующий файл в `routes/`
3. Добавь новый `router.get()` или `router.post()`
4. Обнови эту документацию

**Пример**:
```javascript
// routes/stats.js
router.get('/api/stats/new-endpoint', async (req, res) => {
    // твой код
    res.json({ success: true, data: result });
});
```

### Добавить новую таблицу

1. Открой `models/schema.js`
2. Добавь `CREATE TABLE IF NOT EXISTS` в функцию `initDatabase()`
3. Добавь индексы если нужно
4. Обнови эту документацию

### Добавить новую константу

1. Для цен: добавь в `utils/prices.js`
2. Для БД: добавь в `config/database.js`
3. Экспортируй и импортируй где нужно

---

## ОТКАТ К СТАРОЙ ВЕРСИИ

Если что-то пошло не так, можно вернуть оригинальный монолитный server.js:

```bash
cd /home/user/cabinet/Server
cp server.js.backup server.js
node server.js
```

---

## ЗАПУСК

```bash
cd /home/user/cabinet/Server
npm start
# или
node server.js
```

---

## ТЕСТИРОВАНИЕ

```bash
cd /home/user/cabinet/Server
npm test
# или
node test_bot_endpoints.js
```

---

## ЗАВИСИМОСТИ

```json
{
  "express": "^5.2.1",
  "pg": "^8.16.3",
  "sqlite3": "^5.1.7",
  "axios": "^1.13.2",
  "bcryptjs": "^3.0.3",
  "body-parser": "^2.2.1",
  "cors": "^2.8.5"
}
```

---

## ИСТОРИЯ ИЗМЕНЕНИЙ

| Версия | Дата | Описание |
|--------|------|----------|
| v6.0 | - | Монолитный server.js (2224 строки) |
| v7.0 | 2024-12-09 | Модульная архитектура (разделение на 12 файлов) |

---

## КАРТА ФАЙЛОВ (Что откуда перенесено)

| Из server.js (строки) | В файл | Описание |
|-----------------------|--------|----------|
| 1-33 | server.js | Middleware и настройки |
| 34-47 | utils/logger.js | Функция logError |
| 50-270 | models/schema.js | Инициализация БД |
| 274-336 | routes/auth.js | Аутентификация |
| 339-486 | routes/team.js | Управление командой |
| 489-619 | routes/profiles.js | Управление анкетами |
| 622-896 | routes/bot.js | API бота |
| 898-1523 | routes/stats.js | Статистика |
| 1526-1579 | routes/utilities.js | Утилиты |
| 1582-2163 | routes/dashboard.js | Личный кабинет |
| 2165-2224 | routes/dashboard.js | Логи ошибок и запуск |

---

**Автор рефакторинга**: Claude AI
**Запрос**: Разделить монолитный server.js на модули без потери функциональности
