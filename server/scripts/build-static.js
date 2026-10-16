'use strict';
// Vercel build: copies only the public website into public/ (served by Vercel's CDN), so source
// files such as server/, package.json and README.md are never published. Also copies the admin
// panel's CSS/JS and the Quill editor so the CDN serves them under /admin/static and /admin/vendor.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'public');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copy = (from, to = from) => fs.cpSync(path.join(root, from), path.join(out, to), { recursive: true });

for (const f of fs.readdirSync(root)) {
  if (f.endsWith('.html') || f === 'robots.txt' || f === 'sitemap.xml') copy(f);
}
copy('assets');
copy('practice-areas');
copy('server/public', 'admin/static');
copy(path.relative(root, path.join(path.dirname(require.resolve('quill/package.json')), 'dist')), 'admin/vendor/quill');

console.log(`Static site written to ${path.relative(root, out)}/`);
