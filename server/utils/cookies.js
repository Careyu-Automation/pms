const env = require('../config/env');

function baseOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

function readAuthToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const bearer = header.slice('Bearer '.length).trim();
    if (bearer) return bearer;
  }
  return readCookie(req, env.cookieName);
}

function setAuthCookie(res, token, remember) {
  const options = baseOptions();
  if (remember) {
    options.maxAge = 7 * 24 * 60 * 60 * 1000;
  }
  res.cookie(env.cookieName, token, options);
}

function clearAuthCookie(res) {
  res.clearCookie(env.cookieName, baseOptions());
}

module.exports = {
  readAuthToken,
  setAuthCookie,
  clearAuthCookie,
};
