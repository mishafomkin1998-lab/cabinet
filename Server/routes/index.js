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

module.exports = {
    authRoutes,
    teamRoutes,
    profilesRoutes,
    botsRoutes,
    activityRoutes,
    statsRoutes,
    dashboardRoutes
};
