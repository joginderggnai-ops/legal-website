'use strict';
// SQLite (local/VPS): writes a consistent copy of the database to data/backups/site-YYYY-MM-DD-HHMM.db
// (safe while the server runs) and keeps the newest 30. Copy data/uploads/ as well to keep blog images.
// Postgres (Vercel/Neon): use Neon's own backups and point-in-time restore instead.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const db = require('../src/db');

if (db.isPg) {
  console.log('This project uses Postgres (DATABASE_URL). Backups are handled by Neon: see "Backup & Restore" in the Neon console.');
  db.close();
} else {
  const dir = path.join(config.dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const file = path.join(dir, `site-${stamp}.db`);
  db.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  console.log(`Backup written: ${file}`);
  const old = fs.readdirSync(dir).filter((f) => /^site-.*\.db$/.test(f)).sort().reverse().slice(30);
  for (const f of old) fs.rmSync(path.join(dir, f));
  db.close();
}
