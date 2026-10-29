const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { pool, checkConnection } = require('./db');
const { ensureRunning } = require('./scripts/start-project-db');

async function start() {
  // Listen only after PostgreSQL accepts a connection.
  try {
    if (env.db.connectionString) {
      await require('./db/aivenCompat').install(env.db.connectionString);
    } else if (!env.isProduction && env.db.host === 'localhost') {
      const database = ensureRunning();
      if (database.started) logger.info('database_started', { port: database.port, database: database.database });
    }
    await checkConnection();
    await require('./services/settings.service').ensureReady();
    await require('./db/user.repository').ensureCredentialColumns();
    logger.info('database_connected', {
      ...(env.isProduction ? {} : {
        host: env.db.host,
        database: env.db.database,
      }),
      maxConnections: env.db.max,
      idleTimeoutMillis: env.db.idleTimeoutMillis,
    });
  } catch (error) {
    logger.error('database_connection_failed', {
      code: error.code,
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
    });
    const detail = String(error.message || '').replace(/postgres:\/\/\S+/gi, 'postgres://***');
    console.error(`Database is unavailable at ${env.db.host}:${env.db.port}/${env.db.database}. ${detail}`);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info('server_started', { port: env.port });
    console.log(`CareYu API server running on:\nhttp://localhost:${env.port}`);
    console.log(`Health:\nhttp://localhost:${env.port}/api/health`);
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`Port ${env.port} is already in use.`);
    else console.error(error.message);
    process.exit(1);
  });
  require('./realtime/hub').attach(server);
  const emailReports = require('./services/emailReport.service');
  require('./services/dailyWorkReport.bootstrap').ensureDailyWorkReport()
    .then((result) => {
      if (result.missing?.length) {
        logger.warn('daily_work_report_recipients_missing', { missing: result.missing });
      }
      (result.reports || []).forEach((item) => {
        logger.info('daily_work_report_ready', {
          reportId: item.reportId,
          period: item.period,
          sendTime: item.sendTime,
          nextRunAt: item.nextRunAt,
          timezone: result.timezone,
        });
      });
    })
    .catch((error) => logger.error('daily_work_report_bootstrap', { message: error.message }));
  const timer = setInterval(() => {
    emailReports.tick().catch((error) => logger.error('email_report_tick', { message: error.message }));
  }, 60000);
  timer.unref();

  async function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', (error) => {
    logger.error('unhandled_rejection', { message: error && error.message ? error.message : 'unknown' });
  });
}

start();
