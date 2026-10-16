'use strict';
// Passwords (scrypt), cookie sessions stored in the database, CSRF tokens and role checks.
const crypto = require('node:crypto');
const db = require('./db');
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

// Creates the first administrator from INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD when no users exist.
let initialAdminChecked = false;
async function ensureInitialAdmin() {
  if (initialAdminChecked) return;
  const { email, password, name } = config.initialAdmin;
  if (email && password) {
    if (passwordProblem(password)) {
      console.warn('[auth] INITIAL_ADMIN_PASSWORD is too short (at least 10 characters); no administrator created.');
    } else if ((await db.get('SELECT COUNT(*) AS n FROM users')).n === 0) {
      await db.run("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, 'admin', ?)", [email, name, hashPassword(password)]);
      console.log(`[auth] Created the first administrator: ${email}`);
    }
  }
  initialAdminChecked = true;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
    }
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

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  await db.run('INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)',
    [sha256(token), userId, csrf, Date.now() + SESSION_MS]);
  await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [db.nowSql(), userId]);
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]); // tidy up expired sessions
  setCookie(res, token, SESSION_MS);
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
  setCookie(res, '', 0);
}

// Ends every session for a user (after a password reset or deactivation), optionally keeping one.
async function endUserSessions(userId, keepTokenHash) {
  if (keepTokenHash) await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [userId, keepTokenHash]);
  else await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

// Loads req.user / req.csrf from the session cookie. Sessions slide: renewed when half used.
async function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return next();
  const tokenHash = sha256(token);
  const row = await db.get(`
    SELECT s.csrf, s.expires_at, u.id, u.email, u.name, u.role, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`, [tokenHash]);
  if (!row || row.expires_at < Date.now() || !row.active) {
    if (row) await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
    setCookie(res, '', 0);
    return next();
  }
  if (row.expires_at - Date.now() < SESSION_MS / 2) {
    await db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', [Date.now() + SESSION_MS, tokenHash]);
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
// Kept in memory, so on Vercel it applies per running instance.
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
}, 10 * 60 * 1000).unref();

module.exports = {
  MIN_PASSWORD, hashPassword, verifyPassword, generatePassword, passwordProblem, ensureInitialAdmin,
  createSession, destroySession, endUserSessions, loadSession,
  requireUser, requireAdmin, checkCsrf, sameOrigin,
  loginBlocked, recordFailure, clearFailures
};
