'use strict';
// Passwords (scrypt), cookie sessions stored in SQLite, CSRF tokens and role checks.
const crypto = require('node:crypto');
const { db } = require('./db');
const config = require('./config');

const COOKIE = 'rl_admin';
const SESSION_MS = config.sessionDays * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 10;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

// A readable temporary password, e.g. "Kq7m-x2Pd-R9wz".
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += chars[bytes[i] % chars.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return 'Use at most 200 characters.';
  return '';
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, value, maxAgeMs) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (config.cookieSecure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(token), userId, csrf, Date.now() + SESSION_MS);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
  setCookie(res, token, SESSION_MS);
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(res, '', 0);
}

// Ends every session for a user (after a password reset or deactivation), optionally keeping one.
function endUserSessions(userId, keepTokenHash) {
  if (keepTokenHash) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, keepTokenHash);
  else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Loads req.user / req.csrf from the session cookie. Sessions slide: renewed when half used.
function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return next();
  const tokenHash = sha256(token);
  const row = db.prepare(`
    SELECT s.csrf, s.expires_at, u.id, u.email, u.name, u.role, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(tokenHash);
  if (!row || row.expires_at < Date.now() || !row.active) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    setCookie(res, '', 0);
    return next();
  }
  if (row.expires_at - Date.now() < SESSION_MS / 2) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() + SESSION_MS, tokenHash);
    setCookie(res, token, SESSION_MS);
  }
  req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
  req.csrf = row.csrf;
  req.sessionHash = tokenHash;
  next();
}

function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
  return res.status(401).json({ ok: false, error: 'Please sign in again.' });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).send('Only administrators can do this.');
}

// For state-changing requests: the form's _csrf field (or X-CSRF-Token header) must match the session.
function checkCsrf(req, res, next) {
  const sent = String((req.body && req.body._csrf) || req.get('x-csrf-token') || '');
  const a = Buffer.from(sent);
  const b = Buffer.from(String(req.csrf || ''));
  if (a.length && a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.status(403).send('Your session expired or the form was out of date. Go back, refresh the page and try again.');
}

// Rejects cross-site POSTs (defence in depth alongside CSRF tokens and SameSite cookies).
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (new URL(origin).host === req.get('host')) return next();
  } catch { /* fall through */ }
  res.status(403).send('Cross-site request blocked.');
}

// Login throttling: 8 failed attempts per IP or per email in 15 minutes.
const failures = new Map();
const WINDOW = 15 * 60 * 1000;
function loginBlocked(ip, email) {
  const now = Date.now();
  return [ip, 'e:' + email].some((k) => {
    const f = failures.get(k);
    return f && f.reset > now && f.count >= 8;
  });
}
function recordFailure(ip, email) {
  const now = Date.now();
  for (const k of [ip, 'e:' + email]) {
    const f = failures.get(k);
    if (!f || f.reset <= now) failures.set(k, { count: 1, reset: now + WINDOW });
    else f.count += 1;
  }
}
function clearFailures(ip, email) {
  failures.delete(ip);
  failures.delete('e:' + email);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, f] of failures) if (f.reset <= now) failures.delete(k);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}, 10 * 60 * 1000).unref();

module.exports = {
  MIN_PASSWORD, hashPassword, verifyPassword, generatePassword, passwordProblem,
  createSession, destroySession, endUserSessions, loadSession,
  requireUser, requireAdmin, checkCsrf, sameOrigin,
  loginBlocked, recordFailure, clearFailures
};
