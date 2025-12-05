// ==========================================
// SERVER.JS - v6.0 (Полная схема данных для личного кабинета)
// ==========================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

// ЦЕНЫ
const PRICE_LETTER = 1.5;
const PRICE_CHAT = 0.15;

// НАСТРОЙКИ БАЗЫ ДАННЫХ
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ladabot_stats',
    password: 'mikmik98',
    port: 5432,
});

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ==========================================
// 8. УТИЛИТА ЗАПИСИ ОШИБОК (перенесена для раннего использования)
// ==========================================
async function logError(endpoint, errorType, message, rawData, userId) {
    try {
        await pool.query(
            `INSERT INTO error_logs (endpoint, error_type, message, raw_data, user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [endpoint, errorType, message, rawData || null, userId || null]
        );
    } catch (e) {
        console.error('Критическая ошибка записи лога:', e.message);
    }
}


// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ БАЗЫ (v6.0 - ПОЛНАЯ СХЕМА ДЛЯ ЛИЧНОГО КАБИНЕТА)
// ==========================================
async function initDatabase() {
    try {
        console.log('⚙️ Проверка таблиц базы данных v6.0 (полная схема для личного кабинета)...');

        // 1. Таблица пользователей (обновлена)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                login VARCHAR(100),
                role VARCHAR(20) NOT NULL,
                owner_id INTEGER REFERENCES users(id),
                salary DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(username)
            )
        `);

        // Добавляем недостающие колонки если их нет
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login VARCHAR(100)`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary DECIMAL(10,2)`);

        // 2. Таблица Анкет (профилей) - расширенная
        await pool.query(`
            CREATE TABLE IF NOT EXISTS profiles (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) UNIQUE NOT NULL,
                login VARCHAR(100),
                password VARCHAR(100),
                admin_id INTEGER REFERENCES users(id),
                translator_id INTEGER REFERENCES users(id),
                note TEXT,
                paused BOOLEAN DEFAULT FALSE,
                status VARCHAR(20) DEFAULT 'offline',
                last_online TIMESTAMP,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Синхронизируем с allowed_profiles для совместимости
        await pool.query(`
            CREATE TABLE IF NOT EXISTS allowed_profiles (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) UNIQUE NOT NULL,
                note TEXT,
                assigned_admin_id INTEGER,
                assigned_translator_id INTEGER,
                login VARCHAR(100),
                password VARCHAR(100),
                paused BOOLEAN DEFAULT FALSE,
                status VARCHAR(20) DEFAULT 'offline',
                last_online TIMESTAMP,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Добавляем недостающие колонки в allowed_profiles
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS login VARCHAR(100)`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS password VARCHAR(100)`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline'`);
        await pool.query(`ALTER TABLE allowed_profiles ADD COLUMN IF NOT EXISTS last_online TIMESTAMP`);

        // 3. Таблица ботов
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bots (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(100),
                platform VARCHAR(100),
                ip VARCHAR(50),
                version VARCHAR(20),
                status VARCHAR(20) DEFAULT 'offline',
                last_heartbeat TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. Связь бота с анкетами
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_profiles (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(100) NOT NULL,
                profile_id VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bot_id, profile_id)
            )
        `);

        // 5. Таблица активности (ключевая таблица!)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(100) NOT NULL,
                bot_id VARCHAR(100),
                admin_id INTEGER,
                translator_id INTEGER,
                action_type VARCHAR(50) NOT NULL,
                man_id VARCHAR(100),
                message_text TEXT,
                response_time_sec INTEGER,
                used_ai BOOLEAN DEFAULT FALSE,
                income DECIMAL(10,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Индексы для activity_log
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_profile ON activity_log(profile_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(action_type)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_admin ON activity_log(admin_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_translator ON activity_log(translator_id)`);

        // 6. Таблица Сообщений (для совместимости)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(50),
                account_id VARCHAR(50),
                type VARCHAR(20),
                sender_id VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                response_time INTEGER,
                is_first_message BOOLEAN DEFAULT FALSE,
                is_last_message BOOLEAN DEFAULT FALSE,
                conversation_id VARCHAR(50),
                message_length INTEGER,
                read_status BOOLEAN DEFAULT FALSE,
                status VARCHAR(20) DEFAULT 'success',
                message_content_id INTEGER,
                error_log_id INTEGER
            )
        `);

        // Меняем тип response_time на INTEGER если он INTERVAL
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'messages'
                    AND column_name = 'response_time'
                    AND data_type = 'interval'
                ) THEN
                    ALTER TABLE messages ALTER COLUMN response_time TYPE INTEGER USING EXTRACT(EPOCH FROM response_time)::INTEGER;
                END IF;
            END $$;
        `);

        // 7. Хранение контента сообщения
        await pool.query(`
            CREATE TABLE IF NOT EXISTS message_content (
                id SERIAL PRIMARY KEY,
                text_content TEXT,
                media_url VARCHAR(255),
                file_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 8. Логи ошибок
        await pool.query(`
            CREATE TABLE IF NOT EXISTS error_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                endpoint VARCHAR(100),
                error_type VARCHAR(100),
                message TEXT,
                raw_data JSONB,
                user_id INTEGER
            )
        `);

        // 9. Heartbeats от бота
        await pool.query(`
            CREATE TABLE IF NOT EXISTS heartbeats (
                id SERIAL PRIMARY KEY,
                bot_id VARCHAR(255) NOT NULL,
                account_display_id VARCHAR(255) NOT NULL,
                status VARCHAR(50),
                ip VARCHAR(50),
                version VARCHAR(50),
                platform VARCHAR(100),
                timestamp TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Индексы для heartbeats
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_account ON heartbeats(account_display_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeats_bot_id ON heartbeats(bot_id)`);

        // 10. Таблица для ежедневной статистики
        await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                date DATE NOT NULL,
                letters_count INTEGER DEFAULT 0,
                chats_count INTEGER DEFAULT 0,
                unique_men INTEGER DEFAULT 0,
                total_income DECIMAL(10,2) DEFAULT 0,
                avg_response_time INTEGER,
                conversion_rate DECIMAL(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, date)
            )
        `);

        console.log('✅ База данных готова к работе (v6.0 - полная схема для личного кабинета)');
    } catch (e) {
        console.error('❌ Ошибка инициализации БД:', e.message);
    }
}
initDatabase();

// ==========================================
// 2. АУТЕНТИФИКАЦИЯ (без изменений)
// ==========================================
app.get('/setup-director', async (req, res) => {
    const { user, pass } = req.query;
    if (!user || !pass) return res.send('Ошибка: укажите ?user=Имя&pass=Пароль в ссылке');
    
    try {
        const hash = await bcrypt.hash(pass, 10);
        await pool.query(
            `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'director')
             ON CONFLICT (username) DO UPDATE SET password_hash = $2`, [user, hash]
        );
        res.send(`<h1>Готово!</h1><p>Директор <b>${user}</b> создан/обновлен.</p>`);
    } catch (e) { res.send('Ошибка создания: ' + e.message); }
});

app.get('/fix-password', async (req, res) => {
    const user = req.query.user;
    const newPass = '12345';
    
    if (!user) return res.send('Укажите ?user=ИМЯ в ссылке');

    try {
        const hash = await bcrypt.hash(newPass, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, user]);
        res.send(`<h1>Успех!</h1><p>Пароль для <b>${user}</b> изменен на <b>12345</b></p>`);
    } catch (e) {
        res.send('Ошибка: ' + e.message);
    }
});

app.post('/api/login', async (req, res) => {
    console.log('👉 [LOGIN DEBUG] Получен запрос:', req.body);

    const { username, password } = req.body;

    if (!username || !password) {
        console.log('❌ [LOGIN] Пустые данные');
        return res.json({ success: false, error: 'Введите логин и пароль' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            console.log(`❌ [LOGIN] Пользователь "${username}" не найден в базе.`);
            return res.json({ success: false, error: 'Пользователь не найден' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            console.log(`✅ [LOGIN] Успешный вход: ${username} (${user.role})`);
            res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
        } else {
            console.log(`❌ [LOGIN] Неверный пароль для "${username}"`);
            res.json({ success: false, error: 'Неверный пароль' });
        }
    } catch (e) {
        console.error('💥 [LOGIN] Ошибка сервера/БД:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 3. КОМАНДА (ОБНОВЛЕНО v6.0 - с полной статистикой)
// ==========================================
app.get('/api/team', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'director') {
            // Директор видит всех админов и их переводчиков
            filter = `WHERE u.role IN ('admin', 'translator')`;
        } else if (role === 'admin') {
            // Админ видит только своих переводчиков
            filter = `WHERE u.owner_id = $1`;
            params.push(userId);
        } else {
            return res.json({ success: true, list: [] });
        }

        // Запрос с полной статистикой
        const query = `
            SELECT
                u.id,
                u.username,
                u.login,
                u.role,
                u.owner_id,
                u.salary,
                u.created_at,
                -- Количество анкет
                COALESCE(profiles.accounts_count, 0) as accounts_count,
                -- Статистика за сегодня
                COALESCE(stats.letters_today, 0) as letters_today,
                COALESCE(stats.chats_today, 0) as chats_today,
                COALESCE(stats.income_today, 0) as income_today,
                -- Конверсия (уникальные мужчины / письма * 100)
                CASE
                    WHEN COALESCE(stats.letters_today, 0) > 0
                    THEN ROUND((COALESCE(stats.unique_men_today, 0)::numeric / stats.letters_today) * 100, 1)
                    ELSE 0
                END as conversion,
                -- Является ли это мой админ (для переводчиков)
                CASE WHEN u.owner_id = $${params.length > 0 ? params.length : 1} THEN true ELSE false END as is_my_admin,
                -- Список анкет (для переводчиков)
                COALESCE(profiles.accounts, ARRAY[]::varchar[]) as accounts
            FROM users u
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) as accounts_count,
                    ARRAY_AGG(p.profile_id) as accounts
                FROM allowed_profiles p
                WHERE
                    (u.role = 'admin' AND p.assigned_admin_id = u.id)
                    OR (u.role = 'translator' AND p.assigned_translator_id = u.id)
            ) profiles ON true
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE) as letters_today,
                    COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE) as chats_today,
                    COALESCE(SUM(a.income) FILTER (WHERE DATE(a.created_at) = CURRENT_DATE), 0) as income_today,
                    COUNT(DISTINCT CASE WHEN DATE(a.created_at) = CURRENT_DATE THEN a.man_id END) as unique_men_today
                FROM activity_log a
                WHERE
                    (u.role = 'admin' AND a.admin_id = u.id)
                    OR (u.role = 'translator' AND a.translator_id = u.id)
            ) stats ON true
            ${filter}
            ORDER BY u.role, u.username
        `;

        // Добавляем userId для is_my_admin если params пустой
        if (params.length === 0) {
            params.push(userId);
        }

        const result = await pool.query(query, params);

        // Также получаем данные из messages для совместимости
        const msgQuery = `
            SELECT
                CASE
                    WHEN p.assigned_admin_id IS NOT NULL THEN p.assigned_admin_id
                    ELSE p.assigned_translator_id
                END as user_id,
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND DATE(m.timestamp) = CURRENT_DATE) as letters_today,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE) as chats_today,
                COUNT(DISTINCT CASE WHEN DATE(m.timestamp) = CURRENT_DATE THEN m.sender_id END) as unique_men_today
            FROM allowed_profiles p
            LEFT JOIN messages m ON p.profile_id = m.account_id
            GROUP BY CASE WHEN p.assigned_admin_id IS NOT NULL THEN p.assigned_admin_id ELSE p.assigned_translator_id END
        `;
        const msgResult = await pool.query(msgQuery);
        const msgStatsMap = {};
        msgResult.rows.forEach(r => {
            if (r.user_id) msgStatsMap[r.user_id] = r;
        });

        const list = result.rows.map(row => {
            const msgStats = msgStatsMap[row.id] || {};
            const lettersToday = parseInt(row.letters_today) || parseInt(msgStats.letters_today) || 0;
            const chatsToday = parseInt(row.chats_today) || parseInt(msgStats.chats_today) || 0;
            const incomeToday = parseFloat(row.income_today) || (lettersToday * PRICE_LETTER + chatsToday * PRICE_CHAT);
            const uniqueMen = parseInt(msgStats.unique_men_today) || 0;
            const conversion = lettersToday > 0 ? ((uniqueMen / lettersToday) * 100).toFixed(1) : 0;

            return {
                id: row.id,
                username: row.username,
                login: row.login,
                role: row.role,
                owner_id: row.owner_id,
                salary: row.salary,
                accounts_count: parseInt(row.accounts_count) || 0,
                letters_today: lettersToday,
                conversion: parseFloat(row.conversion) || parseFloat(conversion),
                is_my_admin: row.is_my_admin,
                accounts: row.accounts || []
            };
        });

        res.json({ success: true, list });
    } catch (e) {
        console.error('Team error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { username, password, role, ownerId } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (username, password_hash, role, owner_id) VALUES ($1, $2, $3, $4)`,
            [username, hash, role, ownerId]
        );
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: 'Логин занят' }); }
});

app.delete('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        await pool.query(`UPDATE allowed_profiles SET assigned_translator_id = NULL WHERE assigned_translator_id = $1`, [userId]);
        await pool.query(`UPDATE allowed_profiles SET assigned_admin_id = NULL WHERE assigned_admin_id = $1`, [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 4. АНКЕТЫ (ОБНОВЛЕНО v6.0 - с полной статистикой)
// ==========================================
app.get('/api/profiles', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'admin') {
            filter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        } else if (role === 'translator') {
            filter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        }

        // Основной запрос с агрегированной статистикой
        const query = `
            SELECT
                p.id,
                p.profile_id,
                p.login,
                p.password,
                p.note,
                p.paused,
                p.status,
                p.last_online,
                p.added_at,
                p.assigned_admin_id as admin_id,
                p.assigned_translator_id as translator_id,
                u_admin.username as admin_name,
                u_trans.username as trans_name,
                -- Статистика за сегодня
                COALESCE(stats.letters_today, 0) as letters_today,
                COALESCE(stats.chats_today, 0) as chats_today,
                -- Общая статистика
                COALESCE(stats.letters_total, 0) as letters_total,
                COALESCE(stats.chats_total, 0) as chats_total
            FROM allowed_profiles p
            LEFT JOIN users u_admin ON p.assigned_admin_id = u_admin.id
            LEFT JOIN users u_trans ON p.assigned_translator_id = u_trans.id
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE a.action_type = 'incoming' AND DATE(a.created_at) = CURRENT_DATE) as letters_today,
                    COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE) as chats_today,
                    COUNT(*) FILTER (WHERE a.action_type = 'incoming') as letters_total,
                    COUNT(*) FILTER (WHERE a.action_type = 'chat') as chats_total
                FROM activity_log a
                WHERE a.profile_id = p.profile_id
            ) stats ON true
            ${filter}
            ORDER BY p.id DESC
        `;

        const result = await pool.query(query, params);

        // Также считаем из messages для совместимости если activity_log пустой
        // Входящие письма = type = 'incoming' (от мужчин к девушкам)
        const msgStatsQuery = `
            SELECT
                p.profile_id,
                COUNT(*) FILTER (WHERE m.type = 'incoming' AND DATE(m.timestamp) = CURRENT_DATE) as letters_today,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE) as chats_today,
                COUNT(*) FILTER (WHERE m.type = 'incoming') as letters_total,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats_total
            FROM allowed_profiles p
            LEFT JOIN messages m ON p.profile_id = m.account_id
            ${filter}
            GROUP BY p.profile_id
        `;
        const msgResult = await pool.query(msgStatsQuery, params);
        const msgStatsMap = {};
        msgResult.rows.forEach(r => {
            msgStatsMap[r.profile_id] = r;
        });

        // Объединяем результаты
        const list = result.rows.map(row => {
            const msgStats = msgStatsMap[row.profile_id] || {};
            return {
                profile_id: row.profile_id,
                login: row.login,
                password: row.password,
                status: row.status || 'offline',
                last_online: row.last_online,
                letters_today: parseInt(row.letters_today) || parseInt(msgStats.letters_today) || 0,
                letters_total: parseInt(row.letters_total) || parseInt(msgStats.letters_total) || 0,
                chats_today: parseInt(row.chats_today) || parseInt(msgStats.chats_today) || 0,
                admin_id: row.admin_id,
                admin_name: row.admin_name,
                translator_id: row.translator_id,
                trans_name: row.trans_name,
                added_at: row.added_at,
                note: row.note,
                paused: row.paused || false
            };
        });

        res.json({ success: true, list });
    } catch (e) {
        console.error('Profiles error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/profiles/bulk', async (req, res) => {
    const { profiles, note, adminId } = req.body;
    try {
        for (const id of profiles) {
            if (id.trim().length > 2) {
                await pool.query(
                    `INSERT INTO allowed_profiles (profile_id, note, assigned_admin_id)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (profile_id) DO UPDATE SET assigned_admin_id = $3`,
                    [id.trim(), note, adminId || null]
                );
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profiles/assign', async (req, res) => {
    const { profileIds, targetUserId, roleTarget } = req.body;
    try {
        let field = roleTarget === 'admin' ? 'assigned_admin_id' : 'assigned_translator_id';
        const placeholders = profileIds.map((_, i) => `$${i + 2}`).join(',');
        const query = `UPDATE allowed_profiles SET ${field} = $1 WHERE id IN (${placeholders})`;
        await pool.query(query, [targetUserId, ...profileIds]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 5. ОСНОВНАЯ СТАТИСТИКА (обновляем v5.1)
// ==========================================
app.post('/api/message_sent', async (req, res) => {
    const { botId, accountDisplayId, recipientId, type, responseTime, isFirst, isLast, convId, length,
            status, textContent, mediaUrl, fileName, translatorId, errorReason } = req.body;

    let contentId = null;
    let errorLogId = null;

    try {
        // Проверяем анкету (поддерживаем оба поля: profile_id и account_display_id)
        const check = await pool.query(
            'SELECT * FROM allowed_profiles WHERE profile_id = $1',
            [accountDisplayId]
        );

        if (check.rows.length === 0) {
            console.log(`⚠️ Анкета ${accountDisplayId} не найдена в allowed_profiles - игнорируем`);
            return res.json({ status: 'ignored' });
        }

        // 1. Сохранение контента сообщения
        const contentRes = await pool.query(
            `INSERT INTO message_content (text_content, media_url, file_name)
             VALUES ($1, $2, $3) RETURNING id`,
            [textContent || null, mediaUrl || null, fileName || null]
        );
        contentId = contentRes.rows[0].id;

        // 2. Если статус 'failed', записываем лог ошибки
        if (status === 'failed' && errorReason) {
             const logRes = await pool.query(
                `INSERT INTO error_logs (endpoint, error_type, message, user_id, raw_data)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                ['/api/message_sent', 'SendingFailed', errorReason, translatorId || null, JSON.stringify(req.body)]
            );
            errorLogId = logRes.rows[0].id;
        }

        // 3. Сохранение сообщения со статусом и ссылкой на контент
        const msgType = type || 'outgoing';
        await pool.query(
            `INSERT INTO messages (bot_id, account_id, type, sender_id, timestamp, response_time, is_first_message, is_last_message, conversation_id, message_length, status, message_content_id, error_log_id)
             VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12)`,
            [botId, accountDisplayId, msgType, recipientId, responseTime || null, isFirst || false, isLast || false, convId || null, length || 0, status || 'success', contentId, errorLogId]
        );

        console.log(`✅ Сообщение от бота ${botId} для анкеты ${accountDisplayId} сохранено (contentId: ${contentId})`);

        res.json({ status: 'ok', contentId: contentId });

    } catch (e) {
        console.error('❌ Ошибка сохранения сообщения:', e.message);
        await logError('/api/message_sent', 'DatabaseError', e.message, req.body, translatorId);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 5.1. HEARTBEAT ОТ БОТА (новый эндпоинт)
// ==========================================
app.post('/api/heartbeat', async (req, res) => {
    const { botId, accountDisplayId, status, timestamp, ip, systemInfo } = req.body;

    try {
        await pool.query(`
            INSERT INTO heartbeats (
                bot_id, account_display_id, status,
                ip, version, platform, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            botId,
            accountDisplayId,
            status || 'online',
            ip || null,
            systemInfo?.version || null,
            systemInfo?.platform || null,
            timestamp || new Date()
        ]);

        // Опционально: обновляем last_seen в таблице allowed_profiles
        await pool.query(`
            UPDATE allowed_profiles
            SET note = COALESCE(note, '') || ' [Last seen: ' || $1 || ']'
            WHERE profile_id = $2
        `, [new Date(timestamp).toISOString(), accountDisplayId]);

        console.log(`❤️ Heartbeat от ${accountDisplayId}: ${status}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('❌ Ошибка heartbeat:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 5.2. ЛОГИРОВАНИЕ ОШИБОК ОТ БОТА (публичный эндпоинт)
// ==========================================
app.post('/api/error', async (req, res) => {
    const { botId, accountDisplayId, endpoint, errorType, message, rawData, userId } = req.body;

    try {
        await pool.query(`
            INSERT INTO error_logs (
                endpoint, error_type, message, raw_data, user_id
            ) VALUES ($1, $2, $3, $4, $5)
        `, [
            endpoint || 'bot_general',
            errorType || 'UnknownError',
            `[Bot: ${botId}] [Account: ${accountDisplayId}] ${message}`,
            rawData ? JSON.stringify(rawData) : JSON.stringify({ botId, accountDisplayId }),
            userId || null
        ]);

        console.log(`⚠️ Ошибка от бота ${botId} (${accountDisplayId}): ${errorType} - ${message}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('❌ Ошибка логирования:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 5.3. НОВЫЙ HEARTBEAT ПО СХЕМЕ (POST /api/bot/heartbeat)
// ==========================================
app.post('/api/bot/heartbeat', async (req, res) => {
    const { botId, profileId, platform, ip, version, status } = req.body;

    try {
        // 1. Обновляем/создаем запись бота
        await pool.query(`
            INSERT INTO bots (bot_id, platform, ip, version, status, last_heartbeat)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (bot_id) DO UPDATE SET
                platform = EXCLUDED.platform,
                ip = EXCLUDED.ip,
                version = EXCLUDED.version,
                status = EXCLUDED.status,
                last_heartbeat = NOW()
        `, [botId, platform || null, ip || null, version || null, status || 'online']);

        // 2. Связываем бота с профилем
        if (profileId) {
            await pool.query(`
                INSERT INTO bot_profiles (bot_id, profile_id)
                VALUES ($1, $2)
                ON CONFLICT (bot_id, profile_id) DO NOTHING
            `, [botId, profileId]);

            // 3. Обновляем статус профиля
            await pool.query(`
                UPDATE allowed_profiles
                SET status = $1, last_online = NOW()
                WHERE profile_id = $2
            `, [status || 'online', profileId]);
        }

        // 4. Записываем в heartbeats для истории
        await pool.query(`
            INSERT INTO heartbeats (bot_id, account_display_id, status, ip, version, platform, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [botId, profileId || '', status || 'online', ip || null, version || null, platform || null]);

        console.log(`❤️ Heartbeat от бота ${botId} (${profileId || 'no profile'}): ${status || 'online'}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('❌ Ошибка heartbeat:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 5.4. ЛОГИРОВАНИЕ АКТИВНОСТИ (POST /api/activity/log)
// ==========================================
app.post('/api/activity/log', async (req, res) => {
    const { botId, profileId, actionType, manId, messageText, responseTimeSec, usedAi, income } = req.body;

    try {
        // Получаем admin_id и translator_id для этого профиля
        const profileResult = await pool.query(
            `SELECT assigned_admin_id, assigned_translator_id FROM allowed_profiles WHERE profile_id = $1`,
            [profileId]
        );

        if (profileResult.rows.length === 0) {
            console.log(`⚠️ Профиль ${profileId} не найден - создаем запись без привязки`);
        }

        const profile = profileResult.rows[0] || {};

        // Расчёт дохода если не передан
        let calculatedIncome = income;
        if (calculatedIncome === undefined || calculatedIncome === null) {
            if (actionType === 'letter') {
                calculatedIncome = PRICE_LETTER;
            } else if (actionType === 'chat') {
                calculatedIncome = PRICE_CHAT;
            } else {
                calculatedIncome = 0;
            }
        }

        // Записываем в activity_log
        await pool.query(`
            INSERT INTO activity_log (profile_id, bot_id, admin_id, translator_id, action_type, man_id, message_text, response_time_sec, used_ai, income)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            profileId,
            botId || null,
            profile.assigned_admin_id || null,
            profile.assigned_translator_id || null,
            actionType,
            manId || null,
            messageText || null,
            responseTimeSec || null,
            usedAi || false,
            calculatedIncome
        ]);

        // Также записываем в messages для совместимости
        const msgType = actionType === 'letter' ? 'outgoing' : (actionType === 'chat' ? 'chat_msg' : actionType);
        await pool.query(`
            INSERT INTO messages (bot_id, account_id, type, sender_id, response_time, status)
            VALUES ($1, $2, $3, $4, $5, 'success')
        `, [botId || null, profileId, msgType, manId || null, responseTimeSec || null]);

        console.log(`📝 Активность: ${actionType} от ${profileId} (бот: ${botId || 'N/A'}), доход: $${calculatedIncome}`);

        res.json({ status: 'ok', income: calculatedIncome });

    } catch (error) {
        console.error('❌ Ошибка записи активности:', error.message);
        await logError('/api/activity/log', 'DatabaseError', error.message, req.body, null);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 5.5. ЛЮБИМЫЙ ШАБЛОН (POST/GET /api/profile/favorite-template)
// ==========================================
app.post('/api/profile/favorite-template', async (req, res) => {
    const { profileId, templateName, templateText } = req.body;

    try {
        // Добавляем колонку если её нет (миграция)
        await pool.query(`
            ALTER TABLE allowed_profiles
            ADD COLUMN IF NOT EXISTS favorite_template_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS favorite_template_text TEXT
        `);

        // Сохраняем избранный шаблон
        await pool.query(`
            UPDATE allowed_profiles
            SET favorite_template_name = $1, favorite_template_text = $2
            WHERE profile_id = $3
        `, [templateName || null, templateText || null, profileId]);

        console.log(`⭐ Сохранён избранный шаблон для ${profileId}: ${templateName}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Ошибка сохранения шаблона:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/profile/favorite-template', async (req, res) => {
    const { profileId } = req.query;

    try {
        const result = await pool.query(`
            SELECT favorite_template_name, favorite_template_text
            FROM allowed_profiles
            WHERE profile_id = $1
        `, [profileId]);

        if (result.rows.length > 0) {
            res.json({
                success: true,
                templateName: result.rows[0].favorite_template_name,
                templateText: result.rows[0].favorite_template_text
            });
        } else {
            res.json({ success: true, templateName: null, templateText: null });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 5.5.1. ВСЕ ИЗБРАННЫЕ ШАБЛОНЫ (GET /api/favorite-templates)
// ==========================================
app.get('/api/favorite-templates', async (req, res) => {
    const { userId, role } = req.query;

    try {
        let filter = "";
        let params = [];

        if (role === 'translator') {
            filter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        } else if (role === 'admin') {
            filter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        }

        const result = await pool.query(`
            SELECT p.profile_id, p.favorite_template_name, p.favorite_template_text
            FROM allowed_profiles p
            ${filter}
            WHERE p.favorite_template_name IS NOT NULL
        `, params);

        res.json({
            success: true,
            templates: result.rows.map(r => ({
                profileId: r.profile_id,
                name: r.favorite_template_name,
                text: r.favorite_template_text
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 5.6. СТАТУС ПРОФИЛЯ (POST /api/profile/status)
// ==========================================
app.post('/api/profile/status', async (req, res) => {
    const { botId, profileId, status, lastOnline } = req.body;

    try {
        // Обновляем статус профиля
        await pool.query(`
            UPDATE allowed_profiles
            SET status = $1, last_online = $2
            WHERE profile_id = $3
        `, [status || 'online', lastOnline || new Date(), profileId]);

        // Связываем бота с профилем если указан
        if (botId) {
            await pool.query(`
                INSERT INTO bot_profiles (bot_id, profile_id)
                VALUES ($1, $2)
                ON CONFLICT (bot_id, profile_id) DO NOTHING
            `, [botId, profileId]);
        }

        console.log(`👤 Статус профиля ${profileId}: ${status || 'online'}`);

        res.json({ status: 'ok' });

    } catch (error) {
        console.error('❌ Ошибка обновления статуса:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stats/detailed', async (req, res) => {
    const { userId, role } = req.query;

    try {
        let filter = "";
        let params = [];

        if (role === 'translator') {
            filter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        } else if (role === 'admin') {
            filter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        }

        const query = `
            SELECT
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.status = 'success') as letters_count,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.status = 'success') as chats_count,
                COUNT(*) FILTER (WHERE m.status = 'failed') as failed_messages_count,
                COUNT(*) FILTER (WHERE m.status = 'success') as success_messages_count,
                COUNT(DISTINCT CASE
                    WHEN date_trunc('month', m.timestamp) = date_trunc('month', CURRENT_DATE)
                    THEN m.sender_id
                END) as unique_men_month,
                COUNT(DISTINCT m.sender_id) as unique_men_total,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                COUNT(DISTINCT m.conversation_id) as total_conversations,
                SUM(CASE WHEN m.is_first_message THEN 1 ELSE 0 END) as first_messages,
                SUM(CASE WHEN m.is_last_message THEN 1 ELSE 0 END) as last_messages
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            ${filter}
            AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
        `;

        const result = await pool.query(query, params);
        const stats = result.rows[0];
        
        // Расчет дохода
        const earnings = (parseFloat(stats.letters_count) * PRICE_LETTER) + (parseFloat(stats.chats_count) * PRICE_CHAT);
        
        // Расчет коэффициентов
        const totalSent = parseFloat(stats.first_messages);
        const totalConv = parseFloat(stats.total_conversations);
        const replyRate = totalSent > 0 ? ((totalConv / totalSent) * 100).toFixed(1) : 0;
        const avgConvLength = totalConv > 0 ? ((parseFloat(stats.letters_count) + parseFloat(stats.chats_count)) / totalConv).toFixed(1) : 0;
        
        // Обновляем возвращаемый объект
        res.json({
            success: true,
            stats: {
                letters: parseInt(stats.letters_count) || 0,
                chats: parseInt(stats.chats_count) || 0,
                failedMessages: parseInt(stats.failed_messages_count) || 0, // НОВОЕ
                successMessages: parseInt(stats.success_messages_count) || 0, // НОВОЕ
                uniqueMenMonth: parseInt(stats.unique_men_month) || 0,
                uniqueMenTotal: parseInt(stats.unique_men_total) || 0,
                money: earnings.toFixed(2),
                avgResponseTime: Math.round(stats.avg_response_seconds / 60) || 0, // в минутах
                totalConversations: parseInt(stats.total_conversations) || 0,
                replyRate: replyRate,
                avgConvLength: avgConvLength,
                firstMessages: parseInt(stats.first_messages) || 0,
                lastMessages: parseInt(stats.last_messages) || 0
            }
        });

    } catch (e) {
        await logError('/api/stats/detailed', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});


// ==========================================
// 6. НОВЫЕ API ДЛЯ РАСШИРЕННОЙ СТАТИСТИКИ (без изменений)
// ==========================================

// 6.1. Статистика по дням (для графиков)
app.get('/api/stats/daily', async (req, res) => {
    const { userId, role } = req.query;
    const days = parseInt(req.query.days) || 30;

    try {
        let profileFilter = "";
        let params = [days];

        if (role === 'translator') {
            profileFilter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            profileFilter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

        // Генерируем серию дат для последних N дней
        const query = `
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '1 day' * ($1 - 1),
                    CURRENT_DATE,
                    '1 day'::interval
                )::date as date
            )
            SELECT
                ds.date,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing'), 0) as letters,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg'), 0) as chats,
                COUNT(DISTINCT m.sender_id) as unique_men,
                COALESCE(AVG(m.response_time), 0) as avg_response
            FROM date_series ds
            LEFT JOIN allowed_profiles p ON 1=1 ${profileFilter}
            LEFT JOIN messages m ON m.account_id = p.profile_id AND DATE(m.timestamp) = ds.date
            GROUP BY ds.date
            ORDER BY ds.date DESC
        `;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows || [] });
    } catch (e) {
        console.error('Daily stats error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 6.2. Топ анкет по доходу
app.get('/api/stats/top-profiles', async (req, res) => {
    const { userId, role, limit = 10 } = req.query;
    try {
        let filter = "";
        let params = [limit];

        if (role === 'translator') {
            filter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            filter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

        const query = `
            SELECT
                p.profile_id,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats,
                COUNT(DISTINCT m.sender_id) as unique_men,
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} + 
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as income,
                MAX(m.timestamp) as last_activity
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            WHERE m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ${filter}
            GROUP BY p.profile_id, p.id
            ORDER BY income DESC
            LIMIT $1
        `;

        const result = await pool.query(query, params);
        res.json({ success: true, profiles: result.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6.3. Статистика по переводчикам (для админов и директора)
app.get('/api/stats/translators', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'admin') {
            // Админ видит только своих переводчиков
            filter = `WHERE u.owner_id = $1 AND u.role = 'translator'`;
            params.push(userId);
        } else if (role === 'director') {
            // Директор видит всех переводчиков
            filter = `WHERE u.role = 'translator'`;
        } else {
            return res.json({ success: true, translators: [] });
        }

        const query = `
            SELECT
                u.id,
                u.username,
                COUNT(DISTINCT p.id) as profiles_count,
                COUNT(DISTINCT CASE WHEN m.type = 'outgoing' THEN m.id END) as letters,
                COUNT(DISTINCT CASE WHEN m.type = 'chat_msg' THEN m.id END) as chats,
                COUNT(DISTINCT m.sender_id) as unique_men,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                (COUNT(DISTINCT CASE WHEN m.type = 'outgoing' THEN m.id END) * ${PRICE_LETTER} +
                 COUNT(DISTINCT CASE WHEN m.type = 'chat_msg' THEN m.id END) * ${PRICE_CHAT}) as total_income,
                MAX(m.timestamp) as last_activity
            FROM users u
            LEFT JOIN allowed_profiles p ON u.id = p.assigned_translator_id
            LEFT JOIN messages m ON p.profile_id = m.account_id
                AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ${filter}
            GROUP BY u.id, u.username
            ORDER BY total_income DESC NULLS LAST
        `;

        const result = await pool.query(query, params);
        
        // Форматируем данные
        const translators = result.rows.map(t => ({
            id: t.id,
            username: t.username,
            profilesCount: t.profiles_count,
            letters: t.letters || 0,
            chats: t.chats || 0,
            uniqueMen: t.unique_men || 0,
            avgResponseTime: Math.round(t.avg_response_seconds / 60) || 0,
            totalIncome: parseFloat(t.total_income || 0).toFixed(2),
            lastActivity: t.last_activity,
            efficiency: t.profiles_count > 0 ? ((parseFloat(t.total_income || 0) / t.profiles_count) * 100).toFixed(1) : 0
        }));

        res.json({ success: true, translators });
    } catch (e) { await logError('/api/stats/translators', 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// 6.4. Статистика по админам (только для директора)
app.get('/api/stats/admins', async (req, res) => {
    const { userId, role } = req.query;
    
    if (role !== 'director') {
        return res.json({ success: true, admins: [] });
    }

    try {
        const query = `
            SELECT
                u.id,
                u.username,
                COUNT(DISTINCT t.id) as translators_count,
                COUNT(DISTINCT p.id) as total_profiles,
                SUM(stats.letters) as total_letters,
                SUM(stats.chats) as total_chats,
                SUM(stats.income) as team_income,
                COALESCE(AVG(stats.avg_response), 0) as avg_team_response
            FROM users u
            LEFT JOIN users t ON u.id = t.owner_id AND t.role = 'translator'
            LEFT JOIN allowed_profiles p ON u.id = p.assigned_admin_id
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters,
                    COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats,
                    (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} + 
                     COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as income,
                    COALESCE(AVG(m.response_time), 0) as avg_response
                FROM messages m
                WHERE m.account_id = p.profile_id
                    AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
            ) stats ON true
            WHERE u.role = 'admin'
            GROUP BY u.id, u.username
            ORDER BY team_income DESC NULLS LAST
        `;

        const result = await pool.query(query);
        
        const admins = result.rows.map(a => ({
            id: a.id,
            username: a.username,
            translatorsCount: a.translators_count || 0,
            totalProfiles: a.total_profiles || 0,
            totalLetters: a.total_letters || 0,
            totalChats: a.total_chats || 0,
            teamIncome: parseFloat(a.team_income || 0).toFixed(2),
            avgTeamResponse: Math.round(a.avg_team_response / 60) || 0,
            efficiencyPerTranslator: a.translators_count > 0 
                ? (parseFloat(a.team_income || 0) / a.translators_count).toFixed(2)
                : 0
        }));

        res.json({ success: true, admins });
    } catch (e) { await logError('/api/stats/admins', 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// 6.5. Детальная статистика по анкете
app.get('/api/stats/profile/:profileId', async (req, res) => {
    const { profileId } = req.params;
    const { userId, role } = req.query;
    
    try {
        // Проверка доступа к анкете
        let accessQuery = `SELECT * FROM allowed_profiles WHERE profile_id = $1`;
        const accessParams = [profileId];
        
        if (role === 'translator') {
            accessQuery += ` AND assigned_translator_id = $2`;
            accessParams.push(userId);
        } else if (role === 'admin') {
            accessQuery += ` AND assigned_admin_id = $2`;
            accessParams.push(userId);
        }
        
        const accessCheck = await pool.query(accessQuery, accessParams);
        if (accessCheck.rows.length === 0 && role !== 'director') {
            return res.status(403).json({ success: false, error: 'Нет доступа к этой анкете' });
        }

        const query = `
            SELECT
                p.profile_id,
                p.note,
                u_admin.username as admin_name,
                u_trans.username as translator_name,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as total_letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as total_chats,
                COUNT(DISTINCT m.sender_id) as total_men,
                COUNT(DISTINCT m.conversation_id) as total_conversations,
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} + 
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as total_income,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                MAX(m.timestamp) as last_activity,
                MIN(m.timestamp) as first_activity,
                SUM(CASE WHEN m.is_first_message THEN 1 ELSE 0 END) as first_messages_sent,
                SUM(CASE WHEN m.is_last_message THEN 1 ELSE 0 END) as conversations_ended
            FROM allowed_profiles p
            LEFT JOIN users u_admin ON p.assigned_admin_id = u_admin.id
            LEFT JOIN users u_trans ON p.assigned_translator_id = u_trans.id
            LEFT JOIN messages m ON p.profile_id = m.account_id
                AND m.timestamp >= CURRENT_DATE - INTERVAL '90 days'
            WHERE p.profile_id = $1
            GROUP BY p.profile_id, p.note, u_admin.username, u_trans.username
        `;

        const result = await pool.query(query, [profileId]);
        
        if (result.rows.length === 0) {
            return res.json({ success: true, profile: null });
        }

        const profile = result.rows[0];
        const stats = {
            profileId: profile.profile_id,
            note: profile.note,
            adminName: profile.admin_name,
            translatorName: profile.translator_name,
            totalLetters: profile.total_letters || 0,
            totalChats: profile.total_chats || 0,
            totalMen: profile.total_men || 0,
            totalConversations: profile.total_conversations || 0,
            totalIncome: parseFloat(profile.total_income || 0).toFixed(2),
            avgResponseTime: Math.round(profile.avg_response_seconds / 60) || 0,
            lastActivity: profile.last_activity,
            firstActivity: profile.first_activity,
            firstMessagesSent: profile.first_messages_sent || 0,
            conversationsEnded: profile.conversations_ended || 0,
            replyRate: profile.first_messages_sent > 0 
                ? ((profile.total_conversations / profile.first_messages_sent) * 100).toFixed(1)
                : 0,
            avgIncomePerMan: profile.total_men > 0 
                ? (parseFloat(profile.total_income || 0) / profile.total_men).toFixed(2)
                : 0
        };

        res.json({ success: true, profile: stats });
    } catch (e) { await logError(`/api/stats/profile/${profileId}`, 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// 6.6. Прогноз дохода
app.get('/api/stats/forecast', async (req, res) => {
    const { userId, role } = req.query;
    try {
        let filter = "";
        let params = [];

        if (role === 'translator') {
            filter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        } else if (role === 'admin') {
            filter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        }

        const query = `
            SELECT
                -- Доход за последние 7 дней
                SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) as week_income,
                -- Доход за последние 30 дней
                SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) as month_income,
                -- Средний дневной доход за 7 дней
                COALESCE(SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) / 7, 0) as avg_daily_income_7d,
                -- Тренд (сравнение последних 7 дней с предыдущими 7 днями)
                (SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END) /
                 NULLIF(SUM(CASE WHEN m.timestamp >= CURRENT_DATE - INTERVAL '14 days' 
                                 AND m.timestamp < CURRENT_DATE - INTERVAL '7 days'
                    THEN CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END
                    ELSE 0 END), 0) - 1) * 100 as growth_percent
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            ${filter}
        `;

        const result = await pool.query(query, params);
        const data = result.rows[0];
        
        const forecast = {
            weekIncome: parseFloat(data.week_income || 0).toFixed(2),
            monthIncome: parseFloat(data.month_income || 0).toFixed(2),
            avgDailyIncome: parseFloat(data.avg_daily_income_7d || 0).toFixed(2),
            growthPercent: data.growth_percent ? parseFloat(data.growth_percent).toFixed(1) : 0,
            // Прогноз на месяц (средний день * 30)
            monthForecast: (parseFloat(data.avg_daily_income_7d || 0) * 30).toFixed(2),
            // Прогноз на следующую неделю
            weekForecast: (parseFloat(data.avg_daily_income_7d || 0) * 7).toFixed(2)
        };

        res.json({ success: true, forecast });
    } catch (e) { await logError('/api/stats/forecast', 'QueryError', e.message, req.query, userId); res.status(500).json({ error: e.message }); }
});

// 6.7. Активность по часам (тепловая карта) - ОБНОВЛЕНО v6.0
app.get('/api/stats/hourly-activity', async (req, res) => {
    const { userId, role } = req.query;
    const days = parseInt(req.query.days) || 7;

    try {
        let activityFilter = "";
        let msgFilter = "";
        let params = [days];

        if (role === 'translator') {
            activityFilter = `AND a.translator_id = $2`;
            msgFilter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            activityFilter = `AND a.admin_id = $2`;
            msgFilter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

        // Пробуем сначала activity_log
        const activityQuery = `
            SELECT
                EXTRACT(HOUR FROM a.created_at) as hour,
                COUNT(*) as message_count
            FROM activity_log a
            WHERE a.created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
            ${activityFilter}
            GROUP BY EXTRACT(HOUR FROM a.created_at)
            ORDER BY hour
        `;

        let result = await pool.query(activityQuery, params);

        // Если activity_log пуст, используем messages
        if (result.rows.length === 0) {
            const msgQuery = `
                SELECT
                    EXTRACT(HOUR FROM m.timestamp) as hour,
                    COUNT(*) as message_count
                FROM messages m
                JOIN allowed_profiles p ON m.account_id = p.profile_id
                WHERE m.timestamp >= CURRENT_DATE - INTERVAL '1 day' * $1
                ${msgFilter}
                GROUP BY EXTRACT(HOUR FROM m.timestamp)
                ORDER BY hour
            `;
            result = await pool.query(msgQuery, params);
        }

        // Находим максимальное значение для нормализации
        const maxCount = Math.max(...result.rows.map(r => parseInt(r.message_count) || 0), 1);

        // Формируем массив из 24 значений (0-1 интенсивность)
        const hourlyData = Array.from({ length: 24 }, (_, hour) => {
            const hourData = result.rows.find(r => parseInt(r.hour) === hour);
            const count = hourData ? parseInt(hourData.message_count) : 0;
            // Нормализуем до значения от 0 до 1
            return parseFloat((count / maxCount).toFixed(2));
        });

        res.json({ success: true, hourlyData });
    } catch (e) {
        console.error('Hourly activity error:', e.message);
        await logError('/api/stats/hourly-activity', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// 6.8. Статистика по админам (GET /api/stats/by-admin)
app.get('/api/stats/by-admin', async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    try {
        // Фильтр по датам
        let dateFilter = "";
        let params = [];
        let paramIndex = 1;

        if (dateFrom) {
            dateFilter += ` AND a.created_at >= $${paramIndex}::date`;
            params.push(dateFrom);
            paramIndex++;
        }
        if (dateTo) {
            dateFilter += ` AND a.created_at <= $${paramIndex}::date + INTERVAL '1 day'`;
            params.push(dateTo);
            paramIndex++;
        }

        const query = `
            SELECT
                u.id as admin_id,
                u.username as admin_name,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) as letters,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat'), 0) as chats,
                COALESCE(SUM(a.income), 0) as income,
                COALESCE(AVG(a.response_time_sec), 0) as avg_response_time,
                CASE
                    WHEN COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) > 0
                    THEN ROUND((COUNT(DISTINCT a.man_id)::numeric / COUNT(*) FILTER (WHERE a.action_type = 'letter')) * 100, 1)
                    ELSE 0
                END as conversion
            FROM users u
            LEFT JOIN activity_log a ON a.admin_id = u.id ${dateFilter}
            WHERE u.role = 'admin'
            GROUP BY u.id, u.username
            ORDER BY income DESC NULLS LAST
        `;

        const result = await pool.query(query, params);

        const admins = result.rows.map(row => ({
            admin_id: row.admin_id,
            admin_name: row.admin_name,
            letters: parseInt(row.letters) || 0,
            chats: parseInt(row.chats) || 0,
            income: parseFloat(row.income || 0).toFixed(2),
            avg_response_time: Math.round((parseFloat(row.avg_response_time) || 0) / 60),
            conversion: parseFloat(row.conversion) || 0
        }));

        res.json({ success: true, admins });
    } catch (e) {
        console.error('Stats by admin error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 6.9. Статистика по переводчикам (GET /api/stats/by-translator)
app.get('/api/stats/by-translator', async (req, res) => {
    const { adminId, dateFrom, dateTo } = req.query;

    try {
        let filter = "";
        let params = [];
        let paramIndex = 1;

        // Фильтр по админу
        if (adminId) {
            filter += ` AND u.owner_id = $${paramIndex}`;
            params.push(adminId);
            paramIndex++;
        }

        // Фильтр по датам
        let dateFilter = "";
        if (dateFrom) {
            dateFilter += ` AND a.created_at >= $${paramIndex}::date`;
            params.push(dateFrom);
            paramIndex++;
        }
        if (dateTo) {
            dateFilter += ` AND a.created_at <= $${paramIndex}::date + INTERVAL '1 day'`;
            params.push(dateTo);
            paramIndex++;
        }

        const query = `
            SELECT
                u.id as translator_id,
                u.username as translator_name,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) as letters,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat'), 0) as chats,
                COALESCE(SUM(a.income), 0) as income,
                COALESCE(AVG(a.response_time_sec), 0) as avg_response_time,
                CASE
                    WHEN COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter'), 0) > 0
                    THEN ROUND((COUNT(DISTINCT a.man_id)::numeric / COUNT(*) FILTER (WHERE a.action_type = 'letter')) * 100, 1)
                    ELSE 0
                END as conversion,
                CASE
                    WHEN COUNT(*) > 0
                    THEN ROUND((COUNT(*) FILTER (WHERE a.used_ai = true)::numeric / COUNT(*)) * 100, 1)
                    ELSE 0
                END as ai_usage_percent
            FROM users u
            LEFT JOIN activity_log a ON a.translator_id = u.id ${dateFilter}
            WHERE u.role = 'translator' ${filter}
            GROUP BY u.id, u.username
            ORDER BY income DESC NULLS LAST
        `;

        const result = await pool.query(query, params);

        const translators = result.rows.map(row => ({
            translator_id: row.translator_id,
            translator_name: row.translator_name,
            letters: parseInt(row.letters) || 0,
            chats: parseInt(row.chats) || 0,
            income: parseFloat(row.income || 0).toFixed(2),
            avg_response_time: Math.round((parseFloat(row.avg_response_time) || 0) / 60),
            conversion: parseFloat(row.conversion) || 0,
            ai_usage_percent: parseFloat(row.ai_usage_percent) || 0
        }));

        res.json({ success: true, translators });
    } catch (e) {
        console.error('Stats by translator error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 7. УТИЛИТЫ И АВАРИЙНЫЕ ФУНКЦИИ (без изменений)
// ==========================================
app.get('/reset-database', async (req, res) => {
    try {
        console.log('⚠️ ЗАПУЩЕН СБРОС БАЗЫ ДАННЫХ...');
        await pool.query('DROP TABLE IF EXISTS daily_stats CASCADE');
        await pool.query('DROP TABLE IF EXISTS error_logs CASCADE');
        await pool.query('DROP TABLE IF EXISTS message_content CASCADE');
        await pool.query('DROP TABLE IF EXISTS messages CASCADE');
        await pool.query('DROP TABLE IF EXISTS allowed_profiles CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');
        
        console.log('✅ Таблицы удалены. Перезапустите сервер.');
        res.send('<h1>✅ База данных очищена!</h1><p>Теперь <b>перезапустите server.js</b> чтобы создать новые таблицы.</p>');
    } catch(e) {
        res.send('Ошибка: ' + e.message);
    }
});

// Утилита для пересчета статистики
app.get('/recalculate-stats', async (req, res) => {
    try {
        console.log('🔄 Пересчет ежедневной статистики...');
        
        // Пересчитываем статистику за последние 30 дней для всех пользователей
        await pool.query(`
            INSERT INTO daily_stats (user_id, date, letters_count, chats_count, unique_men, total_income, avg_response_time)
            SELECT
                p.assigned_translator_id as user_id,
                DATE(m.timestamp) as date,
                COUNT(*) FILTER (WHERE m.type = 'outgoing') as letters_count,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg') as chats_count,
                COUNT(DISTINCT m.sender_id) as unique_men,
                (COUNT(*) FILTER (WHERE m.type = 'outgoing') * ${PRICE_LETTER} + 
                 COUNT(*) FILTER (WHERE m.type = 'chat_msg') * ${PRICE_CHAT}) as total_income,
                AVG(m.response_time) as avg_response_time
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            WHERE m.timestamp >= CURRENT_DATE - INTERVAL '30 days'
                AND p.assigned_translator_id IS NOT NULL
            GROUP BY p.assigned_translator_id, DATE(m.timestamp)
            ON CONFLICT (user_id, date) DO UPDATE SET
                letters_count = EXCLUDED.letters_count,
                chats_count = EXCLUDED.chats_count,
                unique_men = EXCLUDED.unique_men,
                total_income = EXCLUDED.total_income,
                avg_response_time = EXCLUDED.avg_response_time
        `);
        
        res.json({ success: true, message: 'Статистика пересчитана' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 9. ИСТОРИЯ ПЕРЕПИСОК И ЛОГИ ОШИБОК (без изменений)
// ==========================================

// 9.1. История переписок
app.get('/api/history', async (req, res) => {
    const { userId, role, search, profileId, senderId, startDate, endDate, type, status, limit = 50, offset = 0 } = req.query;
    try {
        let filter = "WHERE 1=1 ";
        let params = [limit, offset];
        let paramIndex = 3;
        
        // Фильтр по роли
        if (role === 'translator') {
            filter += `AND p.assigned_translator_id = $${paramIndex++} `;
            params.push(userId);
        } else if (role === 'admin') {
            filter += `AND p.assigned_admin_id = $${paramIndex++} `;
            params.push(userId);
        }

        // Поиск по ID Анкеты
        if (profileId) {
            filter += `AND p.profile_id = $${paramIndex++} `;
            params.push(profileId);
        }

        // Поиск по ID Мужчины
        if (senderId) {
            filter += `AND m.sender_id = $${paramIndex++} `;
            params.push(senderId);
        }

        // Фильтры по дате
        if (startDate) {
            filter += `AND m.timestamp >= $${paramIndex++}::date `;
            params.push(startDate);
        }
        if (endDate) {
            filter += `AND m.timestamp < ($${paramIndex++}::date + INTERVAL '1 day') `;
            params.push(endDate);
        }

        // Фильтры по типу/статусу
        if (type) {
            filter += `AND m.type = $${paramIndex++} `;
            params.push(type);
        }
        if (status) {
            filter += `AND m.status = $${paramIndex++} `;
            params.push(status);
        }
        
        // Поиск по тексту сообщения
        if (search) {
            filter += `AND mc.text_content ILIKE $${paramIndex++} `;
            params.push(`%${search}%`);
        }

        const query = `
            SELECT 
                m.id, m.timestamp, m.account_id, m.sender_id, m.type, m.status, m.response_time, m.message_length,
                mc.text_content, mc.media_url, mc.file_name
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            LEFT JOIN message_content mc ON m.message_content_id = mc.id
            ${filter}
            ORDER BY m.timestamp DESC
            LIMIT $1 OFFSET $2
        `;
        
        // Общее количество сообщений (для пагинации) - используем те же параметры, кроме LIMIT и OFFSET
        const countParams = params.slice(2);
        const countQuery = `
            SELECT COUNT(m.id)
            FROM messages m
            JOIN allowed_profiles p ON m.account_id = p.profile_id
            LEFT JOIN message_content mc ON m.message_content_id = mc.id
            ${filter}
        `;
        
        const countResult = await pool.query(countQuery, countParams); 
        const totalCount = parseInt(countResult.rows[0].count);

        const result = await pool.query(query, params);
        res.json({ success: true, list: result.rows, total: totalCount });

    } catch (e) { 
        await logError('/api/history', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message }); 
    }
});

// ==========================================
// 10. API ДЛЯ ЛИЧНОГО КАБИНЕТА (DASHBOARD)
// ==========================================

// 10.1. Сводка для дашборда (все ключевые метрики) - ОБНОВЛЕНО v6.0
app.get('/api/dashboard', async (req, res) => {
    const { userId, role, dateFrom, dateTo } = req.query;

    try {
        let profileFilter = "";
        let activityFilter = "";
        let params = [];
        let paramIndex = 1;

        if (role === 'translator') {
            profileFilter = `WHERE p.assigned_translator_id = $${paramIndex}`;
            activityFilter = `AND a.translator_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        } else if (role === 'admin') {
            profileFilter = `WHERE p.assigned_admin_id = $${paramIndex}`;
            activityFilter = `AND a.admin_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        }

        // Количество анкет
        const profilesQuery = `
            SELECT COUNT(*) as total_profiles
            FROM allowed_profiles p
            ${profileFilter}
        `;
        const profilesResult = await pool.query(profilesQuery, params);
        const totalProfiles = parseInt(profilesResult.rows[0]?.total_profiles) || 0;

        // Статистика из activity_log (основная таблица) + messages (для совместимости)
        const statsQuery = `
            SELECT
                -- Сегодня
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE), 0) as letters_today,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE), 0) as chats_today,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'incoming' AND DATE(a.created_at) = CURRENT_DATE), 0) as incoming_today,
                -- AI использования
                COALESCE(COUNT(*) FILTER (WHERE a.used_ai = true AND DATE(a.created_at) = CURRENT_DATE), 0) as ai_usage_today,
                COALESCE(COUNT(*) FILTER (WHERE a.used_ai = true AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as ai_usage_week,
                COALESCE(COUNT(*) FILTER (WHERE a.used_ai = true AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as ai_usage_month,
                -- Вчера (для сравнения)
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND DATE(a.created_at) = CURRENT_DATE - 1), 0) as letters_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND DATE(a.created_at) = CURRENT_DATE - 1), 0) as chats_yesterday,
                -- За 7 дней
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as letters_week,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as chats_week,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'incoming' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as incoming_week,
                -- За 30 дней
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'letter' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as letters_month,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'chat' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as chats_month,
                COALESCE(COUNT(*) FILTER (WHERE a.action_type = 'incoming' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as incoming_month,
                -- Уникальные мужчины (сколько РАЗНЫХ мужчин прислали входящие письма за период)
                COUNT(DISTINCT CASE WHEN a.action_type = 'incoming' AND DATE(a.created_at) = CURRENT_DATE THEN a.man_id END) as unique_men_today,
                COUNT(DISTINCT CASE WHEN a.action_type = 'incoming' AND a.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN a.man_id END) as unique_men_week,
                COUNT(DISTINCT CASE WHEN a.action_type = 'incoming' AND a.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN a.man_id END) as unique_men_month,
                -- Среднее время ответа (в секундах -> минуты)
                COALESCE(AVG(a.response_time_sec) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as avg_response_seconds,
                -- Медиана времени ответа
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a.response_time_sec) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as median_response_seconds,
                -- Суммарный доход
                COALESCE(SUM(a.income) FILTER (WHERE DATE(a.created_at) = CURRENT_DATE), 0) as income_today,
                COALESCE(SUM(a.income) FILTER (WHERE DATE(a.created_at) = CURRENT_DATE - 1), 0) as income_yesterday,
                COALESCE(SUM(a.income) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as income_week,
                COALESCE(SUM(a.income) FILTER (WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as income_month
            FROM activity_log a
            WHERE 1=1 ${activityFilter}
        `;

        const statsResult = await pool.query(statsQuery, params);
        const stats = statsResult.rows[0] || {};

        // Ошибки из error_logs
        const errorsQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE DATE(timestamp) = CURRENT_DATE), 0) as errors_today,
                COALESCE(COUNT(*) FILTER (WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'), 0) as errors_week
            FROM error_logs
        `;
        const errorsResult = await pool.query(errorsQuery);
        const errors = errorsResult.rows[0] || {};

        // Также считаем из messages для совместимости (если activity_log пуст)
        const messagesQuery = `
            SELECT
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND DATE(m.timestamp) = CURRENT_DATE AND m.status = 'success'), 0) as letters_today,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE AND m.status = 'success'), 0) as chats_today,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND DATE(m.timestamp) = CURRENT_DATE - 1 AND m.status = 'success'), 0) as letters_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND DATE(m.timestamp) = CURRENT_DATE - 1 AND m.status = 'success'), 0) as chats_yesterday,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.timestamp >= CURRENT_DATE - INTERVAL '7 days' AND m.status = 'success'), 0) as letters_week,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.timestamp >= CURRENT_DATE - INTERVAL '7 days' AND m.status = 'success'), 0) as chats_week,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days' AND m.status = 'success'), 0) as letters_month,
                COALESCE(COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days' AND m.status = 'success'), 0) as chats_month,
                -- Уникальные мужчины (входящие письма)
                COUNT(DISTINCT CASE WHEN m.type = 'incoming' AND DATE(m.timestamp) = CURRENT_DATE THEN m.sender_id END) as unique_men_today,
                COUNT(DISTINCT CASE WHEN m.type = 'incoming' AND m.timestamp >= CURRENT_DATE - INTERVAL '7 days' THEN m.sender_id END) as unique_men_week,
                COUNT(DISTINCT CASE WHEN m.type = 'incoming' AND m.timestamp >= CURRENT_DATE - INTERVAL '30 days' THEN m.sender_id END) as unique_men_month,
                COALESCE(AVG(m.response_time) FILTER (WHERE m.timestamp >= CURRENT_DATE - INTERVAL '7 days'), 0) as avg_response_seconds
            FROM allowed_profiles p
            LEFT JOIN messages m ON m.account_id = p.profile_id
            ${profileFilter}
        `;
        const messagesResult = await pool.query(messagesQuery, params);
        const msgStats = messagesResult.rows[0] || {};

        // Используем данные из activity_log если есть, иначе из messages
        const lettersToday = parseInt(stats.letters_today) || parseInt(msgStats.letters_today) || 0;
        const chatsToday = parseInt(stats.chats_today) || parseInt(msgStats.chats_today) || 0;
        const lettersYesterday = parseInt(stats.letters_yesterday) || parseInt(msgStats.letters_yesterday) || 0;
        const chatsYesterday = parseInt(stats.chats_yesterday) || parseInt(msgStats.chats_yesterday) || 0;
        const lettersWeek = parseInt(stats.letters_week) || parseInt(msgStats.letters_week) || 0;
        const chatsWeek = parseInt(stats.chats_week) || parseInt(msgStats.chats_week) || 0;
        const lettersMonth = parseInt(stats.letters_month) || parseInt(msgStats.letters_month) || 0;
        const chatsMonth = parseInt(stats.chats_month) || parseInt(msgStats.chats_month) || 0;

        // Входящие письма от мужчин
        const incomingToday = parseInt(stats.incoming_today) || 0;
        const incomingWeek = parseInt(stats.incoming_week) || 0;
        const incomingMonth = parseInt(stats.incoming_month) || 0;

        // Доход из activity_log или расчет по messages
        const incomeToday = parseFloat(stats.income_today) || (lettersToday * PRICE_LETTER + chatsToday * PRICE_CHAT);
        const incomeYesterday = parseFloat(stats.income_yesterday) || (lettersYesterday * PRICE_LETTER + chatsYesterday * PRICE_CHAT);
        const incomeWeek = parseFloat(stats.income_week) || (lettersWeek * PRICE_LETTER + chatsWeek * PRICE_CHAT);
        const incomeMonth = parseFloat(stats.income_month) || (lettersMonth * PRICE_LETTER + chatsMonth * PRICE_CHAT);

        // Рост по сравнению со вчера
        const growthPercent = incomeYesterday > 0
            ? (((incomeToday - incomeYesterday) / incomeYesterday) * 100).toFixed(1)
            : (incomeToday > 0 ? 100 : 0);

        // Среднее и медиана времени ответа
        const avgResponseSec = parseFloat(stats.avg_response_seconds) || parseFloat(msgStats.avg_response_seconds) || 0;
        const medianResponseSec = parseFloat(stats.median_response_seconds) || 0;

        // Расчёт времени работы на основе heartbeats (количество уникальных часов онлайн)
        const workTimeQuery = `
            SELECT
                COUNT(DISTINCT DATE_TRUNC('hour', timestamp)) FILTER (WHERE DATE(timestamp) = CURRENT_DATE) as hours_today,
                COUNT(DISTINCT DATE_TRUNC('hour', timestamp)) FILTER (WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days') as hours_month
            FROM heartbeats
            WHERE status = 'online'
        `;
        const workTimeResult = await pool.query(workTimeQuery);
        const workTimeData = workTimeResult.rows[0] || {};
        const hoursToday = parseInt(workTimeData.hours_today) || 0;
        const hoursMonth = parseInt(workTimeData.hours_month) || 0;

        // Форматирование времени работы
        const formatWorkTime = (hours) => {
            if (hours < 1) return '0ч 0м';
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            return `${h}ч ${m}м`;
        };

        res.json({
            success: true,
            dashboard: {
                // Сегодня
                today: {
                    letters: lettersToday,
                    chats: chatsToday,
                    incomingLetters: incomingToday,
                    uniqueMen: parseInt(stats.unique_men_today) || parseInt(msgStats.unique_men_today) || 0,
                    income: incomeToday.toFixed(2),
                    errors: parseInt(errors.errors_today) || 0,
                    aiUsage: parseInt(stats.ai_usage_today) || 0
                },
                // Вчера (для сравнения)
                yesterday: {
                    letters: lettersYesterday,
                    chats: chatsYesterday,
                    income: incomeYesterday.toFixed(2)
                },
                // За неделю
                week: {
                    letters: lettersWeek,
                    chats: chatsWeek,
                    incomingLetters: incomingWeek,
                    uniqueMen: parseInt(stats.unique_men_week) || parseInt(msgStats.unique_men_week) || 0,
                    income: incomeWeek.toFixed(2),
                    errors: parseInt(errors.errors_week) || 0,
                    aiUsage: parseInt(stats.ai_usage_week) || 0
                },
                // За месяц
                month: {
                    letters: lettersMonth,
                    chats: chatsMonth,
                    incomingLetters: incomingMonth,
                    uniqueMen: parseInt(stats.unique_men_month) || parseInt(msgStats.unique_men_month) || 0,
                    income: incomeMonth.toFixed(2),
                    aiUsage: parseInt(stats.ai_usage_month) || 0
                },
                // Метрики
                metrics: {
                    totalProfiles: totalProfiles,
                    avgResponseTime: Math.round(avgResponseSec / 60),
                    medianResponseTime: Math.round(medianResponseSec / 60),
                    growthPercent: parseFloat(growthPercent) || 0,
                    avgDailyIncome: (incomeWeek / 7).toFixed(2),
                    workTime: formatWorkTime(hoursToday),
                    workTimeMonth: formatWorkTime(hoursMonth)
                }
            }
        });

    } catch (e) {
        console.error('Dashboard error:', e.message);
        await logError('/api/dashboard', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// 10.2. Статус ботов (онлайн/офлайн) - ОБНОВЛЕНО v6.0
app.get('/api/bots/status', async (req, res) => {
    const { userId, role } = req.query;

    try {
        // Получаем список ботов из таблицы bots с количеством профилей
        const botsQuery = `
            SELECT
                b.bot_id,
                b.name,
                b.platform,
                b.ip,
                b.version,
                b.status,
                b.last_heartbeat,
                CASE
                    WHEN b.last_heartbeat > NOW() - INTERVAL '2 minutes' THEN 'online'
                    WHEN b.last_heartbeat > NOW() - INTERVAL '10 minutes' THEN 'idle'
                    ELSE 'offline'
                END as connection_status,
                COALESCE(bp.profiles_count, 0) as profiles_count,
                bp.profiles
            FROM bots b
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) as profiles_count,
                    ARRAY_AGG(bp2.profile_id) as profiles
                FROM bot_profiles bp2
                WHERE bp2.bot_id = b.bot_id
            ) bp ON true
            ORDER BY b.last_heartbeat DESC NULLS LAST
        `;
        const botsResult = await pool.query(botsQuery);

        // Также получаем по старой схеме для совместимости
        let profileFilter = "";
        let params = [];

        if (role === 'translator') {
            profileFilter = `WHERE p.assigned_translator_id = $1`;
            params.push(userId);
        } else if (role === 'admin') {
            profileFilter = `WHERE p.assigned_admin_id = $1`;
            params.push(userId);
        }

        const profilesQuery = `
            SELECT DISTINCT ON (p.profile_id)
                p.profile_id,
                p.note,
                h.bot_id,
                h.status,
                h.ip,
                h.version,
                h.platform,
                h.timestamp as last_heartbeat,
                CASE
                    WHEN h.timestamp > NOW() - INTERVAL '2 minutes' THEN 'online'
                    WHEN h.timestamp > NOW() - INTERVAL '10 minutes' THEN 'idle'
                    ELSE 'offline'
                END as connection_status
            FROM allowed_profiles p
            LEFT JOIN heartbeats h ON p.profile_id = h.account_display_id
            ${profileFilter}
            ORDER BY p.profile_id, h.timestamp DESC
        `;
        const profilesResult = await pool.query(profilesQuery, params);

        // Подсчёт статусов
        const statusCounts = {
            online: 0,
            idle: 0,
            offline: 0,
            never_connected: 0
        };

        // Формируем список ботов
        const bots = botsResult.rows.length > 0
            ? botsResult.rows.map(row => {
                const status = row.last_heartbeat ? row.connection_status : 'never_connected';
                statusCounts[status]++;

                return {
                    botId: row.bot_id,
                    name: row.name,
                    platform: row.platform,
                    ip: row.ip,
                    version: row.version,
                    status: status,
                    lastHeartbeat: row.last_heartbeat,
                    profilesCount: parseInt(row.profiles_count) || 0,
                    profiles: row.profiles || []
                };
            })
            : profilesResult.rows.map(row => {
                const status = row.last_heartbeat ? row.connection_status : 'never_connected';
                statusCounts[status]++;

                return {
                    botId: row.bot_id || row.profile_id,  // Используем profile_id если нет bot_id
                    profileId: row.profile_id,
                    name: row.note || `Анкета ${row.profile_id}`,
                    note: row.note,
                    platform: row.platform || 'Unknown',
                    ip: row.ip || '-',
                    version: row.version || '-',
                    status: status,
                    lastHeartbeat: row.last_heartbeat,
                    profilesCount: 1
                };
            });

        res.json({
            success: true,
            summary: statusCounts,
            bots: bots
        });

    } catch (e) {
        console.error('Bots status error:', e.message);
        await logError('/api/bots/status', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// 10.3. Последняя активность (лента событий) - ОБНОВЛЕНО v6.0
app.get('/api/activity/recent', async (req, res) => {
    const { userId, role, limit = 50 } = req.query;
    const limitInt = parseInt(limit) || 50;

    try {
        let activityFilter = "";
        let msgFilter = "";
        let params = [limitInt];

        if (role === 'translator') {
            activityFilter = `AND a.translator_id = $2`;
            msgFilter = `AND p.assigned_translator_id = $2`;
            params.push(userId);
        } else if (role === 'admin') {
            activityFilter = `AND a.admin_id = $2`;
            msgFilter = `AND p.assigned_admin_id = $2`;
            params.push(userId);
        }

        // Сначала пробуем activity_log
        const activityQuery = `
            SELECT
                a.id,
                a.created_at as timestamp,
                a.profile_id,
                a.man_id,
                a.action_type,
                a.message_text,
                a.response_time_sec,
                a.used_ai,
                a.income,
                u_admin.username as admin_name,
                u_trans.username as translator_name,
                -- Проверяем есть ли входящее письмо от этого мужчины ДО отправки (это ответ)
                CASE WHEN a.action_type IN ('letter', 'chat') AND EXISTS (
                    SELECT 1 FROM activity_log prev
                    WHERE prev.man_id = a.man_id
                    AND prev.profile_id = a.profile_id
                    AND prev.action_type = 'incoming'
                    AND prev.created_at < a.created_at
                ) THEN true ELSE false END as is_reply
            FROM activity_log a
            LEFT JOIN users u_admin ON a.admin_id = u_admin.id
            LEFT JOIN users u_trans ON a.translator_id = u_trans.id
            WHERE 1=1 ${activityFilter}
            ORDER BY a.created_at DESC
            LIMIT $1
        `;

        const activityResult = await pool.query(activityQuery, params);

        // Если activity_log пуст, используем messages
        if (activityResult.rows.length === 0) {
            const msgQuery = `
                SELECT
                    m.id,
                    m.timestamp,
                    m.account_id as profile_id,
                    m.sender_id as man_id,
                    m.type as action_type,
                    m.status,
                    m.response_time as response_time_sec,
                    mc.text_content as message_text,
                    CASE WHEN m.type = 'outgoing' THEN ${PRICE_LETTER} ELSE ${PRICE_CHAT} END as income
                FROM messages m
                JOIN allowed_profiles p ON m.account_id = p.profile_id
                LEFT JOIN message_content mc ON m.message_content_id = mc.id
                WHERE 1=1 ${msgFilter}
                ORDER BY m.timestamp DESC
                LIMIT $1
            `;

            const msgResult = await pool.query(msgQuery, params);

            const activity = msgResult.rows.map(row => ({
                id: row.id,
                profile_id: row.profile_id,
                action_type: row.action_type === 'outgoing' ? 'letter' : (row.action_type === 'chat_msg' ? 'chat' : row.action_type),
                man_id: row.man_id,
                message_text: row.message_text ? row.message_text.substring(0, 200) : null,
                response_time_sec: row.response_time_sec,
                used_ai: false,
                income: row.status === 'success' ? parseFloat(row.income) : 0,
                created_at: row.timestamp
            }));

            return res.json({ success: true, activity });
        }

        // Форматируем активность из activity_log
        const activity = activityResult.rows.map(row => ({
            id: row.id,
            profile_id: row.profile_id,
            action_type: row.action_type,
            man_id: row.man_id,
            message_text: row.message_text ? row.message_text.substring(0, 200) : null,
            response_time_sec: row.response_time_sec,
            used_ai: row.used_ai,
            income: parseFloat(row.income) || 0,
            created_at: row.timestamp,
            admin_name: row.admin_name,
            translator_name: row.translator_name,
            is_reply: row.is_reply || false
        }));

        res.json({ success: true, activity });

    } catch (e) {
        console.error('Activity recent error:', e.message);
        await logError('/api/activity/recent', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// 10.4. Статистика по конкретному боту
app.get('/api/bots/:botId/stats', async (req, res) => {
    const { botId } = req.params;
    const { userId, role, days = 7 } = req.query;

    try {
        // Проверяем доступ через профиль бота
        const accessQuery = `
            SELECT h.account_display_id
            FROM heartbeats h
            JOIN allowed_profiles p ON h.account_display_id = p.profile_id
            WHERE h.bot_id = $1
            ${role === 'translator' ? 'AND p.assigned_translator_id = $2' : ''}
            ${role === 'admin' ? 'AND p.assigned_admin_id = $2' : ''}
            LIMIT 1
        `;
        const accessParams = role === 'director' ? [botId] : [botId, userId];
        const accessResult = await pool.query(accessQuery, accessParams);

        if (accessResult.rows.length === 0 && role !== 'director') {
            return res.status(403).json({ success: false, error: 'Нет доступа к этому боту' });
        }

        const profileId = accessResult.rows[0]?.account_display_id;

        // Статистика бота
        const statsQuery = `
            SELECT
                COUNT(*) FILTER (WHERE m.type = 'outgoing' AND m.status = 'success') as letters,
                COUNT(*) FILTER (WHERE m.type = 'chat_msg' AND m.status = 'success') as chats,
                COUNT(*) FILTER (WHERE m.status = 'failed') as errors,
                COUNT(DISTINCT m.sender_id) as unique_men,
                COALESCE(AVG(m.response_time), 0) as avg_response_seconds,
                MIN(m.timestamp) as first_message,
                MAX(m.timestamp) as last_message
            FROM messages m
            WHERE m.bot_id = $1
            AND m.timestamp >= CURRENT_DATE - INTERVAL '1 day' * $2
        `;

        const statsResult = await pool.query(statsQuery, [botId, days]);
        const stats = statsResult.rows[0];

        // Последний heartbeat
        const heartbeatQuery = `
            SELECT * FROM heartbeats
            WHERE bot_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
        `;
        const heartbeatResult = await pool.query(heartbeatQuery, [botId]);
        const lastHeartbeat = heartbeatResult.rows[0];

        const income = (parseFloat(stats.letters || 0) * PRICE_LETTER) + (parseFloat(stats.chats || 0) * PRICE_CHAT);

        res.json({
            success: true,
            bot: {
                botId: botId,
                profileId: profileId,
                status: lastHeartbeat && new Date(lastHeartbeat.timestamp) > new Date(Date.now() - 2 * 60 * 1000)
                    ? 'online' : 'offline',
                lastHeartbeat: lastHeartbeat?.timestamp,
                ip: lastHeartbeat?.ip,
                version: lastHeartbeat?.version,
                platform: lastHeartbeat?.platform,
                stats: {
                    letters: parseInt(stats.letters) || 0,
                    chats: parseInt(stats.chats) || 0,
                    errors: parseInt(stats.errors) || 0,
                    uniqueMen: parseInt(stats.unique_men) || 0,
                    avgResponseTime: Math.round(stats.avg_response_seconds / 60) || 0,
                    income: income.toFixed(2),
                    firstMessage: stats.first_message,
                    lastMessage: stats.last_message
                }
            }
        });

    } catch (e) {
        await logError(`/api/bots/${botId}/stats`, 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});

// 9.2. Логи ошибок
app.get('/api/error_logs', async (req, res) => {
    const { userId, role, limit = 50, offset = 0 } = req.query;
    try {
        let filter = "WHERE 1=1 ";
        let params = [limit, offset];
        
        if (role === 'admin' || role === 'translator') {
            filter += `AND el.user_id = $3 `;
            params.push(userId);
        }

        const query = `
            SELECT el.*, u.username
            FROM error_logs el
            LEFT JOIN users u ON el.user_id = u.id
            ${filter}
            ORDER BY el.timestamp DESC
            LIMIT $1 OFFSET $2
        `;
        
        const result = await pool.query(query, params);
        res.json({ success: true, logs: result.rows });
    } catch (e) {
        await logError('/api/error_logs', 'QueryError', e.message, req.query, userId);
        res.status(500).json({ error: e.message });
    }
});


app.listen(PORT, () => {
    console.log(`🚀 CRM System v6.0 (Полная схема личного кабинета) запущен на порту ${PORT}`);
    console.log(`\n📡 Эндпоинты для бота:`);
    console.log(`   • POST /api/bot/heartbeat - heartbeat (новая схема)`);
    console.log(`   • POST /api/activity/log - логирование активности`);
    console.log(`   • POST /api/profile/status - статус профиля`);
    console.log(`   • POST /api/message_sent - отправка сообщений (legacy)`);
    console.log(`   • POST /api/heartbeat - heartbeat (legacy)`);
    console.log(`   • POST /api/error - логирование ошибок`);
    console.log(`\n📊 Эндпоинты статистики:`);
    console.log(`   • GET /api/stats/detailed - детальная статистика`);
    console.log(`   • GET /api/stats/daily - статистика по дням`);
    console.log(`   • GET /api/stats/top-profiles - топ анкет`);
    console.log(`   • GET /api/stats/translators - статистика переводчиков`);
    console.log(`   • GET /api/stats/admins - статистика админов`);
    console.log(`   • GET /api/stats/by-admin - статистика по админам`);
    console.log(`   • GET /api/stats/by-translator - статистика по переводчикам`);
    console.log(`   • GET /api/stats/profile/:id - детали по анкете`);
    console.log(`   • GET /api/stats/forecast - прогноз дохода`);
    console.log(`   • GET /api/stats/hourly-activity - активность по часам (24 значения)`);
    console.log(`\n🖥️  API для личного кабинета:`);
    console.log(`   • GET /api/dashboard - сводка для дашборда`);
    console.log(`   • GET /api/profiles - список анкет с статистикой`);
    console.log(`   • GET /api/bots/status - статус всех ботов`);
    console.log(`   • GET /api/bots/:botId/stats - статистика конкретного бота`);
    console.log(`   • GET /api/team - команда (админы + переводчики)`);
    console.log(`   • GET /api/activity/recent - последняя активность`);
    console.log(`   • GET /api/history - история переписок`);
    console.log(`   • GET /api/error_logs - логи ошибок`);
});