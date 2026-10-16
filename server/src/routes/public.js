'use strict';
const express = require('express');
const db = require('../db');
const mail = require('../mail');
const blog = require('../views/blog');
const { PRACTICE_AREAS, rateLimit, formatDate, parseUtc } = require('../util');

const router = express.Router();

// A post is public once published and its publish time has passed (so posts can be scheduled).
const PUBLIC = "status = 'published' AND published_at IS NOT NULL AND published_at <= ?";
const CARD_COLS = 'id, title, slug, excerpt, category, cover_image, cover_alt, published_at';

/* ---------------------------------------------------------------- Contact form → leads */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const field = (v, max) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
// Waits for the alert email, but never more than 8 seconds (serverless functions stop after the response).
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

router.post(
  '/api/contact',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many enquiries from your connection. Please email or call us instead.' }),
  express.json({ limit: '20kb' }),
  async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true }); // honeypot: pretend success to bots

    const lead = {
      name: field(b.name, 100),
      email: field(b.email, 150),
      phone: field(b.phone, 30),
      company: field(b.company, 150),
      practice_area: field(b.practiceArea, 120),
      message: field(b.message, 2000),
      page: field(b.page, 500)
    };
    const errors = {};
    if (!lead.name) errors.name = 'Please enter your full name.';
    if (!EMAIL_RE.test(lead.email)) errors.email = 'Please enter a valid email address.';
    if (!/^\+\d{1,4} \d{6,14}$/.test(lead.phone)) errors.phone = 'Please enter a valid phone number.';
    if (!PRACTICE_AREAS.includes(lead.practice_area)) errors.practiceArea = 'Please choose a practice area.';
    if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });

    const row = await db.get(`
      INSERT INTO leads (name, email, phone, company, practice_area, message, page, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, created_at`, [
      lead.name, lead.email, lead.phone, lead.company, lead.practice_area, lead.message, lead.page,
      req.ip || '', field(req.get('user-agent'), 300)
    ]);

    await withTimeout(
      mail.sendLeadAlert({ ...lead, ...row }).catch((err) => console.error('[mail] lead alert failed:', err.message)),
      8000
    );
    res.status(201).json({ ok: true });
  }
);

/* ---------------------------------------------------------------- Blog JSON for the home page and footer */

router.get('/api/posts', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 3, 1), 12);
  const posts = await db.all(`SELECT ${CARD_COLS} FROM posts WHERE ${PUBLIC} ORDER BY published_at DESC LIMIT ?`, [db.nowSql(), limit]);
  res.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  res.json({
    posts: posts.map((p) => ({
      title: p.title,
      url: `/blog/${p.slug}`,
      excerpt: p.excerpt,
      category: p.category,
      image: p.cover_image,
      imageAlt: p.cover_alt,
      date: (parseUtc(p.published_at) || new Date()).toISOString(),
      dateLabel: formatDate(p.published_at)
    }))
  });
});

/* ---------------------------------------------------------------- Blog pages */

const PER_PAGE = 9;

router.get('/blog', async (req, res) => {
  const now = db.nowSql();
  const total = (await db.get(`SELECT COUNT(*) AS n FROM posts WHERE ${PUBLIC}`, [now])).n;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageNo = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
  const posts = await db.all(`SELECT ${CARD_COLS} FROM posts WHERE ${PUBLIC} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
    [now, PER_PAGE, (pageNo - 1) * PER_PAGE]);
  res.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  res.send(blog.indexPage({ posts, pageNo, pages }));
});

router.get('/blog/sitemap.xml', async (req, res) => {
  const posts = await db.all(`SELECT slug, updated_at FROM posts WHERE ${PUBLIC} ORDER BY published_at DESC`, [db.nowSql()]);
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(blog.sitemap(posts));
});

router.get('/blog/:slug', async (req, res) => {
  const now = db.nowSql();
  const post = await db.get(`SELECT * FROM posts WHERE slug = ? AND ${PUBLIC}`, [req.params.slug, now]);
  if (!post) return res.status(404).send(blog.notFoundPage());
  const related = await db.all(`
    SELECT ${CARD_COLS} FROM posts WHERE ${PUBLIC} AND id <> ?
    ORDER BY (category = ? AND category <> '') DESC, published_at DESC LIMIT 3`, [now, post.id, post.category]);
  res.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  res.send(blog.postPage(post, related));
});

module.exports = router;
