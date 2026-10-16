'use strict';
// Runs the app as a normal Node server (local development and the VPS).
const config = require('./config');
const db = require('./db');
const app = require('./app');

db.ready()
  .then(() => {
    app.listen(config.port, config.host, () => {
      console.log(`Resurgent Legal backend on http://${config.host}:${config.port}  (admin: /admin)`);
      console.log(`Database: ${db.isPg ? 'Postgres' : config.dbFile}`);
      if (config.serveSite) console.log(`Serving the website from ${config.siteDir}`);
    });
  })
  .catch((err) => {
    console.error('Could not open the database:', err.message);
    process.exit(1);
  });
