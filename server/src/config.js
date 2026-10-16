'use strict';
// All settings come from environment variables (see .env.example).
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const env = process.env;
const isProd = env.NODE_ENV === 'production';
const onVercel = Boolean(env.VERCEL);

const dataDir = path.resolve(root, env.DATA_DIR || 'data');

module.exports = {
  isProd,
  onVercel,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '127.0.0.1',
  // The static website folder (index.html, assets/ …). Blog pages reuse its header and footer.
  siteDir: path.resolve(root, env.SITE_DIR || '..'),
  // Serve the static site from Node too. Handy locally; nginx (VPS) or Vercel's CDN serve it in production.
  serveSite: env.SERVE_SITE ? env.SERVE_SITE === '1' : !isProd && !onVercel,
  // Postgres (e.g. Neon on Vercel) when set; otherwise a SQLite file in DATA_DIR.
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
  dataDir,
  dbFile: path.join(dataDir, 'site.db'),
  // Vercel Blob for uploaded images when set; otherwise files in DATA_DIR/uploads served at /uploads.
  blobToken: env.BLOB_READ_WRITE_TOKEN || '',
  uploadsDir: path.join(dataDir, 'uploads'),
  baseUrl: (env.BASE_URL || 'https://www.resurgentlegal.com').replace(/\/+$/, ''),
  // Behind nginx (VPS) trust the local proxy; on Vercel trust its edge network.
  trustProxy: onVercel ? true : env.TRUST_PROXY ? env.TRUST_PROXY === '1' : isProd ? 'loopback' : false,
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : isProd || onVercel,
  sessionDays: Number(env.SESSION_DAYS) || 7,
  timeZone: env.TIME_ZONE || 'Asia/Kolkata',
  // Creates the first administrator on start-up when there are no users yet (handy on Vercel).
  initialAdmin: {
    email: (env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase(),
    password: env.INITIAL_ADMIN_PASSWORD || '',
    name: env.INITIAL_ADMIN_NAME || 'Administrator'
  },
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
