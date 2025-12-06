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
 */
router.post('/topup', asyncHandler(async (req, res) => {
    const { userId, amount, byUserId, note } = req.body;

    if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Неверные параметры' });
    }

    // Проверяем права (только директор может пополнять)
    const byUser = await pool.query(`SELECT role FROM users WHERE id = $1`, [byUserId]);
    if (byUser.rows.length === 0 || byUser.rows[0].role !== 'director') {
        return res.status(403).json({ success: false, error: 'Нет прав для пополнения баланса' });
    }

    // Пополняем баланс
    await pool.query(
        `UPDATE users SET balance = balance + $1 WHERE id = $2`,
        [amount, userId]
    );

    // Сохраняем в историю пополнений
    await pool.query(
        `INSERT INTO billing_history (admin_id, amount, by_user_id, note) VALUES ($1, $2, $3, $4)`,
        [userId, amount, byUserId, note || null]
    );

    // Получаем новый баланс
    const newBalance = await pool.query(`SELECT balance FROM users WHERE id = $1`, [userId]);

    res.json({
        success: true,
        newBalance: parseFloat(newBalance.rows[0].balance) || 0
    });
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
            , NOW()) + INTERVAL '${days} days',
            is_trial = FALSE
            WHERE profile_id = $1
        `, [profileId]);

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
        , NOW()) + INTERVAL '${days} days',
        is_trial = FALSE
        WHERE profile_id = $1
    `, [profileId]);

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
            u.is_restricted as admin_is_restricted
        FROM allowed_profiles ap
        LEFT JOIN users u ON ap.assigned_admin_id = u.id
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

module.exports = router;
