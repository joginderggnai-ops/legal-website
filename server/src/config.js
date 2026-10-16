'use strict';
// All settings come from environment variables (see .env.example).
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const env = process.env;
const isProd = env.NODE_ENV === 'production';

const dataDir = path.resolve(root, env.DATA_DIR || 'data');

module.exports = {
  isProd,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '127.0.0.1',
  // The static website folder (index.html, assets/ …). Blog pages reuse its header and footer.
  siteDir: path.resolve(root, env.SITE_DIR || '..'),
  // Serve the static site from Node too. Handy locally; on the VPS nginx serves it instead.
  serveSite: env.SERVE_SITE ? env.SERVE_SITE === '1' : !isProd,
  dataDir,
  dbFile: path.join(dataDir, 'site.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  baseUrl: (env.BASE_URL || 'https://www.resurgentlegal.com').replace(/\/+$/, ''),
  // Behind nginx, trust X-Forwarded-For / -Proto from the local proxy.
  trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === '1' : isProd,
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : isProd,
  sessionDays: Number(env.SESSION_DAYS) || 7,
  timeZone: env.TIME_ZONE || 'Asia/Kolkata',
  mail: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === '1', // true for port 465
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || '',
    leadAlertTo: env.LEAD_ALERT_TO || 'corporate@resurgentlegal.com'
  }
};
