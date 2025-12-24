/**
 * Billing Routes
 * Маршруты для системы оплаты анкет
 *
 * Тарифы:
 * - 15 дней = $1
 * - 30 дней = $2
 * - 45 дней = $3
 * - 60 дней = $4
 *
 * Тестовый период: 2 дня бесплатно
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

// Тарифы (дни -> цена в долларах)
const PRICING = {
    15: 1,
    30: 2,
    45: 3,
    60: 4
};

const TRIAL_DAYS = 2;

/**
 * GET /api/billing/balance/:userId
 * Получить баланс пользователя
 */
router.get('/balance/:userId', asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const result = await pool.query(
        `SELECT balance, is_restricted FROM users WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    res.json({
        success: true,
        balance: parseFloat(result.rows[0].balance) || 0,
        isRestricted: result.rows[0].is_restricted || false
    });
}));

/**
 * POST /api/billing/topup
 * Пополнить баланс пользователя (директор -> админ)
 * ИСПОЛЬЗУЕТ ТРАНЗАКЦИЮ для целостности данных
 */
router.post('/topup', asyncHandler(async (req, res) => {
    const { userId, amount, byUserId, note } = req.body;

    // Валидация
    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ success: false, error: 'Неверный userId' });
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, error: 'Сумма должна быть положительным числом' });
    }
    if (!byUserId || isNaN(parseInt(byUserId))) {
        return res.status(400).json({ success: false, error: 'Неверный byUserId' });
    }

    const parsedAmount = parseFloat(amount);

    // Проверяем права (только директор может пополнять)
    const byUser = await pool.query(`SELECT role FROM users WHERE id = $1`, [byUserId]);
    if (byUser.rows.length === 0 || byUser.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Нет прав для пополнения баланса' });
    }

    // === НАЧАЛО ТРАНЗАКЦИИ ===
    await pool.query('BEGIN');

    try {
        // Пополняем баланс
        await pool.query(
            `UPDATE users SET balance = balance + $1 WHERE id = $2`,
            [parsedAmount, userId]
        );

        // Сохраняем в историю пополнений
        await pool.query(
            `INSERT INTO billing_history (admin_id, amount, by_user_id, note) VALUES ($1, $2, $3, $4)`,
            [userId, parsedAmount, byUserId, note || null]
        );

        await pool.query('COMMIT');
        // === КОНЕЦ ТРАНЗАКЦИИ ===

        // Получаем новый баланс
        const newBalance = await pool.query(`SELECT balance FROM users WHERE id = $1`, [userId]);

        res.json({
            success: true,
            newBalance: parseFloat(newBalance.rows[0].balance) || 0
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('💥 [BILLING] Ошибка транзакции пополнения:', error.message);
        res.status(500).json({ success: false, error: 'Ошибка при пополнении баланса' });
    }
}));

/**
 * GET /api/billing/history
 * Получить историю пополнений (только для директора)
 */
router.get('/history', asyncHandler(async (req, res) => {
    const { userId, limit = 100 } = req.query;

    // Проверяем права
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || user.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Нет доступа' });
    }

    // Получаем историю с именами пользователей
    const result = await pool.query(`
        SELECT
            bh.id,
            bh.admin_id,
            bh.amount,
            bh.note,
            bh.created_at,
            u.username as admin_name,
            u.balance as admin_balance
        FROM billing_history bh
        JOIN users u ON bh.admin_id = u.id
        ORDER BY bh.created_at DESC
        LIMIT $1
    `, [limit]);

    // Считаем общую сумму пополнений
    const totalResult = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM billing_history`);
    const totalSum = parseFloat(totalResult.rows[0].total) || 0;

    res.json({
        success: true,
        history: result.rows.map(row => ({
            id: row.id,
            adminId: row.admin_id,
            adminName: row.admin_name,
            adminBalance: parseFloat(row.admin_balance) || 0,
            amount: parseFloat(row.amount),
            note: row.note,
            createdAt: row.created_at
        })),
        totalSum: totalSum
    });
}));

/**
 * GET /api/billing/admins
 * Получить список админов для пополнения (только не "мой админ")
 */
router.get('/admins', asyncHandler(async (req, res) => {
    const { userId } = req.query;

    // Проверяем права
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || user.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Нет доступа' });
    }

    // Получаем админов без флага is_restricted (не "мой админ")
    const result = await pool.query(`
        SELECT
            id,
            username,
            balance,
            is_restricted
        FROM users
        WHERE role = 'admin' AND (is_restricted = FALSE OR is_restricted IS NULL)
        ORDER BY username
    `);

    res.json({
        success: true,
        admins: result.rows.map(row => ({
            id: row.id,
            name: row.username,
            balance: parseFloat(row.balance) || 0
        }))
    });
}));

/**
 * POST /api/billing/extend-profile
 * Продлить анкету (списать с баланса)
 */
router.post('/extend-profile', asyncHandler(async (req, res) => {
    const { profileId, days, userId } = req.body;

    if (!profileId || !days || !PRICING[days]) {
        return res.status(400).json({
            success: false,
            error: 'Неверные параметры. Доступные периоды: 15, 30, 45, 60 дней'
        });
    }

    const cost = PRICING[days];

    // Получаем пользователя и его баланс
    const user = await pool.query(
        `SELECT id, balance, is_restricted FROM users WHERE id = $1`,
        [userId]
    );

    if (user.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    // Если "мой админ" - бесплатно
    if (user.rows[0].is_restricted) {
        // Продлеваем без списания
        await pool.query(`
            UPDATE allowed_profiles
            SET paid_until = COALESCE(
                CASE WHEN paid_until > NOW() THEN paid_until ELSE NOW() END
            , NOW()) + INTERVAL '1 day' * $2,
            is_trial = FALSE
            WHERE profile_id = $1
        `, [profileId, days]);

        return res.json({
            success: true,
            message: 'Анкета продлена (бесплатно для "мой админ")',
            cost: 0,
            newBalance: parseFloat(user.rows[0].balance) || 0
        });
    }

    // Проверяем баланс
    const balance = parseFloat(user.rows[0].balance) || 0;
    if (balance < cost) {
        return res.status(400).json({
            success: false,
            error: `Недостаточно средств. Нужно: $${cost}, на балансе: $${balance.toFixed(2)}`
        });
    }

    // Списываем с баланса
    await pool.query(
        `UPDATE users SET balance = balance - $1 WHERE id = $2`,
        [cost, userId]
    );

    // Продлеваем анкету
    await pool.query(`
        UPDATE allowed_profiles
        SET paid_until = COALESCE(
            CASE WHEN paid_until > NOW() THEN paid_until ELSE NOW() END
        , NOW()) + INTERVAL '1 day' * $2,
        is_trial = FALSE
        WHERE profile_id = $1
    `, [profileId, days]);

    // Получаем новый баланс
    const newBalance = await pool.query(`SELECT balance FROM users WHERE id = $1`, [userId]);

    res.json({
        success: true,
        message: `Анкета продлена на ${days} дней`,
        cost: cost,
        newBalance: parseFloat(newBalance.rows[0].balance) || 0
    });
}));

/**
 * POST /api/billing/start-trial
 * Активировать тестовый период для анкеты (2 дня)
 */
router.post('/start-trial', asyncHandler(async (req, res) => {
    const { profileId, userId } = req.body;

    // Проверяем, что пользователь НЕ "мой админ"
    const user = await pool.query(
        `SELECT is_restricted FROM users WHERE id = $1`,
        [userId]
    );

    if (user.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    // Для "мой админ" trial не нужен
    if (user.rows[0].is_restricted) {
        return res.json({ success: true, message: 'Для "мой админ" тестовый период не требуется' });
    }

    // Проверяем, не был ли уже trial
    const profile = await pool.query(
        `SELECT is_trial, trial_started_at, paid_until FROM allowed_profiles WHERE profile_id = $1`,
        [profileId]
    );

    if (profile.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Анкета не найдена' });
    }

    // Если уже был trial или есть оплата
    if (profile.rows[0].trial_started_at) {
        return res.status(400).json({
            success: false,
            error: 'Тестовый период уже был использован для этой анкеты'
        });
    }

    // Активируем trial
    await pool.query(`
        UPDATE allowed_profiles
        SET is_trial = TRUE,
            trial_started_at = NOW(),
            paid_until = NOW() + INTERVAL '${TRIAL_DAYS} days'
        WHERE profile_id = $1
    `, [profileId]);

    res.json({
        success: true,
        message: `Тестовый период активирован (${TRIAL_DAYS} дня)`,
        trialDays: TRIAL_DAYS
    });
}));

/**
 * GET /api/billing/profile-status/:profileId
 * Проверить статус оплаты анкеты
 */
router.get('/profile-status/:profileId', asyncHandler(async (req, res) => {
    const { profileId } = req.params;

    const result = await pool.query(`
        SELECT
            ap.profile_id,
            ap.paid_until,
            ap.is_trial,
            ap.trial_started_at,
            ap.assigned_admin_id,
            ap.assigned_translator_id,
            u.is_restricted as admin_is_restricted,
            u_trans.is_own_translator as translator_is_own
        FROM allowed_profiles ap
        LEFT JOIN users u ON ap.assigned_admin_id = u.id
        LEFT JOIN users u_trans ON ap.assigned_translator_id = u_trans.id
        WHERE ap.profile_id = $1
    `, [profileId]);

    if (result.rows.length === 0) {
        return res.json({
            success: true,
            exists: false,
            isPaid: false,
            reason: 'not_found'
        });
    }

    const row = result.rows[0];

    // Если админ - "мой админ", оплата не требуется
    if (row.admin_is_restricted) {
        return res.json({
            success: true,
            exists: true,
            isPaid: true,
            isFree: true,
            reason: 'my_admin'
        });
    }

    // Если переводчик - "мой переводчик", оплата не требуется
    if (row.translator_is_own) {
        return res.json({
            success: true,
            exists: true,
            isPaid: true,
            isFree: true,
            reason: 'my_translator'
        });
    }

    const paidUntil = row.paid_until ? new Date(row.paid_until) : null;
    const now = new Date();
    const isPaid = paidUntil && paidUntil > now;

    // Считаем оставшиеся дни
    let daysLeft = 0;
    if (isPaid) {
        daysLeft = Math.ceil((paidUntil - now) / (1000 * 60 * 60 * 24));
    }

    res.json({
        success: true,
        exists: true,
        isPaid: isPaid,
        isTrial: row.is_trial || false,
        trialUsed: !!row.trial_started_at,
        paidUntil: row.paid_until,
        daysLeft: daysLeft,
        reason: isPaid ? 'paid' : (row.trial_started_at ? 'trial_expired' : 'not_paid')
    });
}));

/**
 * POST /api/billing/profiles-status
 * Получить статусы оплаты для нескольких анкет одним запросом (bulk)
 * Это критично для производительности - вместо N запросов делаем 1
 */
router.post('/profiles-status', asyncHandler(async (req, res) => {
    const { profileIds } = req.body;

    if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) {
        return res.json({ success: true, statuses: {} });
    }

    // Ограничиваем количество анкет для защиты от злоупотреблений
    const limitedIds = profileIds.slice(0, 500);

    const result = await pool.query(`
        SELECT
            ap.profile_id,
            ap.paid_until,
            ap.is_trial,
            ap.trial_started_at,
            ap.assigned_admin_id,
            ap.assigned_translator_id,
            u_admin.is_restricted as admin_is_restricted,
            u_trans.is_own_translator as translator_is_own
        FROM allowed_profiles ap
        LEFT JOIN users u_admin ON ap.assigned_admin_id = u_admin.id
        LEFT JOIN users u_trans ON ap.assigned_translator_id = u_trans.id
        WHERE ap.profile_id = ANY($1)
    `, [limitedIds]);

    const now = new Date();
    const statuses = {};

    for (const row of result.rows) {
        // Если админ - "мой админ" ИЛИ переводчик - "мой переводчик", оплата не требуется
        if (row.admin_is_restricted || row.translator_is_own) {
            statuses[row.profile_id] = {
                isPaid: true,
                isFree: true,
                daysLeft: 999,
                isTrial: false,
                trialUsed: false
            };
            continue;
        }

        const paidUntil = row.paid_until ? new Date(row.paid_until) : null;
        const isPaid = paidUntil && paidUntil > now;
        let daysLeft = 0;
        if (isPaid) {
            daysLeft = Math.ceil((paidUntil - now) / (1000 * 60 * 60 * 24));
        }

        statuses[row.profile_id] = {
            isPaid: isPaid,
            isFree: false,
            daysLeft: daysLeft,
            isTrial: row.is_trial || false,
            trialUsed: !!row.trial_started_at
        };
    }

    // Для анкет, которых нет в результате - возвращаем дефолт
    for (const id of limitedIds) {
        if (!statuses[id]) {
            statuses[id] = {
                isPaid: false,
                isFree: false,
                daysLeft: 0,
                isTrial: false,
                trialUsed: false
            };
        }
    }

    res.json({ success: true, statuses });
}));

/**
 * GET /api/billing/pricing
 * Получить тарифы
 */
router.get('/pricing', (req, res) => {
    res.json({
        success: true,
        pricing: PRICING,
        trialDays: TRIAL_DAYS
    });
});

/**
 * POST /api/billing/pay-profile
 * Оплатить анкету напрямую (только директор)
 */
router.post('/pay-profile', asyncHandler(async (req, res) => {
    const { profileId, days, byUserId, note } = req.body;

    if (!profileId || !days || !PRICING[days]) {
        return res.status(400).json({
            success: false,
            error: 'Неверные параметры. Доступные периоды: 15, 30, 45, 60 дней'
        });
    }

    // Проверяем права (только директор)
    const byUser = await pool.query(`SELECT role FROM users WHERE id = $1`, [byUserId]);
    if (byUser.rows.length === 0 || byUser.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Нет прав' });
    }

    // Проверяем существование анкеты
    const profile = await pool.query(
        `SELECT profile_id, paid_until FROM allowed_profiles WHERE profile_id = $1`,
        [profileId]
    );

    if (profile.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Анкета не найдена' });
    }

    // Продлеваем анкету
    await pool.query(`
        UPDATE allowed_profiles
        SET paid_until = COALESCE(
            CASE WHEN paid_until > NOW() THEN paid_until ELSE NOW() END
        , NOW()) + INTERVAL '1 day' * $2,
        is_trial = FALSE
        WHERE profile_id = $1
    `, [profileId, days]);

    // Сохраняем в историю оплаты анкет
    await pool.query(
        `INSERT INTO profile_payment_history (profile_id, days, action_type, by_user_id, note) VALUES ($1, $2, 'payment', $3, $4)`,
        [profileId, days, byUserId, note || null]
    );

    res.json({
        success: true,
        message: `Анкета #${profileId} оплачена на ${days} дней`
    });
}));

/**
 * POST /api/billing/pay
 * Оплатить анкету со своего баланса (для админов/переводчиков)
 * ИСПОЛЬЗУЕТ ТРАНЗАКЦИЮ для целостности данных
 */
router.post('/pay', asyncHandler(async (req, res) => {
    const { profileId, days, userId } = req.body;

    if (!profileId || !days || !PRICING[days]) {
        return res.status(400).json({
            success: false,
            error: 'Неверные параметры. Доступные периоды: 15, 30, 45, 60 дней'
        });
    }

    // Валидация userId
    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ success: false, error: 'Неверный userId' });
    }

    const cost = PRICING[days];

    // Получаем пользователя и его баланс
    const userResult = await pool.query(
        `SELECT id, balance, role FROM users WHERE id = $1`,
        [userId]
    );

    if (userResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    const user = userResult.rows[0];
    const balance = parseFloat(user.balance) || 0;

    if (balance < cost) {
        return res.status(400).json({
            success: false,
            error: `Недостаточно средств. Нужно: $${cost}, на балансе: $${balance.toFixed(2)}`
        });
    }

    // Проверяем существование анкеты (profileId - это строковый profile_id)
    const profile = await pool.query(
        `SELECT profile_id, paid_until FROM allowed_profiles WHERE profile_id = $1`,
        [String(profileId)]
    );

    if (profile.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Анкета не найдена' });
    }

    // === НАЧАЛО ТРАНЗАКЦИИ ===
    await pool.query('BEGIN');

    try {
        // Списываем с баланса
        await pool.query(
            `UPDATE users SET balance = balance - $1 WHERE id = $2`,
            [cost, userId]
        );

        // Продлеваем анкету (параметризованный запрос для защиты от SQL Injection)
        await pool.query(`
            UPDATE allowed_profiles
            SET paid_until = COALESCE(
                CASE WHEN paid_until > NOW() THEN paid_until ELSE NOW() END
            , NOW()) + INTERVAL '1 day' * $2,
            is_trial = FALSE
            WHERE profile_id = $1
        `, [profileId, days]);

        // Сохраняем в историю оплаты
        await pool.query(
            `INSERT INTO profile_payment_history (profile_id, days, action_type, by_user_id, amount) VALUES ($1, $2, 'payment', $3, $4)`,
            [profileId, days, userId, cost]
        );

        // Сохраняем в историю биллинга
        await pool.query(
            `INSERT INTO billing_history (admin_id, amount, description, type) VALUES ($1, $2, $3, 'expense')`,
            [userId, cost, `Оплата анкеты ${profileId} на ${days} дней`]
        );

        await pool.query('COMMIT');
        // === КОНЕЦ ТРАНЗАКЦИИ ===

        res.json({
            success: true,
            message: `Анкета #${profileId} оплачена на ${days} дней`,
            newBalance: balance - cost
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('💥 [BILLING] Ошибка транзакции оплаты:', error.message);
        res.status(500).json({ success: false, error: 'Ошибка при оплате. Попробуйте снова.' });
    }
}));

/**
 * POST /api/billing/remove-payment
 * Убрать оплату с анкеты (только директор)
 */
router.post('/remove-payment', asyncHandler(async (req, res) => {
    const { profileId, byUserId } = req.body;

    if (!profileId) {
        return res.status(400).json({ success: false, error: 'Укажите ID анкеты' });
    }

    // Проверяем права (только директор)
    const byUser = await pool.query(`SELECT role FROM users WHERE id = $1`, [byUserId]);
    if (byUser.rows.length === 0 || byUser.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Нет прав' });
    }

    // Сбрасываем оплату
    await pool.query(`
        UPDATE allowed_profiles
        SET paid_until = NULL, is_trial = FALSE
        WHERE profile_id = $1
    `, [profileId]);

    // Сохраняем в историю
    await pool.query(
        `INSERT INTO profile_payment_history (profile_id, days, action_type, by_user_id, note) VALUES ($1, 0, 'removal', $2, 'Оплата снята')`,
        [profileId, byUserId]
    );

    res.json({
        success: true,
        message: `Оплата с анкеты #${profileId} снята`
    });
}));

/**
 * GET /api/billing/profile-payment-history
 * Получить историю оплаты анкет (только для директора)
 */
router.get('/profile-payment-history', asyncHandler(async (req, res) => {
    const { userId, limit = 100 } = req.query;

    // Проверяем права
    const user = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (user.rows.length === 0 || user.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Нет доступа' });
    }

    const result = await pool.query(`
        SELECT
            pph.id,
            pph.profile_id,
            pph.days,
            pph.action_type,
            pph.note,
            pph.created_at,
            u.username as by_user_name
        FROM profile_payment_history pph
        LEFT JOIN users u ON pph.by_user_id = u.id
        ORDER BY pph.created_at DESC
        LIMIT $1
    `, [limit]);

    res.json({
        success: true,
        history: result.rows.map(row => ({
            id: row.id,
            profileId: row.profile_id,
            days: row.days,
            actionType: row.action_type,
            note: row.note,
            byUserName: row.by_user_name || 'Система',
            createdAt: row.created_at
        }))
    });
}));

module.exports = router;
