# 📡 РУКОВОДСТВО ПО ИНТЕГРАЦИИ БОТА С СЕРВЕРОМ

## 🎯 Обзор

Сервер теперь поддерживает 3 эндпоинта для приема данных от бота:

1. **POST /api/message_sent** - статистика отправленных сообщений
2. **POST /api/heartbeat** - heartbeat каждые 30 секунд
3. **POST /api/error** - логирование ошибок бота

---

## 🚀 БЫСТРЫЙ СТАРТ

### 1. Установка зависимостей (если еще не установлены)

```bash
cd /home/user/Server
npm install
```

### 2. Запуск миграции базы данных (создание таблицы heartbeats)

```bash
node migration_heartbeats.js
```

**Примечание:** Таблица `heartbeats` также будет создана автоматически при первом запуске сервера.

### 3. Добавление тестовой анкеты в базу данных

Перед тестированием добавьте анкету в таблицу `allowed_profiles`:

```sql
-- Подключитесь к PostgreSQL
psql -U postgres -d ladabot_stats

-- Добавьте тестовую анкету
INSERT INTO allowed_profiles (profile_id, note)
VALUES ('TestProfile001', 'Тестовая анкета для бота');
```

### 4. Запуск сервера

```bash
node server.js
```

Вы должны увидеть:
```
🚀 CRM System v5.2 (Полная аналитика + Интеграция бота) запущен на порту 3000

📡 Эндпоинты для бота:
   • POST /api/message_sent - отправка данных о сообщениях
   • POST /api/heartbeat - heartbeat каждые 30 секунд
   • POST /api/error - логирование ошибок бота
```

### 5. Тестирование эндпоинтов

```bash
node test_bot_endpoints.js
```

---

## 📋 ДЕТАЛЬНАЯ ДОКУМЕНТАЦИЯ ЭНДПОИНТОВ

### 1️⃣ POST /api/message_sent

**Описание:** Отправка данных о каждом сообщении, отправленном ботом.

**URL:** `http://localhost:3000/api/message_sent`

**Формат запроса:**

```json
{
  "botId": "bot_1733248123456",
  "accountDisplayId": "Maria25",
  "recipientId": "12345678",
  "type": "outgoing",
  "length": 185,
  "isFirst": false,
  "isLast": false,
  "convId": "conv_bot_1733248123456_12345678",
  "responseTime": "00:05:30",
  "status": "success",
  "textContent": "Hello! Thank you for your message...",
  "mediaUrl": "photo.jpg",
  "fileName": "sunset.jpg",
  "translatorId": 42,
  "errorReason": null
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `botId` | string | Да | ID бота |
| `accountDisplayId` | string | Да | ID анкеты (должна быть в `allowed_profiles`) |
| `recipientId` | string | Да | ID получателя |
| `type` | string | Нет | `"outgoing"` (письмо, $1.5) или `"chat_msg"` (чат, $0.15) |
| `length` | integer | Нет | Длина сообщения в символах |
| `isFirst` | boolean | Нет | Первое сообщение в диалоге? |
| `isLast` | boolean | Нет | Последнее сообщение в диалоге? |
| `convId` | string | Нет | ID беседы для группировки |
| `responseTime` | string | Нет | Время ответа (формат: "00:05:30") |
| `status` | string | Нет | `"success"`, `"failed"`, или `"pending"` |
| `textContent` | string | Нет | Текст сообщения |
| `mediaUrl` | string | Нет | URL медиа-файла |
| `fileName` | string | Нет | Имя файла |
| `translatorId` | integer | Нет | ID переводчика |
| `errorReason` | string | Нет | Причина ошибки (если status="failed") |

**Ответы:**

✅ Успех:
```json
{
  "status": "ok",
  "contentId": 12345
}
```

⚠️ Анкета не найдена:
```json
{
  "status": "ignored"
}
```

❌ Ошибка:
```json
{
  "error": "Database error message"
}
```

---

### 2️⃣ POST /api/heartbeat

**Описание:** Heartbeat от бота каждые 30 секунд для отслеживания статуса.

**URL:** `http://localhost:3000/api/heartbeat`

**Формат запроса:**

```json
{
  "botId": "bot_1733248123456",
  "accountDisplayId": "Maria25",
  "status": "online",
  "timestamp": "2025-12-03T10:30:00.000Z",
  "ip": "127.0.0.1",
  "systemInfo": {
    "version": "10.0",
    "platform": "Win32"
  }
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `botId` | string | Да | ID бота |
| `accountDisplayId` | string | Да | ID анкеты |
| `status` | string | Нет | `"online"` или `"offline"` |
| `timestamp` | string | Нет | ISO timestamp |
| `ip` | string | Нет | IP адрес |
| `systemInfo.version` | string | Нет | Версия бота |
| `systemInfo.platform` | string | Нет | Платформа (Win32, Linux, etc.) |

**Ответ:**

```json
{
  "status": "ok"
}
```

---

### 3️⃣ POST /api/error

**Описание:** Логирование ошибок от бота.

**URL:** `http://localhost:3000/api/error`

**Формат запроса:**

```json
{
  "botId": "bot_1733248123456",
  "accountDisplayId": "Maria25",
  "endpoint": "bot_send_message",
  "errorType": "mail_send_error",
  "message": "API rate limit exceeded - 429 error",
  "rawData": null,
  "userId": null
}
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `botId` | string | Да | ID бота |
| `accountDisplayId` | string | Да | ID анкеты |
| `endpoint` | string | Нет | Название эндпоинта где произошла ошибка |
| `errorType` | string | Нет | Тип ошибки |
| `message` | string | Да | Описание ошибки |
| `rawData` | any | Нет | Дополнительные данные |
| `userId` | integer | Нет | ID пользователя |

**Ответ:**

```json
{
  "status": "ok"
}
```

---

## 📊 СТРУКТУРА БАЗЫ ДАННЫХ

### Таблица: `messages`

Хранит все сообщения, отправленные ботом.

```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    bot_id VARCHAR(50),
    account_id VARCHAR(50),
    type VARCHAR(20),
    sender_id VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_time INTERVAL,
    is_first_message BOOLEAN DEFAULT FALSE,
    is_last_message BOOLEAN DEFAULT FALSE,
    conversation_id VARCHAR(50),
    message_length INTEGER,
    read_status BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'success',
    message_content_id INTEGER,
    error_log_id INTEGER
);
```

### Таблица: `message_content`

Хранит контент сообщений.

```sql
CREATE TABLE message_content (
    id SERIAL PRIMARY KEY,
    text_content TEXT,
    media_url VARCHAR(255),
    file_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Таблица: `heartbeats`

Хранит heartbeats от бота.

```sql
CREATE TABLE heartbeats (
    id SERIAL PRIMARY KEY,
    bot_id VARCHAR(255) NOT NULL,
    account_display_id VARCHAR(255) NOT NULL,
    status VARCHAR(50),
    ip VARCHAR(50),
    version VARCHAR(50),
    platform VARCHAR(100),
    timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Таблица: `error_logs`

Хранит логи ошибок.

```sql
CREATE TABLE error_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    endpoint VARCHAR(100),
    error_type VARCHAR(100),
    message TEXT,
    raw_data JSONB,
    user_id INTEGER
);
```

---

## 🔍 ПОЛЕЗНЫЕ SQL ЗАПРОСЫ

### Статистика по анкетам за последние 24 часа

```sql
SELECT
    account_id,
    COUNT(*) as total_messages,
    SUM(CASE WHEN type = 'outgoing' THEN 1 ELSE 0 END) as mails,
    SUM(CASE WHEN type = 'chat_msg' THEN 1 ELSE 0 END) as chats,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as errors
FROM messages
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY account_id;
```

### Последние heartbeats от каждой анкеты

```sql
SELECT DISTINCT ON (account_display_id)
    account_display_id,
    status,
    timestamp,
    created_at
FROM heartbeats
ORDER BY account_display_id, created_at DESC;
```

### Топ ошибок за последние 24 часа

```sql
SELECT
    error_type,
    COUNT(*) as count
FROM error_logs
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY error_type
ORDER BY count DESC;
```

### История сообщений для конкретной анкеты

```sql
SELECT
    m.id,
    m.timestamp,
    m.type,
    m.status,
    mc.text_content,
    mc.media_url
FROM messages m
LEFT JOIN message_content mc ON m.message_content_id = mc.id
WHERE m.account_id = 'Maria25'
ORDER BY m.timestamp DESC
LIMIT 50;
```

---

## 🧪 ТЕСТИРОВАНИЕ

### Использование тестового скрипта

```bash
node test_bot_endpoints.js
```

### Тестирование с помощью curl

**Тест /api/message_sent:**

```bash
curl -X POST http://localhost:3000/api/message_sent \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "bot_test",
    "accountDisplayId": "TestProfile001",
    "recipientId": "12345",
    "type": "outgoing",
    "length": 100,
    "isFirst": true,
    "isLast": false,
    "convId": "conv_test_12345",
    "responseTime": null,
    "status": "success",
    "textContent": "Test message",
    "mediaUrl": null,
    "fileName": null,
    "translatorId": 1,
    "errorReason": null
  }'
```

**Тест /api/heartbeat:**

```bash
curl -X POST http://localhost:3000/api/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "bot_test",
    "accountDisplayId": "TestProfile001",
    "status": "online",
    "timestamp": "2025-12-03T10:00:00Z",
    "ip": "127.0.0.1",
    "systemInfo": {"version": "10.0", "platform": "Win32"}
  }'
```

**Тест /api/error:**

```bash
curl -X POST http://localhost:3000/api/error \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "bot_test",
    "accountDisplayId": "TestProfile001",
    "endpoint": "bot_send_message",
    "errorType": "network_error",
    "message": "Connection timeout"
  }'
```

---

## ⚠️ ВАЖНЫЕ ПРИМЕЧАНИЯ

1. **Регистрация анкет:** Все анкеты (`accountDisplayId`) ДОЛЖНЫ быть добавлены в таблицу `allowed_profiles` ПЕРЕД отправкой данных. Иначе сообщения будут игнорироваться со статусом `"ignored"`.

2. **Формат времени:** `responseTime` должен быть в формате PostgreSQL INTERVAL (например: `"00:05:30"` для 5 минут 30 секунд).

3. **Типы сообщений:**
   - `"outgoing"` = письмо (приносит $1.5 дохода)
   - `"chat_msg"` = чат (приносит $0.15 дохода)

4. **Обработка ошибок:** При `status = "failed"` ОБЯЗАТЕЛЬНО передавайте `errorReason` для аудита.

5. **Heartbeat частота:** Рекомендуется отправлять heartbeat каждые 30 секунд для каждой активной анкеты.

---

## 🐛 ОТЛАДКА

### Проверка логов сервера

Сервер выводит подробные логи для каждого запроса:

```
✅ Сообщение от бота bot_12345 для анкеты Maria25 сохранено (contentId: 789)
❤️ Heartbeat от Maria25: online
⚠️ Ошибка от бота bot_12345 (Maria25): network_error - Connection timeout
```

### Проверка таблиц в базе данных

```bash
psql -U postgres -d ladabot_stats

# Посмотреть последние сообщения
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10;

# Посмотреть последние heartbeats
SELECT * FROM heartbeats ORDER BY created_at DESC LIMIT 10;

# Посмотреть последние ошибки
SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT 10;
```

---

## 📞 ПОДДЕРЖКА

Если возникли проблемы:

1. Проверьте, что сервер запущен
2. Проверьте, что база данных доступна
3. Убедитесь, что анкета добавлена в `allowed_profiles`
4. Проверьте логи сервера
5. Запустите тестовый скрипт: `node test_bot_endpoints.js`

---

## 📝 ИСТОРИЯ ВЕРСИЙ

### v5.2 (Текущая)
- ✅ Добавлена поддержка эндпоинта `/api/message_sent` для бота
- ✅ Добавлен эндпоинт `/api/heartbeat`
- ✅ Добавлен эндпоинт `/api/error`
- ✅ Создана таблица `heartbeats`
- ✅ Улучшено логирование

### v5.1
- Полная аналитика CRM с логами и историей
