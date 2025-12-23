# ПРАВИЛА РАЗРАБОТКИ - ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ

## КРИТИЧЕСКИ ВАЖНО

### ЗАПРЕЩЕНО РЕДАКТИРОВАТЬ:
```
/home/user/cabinet/Bot/        ← PRODUCTION! НЕ ТРОГАТЬ!
/home/user/cabinet/Server/     ← PRODUCTION! НЕ ТРОГАТЬ!
```

### РАЗРЕШЕНО РЕДАКТИРОВАТЬ:
```
/home/user/cabinet/Bot_v2/     ← Копия для разработки
/home/user/cabinet/Server_v2/  ← Копия для разработки
```

---

## Структура проекта

| Папка | Статус | Сервер | База данных |
|-------|--------|--------|-------------|
| `Bot/` + `Server/` | PRODUCTION (работает!) | 188.137.253.169 | ladabot_stats |
| `Bot_v2/` + `Server_v2/` | DEVELOPMENT (разработка) | 188.137.254.179 | novabotbase |

---

## Правила для Claude Code

1. **НИКОГДА** не редактировать файлы в `Bot/` и `Server/`
2. **ВСЕ** изменения делать только в `Bot_v2/` и `Server_v2/`
3. Перед любым редактированием проверять путь файла
4. Если путь начинается с `/home/user/cabinet/Bot/` или `/home/user/cabinet/Server/` - **ОТКАЗАТЬСЯ** от редактирования

---

## Проверка перед редактированием

```
✅ МОЖНО: /home/user/cabinet/Bot_v2/js/modules/config.js
✅ МОЖНО: /home/user/cabinet/Server_v2/server.js
✅ МОЖНО: /home/user/cabinet/Server_v2/config/database.js

❌ НЕЛЬЗЯ: /home/user/cabinet/Bot/js/modules/config.js
❌ НЕЛЬЗЯ: /home/user/cabinet/Server/server.js
❌ НЕЛЬЗЯ: /home/user/cabinet/Server/config/database.js
```

---

## План миграции

1. Разрабатываем и тестируем в `*_v2/` версиях
2. Тестируем на новом сервере (188.137.254.179)
3. Когда всё готово - переключаем DNS домена novabot.com.ua на новый IP
4. Все пользователи автоматически переходят на новый сервер

---

## Дата создания: 2024-12-21
## Автор: Claude Code
