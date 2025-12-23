# CLAUDE.md - Документация для Claude Code

---

## ⛔⛔⛔ КРИТИЧЕСКИЕ ПРАВИЛА РАЗРАБОТКИ ⛔⛔⛔

### РАЗРЕШЕНО РЕДАКТИРОВАТЬ (DEVELOPMENT):
```
/home/user/cabinet/Bot_v3/     ← РАБОТАЕМ ЗДЕСЬ
/home/user/cabinet/Server_v3/  ← РАБОТАЕМ ЗДЕСЬ
```

### КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО РЕДАКТИРОВАТЬ:

```
/home/user/cabinet/Bot/        ← PRODUCTION - НЕ ТРОГАТЬ!!!
/home/user/cabinet/Server/     ← PRODUCTION - НЕ ТРОГАТЬ!!!
/home/user/cabinet/Bot_v2/     ← BACKUP - НЕ ТРОГАТЬ!!!
/home/user/cabinet/Server_v2/  ← BACKUP - НЕ ТРОГАТЬ!!!
```

### ПЕРЕД ЛЮБЫМ РЕДАКТИРОВАНИЕМ:

1. **ПРОВЕРЬ ПУТЬ!** Разрешены ТОЛЬКО пути с `_v3`
2. Если путь содержит `/Bot/`, `/Server/`, `/Bot_v2/`, `/Server_v2/` - **ОТКАЗАТЬСЯ!**
3. Анализировать можно ВСЁ, редактировать - ТОЛЬКО v3!

---

## Структура проекта

```
/home/user/cabinet/
│
├── Bot/                    # PRODUCTION - НЕ ТРОГАТЬ!
├── Server/                 # PRODUCTION - НЕ ТРОГАТЬ!
│
├── Bot_v2/                 # BACKUP - НЕ ТРОГАТЬ!
├── Server_v2/              # BACKUP - НЕ ТРОГАТЬ!
│
├── Bot_v3/                 # DEVELOPMENT - Работаем здесь
│   ├── main.js             # Electron main process
│   ├── index.html          # UI интерфейс
│   ├── package.json        # Зависимости npm
│   ├── css/bot.css         # Стили + темы
│   ├── Sound/              # Звуки уведомлений
│   └── js/modules/         # ВСЯ ЛОГИКА БОТА
│       ├── config.js       # Глобальные переменные
│       ├── utils.js        # Утилиты
│       ├── api.js          # API функции
│       ├── logger.js       # Logger уведомлений
│       ├── minichat.js     # MiniChat
│       ├── ai.js           # AI генерация
│       ├── settings.js     # Настройки
│       ├── AccountBot.js   # ЯДРО ЛОГИКИ
│       ├── main.js         # UI функции
│       └── init.js         # Инициализация
│
├── Server_v3/              # DEVELOPMENT - Работаем здесь (порт 3001)
│   ├── server.js           # Точка входа
│   ├── routes/             # API маршруты
│   ├── config/database.js  # PostgreSQL подключение
│   ├── public/             # Frontend статика
│   └── views/              # HTML шаблоны
│
└── CLAUDE.md               # Этот файл
```

---

## Назначение версий

| Версия | Назначение | Статус |
|--------|------------|--------|
| `Bot/` + `Server/` | PRODUCTION | Работает у клиентов |
| `Bot_v2/` + `Server_v2/` | BACKUP | Резервная копия |
| `Bot_v3/` + `Server_v3/` | DEVELOPMENT | Свободная разработка |

---

## Обзор проекта

**Novabot** - Electron приложение для управления анкетами на платформе LadaDate.
Позволяет автоматически отправлять письма (Mail) и сообщения в чат (Chat) от имени женских анкет.

**Server** - Express.js сервер с личным кабинетом для управления анкетами, статистикой и биллингом.

---

## Порты серверов

| Версия | Порт |
|--------|------|
| Server (production) | 3000 |
| Server_v3 (development) | 3001 |

---

## База данных

Все версии используют **одну и ту же PostgreSQL базу данных**.

Конфигурация: `Server_v3/config/database.js`

---

## Порядок загрузки модулей бота

```
1. config.js      → Глобальные переменные
2. utils.js       → Утилиты
3. api.js         → API функции
4. logger.js      → Система уведомлений
5. minichat.js    → MiniChat
6. ai.js          → AI генерация
7. settings.js    → Настройки
8. AccountBot.js  → ЯДРО ЛОГИКИ
9. main.js        → UI функции
10. init.js       → Инициализация
```

**ВАЖНО:** Порядок критичен! Каждый модуль зависит от предыдущих.

---

## Ключевые файлы для редактирования

### Bot_v3:

| Файл | Описание |
|------|----------|
| `js/modules/AccountBot.js` | Основная логика бота |
| `js/modules/api.js` | API запросы к серверу |
| `js/modules/main.js` | UI и интерфейс |
| `js/modules/settings.js` | Настройки |
| `js/modules/config.js` | Константы и переменные |
| `index.html` | Интерфейс |
| `main.js` | Electron main process |

### Server_v3:

| Файл | Описание |
|------|----------|
| `server.js` | Точка входа |
| `routes/*.js` | API эндпоинты |
| `public/js/*.js` | Frontend логика |
| `views/*.html` | HTML страницы |
| `config/database.js` | Подключение к БД |

---

## Команды запуска

### Server_v3:
```bash
cd Server_v3
npm install
npm start          # или: node server.js
```

### Bot_v3:
```bash
cd Bot_v3
npm install
npm start          # Запуск Electron
npm run build      # Сборка
```

---

## Важные константы

```javascript
// Bot_v3/js/modules/config.js
const LABABOT_SERVER = 'http://188.137.254.179:3000';  // Production сервер
const LADADATE_BASE_URL = 'https://ladadate.com';
```

---

## Версия документации

- **Дата обновления:** 2025-12-23
- **Автор:** Claude Code
