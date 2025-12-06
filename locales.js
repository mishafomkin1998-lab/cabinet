/**
 * Nova Dashboard - Localization System
 * Languages: Russian (ru), English (en), Ukrainian (uk)
 */

const LOCALES = {
    // ============================================
    // RUSSIAN (Default)
    // ============================================
    ru: {
        // Page
        pageTitle: 'Личный кабинет - Nova',

        // Menu items
        menu: {
            statistics: 'Статистика',
            profiles: 'Анкеты',
            control: 'Управление',
            team: 'Команда',
            monitoring: 'Мониторинг',
            training: 'Обучение',
            history: 'История'
        },

        // Page titles and subtitles
        pages: {
            stats: { title: 'Статистика', subtitle: 'Общая статистика работы' },
            accounts: { title: 'Анкеты', subtitle: 'Управление анкетами' },
            control: { title: 'Управление', subtitle: 'Настройки и боты' },
            team: { title: 'Команда', subtitle: 'Управление командой' },
            monitoring: { title: 'Мониторинг', subtitle: 'Отслеживание активности' },
            training: { title: 'Обучение', subtitle: 'Обучение и документация' },
            history: { title: 'История', subtitle: 'История изменений' }
        },

        // Common words
        common: {
            all: 'Все',
            search: 'Поиск',
            save: 'Сохранить',
            cancel: 'Отмена',
            delete: 'Удалить',
            edit: 'Редактировать',
            add: 'Добавить',
            close: 'Закрыть',
            refresh: 'Обновить',
            export: 'Выгрузить',
            loading: 'Загрузка данных...',
            noData: 'Нет данных',
            today: 'Сегодня',
            week: 'Неделя',
            month: 'Месяц',
            thisMonth: 'Этот месяц',
            selectPeriod: 'Выбрать период',
            from: 'От',
            to: 'До',
            yes: 'Да',
            no: 'Нет',
            actions: 'Действия',
            status: 'Статус',
            date: 'Дата',
            time: 'Время',
            details: 'Детали',
            comment: 'Комментарий',
            name: 'Имя',
            login: 'Логин',
            password: 'Пароль',
            selected: 'Выбрано'
        },

        // User roles
        roles: {
            director: 'Директор',
            admin: 'Администратор',
            translator: 'Переводчик'
        },

        // Statistics section
        stats: {
            totalProfiles: 'Всего анкет',
            incomingLetters: 'Входящих писем',
            chats: 'Чатов',
            medianTime: 'Медианное время',
            avgTime: 'Среднее время',
            uniqueMen: 'Уникальных мужчин',
            botsStatus: 'Статус ботов',
            workTime: 'Время работы',
            online: 'Онлайн',
            idle: 'Ожидание',
            offline: 'Оффлайн',
            peakHours: 'Пиковые часы активности',
            advancedStats: 'Расширенная статистика',
            forMonth: 'За месяц',
            loaded: 'Загружено',
            medianResponseTime: 'Медианное время ответа оператора',
            compareTranslators: 'Сравнение переводчиков',
            letters: 'Писем',
            income: 'Доход'
        },

        // Profiles section
        profiles: {
            searchPlaceholder: 'Поиск по ID или логину...',
            addProfile: 'Добавить',
            id: 'ID',
            loginCol: 'Логин',
            passwordCol: 'Пароль',
            statusCol: 'Статус',
            lastOnline: 'Дата онлайн',
            incoming: 'Входящие',
            admin: 'Админ',
            addedDate: 'Дата добавления',
            commentCol: 'Комментарий',
            notAssigned: 'Не назначен',
            profileStatuses: {
                online: 'Свободна',
                working: 'В работе',
                offline: 'Оффлайн',
                inactive: 'Неактивна'
            }
        },

        // Control section
        control: {
            activeSessions: 'Активные сессии',
            mailingSettings: 'Настройки рассылки',
            enableMailing: 'Включить рассылку',
            autoMessages: 'Автоматические сообщения',
            stopSpam: 'Остановить спам',
            onComplaints: 'При жалобах',
            panicMode: 'Panic Mode',
            updateAllBots: 'Обновить все боты',
            generationPrompt: 'Промт для генерации',
            promptPlaceholder: 'Введите промт для генерации ответов...',
            promptSync: 'Синхронизируется с промтом "Generate" в боте',
            syncWithBots: 'Синхронизировать с ботами',
            botActive: 'Активен',
            botInactive: 'Неактивен',
            turnOff: 'Выключить',
            activate: 'Активировать',
            ip: 'IP',
            version: 'Версия',
            profilesCount: 'Анкет',
            lastHeartbeat: 'Последний отклик',
            botName: 'Название бота'
        },

        // Team section
        team: {
            teamManagement: 'Управление командой',
            addAdmin: 'Добавить админа',
            profiles: 'анкет',
            conversion: 'Конверсия',
            editBtn: 'Редактировать',
            profilesBtn: 'Анкеты',
            viewBtn: 'Просмотреть',
            translators: 'Переводчики',
            myAdmin: 'Мой админ',
            noAccessNote: 'без доступа к добавлению анкет и финансам',
            amount: 'Сумма',
            aiEnabled: 'Разрешить использование ИИ'
        },

        // Monitoring section
        monitoring: {
            allAdmins: 'Все Админы',
            allTranslators: 'Все Переводчики',
            lastResponses: 'Последние ответы',
            sentLetters: 'Отправленные письма',
            favoriteMailing: 'Любимая рассылка',
            workTimeBtn: 'Время работы',
            aiUsage: 'Использование ИИ',
            lastResponsesTitle: 'Последние ответы (письма/чаты)',
            sentLettersTitle: 'Отправленные письма',
            favoriteMailingTitle: 'Любимая рассылка',
            workTimeTitle: 'Время реальной работы',
            aiUsageTitle: 'Использование ИИ',
            response: 'Ответ',
            profile: 'Анкета',
            man: 'Мужчина',
            textNotSaved: '(текст не сохранён)',
            noResponses: 'Нет данных об ответах',
            noLetters: 'Нет отправленных писем за выбранный период',
            noFavorites: 'Нет избранных шаблонов. Отметьте шаблон сердечком в боте.',
            noName: 'Без названия',
            aiGenerations: 'Генерации ИИ',
            recentGenerations: 'Последние генерации',
            noAiData: 'Нет данных об использовании ИИ',
            lastCorrespondence: 'Последняя переписка',
            noCorrespondence: 'Нет переписки',
            message: '(сообщение)'
        },

        // Training section
        training: {
            title: 'Обучение и документация',
            userGuide: 'Руководство пользователя',
            userGuideDesc: 'Полное руководство по работе с панелью управления',
            openBtn: 'Открыть',
            videoTutorials: 'Видеоуроки',
            videoDesc: 'Пошаговые видеоинструкции по настройке',
            watchBtn: 'Смотреть'
        },

        // History section
        history: {
            title: 'История изменений анкет',
            dateCol: 'Дата',
            profileCol: 'Анкета',
            actionCol: 'Действие',
            byWhom: 'Кем',
            detailsCol: 'Детали',
            noHistory: 'Нет истории изменений за выбранный период',
            actions: {
                added: 'Добавлена',
                removed: 'Удалена',
                assigned: 'Назначена',
                unassigned: 'Снята',
                paused: 'Приостановлена',
                resumed: 'Возобновлена',
                updated: 'Изменена'
            }
        },

        // Modals
        modals: {
            addProfiles: {
                title: 'Добавление анкет',
                idsLabel: 'ID анкет (6 цифр)',
                idsPlaceholder: 'Введите ID через пробел или запятую: 123456 234567 345678',
                idsHint: 'Можно ввести несколько ID через пробел или запятую',
                commentLabel: 'Комментарий',
                commentPlaceholder: 'Общий комментарий для всех анкет',
                loginLabel: 'Логин',
                loginPlaceholder: 'Общий логин',
                passwordLabel: 'Пароль',
                passwordPlaceholder: 'Общий пароль',
                saveBtn: 'Сохранить анкеты'
            },
            addAdmin: {
                titleAdd: 'Добавление администратора',
                titleEdit: 'Редактировать администратора',
                nameLabel: 'Имя',
                namePlaceholder: 'Введите имя',
                loginLabel: 'Логин',
                loginPlaceholder: 'Введите логин',
                passwordLabel: 'Пароль',
                passwordPlaceholder: 'Введите пароль',
                myAdminLabel: 'Мой админ (без доступа к добавлению анкет и финансам)',
                amountLabel: 'Сумма',
                amountPlaceholder: 'Введите сумму'
            },
            assignProfiles: {
                title: 'Анкеты для',
                selectExisting: 'Выбрать из существующих анкет',
                noFreeProfiles: 'Нет свободных анкет',
                selectedCount: 'Выбрано',
                profilesWord: 'анкет',
                orEnterManually: 'Или введите ID вручную',
                manualPlaceholder: 'Введите ID анкет через запятую: 123456, 234567',
                commentLabel: 'Комментарий',
                commentPlaceholder: 'Общий комментарий',
                assignBtn: 'Назначить'
            },
            viewAdmin: {
                title: 'Детали администратора',
                loginLabel: 'Логин',
                passwordLabel: 'Пароль',
                translatorsLabel: 'Переводчики',
                conversionLabel: 'конверсия',
                profilesLabel: 'Анкеты',
                noProfiles: 'нет'
            }
        },

        // Filters
        filters: {
            allAdmins: 'Все Админы',
            allTranslators: 'Все Переводчики'
        },

        // Calendar
        calendar: {
            weekDays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
            months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                     'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
        },

        // Time
        time: {
            justNow: 'только что',
            minutesAgo: 'мин. назад',
            hoursAgo: 'ч. назад',
            min: 'мин'
        },

        // Messages
        messages: {
            connectionError: 'Ошибка подключения к серверу',
            loadError: 'Ошибка загрузки данных',
            retry: 'Повторить',
            allSystemsActive: 'Все системы активны',
            profileAdded: 'Добавлено анкет',
            adminSaved: 'Администратор сохранен',
            profilesAssigned: 'анкет администратору',
            assigned: 'Назначено',
            fillRequired: 'Заполните все обязательные поля',
            specifyAmount: 'Для не "моего админа" укажите сумму',
            enterProfileIds: 'Введите ID анкет',
            enterCorrectIds: 'Введите корректные ID (6 цифр)',
            selectOrEnterIds: 'Выберите или введите ID анкет',
            deleteConfirm: 'Удалить анкету',
            botsSynced: 'Промт синхронизирован с ботами',
            botsUpdated: 'Все боты обновлены',
            botNameSaved: 'Название бота сохранено'
        },

        // User menu
        userMenu: {
            logout: 'Выход'
        }
    },

    // ============================================
    // ENGLISH
    // ============================================
    en: {
        // Page
        pageTitle: 'Dashboard - Nova',

        // Menu items
        menu: {
            statistics: 'Statistics',
            profiles: 'Profiles',
            control: 'Control',
            team: 'Team',
            monitoring: 'Monitoring',
            training: 'Training',
            history: 'History'
        },

        // Page titles and subtitles
        pages: {
            stats: { title: 'Statistics', subtitle: 'Overall performance statistics' },
            accounts: { title: 'Profiles', subtitle: 'Profile management' },
            control: { title: 'Control', subtitle: 'Settings and bots' },
            team: { title: 'Team', subtitle: 'Team management' },
            monitoring: { title: 'Monitoring', subtitle: 'Activity tracking' },
            training: { title: 'Training', subtitle: 'Training and documentation' },
            history: { title: 'History', subtitle: 'Change history' }
        },

        // Common words
        common: {
            all: 'All',
            search: 'Search',
            save: 'Save',
            cancel: 'Cancel',
            delete: 'Delete',
            edit: 'Edit',
            add: 'Add',
            close: 'Close',
            refresh: 'Refresh',
            export: 'Export',
            loading: 'Loading data...',
            noData: 'No data',
            today: 'Today',
            week: 'Week',
            month: 'Month',
            thisMonth: 'This month',
            selectPeriod: 'Select period',
            from: 'From',
            to: 'To',
            yes: 'Yes',
            no: 'No',
            actions: 'Actions',
            status: 'Status',
            date: 'Date',
            time: 'Time',
            details: 'Details',
            comment: 'Comment',
            name: 'Name',
            login: 'Login',
            password: 'Password',
            selected: 'Selected'
        },

        // User roles
        roles: {
            director: 'Director',
            admin: 'Administrator',
            translator: 'Operator'
        },

        // Statistics section
        stats: {
            totalProfiles: 'Total profiles',
            incomingLetters: 'Incoming letters',
            chats: 'Chats',
            medianTime: 'Median time',
            avgTime: 'Average time',
            uniqueMen: 'Unique men',
            botsStatus: 'Bots status',
            workTime: 'Work time',
            online: 'Online',
            idle: 'Idle',
            offline: 'Offline',
            peakHours: 'Peak activity hours',
            advancedStats: 'Advanced statistics',
            forMonth: 'For month',
            loaded: 'Loaded',
            medianResponseTime: 'Median operator response time',
            compareTranslators: 'Compare operators',
            letters: 'Letters',
            income: 'Income'
        },

        // Profiles section
        profiles: {
            searchPlaceholder: 'Search by ID or login...',
            addProfile: 'Add',
            id: 'ID',
            loginCol: 'Login',
            passwordCol: 'Password',
            statusCol: 'Status',
            lastOnline: 'Last online',
            incoming: 'Incoming',
            admin: 'Admin',
            addedDate: 'Added date',
            commentCol: 'Comment',
            notAssigned: 'Not assigned',
            profileStatuses: {
                online: 'Available',
                working: 'Working',
                offline: 'Offline',
                inactive: 'Inactive'
            }
        },

        // Control section
        control: {
            activeSessions: 'Active sessions',
            mailingSettings: 'Mailing settings',
            enableMailing: 'Enable mailing',
            autoMessages: 'Automatic messages',
            stopSpam: 'Stop spam',
            onComplaints: 'On complaints',
            panicMode: 'Panic Mode',
            updateAllBots: 'Update all bots',
            generationPrompt: 'Generation prompt',
            promptPlaceholder: 'Enter prompt for response generation...',
            promptSync: 'Syncs with "Generate" prompt in bot',
            syncWithBots: 'Sync with bots',
            botActive: 'Active',
            botInactive: 'Inactive',
            turnOff: 'Turn off',
            activate: 'Activate',
            ip: 'IP',
            version: 'Version',
            profilesCount: 'Profiles',
            lastHeartbeat: 'Last heartbeat',
            botName: 'Bot name'
        },

        // Team section
        team: {
            teamManagement: 'Team management',
            addAdmin: 'Add admin',
            profiles: 'profiles',
            conversion: 'Conversion',
            editBtn: 'Edit',
            profilesBtn: 'Profiles',
            viewBtn: 'View',
            translators: 'Operators',
            myAdmin: 'My admin',
            noAccessNote: 'no access to adding profiles and finances',
            amount: 'Amount',
            aiEnabled: 'Allow AI usage'
        },

        // Monitoring section
        monitoring: {
            allAdmins: 'All Admins',
            allTranslators: 'All Operators',
            lastResponses: 'Recent responses',
            sentLetters: 'Sent letters',
            favoriteMailing: 'Favorite mailing',
            workTimeBtn: 'Work time',
            aiUsage: 'AI Usage',
            lastResponsesTitle: 'Recent responses (letters/chats)',
            sentLettersTitle: 'Sent letters',
            favoriteMailingTitle: 'Favorite mailing',
            workTimeTitle: 'Real work time',
            aiUsageTitle: 'AI Usage',
            response: 'Response',
            profile: 'Profile',
            man: 'Man',
            textNotSaved: '(text not saved)',
            noResponses: 'No response data',
            noLetters: 'No letters sent for selected period',
            noFavorites: 'No favorite templates. Mark a template with heart in bot.',
            noName: 'No name',
            aiGenerations: 'AI Generations',
            recentGenerations: 'Recent generations',
            noAiData: 'No AI usage data',
            lastCorrespondence: 'Recent correspondence',
            noCorrespondence: 'No correspondence',
            message: '(message)'
        },

        // Training section
        training: {
            title: 'Training and documentation',
            userGuide: 'User Guide',
            userGuideDesc: 'Complete guide to using the control panel',
            openBtn: 'Open',
            videoTutorials: 'Video tutorials',
            videoDesc: 'Step-by-step setup instructions',
            watchBtn: 'Watch'
        },

        // History section
        history: {
            title: 'Profile change history',
            dateCol: 'Date',
            profileCol: 'Profile',
            actionCol: 'Action',
            byWhom: 'By',
            detailsCol: 'Details',
            noHistory: 'No change history for selected period',
            actions: {
                added: 'Added',
                removed: 'Removed',
                assigned: 'Assigned',
                unassigned: 'Unassigned',
                paused: 'Paused',
                resumed: 'Resumed',
                updated: 'Updated'
            }
        },

        // Modals
        modals: {
            addProfiles: {
                title: 'Add profiles',
                idsLabel: 'Profile IDs (6 digits)',
                idsPlaceholder: 'Enter IDs separated by space or comma: 123456 234567 345678',
                idsHint: 'You can enter multiple IDs separated by space or comma',
                commentLabel: 'Comment',
                commentPlaceholder: 'Common comment for all profiles',
                loginLabel: 'Login',
                loginPlaceholder: 'Common login',
                passwordLabel: 'Password',
                passwordPlaceholder: 'Common password',
                saveBtn: 'Save profiles'
            },
            addAdmin: {
                titleAdd: 'Add administrator',
                titleEdit: 'Edit administrator',
                nameLabel: 'Name',
                namePlaceholder: 'Enter name',
                loginLabel: 'Login',
                loginPlaceholder: 'Enter login',
                passwordLabel: 'Password',
                passwordPlaceholder: 'Enter password',
                myAdminLabel: 'My admin (no access to adding profiles and finances)',
                amountLabel: 'Amount',
                amountPlaceholder: 'Enter amount'
            },
            assignProfiles: {
                title: 'Profiles for',
                selectExisting: 'Select from existing profiles',
                noFreeProfiles: 'No available profiles',
                selectedCount: 'Selected',
                profilesWord: 'profiles',
                orEnterManually: 'Or enter IDs manually',
                manualPlaceholder: 'Enter profile IDs separated by comma: 123456, 234567',
                commentLabel: 'Comment',
                commentPlaceholder: 'Common comment',
                assignBtn: 'Assign'
            },
            viewAdmin: {
                title: 'Administrator details',
                loginLabel: 'Login',
                passwordLabel: 'Password',
                translatorsLabel: 'Operators',
                conversionLabel: 'conversion',
                profilesLabel: 'Profiles',
                noProfiles: 'none'
            }
        },

        // Filters
        filters: {
            allAdmins: 'All Admins',
            allTranslators: 'All Operators'
        },

        // Calendar
        calendar: {
            weekDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            months: ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December']
        },

        // Time
        time: {
            justNow: 'just now',
            minutesAgo: 'min ago',
            hoursAgo: 'h ago',
            min: 'min'
        },

        // Messages
        messages: {
            connectionError: 'Server connection error',
            loadError: 'Data loading error',
            retry: 'Retry',
            allSystemsActive: 'All systems active',
            profileAdded: 'Profiles added',
            adminSaved: 'Administrator saved',
            profilesAssigned: 'profiles to administrator',
            assigned: 'Assigned',
            fillRequired: 'Fill in all required fields',
            specifyAmount: 'Specify amount for non "my admin"',
            enterProfileIds: 'Enter profile IDs',
            enterCorrectIds: 'Enter correct IDs (6 digits)',
            selectOrEnterIds: 'Select or enter profile IDs',
            deleteConfirm: 'Delete profile',
            botsSynced: 'Prompt synced with bots',
            botsUpdated: 'All bots updated',
            botNameSaved: 'Bot name saved'
        },

        // User menu
        userMenu: {
            logout: 'Logout'
        }
    },

    // ============================================
    // UKRAINIAN
    // ============================================
    uk: {
        // Page
        pageTitle: 'Особистий кабінет - Nova',

        // Menu items
        menu: {
            statistics: 'Статистика',
            profiles: 'Анкети',
            control: 'Керування',
            team: 'Команда',
            monitoring: 'Моніторинг',
            training: 'Навчання',
            history: 'Історія'
        },

        // Page titles and subtitles
        pages: {
            stats: { title: 'Статистика', subtitle: 'Загальна статистика роботи' },
            accounts: { title: 'Анкети', subtitle: 'Керування анкетами' },
            control: { title: 'Керування', subtitle: 'Налаштування та боти' },
            team: { title: 'Команда', subtitle: 'Керування командою' },
            monitoring: { title: 'Моніторинг', subtitle: 'Відстеження активності' },
            training: { title: 'Навчання', subtitle: 'Навчання та документація' },
            history: { title: 'Історія', subtitle: 'Історія змін' }
        },

        // Common words
        common: {
            all: 'Всі',
            search: 'Пошук',
            save: 'Зберегти',
            cancel: 'Скасувати',
            delete: 'Видалити',
            edit: 'Редагувати',
            add: 'Додати',
            close: 'Закрити',
            refresh: 'Оновити',
            export: 'Вивантажити',
            loading: 'Завантаження даних...',
            noData: 'Немає даних',
            today: 'Сьогодні',
            week: 'Тиждень',
            month: 'Місяць',
            thisMonth: 'Цей місяць',
            selectPeriod: 'Вибрати період',
            from: 'Від',
            to: 'До',
            yes: 'Так',
            no: 'Ні',
            actions: 'Дії',
            status: 'Статус',
            date: 'Дата',
            time: 'Час',
            details: 'Деталі',
            comment: 'Коментар',
            name: "Ім'я",
            login: 'Логін',
            password: 'Пароль',
            selected: 'Вибрано'
        },

        // User roles
        roles: {
            director: 'Директор',
            admin: 'Адміністратор',
            translator: 'Перекладач'
        },

        // Statistics section
        stats: {
            totalProfiles: 'Всього анкет',
            incomingLetters: 'Вхідних листів',
            chats: 'Чатів',
            medianTime: 'Медіанний час',
            avgTime: 'Середній час',
            uniqueMen: 'Унікальних чоловіків',
            botsStatus: 'Статус ботів',
            workTime: 'Час роботи',
            online: 'Онлайн',
            idle: 'Очікування',
            offline: 'Офлайн',
            peakHours: 'Пікові години активності',
            advancedStats: 'Розширена статистика',
            forMonth: 'За місяць',
            loaded: 'Завантажено',
            medianResponseTime: 'Медіанний час відповіді оператора',
            compareTranslators: 'Порівняння перекладачів',
            letters: 'Листів',
            income: 'Дохід'
        },

        // Profiles section
        profiles: {
            searchPlaceholder: 'Пошук за ID або логіном...',
            addProfile: 'Додати',
            id: 'ID',
            loginCol: 'Логін',
            passwordCol: 'Пароль',
            statusCol: 'Статус',
            lastOnline: 'Дата онлайн',
            incoming: 'Вхідні',
            admin: 'Адмін',
            addedDate: 'Дата додавання',
            commentCol: 'Коментар',
            notAssigned: 'Не призначено',
            profileStatuses: {
                online: 'Вільна',
                working: 'В роботі',
                offline: 'Офлайн',
                inactive: 'Неактивна'
            }
        },

        // Control section
        control: {
            activeSessions: 'Активні сесії',
            mailingSettings: 'Налаштування розсилки',
            enableMailing: 'Увімкнути розсилку',
            autoMessages: 'Автоматичні повідомлення',
            stopSpam: 'Зупинити спам',
            onComplaints: 'При скаргах',
            panicMode: 'Panic Mode',
            updateAllBots: 'Оновити всі боти',
            generationPrompt: 'Промт для генерації',
            promptPlaceholder: 'Введіть промт для генерації відповідей...',
            promptSync: 'Синхронізується з промтом "Generate" в боті',
            syncWithBots: 'Синхронізувати з ботами',
            botActive: 'Активний',
            botInactive: 'Неактивний',
            turnOff: 'Вимкнути',
            activate: 'Активувати',
            ip: 'IP',
            version: 'Версія',
            profilesCount: 'Анкет',
            lastHeartbeat: 'Останній відгук',
            botName: 'Назва бота'
        },

        // Team section
        team: {
            teamManagement: 'Керування командою',
            addAdmin: 'Додати адміна',
            profiles: 'анкет',
            conversion: 'Конверсія',
            editBtn: 'Редагувати',
            profilesBtn: 'Анкети',
            viewBtn: 'Переглянути',
            translators: 'Перекладачі',
            myAdmin: 'Мій адмін',
            noAccessNote: 'без доступу до додавання анкет та фінансів',
            amount: 'Сума',
            aiEnabled: 'Дозволити використання ШІ'
        },

        // Monitoring section
        monitoring: {
            allAdmins: 'Всі Адміни',
            allTranslators: 'Всі Перекладачі',
            lastResponses: 'Останні відповіді',
            sentLetters: 'Надіслані листи',
            favoriteMailing: 'Улюблена розсилка',
            workTimeBtn: 'Час роботи',
            aiUsage: 'Використання ШІ',
            lastResponsesTitle: 'Останні відповіді (листи/чати)',
            sentLettersTitle: 'Надіслані листи',
            favoriteMailingTitle: 'Улюблена розсилка',
            workTimeTitle: 'Реальний час роботи',
            aiUsageTitle: 'Використання ШІ',
            response: 'Відповідь',
            profile: 'Анкета',
            man: 'Чоловік',
            textNotSaved: '(текст не збережено)',
            noResponses: 'Немає даних про відповіді',
            noLetters: 'Немає надісланих листів за вибраний період',
            noFavorites: 'Немає улюблених шаблонів. Позначте шаблон сердечком у боті.',
            noName: 'Без назви',
            aiGenerations: 'Генерації ШІ',
            recentGenerations: 'Останні генерації',
            noAiData: 'Немає даних про використання ШІ',
            lastCorrespondence: 'Останнє листування',
            noCorrespondence: 'Немає листування',
            message: '(повідомлення)'
        },

        // Training section
        training: {
            title: 'Навчання та документація',
            userGuide: 'Посібник користувача',
            userGuideDesc: 'Повний посібник з роботи з панеллю керування',
            openBtn: 'Відкрити',
            videoTutorials: 'Відеоуроки',
            videoDesc: 'Покрокові відеоінструкції з налаштування',
            watchBtn: 'Дивитись'
        },

        // History section
        history: {
            title: 'Історія змін анкет',
            dateCol: 'Дата',
            profileCol: 'Анкета',
            actionCol: 'Дія',
            byWhom: 'Ким',
            detailsCol: 'Деталі',
            noHistory: 'Немає історії змін за вибраний період',
            actions: {
                added: 'Додана',
                removed: 'Видалена',
                assigned: 'Призначена',
                unassigned: 'Знята',
                paused: 'Призупинена',
                resumed: 'Відновлена',
                updated: 'Змінена'
            }
        },

        // Modals
        modals: {
            addProfiles: {
                title: 'Додавання анкет',
                idsLabel: 'ID анкет (6 цифр)',
                idsPlaceholder: 'Введіть ID через пробіл або кому: 123456 234567 345678',
                idsHint: 'Можна ввести кілька ID через пробіл або кому',
                commentLabel: 'Коментар',
                commentPlaceholder: 'Загальний коментар для всіх анкет',
                loginLabel: 'Логін',
                loginPlaceholder: 'Загальний логін',
                passwordLabel: 'Пароль',
                passwordPlaceholder: 'Загальний пароль',
                saveBtn: 'Зберегти анкети'
            },
            addAdmin: {
                titleAdd: 'Додавання адміністратора',
                titleEdit: 'Редагувати адміністратора',
                nameLabel: "Ім'я",
                namePlaceholder: "Введіть ім'я",
                loginLabel: 'Логін',
                loginPlaceholder: 'Введіть логін',
                passwordLabel: 'Пароль',
                passwordPlaceholder: 'Введіть пароль',
                myAdminLabel: 'Мій адмін (без доступу до додавання анкет та фінансів)',
                amountLabel: 'Сума',
                amountPlaceholder: 'Введіть суму'
            },
            assignProfiles: {
                title: 'Анкети для',
                selectExisting: 'Вибрати з існуючих анкет',
                noFreeProfiles: 'Немає вільних анкет',
                selectedCount: 'Вибрано',
                profilesWord: 'анкет',
                orEnterManually: 'Або введіть ID вручну',
                manualPlaceholder: 'Введіть ID анкет через кому: 123456, 234567',
                commentLabel: 'Коментар',
                commentPlaceholder: 'Загальний коментар',
                assignBtn: 'Призначити'
            },
            viewAdmin: {
                title: 'Деталі адміністратора',
                loginLabel: 'Логін',
                passwordLabel: 'Пароль',
                translatorsLabel: 'Перекладачі',
                conversionLabel: 'конверсія',
                profilesLabel: 'Анкети',
                noProfiles: 'немає'
            }
        },

        // Filters
        filters: {
            allAdmins: 'Всі Адміни',
            allTranslators: 'Всі Перекладачі'
        },

        // Calendar
        calendar: {
            weekDays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
            months: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
                     'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
        },

        // Time
        time: {
            justNow: 'щойно',
            minutesAgo: 'хв. тому',
            hoursAgo: 'год. тому',
            min: 'хв'
        },

        // Messages
        messages: {
            connectionError: 'Помилка підключення до сервера',
            loadError: 'Помилка завантаження даних',
            retry: 'Повторити',
            allSystemsActive: 'Всі системи активні',
            profileAdded: 'Додано анкет',
            adminSaved: 'Адміністратор збережений',
            profilesAssigned: 'анкет адміністратору',
            assigned: 'Призначено',
            fillRequired: "Заповніть всі обов'язкові поля",
            specifyAmount: 'Для не "мого адміна" вкажіть суму',
            enterProfileIds: 'Введіть ID анкет',
            enterCorrectIds: 'Введіть коректні ID (6 цифр)',
            selectOrEnterIds: 'Виберіть або введіть ID анкет',
            deleteConfirm: 'Видалити анкету',
            botsSynced: 'Промт синхронізовано з ботами',
            botsUpdated: 'Всі боти оновлені',
            botNameSaved: 'Назва бота збережена'
        },

        // User menu
        userMenu: {
            logout: 'Вихід'
        }
    }
};

/**
 * Get locale string for date formatting
 */
function getDateLocale(lang) {
    const locales = {
        ru: 'ru-RU',
        en: 'en-US',
        uk: 'uk-UA'
    };
    return locales[lang] || 'ru-RU';
}

/**
 * Format date according to language
 */
function formatLocalizedDate(date, lang, options = {}) {
    const locale = getDateLocale(lang);
    const defaultOptions = {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    };
    return new Date(date).toLocaleDateString(locale, { ...defaultOptions, ...options });
}

/**
 * Format date and time according to language
 */
function formatLocalizedDateTime(date, lang) {
    const locale = getDateLocale(lang);
    return new Date(date).toLocaleString(locale, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format short date (for tables)
 */
function formatLocalizedShortDate(date, lang) {
    const locale = getDateLocale(lang);
    return new Date(date).toLocaleDateString(locale);
}
