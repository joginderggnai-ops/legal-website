'use strict';
// The Express app. server.js runs it as a normal server (local, VPS); api/index.js runs it on Vercel.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// Local image uploads (when Vercel Blob isn't used).
app.use('/uploads', express.static(config.uploadsDir, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff')
}));

// Make sure the tables (and the first administrator, if configured) exist before handling data routes.
app.use(['/api', '/admin', '/blog'], async (req, res, next) => {
  if (req.path.startsWith('/static/') || req.path.startsWith('/vendor/')) return next();
  await db.ready();
  await auth.ensureInitialAdmin();
  next();
});

app.use('/admin', adminRoutes);
app.use(publicRoutes);

// Locally, serve the static website too. On the VPS nginx does this; on Vercel its CDN does.
if (config.serveSite) {
  const notFound = (req, res) => res.status(404).sendFile('404.html', { root: config.siteDir });
  // Never expose the backend's own files.
  app.use((req, res, next) => (/^\/(server|nextjs|node_modules|api|public)(\/|$)/i.test(req.path) || /^\/(package(-lock)?\.json|vercel\.json|\.env.*)$/i.test(req.path) ? notFound(req, res) : next()));
  // Old .html addresses redirect to the clean ones, as nginx and Vercel do on the live site.
  app.use((req, res, next) => {
    const m = /^(.*?)(?:index)?\.html$/.exec(req.path);
    if (!m || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    res.redirect(301, (m[1] || '/') + req.originalUrl.slice(req.path.length));
  });
  // Clean URLs: /about-us → about-us.html. Checked before folders, so /practice-areas serves
  // practice-areas.html rather than the practice-areas/ folder (same as nginx's try_files).
  app.use((req, res, next) => {
    if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(req.path)) return next();
    const file = path.join(config.siteDir, req.path + '.html');
    fs.stat(file, (err, stat) => (!err && stat.isFile() ? res.sendFile(file) : next()));
  });
  app.use(express.static(config.siteDir, { index: 'index.html', dotfiles: 'ignore', redirect: false }));
  app.use(notFound);
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const notConfigured = err.code === 'DB_NOT_CONFIGURED';
  console.error(notConfigured ? `[app] ${err.message}` : err);
  const status = notConfigured ? 503 : err.status || 500;
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ ok: false, error: notConfigured ? 'This service is not set up yet.' : 'Server error.' });
  }
  res.status(status).type('text/plain').send(notConfigured ? err.message : 'Something went wrong. Please try again.');
});

module.exports = app;
