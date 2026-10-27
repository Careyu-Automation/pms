const ApiError = require('./ApiError');

function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const recent = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= max) {
      return next(new ApiError(429, message));
    }

    recent.push(now);
    buckets.set(key, recent);
    return next();
  };
}

module.exports = { createRateLimiter };
