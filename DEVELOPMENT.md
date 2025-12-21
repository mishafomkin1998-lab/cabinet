# NOVA DASHBOARD - Руководство по разработке

## Содержание

1. [Быстрый старт](#быстрый-старт)
2. [Структура проекта](#структура-проекта)
3. [Добавление нового пункта меню](#добавление-нового-пункта-меню)
4. [Добавление новой секции контента](#добавление-новой-секции-контента)
5. [Добавление нового API endpoint](#добавление-нового-api-endpoint)
6. [Добавление модального окна](#добавление-модального-окна)
7. [Работа с базой данных](#работа-с-базой-данных)
8. [Шаблоны кода](#шаблоны-кода)
9. [Частые ошибки](#частые-ошибки)
10. [Чеклист перед коммитом](#чеклист-перед-коммитом)

---

## Быстрый старт

### Запуск проекта

```bash
# 1. Установка зависимостей
cd Server
npm install

# 2. Настройка переменных окружения
cp .env.example .env
# Отредактировать .env

# 3. Запуск сервера
npm start
# или для разработки
npm run dev
```

### Где что находится

| Что нужно изменить | Где искать |
|-------------------|------------|
| Интерфейс директора | `Server/dashboard.html`, `Server/public/js/dashboard.js` |
| Интерфейс админа | `Server/admin-dashboard.html`, `Server/public/js/admin.js` |
| Общие стили | `Server/public/css/common.css` |
| API endpoints | `Server/routes/*.js` |
| База данных | `Server/migrations/index.js`, `Server/db/queries.js` |
| Конфигурация | `Server/public/js/config.js` |
| Типы данных | `Server/public/js/types.js` |

---

## Структура проекта

```
Server/
├── app.js                 # Главный файл сервера Express
├── routes/
│   ├── auth.js           # Авторизация (/api/login, /api/user/profile)
│   ├── profiles.js       # Анкеты (/api/profiles/*)
│   ├── team.js           # Команда (/api/team/*, /api/users/*)
│   ├── bots.js           # Боты (/api/bots/*)
│   ├── stats.js          # Статистика (/api/stats/*)
│   └── billing.js        # Биллинг (/api/billing/*)
├── db/
│   ├── index.js          # Подключение к PostgreSQL
│   └── queries.js        # SQL запросы
├── migrations/
│   └── index.js          # Создание таблиц БД
├── public/
│   ├── css/
│   │   ├── common.css    # Общие стили (467 строк)
│   │   ├── dashboard.css # Стили только для dashboard
│   │   └── admin.css     # Стили только для admin-dashboard
│   └── js/
│       ├── config.js     # Константы и хелперы
│       ├── types.js      # JSDoc определения типов
│       ├── api.js        # Централизованный API модуль
│       ├── dashboard.js  # Логика dashboard.html
│       └── admin.js      # Логика admin-dashboard.html
├── dashboard.html        # Интерфейс директора
└── admin-dashboard.html  # Интерфейс админа
```

---

## Добавление нового пункта меню

### Шаг 1: Добавить пункт в HTML

Найти секцию `<nav class="menu">` и добавить новый пункт:

```html
<!-- dashboard.html или admin-dashboard.html -->
<nav class="menu">
    <!-- Существующие пункты... -->

    <!-- НОВЫЙ ПУНКТ -->
    <a href="#"
       class="menu-item"
       :class="{ active: currentSection === 'новая_секция' }"
       @click.prevent="currentSection = 'новая_секция'">
        <i class="fas fa-star"></i>
        <span>Название пункта</span>
    </a>
</nav>
```

### Шаг 2: Добавить секцию контента

```html
<!-- После других секций -->
<section x-show="currentSection === 'новая_секция'"
         x-transition:enter="transition-all duration-300"
         class="content-section">

    <div class="section-header">
        <h1 class="section-title">
            <i class="fas fa-star"></i>
            Заголовок секции
        </h1>
    </div>

    <div class="content-area">
        <!-- Контент секции -->
    </div>
</section>
```

### Шаг 3: Инициализация данных (если нужно)

В `x-data` добавить переменные состояния:

```javascript
// В начале x-data объекта
новаяСекцияДанные: [],
новаяСекцияLoading: false,

// Добавить метод загрузки
async loadНоваяСекция() {
    this.новаяСекцияLoading = true;
    try {
        const response = await fetch('/api/новый-endpoint');
        const data = await response.json();
        if (data.success) {
            this.новаяСекцияДанные = data.list;
        }
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    } finally {
        this.новаяСекцияLoading = false;
    }
}
```

---

## Добавление новой секции контента

### Полный шаблон секции с таблицей

```html
<section x-show="currentSection === 'новая_секция'"
         x-transition:enter="transition-all duration-300"
         class="content-section">

    <!-- Заголовок -->
    <div class="section-header">
        <h1 class="section-title">
            <i class="fas fa-list"></i>
            Название секции
        </h1>
        <div class="header-actions">
            <button class="glow-button" @click="openAddModal()">
                <i class="fas fa-plus"></i>
                Добавить
            </button>
        </div>
    </div>

    <!-- Фильтры (опционально) -->
    <div class="filters-row glass" style="margin-bottom: 1.5rem; padding: 1rem;">
        <div class="filter-group">
            <label>Поиск:</label>
            <input type="text"
                   x-model="searchQuery"
                   @input.debounce.300ms="filterData()"
                   placeholder="Поиск...">
        </div>
        <div class="filter-group">
            <label>Статус:</label>
            <select x-model="statusFilter" @change="filterData()">
                <option value="">Все</option>
                <option value="active">Активные</option>
                <option value="inactive">Неактивные</option>
            </select>
        </div>
    </div>

    <!-- Таблица -->
    <div class="glass table-container">
        <!-- Индикатор загрузки -->
        <template x-if="dataLoading">
            <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                Загрузка...
            </div>
        </template>

        <!-- Таблица с данными -->
        <template x-if="!dataLoading">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Название</th>
                        <th>Статус</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    <template x-for="item in filteredData" :key="item.id">
                        <tr>
                            <td x-text="item.id"></td>
                            <td x-text="item.name"></td>
                            <td>
                                <span class="status-badge"
                                      :class="item.status === 'active' ? 'status-online' : 'status-offline'"
                                      x-text="item.status === 'active' ? 'Активен' : 'Неактивен'">
                                </span>
                            </td>
                            <td>
                                <button class="btn-icon" @click="editItem(item)" title="Редактировать">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon btn-danger" @click="deleteItem(item.id)" title="Удалить">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    </template>

                    <!-- Пустое состояние -->
                    <template x-if="filteredData.length === 0">
                        <tr>
                            <td colspan="4" class="empty-state">
                                <i class="fas fa-inbox"></i>
                                <p>Нет данных</p>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </template>
    </div>
</section>
```

### Полный шаблон секции с карточками

```html
<section x-show="currentSection === 'cards_section'"
         x-transition:enter="transition-all duration-300"
         class="content-section">

    <div class="section-header">
        <h1 class="section-title">
            <i class="fas fa-th-large"></i>
            Карточки
        </h1>
    </div>

    <!-- Сетка карточек -->
    <div class="cards-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        <template x-for="card in cardsData" :key="card.id">
            <div class="glass card-item" style="padding: 1.5rem;">
                <div class="card-header" style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                    <h3 x-text="card.title"></h3>
                    <span class="status-badge"
                          :class="card.active ? 'status-online' : 'status-offline'">
                        <span x-text="card.active ? 'Активен' : 'Неактивен'"></span>
                    </span>
                </div>
                <div class="card-body">
                    <p x-text="card.description"></p>
                </div>
                <div class="card-footer" style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn-small" @click="editCard(card)">
                        <i class="fas fa-edit"></i> Редактировать
                    </button>
                    <button class="btn-small btn-danger" @click="deleteCard(card.id)">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        </template>
    </div>
</section>
```

---

## Добавление нового API endpoint

### Шаг 1: Создать роут в Express

Создать новый файл или добавить в существующий в `Server/routes/`:

```javascript
// Server/routes/новый_модуль.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /api/новый-endpoint
 * Получить список элементов
 *
 * Query params:
 *   - userId: number (required)
 *   - status: string (optional)
 *
 * Response:
 *   { success: true, list: Item[] }
 */
router.get('/новый-endpoint', async (req, res) => {
    try {
        const { userId, status } = req.query;

        // Валидация
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        // SQL запрос
        let query = 'SELECT * FROM items WHERE user_id = $1';
        const params = [userId];

        if (status) {
            query += ' AND status = $2';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            list: result.rows
        });

    } catch (error) {
        console.error('Error in /api/новый-endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

/**
 * POST /api/новый-endpoint
 * Создать новый элемент
 *
 * Body:
 *   - name: string (required)
 *   - description: string (optional)
 *   - userId: number (required)
 *
 * Response:
 *   { success: true, item: Item }
 */
router.post('/новый-endpoint', async (req, res) => {
    try {
        const { name, description, userId } = req.body;

        // Валидация
        if (!name || !userId) {
            return res.status(400).json({
                success: false,
                error: 'name and userId are required'
            });
        }

        // Вставка в БД
        const result = await pool.query(
            `INSERT INTO items (name, description, user_id, created_at)
             VALUES ($1, $2, $3, NOW())
             RETURNING *`,
            [name, description || null, userId]
        );

        res.json({
            success: true,
            item: result.rows[0]
        });

    } catch (error) {
        console.error('Error in POST /api/новый-endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

/**
 * PUT /api/новый-endpoint/:id
 * Обновить элемент
 */
router.put('/новый-endpoint/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const result = await pool.query(
            `UPDATE items
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [name, description, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Item not found'
            });
        }

        res.json({
            success: true,
            item: result.rows[0]
        });

    } catch (error) {
        console.error('Error in PUT /api/новый-endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

/**
 * DELETE /api/новый-endpoint/:id
 * Удалить элемент
 */
router.delete('/новый-endpoint/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM items WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Item not found'
            });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Error in DELETE /api/новый-endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

module.exports = router;
```

### Шаг 2: Подключить роут в app.js

```javascript
// Server/app.js
const новыйМодуль = require('./routes/новый_модуль');

// После других роутов
app.use('/api', новыйМодуль);
```

### Шаг 3: Добавить в config.js

```javascript
// Server/public/js/config.js
API: {
    // Существующие...

    // Новые endpoints
    НОВЫЙ_ENDPOINT: '/api/новый-endpoint',
    НОВЫЙ_ENDPOINT_BY_ID: (id) => `/api/новый-endpoint/${id}`,
}
```

### Шаг 4: Добавить в api.js (опционально)

```javascript
// Server/public/js/api.js
const api = {
    // Существующие методы...

    новыйМодуль: {
        async list(userId, status = null) {
            const params = { userId };
            if (status) params.status = status;
            return api.get(CONFIG.API.НОВЫЙ_ENDPOINT, params);
        },

        async create(data) {
            return api.post(CONFIG.API.НОВЫЙ_ENDPOINT, data);
        },

        async update(id, data) {
            return api.put(CONFIG.API.НОВЫЙ_ENDPOINT_BY_ID(id), data);
        },

        async delete(id) {
            return api.delete(CONFIG.API.НОВЫЙ_ENDPOINT_BY_ID(id));
        }
    }
};
```

---

## Добавление модального окна

### Шаблон модального окна

```html
<!-- В конце body, перед закрывающим </div> Alpine.js -->

<!-- Модальное окно -->
<div x-show="showМодальноеОкно"
     x-transition:enter="transition-opacity duration-200"
     x-transition:leave="transition-opacity duration-200"
     class="modal-overlay"
     @click.self="closeМодальноеОкно()">

    <div class="modal glass"
         x-transition:enter="transition-transform duration-200"
         x-transition:enter-start="scale-95 opacity-0"
         x-transition:enter-end="scale-100 opacity-100"
         style="max-width: 500px;">

        <!-- Заголовок -->
        <div class="modal-header">
            <h2 x-text="editingItem ? 'Редактировать' : 'Добавить'"></h2>
            <button class="modal-close" @click="closeМодальноеОкно()">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Тело модального окна -->
        <div class="modal-body">
            <!-- Сообщение об ошибке -->
            <div x-show="modalError" class="alert alert-error" x-text="modalError"></div>

            <!-- Форма -->
            <form @submit.prevent="saveМодальноеОкно()">
                <div class="form-group">
                    <label>Название <span class="required">*</span></label>
                    <input type="text"
                           x-model="formData.name"
                           required
                           placeholder="Введите название">
                </div>

                <div class="form-group">
                    <label>Описание</label>
                    <textarea x-model="formData.description"
                              rows="3"
                              placeholder="Введите описание"></textarea>
                </div>

                <div class="form-group">
                    <label>Статус</label>
                    <select x-model="formData.status">
                        <option value="active">Активен</option>
                        <option value="inactive">Неактивен</option>
                    </select>
                </div>

                <!-- Чекбокс -->
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" x-model="formData.enabled">
                        <span>Включено</span>
                    </label>
                </div>
            </form>
        </div>

        <!-- Футер -->
        <div class="modal-footer">
            <button type="button"
                    class="btn-secondary"
                    @click="closeМодальноеОкно()">
                Отмена
            </button>
            <button type="button"
                    class="glow-button"
                    @click="saveМодальноеОкно()"
                    :disabled="modalLoading">
                <template x-if="modalLoading">
                    <i class="fas fa-spinner fa-spin"></i>
                </template>
                <span x-text="editingItem ? 'Сохранить' : 'Добавить'"></span>
            </button>
        </div>
    </div>
</div>
```

### JavaScript для модального окна

```javascript
// В x-data объекте

// Состояние модального окна
showМодальноеОкно: false,
modalLoading: false,
modalError: '',
editingItem: null,
formData: {
    name: '',
    description: '',
    status: 'active',
    enabled: true
},

// Открыть для добавления
openAddModal() {
    this.editingItem = null;
    this.formData = {
        name: '',
        description: '',
        status: 'active',
        enabled: true
    };
    this.modalError = '';
    this.showМодальноеОкно = true;
},

// Открыть для редактирования
openEditModal(item) {
    this.editingItem = item;
    this.formData = {
        name: item.name,
        description: item.description || '',
        status: item.status,
        enabled: item.enabled
    };
    this.modalError = '';
    this.showМодальноеОкно = true;
},

// Закрыть
closeМодальноеОкно() {
    this.showМодальноеОкно = false;
    this.editingItem = null;
    this.modalError = '';
},

// Сохранить
async saveМодальноеОкно() {
    // Валидация
    if (!this.formData.name.trim()) {
        this.modalError = 'Название обязательно';
        return;
    }

    this.modalLoading = true;
    this.modalError = '';

    try {
        const url = this.editingItem
            ? `/api/items/${this.editingItem.id}`
            : '/api/items';

        const method = this.editingItem ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...this.formData,
                userId: this.currentUser.id
            })
        });

        const data = await response.json();

        if (data.success) {
            this.closeМодальноеОкно();
            await this.loadItems(); // Перезагрузить данные
            this.showNotification(
                this.editingItem ? 'Изменения сохранены' : 'Элемент добавлен',
                'success'
            );
        } else {
            this.modalError = data.error || 'Ошибка сохранения';
        }
    } catch (error) {
        console.error('Save error:', error);
        this.modalError = 'Ошибка сети';
    } finally {
        this.modalLoading = false;
    }
}
```

---

## Работа с базой данных

### Создание новой таблицы

Добавить в `Server/migrations/index.js`:

```javascript
// В функции runMigrations()

// Новая таблица
await pool.query(`
    CREATE TABLE IF NOT EXISTS новая_таблица (
        id SERIAL PRIMARY KEY,

        -- Основные поля
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'active',

        -- Связи
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        profile_id VARCHAR(100) REFERENCES allowed_profiles(profile_id) ON DELETE SET NULL,

        -- Флаги
        is_active BOOLEAN DEFAULT true,
        is_deleted BOOLEAN DEFAULT false,

        -- Числовые данные
        amount DECIMAL(10, 2) DEFAULT 0,
        count INTEGER DEFAULT 0,

        -- Даты
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
    )
`);
console.log('Table новая_таблица created');

// Индексы для производительности
await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_новая_таблица_user_id
    ON новая_таблица(user_id)
`);

await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_новая_таблица_status
    ON новая_таблица(status)
    WHERE is_deleted = false
`);
```

### Типичные SQL запросы

```javascript
// Получить с JOIN
const result = await pool.query(`
    SELECT
        t.*,
        u.username as user_name,
        p.profile_id
    FROM новая_таблица t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN allowed_profiles p ON t.profile_id = p.profile_id
    WHERE t.is_deleted = false
    ORDER BY t.created_at DESC
    LIMIT $1 OFFSET $2
`, [limit, offset]);

// Подсчёт с группировкой
const stats = await pool.query(`
    SELECT
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
    FROM новая_таблица
    WHERE user_id = $1
      AND created_at >= $2
      AND is_deleted = false
    GROUP BY status
`, [userId, startDate]);

// Обновление с условием
const updated = await pool.query(`
    UPDATE новая_таблица
    SET
        status = $1,
        updated_at = NOW()
    WHERE id = ANY($2::int[])
      AND user_id = $3
    RETURNING id
`, [newStatus, ids, userId]);

// Мягкое удаление
await pool.query(`
    UPDATE новая_таблица
    SET
        is_deleted = true,
        deleted_at = NOW()
    WHERE id = $1
`, [id]);

// Upsert (вставить или обновить)
await pool.query(`
    INSERT INTO новая_таблица (name, user_id, count)
    VALUES ($1, $2, 1)
    ON CONFLICT (name, user_id)
    DO UPDATE SET
        count = новая_таблица.count + 1,
        updated_at = NOW()
`, [name, userId]);
```

---

## Шаблоны кода

### Уведомления (Toast)

```javascript
// Показать уведомление
showNotification(message, type = 'info') {
    // type: 'success', 'error', 'warning', 'info'
    this.notification = { message, type, show: true };
    setTimeout(() => {
        this.notification.show = false;
    }, 3000);
}

// Использование
this.showNotification('Успешно сохранено!', 'success');
this.showNotification('Ошибка при сохранении', 'error');
```

### Подтверждение удаления

```javascript
async deleteItem(id) {
    if (!confirm('Вы уверены, что хотите удалить этот элемент?')) {
        return;
    }

    try {
        const response = await fetch(`/api/items/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            // Удалить из локального массива
            this.items = this.items.filter(item => item.id !== id);
            this.showNotification('Элемент удалён', 'success');
        } else {
            this.showNotification(data.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        this.showNotification('Ошибка сети', 'error');
    }
}
```

### Debounce для поиска

```html
<!-- В HTML -->
<input type="text"
       x-model="searchQuery"
       @input.debounce.300ms="filterData()">
```

```javascript
// В JavaScript
filterData() {
    const query = this.searchQuery.toLowerCase().trim();

    this.filteredItems = this.items.filter(item => {
        // Поиск по нескольким полям
        return item.name.toLowerCase().includes(query) ||
               item.description?.toLowerCase().includes(query) ||
               item.id.toString().includes(query);
    });
}
```

### Пагинация

```javascript
// Состояние
currentPage: 1,
itemsPerPage: 20,
totalItems: 0,

// Вычисляемые свойства
get totalPages() {
    return Math.ceil(this.totalItems / this.itemsPerPage);
},

get paginatedItems() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredItems.slice(start, start + this.itemsPerPage);
},

// Методы
goToPage(page) {
    if (page >= 1 && page <= this.totalPages) {
        this.currentPage = page;
    }
},

nextPage() {
    this.goToPage(this.currentPage + 1);
},

prevPage() {
    this.goToPage(this.currentPage - 1);
}
```

```html
<!-- Пагинация в HTML -->
<div class="pagination" x-show="totalPages > 1">
    <button @click="prevPage()" :disabled="currentPage === 1">
        <i class="fas fa-chevron-left"></i>
    </button>

    <template x-for="page in totalPages" :key="page">
        <button @click="goToPage(page)"
                :class="{ active: currentPage === page }"
                x-text="page">
        </button>
    </template>

    <button @click="nextPage()" :disabled="currentPage === totalPages">
        <i class="fas fa-chevron-right"></i>
    </button>
</div>
```

### Форматирование данных

```javascript
// Дата
formatDate(date, includeTime = false) {
    if (!date) return '-';
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();

    if (includeTime) {
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
    return `${day}.${month}.${year}`;
}

// Деньги
formatMoney(amount, currency = '$') {
    return `${currency}${(amount || 0).toFixed(2)}`;
}

// Время ответа
formatResponseTime(seconds) {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}м ${secs}с` : `${secs}с`;
}
```

---

## Частые ошибки

### 1. Забыли добавить userId в запрос

❌ **Неправильно:**
```javascript
const response = await fetch('/api/profiles');
```

✅ **Правильно:**
```javascript
const response = await fetch(`/api/profiles?userId=${this.currentUser.id}&role=${this.currentUser.role}`);
```

### 2. Не обработали ошибку API

❌ **Неправильно:**
```javascript
const data = await response.json();
this.items = data.list; // Если success: false, list может быть undefined
```

✅ **Правильно:**
```javascript
const data = await response.json();
if (data.success) {
    this.items = data.list;
} else {
    this.showNotification(data.error || 'Ошибка загрузки', 'error');
}
```

### 3. Мутация массива без реактивности

❌ **Неправильно:**
```javascript
this.items[index].status = 'active'; // Alpine.js может не отследить
```

✅ **Правильно:**
```javascript
// Вариант 1: Создать новый массив
this.items = this.items.map((item, i) =>
    i === index ? { ...item, status: 'active' } : item
);

// Вариант 2: Использовать $nextTick
this.items[index].status = 'active';
this.$nextTick(() => { /* обновление */ });
```

### 4. Неправильная проверка роли

❌ **Неправильно:**
```javascript
if (this.currentUser.role == 'director') // Опечатка возможна
```

✅ **Правильно:**
```javascript
if (this.currentUser.role === CONFIG.ROLES.DIRECTOR)
// или
if (isDirector(this.currentUser))
```

### 5. SQL инъекция

❌ **Неправильно:**
```javascript
await pool.query(`SELECT * FROM users WHERE id = ${userId}`);
```

✅ **Правильно:**
```javascript
await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### 6. Забыли await

❌ **Неправильно:**
```javascript
this.loadProfiles(); // Выполнится асинхронно, данные могут не загрузиться
this.renderTable();  // Выполнится сразу с пустыми данными
```

✅ **Правильно:**
```javascript
await this.loadProfiles();
this.renderTable();
```

---

## Чеклист перед коммитом

### Функциональность
- [ ] Функция работает для всех ролей (director, admin, translator)
- [ ] Обработаны все ошибки API
- [ ] Показаны уведомления пользователю
- [ ] Работает на мобильных устройствах

### Код
- [ ] Нет console.log() отладочных сообщений
- [ ] Нет закомментированного кода
- [ ] Используются константы из CONFIG
- [ ] SQL запросы параметризованы ($1, $2)

### UI/UX
- [ ] Есть индикатор загрузки
- [ ] Есть состояние "пусто" если нет данных
- [ ] Кнопки блокируются во время загрузки
- [ ] Модальные окна закрываются по ESC и клику вне

### Безопасность
- [ ] Проверяется userId/role на сервере
- [ ] Нет чувствительных данных в console.log
- [ ] Пароли не отправляются в открытом виде в GET параметрах

### База данных
- [ ] Добавлены нужные индексы
- [ ] Есть каскадное удаление или SET NULL для FK
- [ ] Миграция добавлена в migrations/index.js

---

## Полезные команды

```bash
# Перезапуск сервера
pm2 restart nova-server

# Логи сервера
pm2 logs nova-server

# Подключение к БД
psql -U nova -d nova_dashboard

# Бэкап БД
pg_dump -U nova nova_dashboard > backup.sql

# Восстановление БД
psql -U nova nova_dashboard < backup.sql
```

---

## Контакты и поддержка

При возникновении вопросов обращайтесь к документации:
- `ARCHITECTURE.md` - архитектура проекта
- `Server/public/js/types.js` - типы данных
- `Server/public/js/config.js` - константы
