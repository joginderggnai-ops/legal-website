// Vercel Function: runs the backend (leads API, blog pages, admin panel).
// vercel.json rewrites /api/*, /admin/* and /blog/* here; static pages are served by Vercel's CDN.
module.exports = require('../server/src/app');
