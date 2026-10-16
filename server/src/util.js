'use strict';
const config = require('./config');

const LEAD_STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'converted', label: 'Converted' },
  { id: 'closed', label: 'Closed' },
  { id: 'spam', label: 'Spam' }
];
const statusLabel = (id) => (LEAD_STATUSES.find((s) => s.id === id) || { label: id }).label;

// Same options as the practice-area select on contact-us.html.
const PRACTICE_AREAS = [
  'Corporate & Commercial',
  'Mergers, Amalgamations & Transaction Advisory',
  'NPA & Stressed Assets Resolution',
  'Foreign Investment & Exchange Control',
  'Employment & Labour Laws',
  'Insolvency & Bankruptcy',
  'Start-Up Assistance',
  'Litigation & Dispute Resolution',
  'Other / General Enquiry'
];

// HTML-escape text for element content and attribute values.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

// SQLite datetime('now') values are UTC "YYYY-MM-DD HH:MM:SS".
function parseUtc(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d;
}
function toSqlUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function formatDate(value, withTime = false) {
  const d = parseUtc(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: config.timeZone,
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(d);
}

// <input type="datetime-local"> works in the firm's time zone; the database stores UTC.
const TZ_OFFSET_MIN = 330; // Asia/Kolkata has no daylight saving
function toLocalInput(value) {
  const d = parseUtc(value);
  if (!d) return '';
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return null;
  const d = new Date(value + ':00Z');
  if (Number.isNaN(d.getTime())) return null;
  return toSqlUtc(new Date(d.getTime() - TZ_OFFSET_MIN * 60000));
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function readingMinutes(html) {
  return Math.max(1, Math.round(stripHtml(html).split(' ').filter(Boolean).length / 220));
}

// One CSV cell. Cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas
// (phone numbers like "+91 98765 43210" are left as they are).
function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d ]+$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Simple in-memory fixed-window rate limiter keyed by IP (fine for a single server process).
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, windowMs).unref();
  return function (req, res, next) {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ ok: false, error: message || 'Too many requests. Please try again later.' });
    }
    next();
  };
}

module.exports = {
  LEAD_STATUSES, statusLabel, PRACTICE_AREAS,
  esc, slugify, parseUtc, toSqlUtc, formatDate, toLocalInput, fromLocalInput,
  stripHtml, readingMinutes, csvCell, rateLimit
};
