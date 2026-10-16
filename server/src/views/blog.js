'use strict';
// Public blog pages: /blog (list) and /blog/<slug> (article), rendered on the server for SEO.
const config = require('../config');
const { esc, formatDate, parseUtc, readingMinutes } = require('../util');
const { page } = require('../site-shell');

const ARROW = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
const PHONE_ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const MAIL_ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';

const ORG_ID = 'https://www.resurgentlegal.com/#organization';
const absUrl = (url) => (/^https?:\/\//.test(url) ? url : config.baseUrl + url);
const isoDate = (value) => (parseUtc(value) || new Date()).toISOString();

// The <script type="application/ld+json"> body, with "<" escaped so it can't close the tag.
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}</script>`;

function card(post) {
  const cover = post.cover_image
    ? `<img src="${esc(post.cover_image)}" alt="${esc(post.cover_alt)}" loading="lazy" decoding="async">`
    : '<span class="blog-card-mark" aria-hidden="true"></span>';
  return `
        <a class="card blog-card" href="/blog/${esc(post.slug)}">
          <span class="blog-card-media">${cover}</span>
          <span class="blog-card-body">
            <span class="blog-card-meta">${post.category ? `<span>${esc(post.category)}</span>` : ''}<time datetime="${esc(isoDate(post.published_at))}">${esc(formatDate(post.published_at))}</time></span>
            <h3>${esc(post.title)}</h3>
            ${post.excerpt ? `<p>${esc(post.excerpt)}</p>` : ''}
            <span class="link-arrow">Read article ${ARROW}</span>
          </span>
        </a>`;
}

function hero({ crumbs, eyebrow, title, lead, meta }) {
  return `
  <section class="page-hero">
    <div class="container">
      <div class="page-hero-inner">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <ol>
            ${crumbs.map((c) => (c.href ? `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>` : `<li><span aria-current="page">${esc(c.label)}</span></li>`)).join('\n            ')}
          </ol>
        </nav>
        ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
        <h1>${esc(title)}</h1>
        ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
        ${meta || ''}
      </div>
    </div>
  </section>`;
}

function ctaBand() {
  return `
  <section class="section">
    <div class="container">
      <div class="cta-band">
        <div>
          <h2>Need advice on a legal matter?</h2>
          <p>Speak to our team about your situation and the options open to you.</p>
        </div>
        <div class="cta-actions">
          <a class="btn btn--accent" href="/contact-us">Schedule a Consultation ${ARROW}</a>
        </div>
      </div>
    </div>
  </section>`;
}

function indexPage({ posts, pageNo, pages }) {
  const canonical = `${config.baseUrl}/blog${pageNo > 1 ? `?page=${pageNo}` : ''}`;
  const pager = pages > 1
    ? `<nav class="blog-pager" aria-label="Blog pages">
        ${pageNo > 1 ? `<a class="btn btn--outline" href="/blog${pageNo > 2 ? `?page=${pageNo - 1}` : ''}" rel="prev">&larr; Newer articles</a>` : '<span></span>'}
        <span>Page ${pageNo} of ${pages}</span>
        ${pageNo < pages ? `<a class="btn btn--outline" href="/blog?page=${pageNo + 1}" rel="next">Older articles &rarr;</a>` : '<span></span>'}
      </nav>`
    : '';

  const main = `${hero({
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Blog' }],
    eyebrow: 'Blog',
    title: 'Legal Insights & Updates',
    lead: 'Analysis of new laws, regulatory changes and court rulings that affect businesses in India, from the lawyers at Resurgent Legal LLP.'
  })}
  <section class="section">
    <div class="container">
      ${posts.length
        ? `<div class="grid grid--3 blog-grid">${posts.map(card).join('')}
      </div>
      ${pager}`
        : '<p class="blog-empty">New articles are on their way. Please check back soon.</p>'}
    </div>
  </section>
${ctaBand()}`;

  const head = `
<meta property="og:type" content="website">
<meta property="og:locale" content="en_IN">
<meta property="og:site_name" content="Resurgent Legal LLP">
<meta property="og:title" content="Legal Insights &amp; Updates | Resurgent Legal LLP">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(config.baseUrl)}/assets/img/og-banner.jpg">
<meta name="twitter:card" content="summary_large_image">
${jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        '@id': `${config.baseUrl}/blog#blog`,
        name: 'Legal Insights & Updates',
        url: `${config.baseUrl}/blog`,
        publisher: { '@id': ORG_ID }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${config.baseUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${config.baseUrl}/blog` }
        ]
      }
    ]
  })}`;

  return page({
    title: `Legal Insights & Updates${pageNo > 1 ? ` (Page ${pageNo})` : ''} | Resurgent Legal LLP`,
    description: 'Legal insights and updates from Resurgent Legal LLP on corporate law, M&A, insolvency, FEMA, employment law, litigation and start-ups in India.',
    canonical,
    head,
    main
  });
}

function postPage(post, related, { preview = false } = {}) {
  const url = `${config.baseUrl}/blog/${post.slug}`;
  const title = post.meta_title || `${post.title} | Resurgent Legal LLP`;
  const description = post.meta_description || post.excerpt || '';
  const image = post.cover_image ? absUrl(post.cover_image) : `${config.baseUrl}/assets/img/og-banner.jpg`;
  const minutes = readingMinutes(post.body);

  const meta = `<p class="post-meta">
          <time datetime="${esc(isoDate(post.published_at))}">${esc(formatDate(post.published_at) || 'Not yet published')}</time>
          ${post.author_name ? `<span>${esc(post.author_name)}</span>` : ''}
          <span>${minutes} min read</span>
        </p>`;

  const main = `${preview ? '<div class="preview-bar" role="status">Draft preview: this is how the article will look. It is not public yet.</div>' : ''}
${hero({
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: post.title }],
    eyebrow: post.category || 'Blog',
    title: post.title,
    lead: post.excerpt,
    meta
  })}
  <section class="section">
    <div class="container pa-detail">
      <article class="pa-detail-main">
        ${post.cover_image ? `<figure class="post-cover"><img src="${esc(post.cover_image)}" alt="${esc(post.cover_alt)}" decoding="async"></figure>` : ''}
        <div class="prose">
${post.body}
        </div>
        <p class="post-back"><a class="link-arrow" href="/blog">All articles ${ARROW}</a></p>
      </article>
      <aside class="pa-aside">
        <div class="contact-card">
          <h2>Have a question about this?</h2>
          <p>Talk to our team.</p>
          <ul class="contact-list">
            <li><span class="ico-wrap">${PHONE_ICON}</span><span><small>Phone</small><a href="tel:+918800453987">+91 88004 53987</a></span></li>
            <li><span class="ico-wrap">${MAIL_ICON}</span><span><small>Email</small><a href="mailto:corporate@resurgentlegal.com">corporate@resurgentlegal.com</a></span></li>
          </ul>
          <a class="btn btn--accent" href="/contact-us">Schedule a Consultation ${ARROW}</a>
        </div>
      </aside>
    </div>
  </section>
${related.length ? `
  <section class="section section--alt" aria-labelledby="related-title">
    <div class="container">
      <div class="section-head">
        <h2 id="related-title">More from the Blog</h2>
      </div>
      <div class="grid grid--3 blog-grid">${related.map(card).join('')}
      </div>
    </div>
  </section>` : ''}
${ctaBand()}`;

  const head = `
<meta property="og:type" content="article">
<meta property="og:locale" content="en_IN">
<meta property="og:site_name" content="Resurgent Legal LLP">
<meta property="og:title" content="${esc(post.meta_title || post.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="article:published_time" content="${esc(isoDate(post.published_at))}">
<meta property="article:modified_time" content="${esc(isoDate(post.updated_at))}">
<meta name="twitter:card" content="summary_large_image">
${jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${url}#article`,
        headline: post.title.slice(0, 110),
        description,
        image,
        datePublished: isoDate(post.published_at),
        dateModified: isoDate(post.updated_at),
        author: post.author_name ? { '@type': 'Person', name: post.author_name } : { '@id': ORG_ID },
        publisher: { '@id': ORG_ID },
        mainEntityOfPage: url,
        ...(post.category ? { articleSection: post.category } : {})
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${config.baseUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${config.baseUrl}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url }
        ]
      }
    ]
  })}`;

  return page({
    title,
    description,
    canonical: preview ? '' : url,
    robots: preview ? 'noindex, nofollow' : 'index, follow',
    head,
    main
  });
}

function notFoundPage() {
  return page({
    title: 'Article not found | Resurgent Legal LLP',
    description: 'This article could not be found.',
    robots: 'noindex',
    main: `${hero({
      crumbs: [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: 'Not found' }],
      title: 'Article not found',
      lead: 'This article may have been moved or unpublished.'
    })}
  <section class="section">
    <div class="container"><p><a class="btn btn--primary" href="/blog">See all articles ${ARROW}</a></p></div>
  </section>`
  });
}

function sitemap(posts) {
  const items = [`  <url><loc>${config.baseUrl}/blog</loc></url>`].concat(
    posts.map((p) => `  <url><loc>${esc(`${config.baseUrl}/blog/${p.slug}`)}</loc><lastmod>${isoDate(p.updated_at).slice(0, 10)}</lastmod></url>`)
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}\n</urlset>\n`;
}

module.exports = { indexPage, postPage, notFoundPage, sitemap };
