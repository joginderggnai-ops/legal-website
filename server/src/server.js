'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const config = require('./config');
require('./db'); // creates the database and tables on first run
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 'loopback');

app.use('/uploads', express.static(config.uploadsDir, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff')
}));
app.use('/admin', adminRoutes);
app.use(publicRoutes);

// Locally, serve the static website too (clean URLs like /about-us map to about-us.html).
if (config.serveSite) {
  const notFound = (req, res) => res.status(404).sendFile('404.html', { root: config.siteDir });
  // Never expose the backend's own files.
  app.use((req, res, next) => (/^\/(server|nextjs|node_modules)(\/|$)/i.test(req.path) ? notFound(req, res) : next()));
  // Old .html addresses redirect to the clean ones, as nginx does on the live site.
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
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(err.status || 500).json({ ok: false, error: 'Server error.' });
  res.status(err.status || 500).send('Something went wrong.');
});

app.listen(config.port, config.host, () => {
  console.log(`Resurgent Legal backend on http://${config.host}:${config.port}  (admin: /admin)`);
  if (config.serveSite) console.log(`Serving the website from ${config.siteDir}`);
});
