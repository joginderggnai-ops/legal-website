'use strict';
const path = require('node:path');
const express = require('express');
const { db, transaction } = require('../db');
const auth = require('../auth');
const mail = require('../mail');
const views = require('../views/admin');
const blogViews = require('../views/blog');
const { upload, saveImage, deleteImage, sanitizeBody } = require('../content');
const {
  LEAD_STATUSES, statusLabel, PRACTICE_AREAS, slugify, stripHtml, csvCell, formatDate,
  fromLocalInput, toSqlUtc
} = require('../util');

const router = express.Router();
const forms = express.urlencoded({ extended: false, limit: '100kb' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v, max) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const toId = (v) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : 0);

/* ---------------------------------------------------------------- Shared setup */

router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'"
  });
  next();
});

router.use('/static', express.static(path.join(__dirname, '../../public'), { maxAge: '1h' }));
router.use('/vendor/quill', express.static(path.join(path.dirname(require.resolve('quill/package.json')), 'dist'), { maxAge: '7d' }));

router.use(auth.sameOrigin, auth.loadSession);

function render(req, res, { title, active, body, status = 200 }) {
  res.status(status).send(views.layout({ title, active, body, user: req.user, csrf: req.csrf, flash: req.query.ok }));
}

// Only redirect back inside the admin panel.
const safeNext = (next) => (typeof next === 'string' && /^\/admin(\/|$|\?)/.test(next) && !next.startsWith('//') ? next : '/admin');

/* ---------------------------------------------------------------- Sign in / out */

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.send(views.loginPage({ next: req.query.next }));
});

router.post('/login', forms, (req, res) => {
  const email = str(req.body.email, 150).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const next = req.body.next;
  if (auth.loginBlocked(req.ip, email)) {
    return res.status(429).send(views.loginPage({ error: 'Too many failed attempts. Please wait 15 minutes and try again.', next, email }));
  }
  const user = db.prepare('SELECT id, password_hash, active FROM users WHERE email = ?').get(email);
  const ok = user && user.active && auth.verifyPassword(password, user.password_hash);
  if (!ok) {
    auth.recordFailure(req.ip, email);
    return res.status(401).send(views.loginPage({ error: 'That email and password combination is not right.', next, email }));
  }
  auth.clearFailures(req.ip, email);
  auth.createSession(res, user.id);
  res.redirect(safeNext(next));
});

router.post('/logout', forms, auth.requireUser, auth.checkCsrf, (req, res) => {
  auth.destroySession(req, res);
  res.redirect('/admin/login');
});

// Everything below needs a signed-in user.
router.use(auth.requireUser);

/* ---------------------------------------------------------------- Dashboard */

router.get('/', (req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  const stats = {
    newLeads: one("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'"),
    leads30: one("SELECT COUNT(*) AS n FROM leads WHERE created_at >= datetime('now', '-30 days') AND status <> 'spam'"),
    leadsTotal: one("SELECT COUNT(*) AS n FROM leads WHERE status <> 'spam'"),
    published: one("SELECT COUNT(*) AS n FROM posts WHERE status = 'published' AND published_at <= datetime('now')"),
    drafts: one("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'")
  };
  const recent = db.prepare('SELECT * FROM leads ORDER BY created_at DESC, id DESC LIMIT 8').all();
  render(req, res, {
    title: 'Dashboard',
    active: 'dashboard',
    body: views.dashboard({ stats, recent, mailEnabled: mail.mailEnabled, isAdmin: req.user.role === 'admin' })
  });
});

/* ---------------------------------------------------------------- Leads */

const LEADS_PER_PAGE = 25;

function leadFilters(query) {
  const status = LEAD_STATUSES.some((s) => s.id === query.status) ? query.status : '';
  const area = PRACTICE_AREAS.includes(query.area) ? query.area : '';
  const q = str(query.q, 100);
  const where = [];
  const params = [];
  if (q) {
    where.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')");
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    params.push(like, like, like, like, like);
  }
  if (area) { where.push('practice_area = ?'); params.push(area); }
  return { filters: { status, area, q }, where, params };
}

router.get('/leads', (req, res) => {
  const { filters, where, params } = leadFilters(req.query);
  const counts = { all: 0 };
  const base = where.length ? `WHERE ${where.join(' AND ')}` : '';
  for (const row of db.prepare(`SELECT status, COUNT(*) AS n FROM leads ${base} GROUP BY status`).all(...params)) {
    counts[row.status] = row.n;
    counts.all += row.n;
  }
  const allWhere = filters.status ? where.concat('status = ?') : where;
  const allParams = filters.status ? params.concat(filters.status) : params;
  const whereSql = allWhere.length ? `WHERE ${allWhere.join(' AND ')}` : '';
  const total = filters.status ? counts[filters.status] || 0 : counts.all;
  const pages = Math.max(1, Math.ceil(total / LEADS_PER_PAGE));
  const pageNo = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
  const leads = db.prepare(`SELECT * FROM leads ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...allParams, LEADS_PER_PAGE, (pageNo - 1) * LEADS_PER_PAGE);
  render(req, res, { title: 'Leads', active: 'leads', body: views.leadsList({ leads, filters, pageNo, pages, total, counts }) });
});

router.get('/leads.csv', (req, res) => {
  const { filters, where, params } = leadFilters(req.query);
  if (filters.status) { where.push('status = ?'); params.push(filters.status); }
  const rows = db.prepare(`
    SELECT l.*, u.name AS assignee FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.created_at DESC, l.id DESC`).all(...params);
  const header = ['Received', 'Name', 'Email', 'Phone', 'Company', 'Practice area', 'Message', 'Status', 'Assigned to', 'Page'];
  const lines = [header.map(csvCell).join(',')].concat(rows.map((l) => [
    formatDate(l.created_at, true), l.name, l.email, l.phone, l.company, l.practice_area, l.message,
    statusLabel(l.status), l.assignee || '', l.page
  ].map(csvCell).join(',')));
  const stamp = new Date().toISOString().slice(0, 10);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${stamp}.csv"` });
  res.send('﻿' + lines.join('\r\n') + '\r\n'); // BOM so Excel reads UTF-8 correctly
});

function getLead(id) {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(toId(id));
}

router.get('/leads/:id', (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return render(req, res, { title: 'Not found', active: 'leads', status: 404, body: views.errorPage('This lead no longer exists.') });
  const activity = db.prepare(`
    SELECT a.body, a.created_at, u.name AS user_name FROM lead_activity a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.lead_id = ? ORDER BY a.created_at DESC, a.id DESC`).all(lead.id);
  const users = db.prepare('SELECT id, name FROM users WHERE active = 1 OR id = ? ORDER BY name').all(lead.assigned_to || 0);
  render(req, res, {
    title: lead.name,
    active: 'leads',
    body: views.leadDetail({ lead, activity, users, csrf: req.csrf, isAdmin: req.user.role === 'admin' })
  });
});

router.post('/leads/:id', forms, auth.checkCsrf, (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.redirect('/admin/leads');
  const status = LEAD_STATUSES.some((s) => s.id === req.body.status) ? req.body.status : lead.status;
  const assigneeId = toId(req.body.assigned_to) || null;
  const assignee = assigneeId ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(assigneeId) : null;
  const note = str(req.body.note, 2000);
  const log = db.prepare('INSERT INTO lead_activity (lead_id, user_id, body) VALUES (?, ?, ?)');

  transaction(() => {
    if (status !== lead.status) log.run(lead.id, req.user.id, `Status changed from ${statusLabel(lead.status)} to ${statusLabel(status)}.`);
    if ((assignee ? assignee.id : null) !== lead.assigned_to) log.run(lead.id, req.user.id, assignee ? `Assigned to ${assignee.name}.` : 'Unassigned.');
    if (note) log.run(lead.id, req.user.id, note);
    db.prepare("UPDATE leads SET status = ?, assigned_to = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, assignee ? assignee.id : null, lead.id);
  });
  res.redirect(`/admin/leads/${lead.id}?ok=saved`);
});

router.post('/leads/:id/delete', forms, auth.checkCsrf, auth.requireAdmin, (req, res) => {
  db.prepare('DELETE FROM leads WHERE id = ?').run(toId(req.params.id));
  res.redirect('/admin/leads?ok=deleted');
});

/* ---------------------------------------------------------------- Blog posts */

const EMPTY_POST = {
  id: 0, title: '', slug: '', excerpt: '', body: '', category: '', author_name: '', cover_image: '', cover_alt: '',
  meta_title: '', meta_description: '', status: 'draft', published_at: null
};

function categories() {
  return db.prepare("SELECT DISTINCT category FROM posts WHERE category <> '' ORDER BY category").all().map((r) => r.category);
}

function getPost(id) {
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(toId(id));
}

router.get('/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT id, title, slug, status, published_at, updated_at,
           (status = 'published' AND published_at > datetime('now')) AS scheduled
    FROM posts ORDER BY COALESCE(published_at, created_at) DESC, id DESC`).all();
  render(req, res, { title: 'Blog posts', active: 'posts', body: views.postsList({ posts }) });
});

function renderPostForm(req, res, post, errors = {}, status = 200) {
  render(req, res, {
    title: post.id ? `Edit: ${post.title}` : 'New post',
    active: 'posts',
    status,
    body: views.postForm({ post, errors, csrf: req.csrf, categories: categories() })
  });
}

router.get('/posts/new', (req, res) => renderPostForm(req, res, { ...EMPTY_POST, author_name: req.user.name }));

router.get('/posts/:id', (req, res) => {
  const post = getPost(req.params.id);
  if (!post) return render(req, res, { title: 'Not found', active: 'posts', status: 404, body: views.errorPage('This post no longer exists.') });
  renderPostForm(req, res, post);
});

router.get('/posts/:id/preview', (req, res) => {
  const post = getPost(req.params.id);
  if (!post) return res.status(404).send('Post not found.');
  // The public page's styles and fonts load from this site and Google Fonts.
  res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  res.send(blogViews.postPage(post, [], { preview: true }));
});

// Multer errors (e.g. file too large) become a form error instead of a crash.
function coverUpload(req, res, next) {
  upload.single('cover')(req, res, (err) => {
    if (err) req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'The image is larger than 5 MB.' : 'The image could not be uploaded.';
    if (!req.body) req.body = {};
    next();
  });
}

function savePost(req, res, existing) {
  const b = req.body;
  const post = {
    ...(existing || EMPTY_POST),
    title: str(b.title, 160),
    excerpt: str(b.excerpt, 300),
    body: sanitizeBody(typeof b.body === 'string' ? b.body.slice(0, 1_000_000) : (existing ? existing.body : '')),
    category: str(b.category, 60),
    author_name: str(b.author_name, 100),
    cover_alt: str(b.cover_alt, 200),
    meta_title: str(b.meta_title, 70),
    meta_description: str(b.meta_description, 170),
    status: b.status === 'published' ? 'published' : 'draft'
  };
  post.slug = slugify(str(b.slug, 80) || post.title);

  const errors = {};
  if (!post.title) errors.title = 'Please enter a title.';
  if (!post.slug) errors.slug = 'Please enter a web address using letters and numbers.';
  else if (db.prepare('SELECT 1 FROM posts WHERE slug = ? AND id <> ?').get(post.slug, existing ? existing.id : 0)) {
    errors.slug = 'Another post already uses this web address.';
  }
  if (post.status === 'published' && !stripHtml(post.body) && !/<img /.test(post.body)) errors.body = 'Please write the article before publishing.';

  const dateInput = str(b.published_at, 20);
  if (dateInput) {
    const parsed = fromLocalInput(dateInput);
    if (parsed) post.published_at = parsed;
    else errors.published_at = 'Please enter a valid date and time.';
  } else if (post.status === 'published') {
    post.published_at = toSqlUtc(new Date());
  } else {
    post.published_at = null;
  }

  if (req.uploadError) errors.cover = req.uploadError;
  if (Object.keys(errors).length) {
    if (req.file && !errors.cover) errors.cover = 'Please choose the image again.';
    return renderPostForm(req, res, post, errors, 422);
  }

  const oldCover = existing ? existing.cover_image : '';
  if (req.file) {
    try {
      post.cover_image = saveImage(req.file);
    } catch (err) {
      return renderPostForm(req, res, post, { cover: err.message }, 422);
    }
  } else if (b.remove_cover === '1') {
    post.cover_image = '';
  }

  const cols = ['title', 'slug', 'excerpt', 'body', 'category', 'author_name', 'cover_image', 'cover_alt', 'meta_title', 'meta_description', 'status', 'published_at'];
  const values = cols.map((c) => post[c]);
  let id;
  if (existing) {
    db.prepare(`UPDATE posts SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values, existing.id);
    id = existing.id;
  } else {
    id = db.prepare(`INSERT INTO posts (${cols.join(', ')}, created_by) VALUES (${cols.map(() => '?').join(', ')}, ?) RETURNING id`)
      .get(...values, req.user.id).id;
  }
  if (oldCover && oldCover !== post.cover_image) deleteImage(oldCover);

  const justPublished = post.status === 'published' && (!existing || existing.status !== 'published');
  res.redirect(`/admin/posts/${id}?ok=${justPublished ? 'published' : 'saved'}`);
}

router.post('/posts/new', coverUpload, auth.checkCsrf, (req, res) => savePost(req, res, null));

router.post('/posts/:id', coverUpload, auth.checkCsrf, (req, res) => {
  const existing = getPost(req.params.id);
  if (!existing) return res.redirect('/admin/posts');
  savePost(req, res, existing);
});

router.post('/posts/:id/delete', forms, auth.checkCsrf, (req, res) => {
  const post = getPost(req.params.id);
  if (post) {
    db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
    deleteImage(post.cover_image);
  }
  res.redirect('/admin/posts?ok=deleted');
});

// Images inserted into the article body by the editor.
router.post('/uploads', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'The image is larger than 5 MB.' : 'Upload failed.' });
    next();
  });
}, auth.checkCsrf, (req, res) => {
  try {
    res.json({ ok: true, url: saveImage(req.file) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* ---------------------------------------------------------------- Users (administrators only) */

function listUsers() {
  return db.prepare('SELECT id, name, email, role, active, last_login_at FROM users ORDER BY active DESC, name').all();
}
function renderUsers(req, res, extra = {}, status = 200) {
  render(req, res, { title: 'Users', active: 'users', status, body: views.usersList({ users: listUsers(), me: req.user, csrf: req.csrf, ...extra }) });
}
// Loads the target user; administrators can't change their own role, status or password here.
function otherUser(req, res) {
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(toId(req.params.id));
  if (!user || user.id === req.user.id) {
    res.redirect('/admin/users');
    return null;
  }
  return user;
}

router.get('/users', auth.requireAdmin, (req, res) => renderUsers(req, res));

router.post('/users', forms, auth.checkCsrf, auth.requireAdmin, (req, res) => {
  const form = { name: str(req.body.name, 100), email: str(req.body.email, 150).toLowerCase(), role: req.body.role === 'admin' ? 'admin' : 'editor' };
  const errors = {};
  if (!form.name) errors.name = 'Please enter a name.';
  if (!EMAIL_RE.test(form.email)) errors.email = 'Please enter a valid email address.';
  else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(form.email)) errors.email = 'A user with this email already exists.';
  if (Object.keys(errors).length) return renderUsers(req, res, { errors, form }, 422);

  const password = auth.generatePassword();
  db.prepare('INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)').run(form.name, form.email, form.role, auth.hashPassword(password));
  renderUsers(req, res, { created: { label: `Account created for ${form.name}.`, email: form.email, password } }, 201);
});

router.post('/users/:id/role', forms, auth.checkCsrf, auth.requireAdmin, (req, res) => {
  const user = otherUser(req, res);
  if (!user) return;
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role === 'admin' ? 'admin' : 'editor', user.id);
  res.redirect('/admin/users?ok=saved');
});

router.post('/users/:id/active', forms, auth.checkCsrf, auth.requireAdmin, (req, res) => {
  const user = otherUser(req, res);
  if (!user) return;
  const active = req.body.active === '1' ? 1 : 0;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, user.id);
  if (!active) auth.endUserSessions(user.id);
  res.redirect('/admin/users?ok=saved');
});

router.post('/users/:id/reset', forms, auth.checkCsrf, auth.requireAdmin, (req, res) => {
  const user = otherUser(req, res);
  if (!user) return;
  const password = auth.generatePassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), user.id);
  auth.endUserSessions(user.id);
  renderUsers(req, res, { created: { label: `New temporary password for ${user.name}.`, email: user.email, password } });
});

router.post('/users/:id/delete', forms, auth.checkCsrf, auth.requireAdmin, (req, res) => {
  const user = otherUser(req, res);
  if (!user) return;
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.redirect('/admin/users?ok=deleted');
});

/* ---------------------------------------------------------------- My account */

router.get('/account', (req, res) => {
  render(req, res, { title: 'My account', active: 'account', body: views.accountPage({ user: req.user, csrf: req.csrf }) });
});

router.post('/account/profile', forms, auth.checkCsrf, (req, res) => {
  const name = str(req.body.name, 100);
  if (!name) {
    return render(req, res, { title: 'My account', active: 'account', status: 422, body: views.accountPage({ user: req.user, csrf: req.csrf, errors: { name: 'Please enter your name.' } }) });
  }
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  res.redirect('/admin/account?ok=saved');
});

router.post('/account/password', forms, auth.checkCsrf, (req, res) => {
  const { current, password, confirm } = req.body;
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const errors = {};
  if (!auth.verifyPassword(String(current || ''), row.password_hash)) errors.current = 'Your current password is not right.';
  const problem = auth.passwordProblem(password);
  if (problem) errors.password = problem;
  else if (password !== confirm) errors.confirm = 'The two new passwords do not match.';
  if (Object.keys(errors).length) {
    return render(req, res, { title: 'My account', active: 'account', status: 422, body: views.accountPage({ user: req.user, csrf: req.csrf, errors }) });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), req.user.id);
  auth.endUserSessions(req.user.id, req.sessionHash);
  res.redirect('/admin/account?ok=password');
});

/* ---------------------------------------------------------------- Errors */

router.use((req, res) => render(req, res, { title: 'Not found', active: '', status: 404, body: views.errorPage('This page does not exist.') }));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  console.error('[admin]', err);
  if (!req.user) return res.status(500).send('Something went wrong.');
  render(req, res, { title: 'Error', active: '', status: 500, body: views.errorPage('The server hit an error. Please try again.') });
});

module.exports = router;
