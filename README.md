# Resurgent Legal LLP — website

Responsive site for www.resurgentlegal.com. The pages are plain HTML, CSS and JavaScript. A small Node.js backend stores contact-form leads, runs the blog, and provides the admin panel at `/admin`. It runs on Vercel (Postgres + Blob storage) or on a VPS (SQLite).

```
index.html            Home
about-us.html         About Us
practice-areas.html   Practice Areas overview, linking to the 8 practice pages
practice-areas/       One page per practice area, e.g. practice-areas/insolvency-bankruptcy.html (each ends with a 5-question FAQ)
career.html           Career
contact-us.html       Contact Us (form + 7 office maps)
404.html              Not-found page (noindex)
assets/css/styles.css All styling. Brand colours are at the top.
assets/js/main.js     Mobile menu, practice-area dropdown, job listings, contact form, latest blog posts
assets/img/           Logo, favicon, page banners, team photos
robots.txt, sitemap.xml
server/               Backend: leads, blog, admin panel (see "Leads, blog and admin panel")
api/index.js          Vercel Function that runs the backend
vercel.json           Vercel settings: build, clean URLs, which paths go to the backend
package.json          Backend dependencies and scripts
nextjs/               For the planned Next.js build: components/FaqSchema.tsx + data/practiceFaqs.ts
```

Every page already has its meta title, description, canonical URL, Open Graph tags and JSON-LD from the copy deck:

| Page | JSON-LD |
| --- | --- |
| Home | Organization, LegalService and WebSite |
| About Us | LegalService and BreadcrumbList |
| Practice Areas | LegalService with an OfferCatalog linking the 8 practice pages |
| Each practice page | Its own meta title and description from the copy deck, a Service with its sub-services, a FAQPage built from the same Q&As shown in its accordion, and a 3-level BreadcrumbList |
| Career | FAQPage, and JobPosting automatically when openings are listed |
| Contact Us | 7 office entries (LegalService, a LocalBusiness subtype) |
| Blog | Blog, BlogPosting and BreadcrumbList (rendered by the backend) |

## Preview locally

Page links use clean URLs with no `.html` (`/about-us`, `/practice-areas/insolvency-bankruptcy`), so preview through the local server rather than by double-clicking the files. Install Node.js 22.13 or newer, then in this folder:

```
npm install
npm run create-user -- you@resurgentlegal.com "Your Name" admin
npm run dev
```

Open http://127.0.0.1:3000 for the site and http://127.0.0.1:3000/admin for the admin panel. Sign in with the temporary password that `create-user` printed. Locally the backend serves the website too and keeps its data in a SQLite file (`server/data/`), so nothing else needs installing.

## Apply the brand

1. **Brand colour.** Set from the logo: blue `#2D5794` (`--brand`) and orange `#F19B15` (`--accent`) in `assets/css/styles.css`. To adjust, change `--brand` or `--accent` at the top of the file. Every tint, hover and dark shade is derived from these. Also update the `theme-color` meta tag in each page head.
2. **Logo.** `assets/img/logo.png` is the official logo, trimmed and sized for the header. To replace it, overwrite that file. The footer places the logo on a white badge, so a standard full-colour logo works on the dark background.
3. **Favicon.** `assets/img/favicon.png` is the wheel mark cropped from the logo.
4. **Social image.** Add `assets/img/og-banner.jpg` (1200×630).

## Content still to supply

- **"Life at Resurgent Legal" photos** on Career. See the comment above `.gallery`.
- **Job openings.** Add entries to `window.RL_JOBS` near the bottom of `career.html`. A commented example is included.
- **Google verification and LinkedIn.** Uncomment the `google-site-verification` meta tag, and add `sameAs` to the JSON-LD.

## Contact form

The form validates input in the browser: required fields, email format and phone number. With `+91` selected, the phone number must be a 10-digit mobile number. A hidden honeypot field filters out spam bots.

It POSTs JSON (`name, email, phone, company, practiceArea, message, page`) to `/api/contact` (`formEndpoint` in `assets/js/main.js`). The backend checks it again and saves it as a lead, and the visitor sees "Thank you for reaching out…". If the backend can't be reached, or a page is opened straight from disk, the form opens the visitor's email app with the enquiry pre-filled to corporate@resurgentlegal.com instead, so no enquiry is lost.

For reCAPTCHA v3, set `recaptchaSiteKey`. The form then sends `recaptchaToken`, which the server must verify.

## Leads, blog and admin panel

The backend (`server/`) is a Node.js (Express) app. It stores its data in **Postgres** when `DATABASE_URL` is set (Vercel + Neon), otherwise in a **SQLite** file in `server/data/`. Blog images go to **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set, otherwise to `server/data/uploads/`. All settings are listed in `.env.example`.

**Admin panel (`/admin`)**

- **Dashboard.** New leads, leads in the last 30 days, and published and draft articles.
- **Leads.** Every Contact Us enquiry, with filters by status, practice area and search, and CSV export (opens in Excel). Each lead has a status (New, Contacted, Qualified, Converted, Closed, Spam), an assignee and a history of notes. Status and assignment changes are logged automatically.
- **Blog posts.** Write with a rich-text editor (headings, bold, links, lists, quotes, images). Each post can have a cover image, summary, category, author and SEO title and description. Save as a draft, preview it, publish it, or set a future publish date to schedule it.
- **Users.** Administrators add people (Administrator or Editor), disable them, reset passwords and delete accounts. Editors can work on leads and the blog but cannot manage users or delete leads. Each user changes their own password under "My account".

**On the website**

- `/blog` lists published posts, 9 per page, and `/blog/<web-address>` shows each article. Both are rendered on the server with full meta tags, Open Graph, `BlogPosting` and `BreadcrumbList` JSON-LD, and reuse the header and footer from `index.html`.
- The home page's "Legal Insights & Updates" section and the footer's "From the Blog" column show the three latest posts. Both stay hidden until at least one post is published.
- `/blog/sitemap.xml` lists the published articles. It is referenced from `robots.txt`.

**New-lead email alerts** go to `LEAD_ALERT_TO` (corporate@resurgentlegal.com) once the SMTP settings are filled in. Until then, leads are still saved and the dashboard shows a reminder. The reply-to is the visitor's email, so replying from your inbox answers them directly.

**Security.** Passwords are hashed with scrypt. Sessions use HttpOnly, SameSite cookies, and every form carries a CSRF token. Sign-in locks for 15 minutes after 8 failed attempts. The contact form allows 10 enquiries per hour per IP and has a honeypot (on Vercel these limits apply per running instance). Article HTML is cleaned on the server, and uploads must be real JPG, PNG, WebP or GIF images under 5 MB.

## Deploying on Vercel

The repository is ready to import as is. `vercel.json` builds the public pages into `public/` (served by Vercel's CDN with clean URLs) and sends `/api/*`, `/admin/*` and `/blog/*` to the backend function in `api/index.js`.

In the Vercel project:

1. **Settings → Build and Deployment.** Set **Root Directory** to the repository root (leave it empty, not `server`). `vercel.json` sets the framework, build command and output folder.
2. **Storage → Create Database → Neon (Postgres)**, then connect it to the project. This adds `DATABASE_URL`. If you choose an environment-variable prefix, the backend also accepts `POSTGRES_URL`.
3. **Storage → Create → Blob**, then connect it. This adds `BLOB_READ_WRITE_TOKEN` for blog images.
4. **Settings → Environment Variables.** Add:
   - `BASE_URL`: the site address, e.g. `https://www.resurgentlegal.com`, or the `*.vercel.app` address until the domain is connected.
   - `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` (10+ characters): the first administrator is created from these on the first request. After signing in, change the password under "My account" and delete `INITIAL_ADMIN_PASSWORD`.
   - The `SMTP_*`, `MAIL_FROM` and `LEAD_ALERT_TO` settings for new-lead alerts (see `.env.example`).
5. **Deployments → Redeploy**, so the new settings take effect.

Until a database is connected, the pages work and `/api`, `/admin` and `/blog` reply "not set up yet". The contact form then falls back to the visitor's email app.

To run admin commands against the live database from your computer (e.g. `npm run create-user`), copy `DATABASE_URL` from Vercel into a local `.env` file. Neon keeps backups of the database: see "Backup & Restore" in the Neon console.

## Deploying on a VPS (nginx)

**1. Backend.** Install Node.js 22.13+ (e.g. from NodeSource), then put the repository outside the web root and build the public folder:

```
sudo git clone https://github.com/joginderggnai-ops/legal-website.git /opt/resurgentlegal
cd /opt/resurgentlegal && sudo npm ci --omit=dev && sudo npm run build
sudo mkdir -p /var/lib/resurgentlegal && sudo chown -R www-data:www-data /var/lib/resurgentlegal
sudo cp .env.example .env && sudo nano .env      # NODE_ENV=production, DATA_DIR=/var/lib/resurgentlegal, SMTP_*
sudo -u www-data npm run create-user -- you@resurgentlegal.com "Your Name" admin
```

`/etc/systemd/system/resurgentlegal.service`:

```ini
[Unit]
Description=Resurgent Legal backend
After=network.target

[Service]
WorkingDirectory=/opt/resurgentlegal
ExecStart=/usr/bin/node --env-file=.env server/src/server.js
User=www-data
Restart=always

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl enable --now resurgentlegal
```

**2. nginx.** nginx serves the built pages from `public/` and proxies the backend's paths:

```nginx
server {
    server_name www.resurgentlegal.com;
    root /opt/resurgentlegal/public;
    index index.html;

    # Page links use clean URLs (/about-us). Old .html addresses (bookmarks, earlier links)
    # redirect to the clean URLs used in the canonicals and sitemap.
    if ($request_uri ~ ^/(.*?)(index)?\.html(\?.*)?$) { return 301 /$1$3; }
    location / { try_files $uri $uri.html $uri/ =404; }   # serves /about-us from about-us.html
    error_page 404 /404.html;

    location /assets/ { expires 30d; add_header Cache-Control "public"; }

    # Backend: leads API, blog pages and the admin panel.
    client_max_body_size 6m;                  # blog image uploads (5 MB limit)
    location /api/   { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location = /admin { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location /admin/ { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location = /blog { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location /blog/  { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
    location /uploads/ {
        alias /var/lib/resurgentlegal/uploads/;
        expires 30d;
        add_header X-Content-Type-Options nosniff;
    }

    # listen 443 ssl; + certificate lines are added by: sudo certbot --nginx -d www.resurgentlegal.com -d resurgentlegal.com
}
server { listen 80; server_name resurgentlegal.com www.resurgentlegal.com; return 301 https://www.resurgentlegal.com$request_uri; }
```

`/etc/nginx/proxy_params` (standard on Ubuntu/Debian) passes `Host`, `X-Real-IP`, `X-Forwarded-For` and `X-Forwarded-Proto`. In production, admin sign-in cookies are HTTPS-only, so set up the certificate before signing in. After pulling changes, run `npm ci --omit=dev && npm run build` and `sudo systemctl restart resurgentlegal`.

**3. Backups.** Back up `/var/lib/resurgentlegal` (database and blog images). `npm run backup` writes a safe copy of the database to `backups/` there and keeps the latest 30. For a nightly backup, add this to the root crontab:

```
30 2 * * * cd /opt/resurgentlegal && sudo -u www-data node --env-file=.env server/scripts/backup.js
```

After going live, submit `https://www.resurgentlegal.com/sitemap.xml` and `https://www.resurgentlegal.com/blog/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
