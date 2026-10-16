'use strict';
// SQLite database (Node's built-in node:sqlite). One file: data/site.db.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.uploadsDir, { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    password_hash TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf       TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT NOT NULL DEFAULT '',
    company       TEXT NOT NULL DEFAULT '',
    practice_area TEXT NOT NULL DEFAULT '',
    message       TEXT NOT NULL DEFAULT '',
    page          TEXT NOT NULL DEFAULT '',
    ip            TEXT NOT NULL DEFAULT '',
    user_agent    TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'new',
    assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at DESC);
  CREATE INDEX IF NOT EXISTS leads_status  ON leads (status);

  -- Notes and status changes on a lead, newest first in the UI.
  CREATE TABLE IF NOT EXISTS lead_activity (
    id         INTEGER PRIMARY KEY,
    lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS lead_activity_lead ON lead_activity (lead_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS posts (
    id               INTEGER PRIMARY KEY,
    title            TEXT NOT NULL,
    slug             TEXT NOT NULL UNIQUE,
    excerpt          TEXT NOT NULL DEFAULT '',
    body             TEXT NOT NULL DEFAULT '',
    category         TEXT NOT NULL DEFAULT '',
    author_name      TEXT NOT NULL DEFAULT '',
    cover_image      TEXT NOT NULL DEFAULT '',
    cover_alt        TEXT NOT NULL DEFAULT '',
    meta_title       TEXT NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at     TEXT,
    created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS posts_published ON posts (status, published_at DESC);
`);

// Wrap a function in BEGIN/COMMIT.
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, transaction };
