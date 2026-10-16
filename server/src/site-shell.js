'use strict';
// Blog pages reuse the static site's header and footer, read from index.html so they never drift.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { esc } = require('./util');

let cache = { mtime: 0, top: '', bottom: '' };

// Relative links in index.html ("about-us.html", "assets/…") → root URLs that work under /blog/….
function absolutize(html) {
  return html
    .replace(/(href|src)="(?!https?:|mailto:|tel:|#|\/)([^"]*)"/g, (m, attr, url) => {
      const [, file, rest = ''] = /^([^?#]*)(.*)$/.exec(url);
      if (file === 'index.html') return `${attr}="/${rest}"`;
      if (file.endsWith('.html')) return `${attr}="/${file.slice(0, -5)}${rest}"`;
      return `${attr}="/${url}"`;
    })
    .replace(/\saria-current="(?:page|true)"/g, '');
}

function load() {
  const file = path.join(config.siteDir, 'index.html');
  const { mtimeMs } = fs.statSync(file);
  if (mtimeMs === cache.mtime) return cache;
  const html = fs.readFileSync(file, 'utf8');
  const bodyStart = html.indexOf('>', html.indexOf('<body')) + 1;
  const mainStart = html.indexOf('<main');
  const mainEnd = html.indexOf('</main>') + '</main>'.length;
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyStart <= 0 || mainStart < 0 || mainEnd < 7 || bodyEnd < 0) throw new Error('index.html layout not recognised');
  cache = {
    mtime: mtimeMs,
    top: absolutize(html.slice(bodyStart, mainStart)),
    bottom: absolutize(html.slice(mainEnd, bodyEnd))
  };
  return cache;
}

// Marks the Blog link as current if the header has one.
function markCurrent(top, href) {
  return top.replace(new RegExp(`<a href="${href}">`), `<a href="${href}" aria-current="page">`);
}

/**
 * Full public page. `head` holds page-specific meta/JSON-LD; `main` is the <main> content.
 */
function page({ title, description, canonical, robots = 'index, follow', head = '', main, current = '/blog' }) {
  const { top, bottom } = load();
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${esc(robots)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="theme-color" content="#2D5794">
${head}
<link rel="icon" href="/assets/img/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap">
<link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
${markCurrent(top, current)}<main id="main">
${main}
</main>
${bottom}
</body>
</html>`;
}

module.exports = { page };
