/**
 * Routes Index
 * Сборка всех маршрутов
 */

const authRoutes = require('./auth');
const teamRoutes = require('./team');
const profilesRoutes = require('./profiles');
const botsRoutes = require('./bots');
const activityRoutes = require('./activity');
const dashboardRoutes = require('./dashboard');
const favoriteTemplatesRoutes = require('./favoriteTemplates');
const billingRoutes = require('./billing');
const botDataRoutes = require('./botData');
const promptTemplatesRoutes = require('./promptTemplates');

module.exports = {
    authRoutes,
    teamRoutes,
    profilesRoutes,
    botsRoutes,
    activityRoutes,
    dashboardRoutes,
    favoriteTemplatesRoutes,
    billingRoutes,
    botDataRoutes,
    promptTemplatesRoutes
};
