/**
 * Prompt Templates Routes
 * API для управления шаблонами промптов (по translator_id)
 */

const express = require('express');
const pool = require('../config/database');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/prompt-templates/:translatorId
 * Получить все шаблоны промптов для переводчика
 */
router.get('/:translatorId', asyncHandler(async (req, res) => {
    const { translatorId } = req.params;

    const result = await pool.query(
        `SELECT id, prompt_type, name, text, is_active, sort_order, created_at, updated_at
         FROM prompt_templates
         WHERE translator_id = $1
         ORDER BY prompt_type, sort_order, created_at`,
        [translatorId]
    );

    // Группируем по типу промпта
    const templates = {
        myPrompt: [],
        replyPrompt: [],
        chatPrompt: []
    };

    result.rows.forEach(row => {
        const item = {
            id: row.id,
            name: row.name,
            text: row.text,
            isActive: row.is_active,
            sortOrder: row.sort_order,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };

        if (templates[row.prompt_type]) {
            templates[row.prompt_type].push(item);
        }
    });

    res.json({
        success: true,
        data: templates
    });
}));

/**
 * POST /api/prompt-templates/:translatorId
 * Создать новый шаблон промпта
 */
router.post('/:translatorId', asyncHandler(async (req, res) => {
    const { translatorId } = req.params;
    const { promptType, name, text, isActive = false } = req.body;

    // Валидация
    if (!promptType || !['myPrompt', 'replyPrompt', 'chatPrompt'].includes(promptType)) {
        return res.status(400).json({ error: 'Invalid promptType' });
    }
    if (!name || !text) {
        return res.status(400).json({ error: 'Name and text are required' });
    }

    // Если новый шаблон активный - деактивируем остальные этого типа
    if (isActive) {
        await pool.query(
            `UPDATE prompt_templates SET is_active = FALSE, updated_at = NOW()
             WHERE translator_id = $1 AND prompt_type = $2`,
            [translatorId, promptType]
        );
    }

    // Получаем максимальный sort_order для этого типа
    const orderResult = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
         FROM prompt_templates
         WHERE translator_id = $1 AND prompt_type = $2`,
        [translatorId, promptType]
    );
    const sortOrder = orderResult.rows[0].next_order;

    // Создаём шаблон
    const result = await pool.query(
        `INSERT INTO prompt_templates (translator_id, prompt_type, name, text, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, prompt_type, name, text, is_active, sort_order, created_at`,
        [translatorId, promptType, name, text, isActive, sortOrder]
    );

    const row = result.rows[0];

    res.json({
        success: true,
        data: {
            id: row.id,
            promptType: row.prompt_type,
            name: row.name,
            text: row.text,
            isActive: row.is_active,
            sortOrder: row.sort_order,
            createdAt: row.created_at
        }
    });
}));

/**
 * PUT /api/prompt-templates/:translatorId/:templateId
 * Обновить шаблон промпта
 */
router.put('/:translatorId/:templateId', asyncHandler(async (req, res) => {
    const { translatorId, templateId } = req.params;
    const { name, text, isActive } = req.body;

    // Получаем текущий шаблон для проверки принадлежности
    const current = await pool.query(
        `SELECT prompt_type FROM prompt_templates WHERE id = $1 AND translator_id = $2`,
        [templateId, translatorId]
    );

    if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
    }

    const promptType = current.rows[0].prompt_type;

    // Если делаем активным - деактивируем остальные
    if (isActive === true) {
        await pool.query(
            `UPDATE prompt_templates SET is_active = FALSE, updated_at = NOW()
             WHERE translator_id = $1 AND prompt_type = $2 AND id != $3`,
            [translatorId, promptType, templateId]
        );
    }

    // Формируем динамический UPDATE
    const updates = ['updated_at = NOW()'];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
    }
    if (text !== undefined) {
        updates.push(`text = $${paramIndex++}`);
        values.push(text);
    }
    if (isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(isActive);
    }

    values.push(templateId, translatorId);

    const result = await pool.query(
        `UPDATE prompt_templates SET ${updates.join(', ')}
         WHERE id = $${paramIndex++} AND translator_id = $${paramIndex}
         RETURNING id, prompt_type, name, text, is_active, sort_order, updated_at`,
        values
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
    }

    const row = result.rows[0];

    res.json({
        success: true,
        data: {
            id: row.id,
            promptType: row.prompt_type,
            name: row.name,
            text: row.text,
            isActive: row.is_active,
            sortOrder: row.sort_order,
            updatedAt: row.updated_at
        }
    });
}));

/**
 * DELETE /api/prompt-templates/:translatorId/:templateId
 * Удалить шаблон промпта
 */
router.delete('/:translatorId/:templateId', asyncHandler(async (req, res) => {
    const { translatorId, templateId } = req.params;

    const result = await pool.query(
        `DELETE FROM prompt_templates
         WHERE id = $1 AND translator_id = $2
         RETURNING id`,
        [templateId, translatorId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true });
}));

/**
 * POST /api/prompt-templates/:translatorId/set-active
 * Установить активный шаблон для типа промпта
 */
router.post('/:translatorId/set-active', asyncHandler(async (req, res) => {
    const { translatorId } = req.params;
    const { promptType, templateId } = req.body;

    // Валидация
    if (!promptType || !['myPrompt', 'replyPrompt', 'chatPrompt'].includes(promptType)) {
        return res.status(400).json({ error: 'Invalid promptType' });
    }

    // Деактивируем все шаблоны этого типа
    await pool.query(
        `UPDATE prompt_templates SET is_active = FALSE, updated_at = NOW()
         WHERE translator_id = $1 AND prompt_type = $2`,
        [translatorId, promptType]
    );

    // Если передан templateId - активируем его
    if (templateId) {
        await pool.query(
            `UPDATE prompt_templates SET is_active = TRUE, updated_at = NOW()
             WHERE id = $1 AND translator_id = $2 AND prompt_type = $3`,
            [templateId, translatorId, promptType]
        );
    }

    res.json({ success: true });
}));

module.exports = router;
