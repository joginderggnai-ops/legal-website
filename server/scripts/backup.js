'use strict';
// Writes a consistent copy of the database to data/backups/site-YYYY-MM-DD-HHMM.db (safe while the server runs).
// Copy data/uploads/ as well to keep blog images. Old backups beyond the newest 30 are removed.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const { db } = require('../src/db');

const dir = path.join(config.dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const file = path.join(dir, `site-${stamp}.db`);

db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
console.log(`Backup written: ${file}`);

const old = fs.readdirSync(dir).filter((f) => /^site-.*\.db$/.test(f)).sort().reverse().slice(30);
for (const f of old) fs.rmSync(path.join(dir, f));
