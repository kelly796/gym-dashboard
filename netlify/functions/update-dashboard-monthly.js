/**
 * update-dashboard-monthly.js — Monthly 1st of month 8am AEST scheduled refresh
 * Schedule: 0 22 1 * *  (22:00 UTC = 08:00 AEST next morning)
 * Delegates to update-dashboard.js logic.
 */

const { handler: updateHandler } = require('./update-dashboard');

exports.handler = async function (event, context) {
  console.log('Scheduled monthly refresh triggered at', new Date().toISOString());
  return updateHandler({ ...event, httpMethod: 'GET', reportType: 'monthly' }, context);
};
