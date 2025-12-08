/**
 * Routes Index
 * Сборка всех маршрутов
 */

const authRoutes = require('./auth');
const teamRoutes = require('./team');
const profilesRoutes = require('./profiles');
const botsRoutes = require('./bots');
const activityRoutes = require('./activity');
const statsRoutes = require('./stats');
const dashboardRoutes = require('./dashboard');
const favoriteTemplatesRoutes = require('./favoriteTemplates');
const billingRoutes = require('./billing');
const botStateRoutes = require('./botState');

module.exports = {
    authRoutes,
    teamRoutes,
    profilesRoutes,
    botsRoutes,
    activityRoutes,
    statsRoutes,
    dashboardRoutes,
    favoriteTemplatesRoutes,
    billingRoutes,
    botStateRoutes
};
