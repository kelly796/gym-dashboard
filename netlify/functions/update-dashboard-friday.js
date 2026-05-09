/**
 * update-dashboard-friday.js — Weekly Friday 8am AEST scheduled refresh
 * Schedule: 0 22 * * 4  (22:00 UTC Thursday = 08:00 AEST Friday)
 * Delegates to update-dashboard.js logic.
 */

const { handler: updateHandler } = require('./update-dashboard');

exports.handler = async function (event, context) {
  console.log('Scheduled Friday refresh triggered at', new Date().toISOString());
  return updateHandler({ ...event, httpMethod: 'GET', reportType: 'weekly-friday' }, context);
};
