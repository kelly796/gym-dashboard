/**
 * update-dashboard-tuesday.js — Weekly Tuesday 8am AEST scheduled refresh
 * Schedule: 0 22 * * 1  (22:00 UTC Monday = 08:00 AEST Tuesday)
 * Delegates to update-dashboard.js logic.
 */

const { handler: updateHandler } = require('./update-dashboard');

exports.handler = async function (event, context) {
  console.log('Scheduled Tuesday refresh triggered at', new Date().toISOString());
  return updateHandler({ ...event, httpMethod: 'GET', reportType: 'weekly-tuesday' }, context);
};
