const { checkConnection } = require('../db');
const { sendSuccess } = require('../utils/response');

async function health(req, res) {
  let database = 'connected';
  try {
    await checkConnection();
  } catch {
    database = 'unavailable';
  }
  return sendSuccess(res, {
    message: 'Service is healthy',
    data: {
      status: 'ok',
      service: 'careyu-api',
      timestamp: new Date().toISOString(),
      database,
    },
  });
}

module.exports = health;
