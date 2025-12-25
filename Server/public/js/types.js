/**
 * ============================================
 * NOVA DASHBOARD - TYPE DEFINITIONS
 * ============================================
 *
 * Этот файл содержит JSDoc определения типов данных.
 * Используется для документации и автодополнения в IDE.
 *
 * Подключение: <script src="public/js/types.js"></script>
 */

// ============================================
// ENUMS (Перечисления)
// ============================================

/**
 * Роли пользователей
 * @readonly
 * @enum {string}
 */
const UserRole = {
    /** Директор - полный доступ */
    DIRECTOR: 'director',
    /** Админ - управляет переводчиками */
    ADMIN: 'admin',
    /** Переводчик - работает с анкетами */
    TRANSLATOR: 'translator'
};

/**
 * Статусы анкеты/бота
 * @readonly
 * @enum {string}
 */
const Status = {
    ONLINE: 'online',
    OFFLINE: 'offline'
};

/**
 * Типы активности
 * @readonly
 * @enum {string}
 */
const ActionType = {
    /** Письмо */
    LETTER: 'letter',
    /** Чат сообщение */
    CHAT: 'chat',
    /** Рассылка */
    MAIL: 'mail'
};

/**
 * Типы действий с анкетой
 * @readonly
 * @enum {string}
 */
const ProfileActionType = {
    /** Добавление */
    ADD: 'add',
    /** Удаление */
    DELETE: 'delete',
    /** Назначение админа */
    ASSIGN_ADMIN: 'assign_admin',
    /** Назначение переводчика */
    ASSIGN_TRANSLATOR: 'assign_translator',
    /** Оплата */
    PAYMENT: 'payment',
    /** Пробный период */
    TRIAL: 'trial'
};

// ============================================
// USER TYPES (Пользователи)
// ============================================

/**
 * Данные авторизованного пользователя (из localStorage)
 * @typedef {Object} AuthUser
 * @property {number} id - ID пользователя
 * @property {string} username - Имя пользователя
 * @property {UserRole} role - Роль: 'director', 'admin', 'translator'
 * @property {boolean} loggedIn - Авторизован ли
 * @property {string|null} [avatar_url] - URL аватара
 */

/**
 * Полные данные пользователя (из API /api/team)
 * @typedef {Object} User
 * @property {number} id - ID пользователя
 * @property {string} username - Имя пользователя (для отображения)
 * @property {string} login - Логин для входа
 * @property {UserRole} role - Роль
 * @property {number|null} owner_id - ID владельца (director для admin, admin для translator)
 * @property {number|null} salary - Зарплата
 * @property {number} balance - Баланс (для админов)
 * @property {boolean} is_restricted - true = "мой админ" (анкеты бесплатно)
 * @property {number} accounts_count - Количество назначенных анкет
 * @property {number} letters_today - Писем сегодня
 * @property {number} chats_today - Чатов сегодня
 * @property {number} conversion - Конверсия в %
 * @property {string[]} accounts - Массив ID анкет
 * @property {string} created_at - Дата создания
 */

/**
 * Данные для создания пользователя
 * @typedef {Object} CreateUserData
 * @property {string} username - Имя пользователя
 * @property {string} login - Логин для входа
 * @property {string} password - Пароль (будет захэширован)
 * @property {UserRole} role - Роль
 * @property {number} ownerId - ID владельца
 * @property {number} [salary] - Зарплата
 * @property {boolean} [isRestricted] - Мой админ
 * @property {boolean} [aiEnabled] - Включен ли AI
 */

/**
 * Данные для обновления пользователя
 * @typedef {Object} UpdateUserData
 * @property {string} [username] - Новое имя
 * @property {string} [password] - Новый пароль
 * @property {number} [salary] - Новая зарплата
 */

// ============================================
// PROFILE TYPES (Анкеты)
// ============================================

/**
 * Анкета (профиль) из API /api/profiles
 * @typedef {Object} Profile
 * @property {string} profile_id - ID анкеты на платформе (например "nova_123456")
 * @property {string|null} login - Логин анкеты на платформе
 * @property {string|null} password - Пароль анкеты
 * @property {Status} status - Статус: 'online', 'offline'
 * @property {string|null} last_online - Последний раз онлайн (ISO date)
 * @property {number} letters_today - Писем сегодня
 * @property {number} letters_total - Всего писем
 * @property {number} chats_today - Чатов сегодня
 * @property {number} incoming_today - Входящих сегодня
 * @property {number} incoming_total - Всего входящих
 * @property {number|null} admin_id - ID назначенного админа
 * @property {string|null} admin_name - Имя админа
 * @property {boolean} admin_is_restricted - Админ = "мой админ"
 * @property {number|null} translator_id - ID назначенного переводчика
 * @property {string|null} trans_name - Имя переводчика
 * @property {string} added_at - Дата добавления (ISO date)
 * @property {string|null} note - Заметка
 * @property {boolean} paused - Приостановлена ли
 */

/**
 * Расширенные данные анкеты с биллингом
 * @typedef {Object} ProfileWithBilling
 * @property {string} profile_id - ID анкеты
 * @property {boolean} isPaid - Оплачена ли
 * @property {boolean} isFree - Бесплатная (для "мой админ")
 * @property {boolean} isTrial - Пробный период
 * @property {string|null} paid_until - Оплачено до (ISO date)
 * @property {number|null} daysRemaining - Осталось дней
 */

/**
 * Данные для массового добавления анкет
 * @typedef {Object} BulkAddProfilesData
 * @property {string[]} profiles - Массив ID анкет
 * @property {string} [note] - Заметка
 * @property {number} [adminId] - ID админа для назначения
 * @property {number} userId - ID текущего пользователя
 * @property {string} userName - Имя текущего пользователя
 */

// ============================================
// BOT TYPES (Боты)
// ============================================

/**
 * Бот из API /api/bots/status
 * @typedef {Object} Bot
 * @property {number} id - ID в базе
 * @property {string} bot_id - Идентификатор бота
 * @property {string|null} name - Имя бота
 * @property {string|null} platform - Платформа (Windows, etc.)
 * @property {string|null} ip - IP адрес
 * @property {string|null} version - Версия бота
 * @property {Status} status - Статус: 'online', 'offline'
 * @property {string|null} last_heartbeat - Последний heartbeat (ISO date)
 * @property {string|null} verified_profile_id - Верифицированный ID анкеты
 * @property {string} created_at - Дата создания
 * @property {string[]} profiles - Связанные анкеты
 */

// ============================================
// ACTIVITY TYPES (Активность)
// ============================================

/**
 * Запись активности
 * @typedef {Object} ActivityLog
 * @property {number} id - ID записи
 * @property {string} profile_id - ID анкеты
 * @property {string|null} bot_id - ID бота
 * @property {number|null} admin_id - ID админа
 * @property {number|null} translator_id - ID переводчика
 * @property {ActionType} action_type - Тип: 'letter', 'chat', 'mail'
 * @property {string|null} man_id - ID мужчины
 * @property {string|null} message_text - Текст сообщения
 * @property {number|null} response_time_sec - Время ответа в секундах
 * @property {boolean} used_ai - Использован ли AI
 * @property {number} income - Доход
 * @property {string} created_at - Дата/время (ISO date)
 */

/**
 * Входящее сообщение
 * @typedef {Object} IncomingMessage
 * @property {number} id - ID записи
 * @property {string} profile_id - ID анкеты
 * @property {string|null} bot_id - ID бота
 * @property {string} man_id - ID мужчины
 * @property {string|null} man_name - Имя мужчины
 * @property {string} type - Тип: 'letter', 'chat'
 * @property {boolean} is_first_from_man - Первое сообщение от мужчины
 * @property {string} created_at - Дата/время
 */

// ============================================
// STATS TYPES (Статистика)
// ============================================

/**
 * Общая статистика дашборда
 * @typedef {Object} DashboardStats
 * @property {number} totalProfiles - Всего анкет
 * @property {number} activeProfiles - Активных анкет
 * @property {number} lettersToday - Писем сегодня
 * @property {number} chatsToday - Чатов сегодня
 * @property {number} incomingToday - Входящих сегодня
 * @property {number} uniqueMenToday - Уникальных мужчин
 * @property {number} totalIncome - Общий доход
 * @property {number} avgResponseTime - Среднее время ответа
 * @property {number} onlineBots - Ботов онлайн
 */

/**
 * Статистика переводчика
 * @typedef {Object} TranslatorStats
 * @property {number} id - ID переводчика
 * @property {string} username - Имя
 * @property {number} letters - Писем
 * @property {number} chats - Чатов
 * @property {number} avgResponseTime - Среднее время ответа (мин)
 * @property {number} totalIncome - Доход
 */

/**
 * Почасовая активность
 * @typedef {Object} HourlyActivity
 * @property {number} hour - Час (0-23)
 * @property {number} letters - Количество писем
 * @property {number} chats - Количество чатов
 */

// ============================================
// BILLING TYPES (Биллинг)
// ============================================

/**
 * Статус оплаты анкеты
 * @typedef {Object} ProfilePaymentStatus
 * @property {boolean} isPaid - Оплачена ли
 * @property {boolean} isFree - Бесплатная (для "мой админ")
 * @property {boolean} isTrial - Пробный период
 * @property {string|null} paid_until - Оплачено до
 * @property {number|null} daysRemaining - Осталось дней
 * @property {boolean} trialAvailable - Доступен ли пробный период
 */

/**
 * История пополнения баланса
 * @typedef {Object} BillingHistoryItem
 * @property {number} id - ID записи
 * @property {number} admin_id - ID админа
 * @property {number} amount - Сумма
 * @property {number|null} by_user_id - Кто пополнил
 * @property {string|null} note - Комментарий
 * @property {string} created_at - Дата
 */

// ============================================
// HISTORY TYPES (История)
// ============================================

/**
 * Запись истории действий с анкетой
 * @typedef {Object} ProfileActionHistory
 * @property {number} id - ID записи
 * @property {string} profile_id - ID анкеты
 * @property {ProfileActionType} action_type - Тип действия
 * @property {string} performed_by - Кто выполнил
 * @property {string|null} details - Детали
 * @property {string|null} old_value - Старое значение
 * @property {string|null} new_value - Новое значение
 * @property {string} created_at - Дата
 */

// ============================================
// API RESPONSE TYPES (Ответы API)
// ============================================

/**
 * Базовый ответ API
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Успешно ли
 * @property {string} [error] - Сообщение об ошибке
 */

/**
 * Ответ со списком
 * @template T
 * @typedef {Object} ApiListResponse
 * @property {boolean} success - Успешно ли
 * @property {T[]} list - Список элементов
 * @property {string} [error] - Сообщение об ошибке
 */

/**
 * Ответ со статистикой
 * @typedef {Object} ApiStatsResponse
 * @property {boolean} success - Успешно ли
 * @property {DashboardStats} stats - Статистика
 * @property {string} [error] - Сообщение об ошибке
 */

// ============================================
// UI STATE TYPES (Состояние UI)
// ============================================

/**
 * Фильтры статистики
 * @typedef {Object} StatsFilter
 * @property {string} dateFrom - Дата от (YYYY-MM-DD)
 * @property {string} dateTo - Дата до (YYYY-MM-DD)
 * @property {number|string} admin - ID админа или ''
 * @property {number|string} translator - ID переводчика или ''
 */

/**
 * Состояние модального окна
 * @typedef {Object} ModalState
 * @property {boolean} show - Показано ли
 * @property {boolean} loading - Загрузка
 * @property {string|null} error - Ошибка
 */

/**
 * Настройки пользователя
 * @typedef {Object} UserSettings
 * @property {string} username - Имя
 * @property {string} currentPassword - Текущий пароль
 * @property {string} newPassword - Новый пароль
 * @property {string} newPasswordConfirm - Подтверждение пароля
 * @property {string} avatarUrl - URL аватара
 */

// ============================================
// EXPORTS
// ============================================

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        UserRole,
        Status,
        ActionType,
        ProfileActionType
    };
}
