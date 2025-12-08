/**
 * API для сохранения/загрузки состояния анкеты бота
 * Данные привязаны к profile_id и сохраняются на сервере
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Инициализация таблицы при запуске
async function initTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_state (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(50) UNIQUE NOT NULL,

                -- Текст письма/чата
                current_mail_text TEXT DEFAULT '',
                current_chat_text TEXT DEFAULT '',

                -- Выбранные шаблоны (индексы)
                last_tpl_mail INTEGER,
                last_tpl_chat INTEGER,

                -- Статистика рассылки
                mail_stats_sent INTEGER DEFAULT 0,
                mail_stats_errors INTEGER DEFAULT 0,

                -- Статистика чата
                chat_stats_sent INTEGER DEFAULT 0,
                chat_stats_errors INTEGER DEFAULT 0,

                -- История (JSON массивы)
                mail_history_sent JSONB DEFAULT '[]'::jsonb,
                mail_history_errors JSONB DEFAULT '[]'::jsonb,
                chat_history_sent JSONB DEFAULT '[]'::jsonb,
                chat_history_errors JSONB DEFAULT '[]'::jsonb,

                -- Черные списки (JSON массивы)
                mail_blacklist JSONB DEFAULT '[]'::jsonb,
                chat_blacklist JSONB DEFAULT '[]'::jsonb,

                -- VIP список
                vip_list JSONB DEFAULT '[]'::jsonb,

                -- Настройки чата
                chat_rotation_hours INTEGER DEFAULT 3,
                chat_cyclic BOOLEAN DEFAULT false,
                chat_current_index INTEGER DEFAULT 0,
                chat_target VARCHAR(20) DEFAULT 'payers',

                -- Настройки рассылки
                mail_auto BOOLEAN DEFAULT false,
                mail_target VARCHAR(20) DEFAULT 'online',
                mail_photo_only BOOLEAN DEFAULT false,

                -- Шаблоны (хранятся на сервере для передачи между операторами)
                templates_mail JSONB DEFAULT '[]'::jsonb,
                templates_chat JSONB DEFAULT '[]'::jsonb,

                -- Метаданные
                updated_at TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Индекс для быстрого поиска
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_bot_state_profile_id ON bot_state(profile_id)
        `);

        console.log('✅ Таблица bot_state готова');
    } catch (e) {
        console.error('❌ Ошибка создания таблицы bot_state:', e.message);
    }
}

initTable();

/**
 * GET /api/bot-state/:profileId
 * Загрузка состояния анкеты
 */
router.get('/:profileId', async (req, res) => {
    const { profileId } = req.params;

    try {
        const result = await pool.query(
            `SELECT * FROM bot_state WHERE profile_id = $1`,
            [profileId]
        );

        if (result.rows.length === 0) {
            // Возвращаем пустое состояние если записи нет
            return res.json({
                success: true,
                exists: false,
                state: null
            });
        }

        const row = result.rows[0];

        res.json({
            success: true,
            exists: true,
            state: {
                currentMailText: row.current_mail_text || '',
                currentChatText: row.current_chat_text || '',
                lastTplMail: row.last_tpl_mail,
                lastTplChat: row.last_tpl_chat,
                mailStats: {
                    sent: row.mail_stats_sent || 0,
                    errors: row.mail_stats_errors || 0,
                    waiting: 0
                },
                chatStats: {
                    sent: row.chat_stats_sent || 0,
                    errors: row.chat_stats_errors || 0,
                    waiting: 0
                },
                mailHistory: {
                    sent: row.mail_history_sent || [],
                    errors: row.mail_history_errors || [],
                    waiting: []
                },
                chatHistory: {
                    sent: row.chat_history_sent || [],
                    errors: row.chat_history_errors || [],
                    waiting: []
                },
                mailBlacklist: row.mail_blacklist || [],
                chatBlacklist: row.chat_blacklist || [],
                vipList: row.vip_list || [],
                chatSettings: {
                    rotationHours: row.chat_rotation_hours || 3,
                    cyclic: row.chat_cyclic || false,
                    currentInviteIndex: row.chat_current_index || 0,
                    target: row.chat_target || 'payers'
                },
                mailSettings: {
                    auto: row.mail_auto || false,
                    target: row.mail_target || 'online',
                    photoOnly: row.mail_photo_only || false
                },
                templatesMail: row.templates_mail || [],
                templatesChat: row.templates_chat || []
            }
        });
    } catch (e) {
        console.error('Ошибка загрузки bot_state:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/bot-state/:profileId
 * Сохранение состояния анкеты
 */
router.post('/:profileId', async (req, res) => {
    const { profileId } = req.params;
    const state = req.body;

    try {
        await pool.query(`
            INSERT INTO bot_state (
                profile_id,
                current_mail_text, current_chat_text,
                last_tpl_mail, last_tpl_chat,
                mail_stats_sent, mail_stats_errors,
                chat_stats_sent, chat_stats_errors,
                mail_history_sent, mail_history_errors,
                chat_history_sent, chat_history_errors,
                mail_blacklist, chat_blacklist,
                vip_list,
                chat_rotation_hours, chat_cyclic, chat_current_index, chat_target,
                mail_auto, mail_target, mail_photo_only,
                templates_mail, templates_chat,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW()
            )
            ON CONFLICT (profile_id) DO UPDATE SET
                current_mail_text = EXCLUDED.current_mail_text,
                current_chat_text = EXCLUDED.current_chat_text,
                last_tpl_mail = EXCLUDED.last_tpl_mail,
                last_tpl_chat = EXCLUDED.last_tpl_chat,
                mail_stats_sent = EXCLUDED.mail_stats_sent,
                mail_stats_errors = EXCLUDED.mail_stats_errors,
                chat_stats_sent = EXCLUDED.chat_stats_sent,
                chat_stats_errors = EXCLUDED.chat_stats_errors,
                mail_history_sent = EXCLUDED.mail_history_sent,
                mail_history_errors = EXCLUDED.mail_history_errors,
                chat_history_sent = EXCLUDED.chat_history_sent,
                chat_history_errors = EXCLUDED.chat_history_errors,
                mail_blacklist = EXCLUDED.mail_blacklist,
                chat_blacklist = EXCLUDED.chat_blacklist,
                vip_list = EXCLUDED.vip_list,
                chat_rotation_hours = EXCLUDED.chat_rotation_hours,
                chat_cyclic = EXCLUDED.chat_cyclic,
                chat_current_index = EXCLUDED.chat_current_index,
                chat_target = EXCLUDED.chat_target,
                mail_auto = EXCLUDED.mail_auto,
                mail_target = EXCLUDED.mail_target,
                mail_photo_only = EXCLUDED.mail_photo_only,
                templates_mail = EXCLUDED.templates_mail,
                templates_chat = EXCLUDED.templates_chat,
                updated_at = NOW()
        `, [
            profileId,
            state.currentMailText || '',
            state.currentChatText || '',
            state.lastTplMail ?? null,
            state.lastTplChat ?? null,
            state.mailStats?.sent || 0,
            state.mailStats?.errors || 0,
            state.chatStats?.sent || 0,
            state.chatStats?.errors || 0,
            JSON.stringify(state.mailHistory?.sent || []),
            JSON.stringify(state.mailHistory?.errors || []),
            JSON.stringify(state.chatHistory?.sent || []),
            JSON.stringify(state.chatHistory?.errors || []),
            JSON.stringify(state.mailBlacklist || []),
            JSON.stringify(state.chatBlacklist || []),
            JSON.stringify(state.vipList || []),
            state.chatSettings?.rotationHours || 3,
            state.chatSettings?.cyclic || false,
            state.chatSettings?.currentInviteIndex || 0,
            state.chatSettings?.target || 'payers',
            state.mailSettings?.auto || false,
            state.mailSettings?.target || 'online',
            state.mailSettings?.photoOnly || false,
            JSON.stringify(state.templatesMail || []),
            JSON.stringify(state.templatesChat || [])
        ]);

        res.json({ success: true });
    } catch (e) {
        console.error('Ошибка сохранения bot_state:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * DELETE /api/bot-state/:profileId
 * Очистка состояния анкеты (сброс статистики)
 */
router.delete('/:profileId', async (req, res) => {
    const { profileId } = req.params;
    const { resetStats, resetBlacklist, resetAll } = req.query;

    try {
        if (resetAll === 'true') {
            await pool.query(`DELETE FROM bot_state WHERE profile_id = $1`, [profileId]);
        } else if (resetStats === 'true') {
            await pool.query(`
                UPDATE bot_state SET
                    mail_stats_sent = 0, mail_stats_errors = 0,
                    chat_stats_sent = 0, chat_stats_errors = 0,
                    mail_history_sent = '[]'::jsonb, mail_history_errors = '[]'::jsonb,
                    chat_history_sent = '[]'::jsonb, chat_history_errors = '[]'::jsonb,
                    updated_at = NOW()
                WHERE profile_id = $1
            `, [profileId]);
        } else if (resetBlacklist === 'true') {
            await pool.query(`
                UPDATE bot_state SET
                    mail_blacklist = '[]'::jsonb,
                    chat_blacklist = '[]'::jsonb,
                    updated_at = NOW()
                WHERE profile_id = $1
            `, [profileId]);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Ошибка очистки bot_state:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
