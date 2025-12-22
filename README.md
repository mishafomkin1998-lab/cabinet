# Novabot

Система для управления анкетами на платформе LadaDate.

## Структура проекта

```
cabinet/
├── Bot/                    # Electron бот (PRODUCTION)
├── Bot_v2/                 # Electron бот (DEVELOPMENT)
├── Server/                 # Express сервер (PRODUCTION)
├── Server_v2/              # Express сервер (DEVELOPMENT)
├── docs/                   # Документация
│   ├── ARCHITECTURE.md     # Архитектура системы
│   └── DEVELOPMENT.md      # Руководство разработчика
├── CLAUDE.md               # Инструкции для Claude Code
└── DEVELOPMENT_RULES.md    # Правила разработки
```

## Компоненты

| Компонент | Описание | Технологии |
|-----------|----------|------------|
| **Bot** | Electron приложение для отправки сообщений | Electron, JavaScript |
| **Server** | API сервер + личный кабинет | Express, PostgreSQL |

## Серверы

| Назначение | IP | База данных |
|------------|-----|-------------|
| Production | 188.137.253.169 | ladabot_stats |
| Development | 188.137.254.179 | novabot |

## Правила разработки

- **PRODUCTION** (`Bot/`, `Server/`) - НЕ РЕДАКТИРОВАТЬ
- **DEVELOPMENT** (`Bot_v2/`, `Server_v2/`) - разработка здесь

Подробнее: см. `DEVELOPMENT_RULES.md`

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [Руководство разработчика](docs/DEVELOPMENT.md)
- [Инструкции для Claude](CLAUDE.md)

## Версия

- **Bot**: v1.3.0
- **Server**: v10.1
