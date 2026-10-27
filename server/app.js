const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const routes = require('./routes');
const { requireAllowedOrigin } = require('./middleware/origin.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(requireAllowedOrigin);

if (!env.isProduction) {
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Date.now() - started,
      });
    });
    next();
  });
}

app.get('/', (req, res) => {
  res.redirect(env.clientOrigins[0] || 'http://localhost:5176');
});
app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
