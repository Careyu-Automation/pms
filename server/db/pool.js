const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../utils/logger');

// One shared pool for the process. Node caches this module, so controllers
// and services reuse the same connections instead of opening a pool per call.
const pool = new Pool(env.db.connectionString
  ? {
      connectionString: env.db.connectionString,
      max: env.db.max,
      idleTimeoutMillis: env.db.idleTimeoutMillis,
      connectionTimeoutMillis: 15000,
      ssl: { rejectUnauthorized: false },
      options: '-c search_path=pms_app,public',
      allowExitOnIdle: true,
    }
  : {
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      user: env.db.user,
      password: env.db.password,
      max: env.db.max,
      idleTimeoutMillis: env.db.idleTimeoutMillis,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: true,
    });

pool.on('error', (error) => {
  logger.error('database_pool_error', { code: error.code });
});

module.exports = pool;
