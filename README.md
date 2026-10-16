# Resurgent Legal LLP — website

Responsive site for www.resurgentlegal.com. The pages are plain HTML, CSS and JavaScript with no build step. A small Node.js backend in `server/` stores contact-form leads, runs the blog, and provides the admin panel at `/admin`.

```
index.html            Home
about-us.html         About Us
practice-areas.html   Practice Areas overview, linking to the 8 practice pages
practice-areas/        One page per practice area, e.g. practice-areas/insolvency-bankruptcy.html (each ends with a 5-question FAQ)
nextjs/                For the planned Next.js build: components/FaqSchema.tsx + data/practiceFaqs.ts
career.html           Career
contact-us.html       Contact Us (form + 7 office maps)
404.html              Not-found page (noindex)
assets/css/styles.css All styling. Brand colours are at the top.
assets/js/main.js     Mobile menu, practice-area highlighting, job listings, contact form
assets/img/           logo.png, favicon.png
robots.txt, sitemap.xml
server/               Node.js backend: leads, blog, admin panel (see "Leads, blog and admin panel")
```

Every page already has its meta title, description, canonical URL, Open Graph tags and JSON-LD from the copy deck:

| Page | JSON-LD |
| --- | --- |
| Home | Organization, LegalService and WebSite |
| About Us | LegalService and BreadcrumbList |
| Practice Areas | LegalService with an OfferCatalog linking the 8 practice pages |
| Each practice page | Its own meta title and description from the copy deck, a Service with its sub-services, a FAQPage built from the same Q&As shown in its accordion, and a 3-level BreadcrumbList |
| Career | Also adds JobPosting automatically when openings are listed |
| Contact Us | 7 office entries (LegalService, a LocalBusiness subtype) |

## Preview locally

Page links use clean URLs with no `.html` (`/about-us`, `/practice-areas/insolvency-bankruptcy`), so preview through a server rather than by double-clicking the files. Install Node.js 22.13 or newer, then:

```
cd server
npm install
npm run create-user -- you@resurgentlegal.com "Your Name" admin
npm run dev
```

Open http://127.0.0.1:3000 for the site and http://127.0.0.1:3000/admin for the admin panel. Sign in with the temporary password that `create-user` printed. Locally the backend serves the website too: `/about-us` serves `about-us.html`, any `.html` address redirects to its clean version, and the contact form and blog work end to end.

## Apply the brand

1. **Brand colour.** Set from the logo: blue `#2D5794` (`--brand`) and orange `#F19B15` (`--accent`) in `assets/css/styles.css`. To adjust, change `--brand` or `--accent` at the top of the file. Every tint, hover and dark shade is derived from these. Also update the `theme-color` meta tag in each page head.
2. **Logo.** `assets/img/logo.png` is the official logo, trimmed and sized for the header. To replace it, overwrite that file. The footer places the logo on a white badge, so a standard full-colour logo works on the dark background.
3. **Favicon.** `assets/img/favicon.png` is the wheel mark cropped from the logo.
4. **Hero banner.** Add `assets/img/hero.jpg` (1920×800, under 200 KB). It appears automatically under the brand-coloured overlay.
5. **Social image.** Add `assets/img/og-banner.jpg` (1200×630).

## Content still to supply

- **Leadership designations and bios, and advisory bios.** These show as yellow "to be added" placeholders on About Us. Search for `class="tbd"`.
- **Team photos.** Add an `<img>` inside each `.person-photo`. Alt text format: "[Name], [Designation] at Resurgent Legal LLP".
- **"Life at Resurgent Legal" photos** on Career. See the comment above `.gallery`.
- **Job openings.** Add entries to `window.RL_JOBS` near the bottom of `career.html`. A commented example is included.
- **Google verification and LinkedIn.** Uncomment the `google-site-verification` meta tag, and add `sameAs` to the JSON-LD.

## Contact form

The form validates input in the browser: required fields, email format and phone number. With `+91` selected, the phone number must be a 10-digit mobile number. A hidden honeypot field filters out spam bots.

How it submits depends on `formEndpoint` in `assets/js/main.js`:

- **`/api/contact` (the default).** The form POSTs JSON to the backend, which checks it again and saves it as a lead. The visitor sees "Thank you for reaching out…". The JSON fields are `name, email, phone, company, practiceArea, message, page`.
- **Empty, or a page opened from disk.** Submitting opens the visitor's email app with the enquiry pre-filled to corporate@resurgentlegal.com.
- **reCAPTCHA v3.** Set `recaptchaSiteKey`. The form then sends `recaptchaToken`, which your server must verify.

## Publishing in a website builder

If the builder accepts custom code:

1. Paste `assets/css/styles.css` into its global custom-CSS area.
2. Add `main.js` to the global footer-scripts area.
3. Add the font `<link>` and per-page `<meta>` and JSON-LD to each page's header-code setting.
4. Paste each page's `<main>…</main>` into a full-width HTML/embed block.
5. Use the `<header>` and `<footer>` markup as the global header and footer.

If the builder accepts a static-site upload (zip or folder), upload the whole folder as is.

When pasting page by page, check the page links (`/about-us`, `/practice-areas/...`) match the builder's own page URLs.

## Leads, blog and admin panel

The backend in `server/` is a Node.js (Express) app with a SQLite database. Everything it stores is in one folder (`server/data/` by default): `site.db` plus `uploads/` for blog images.

**Admin panel (`/admin`)**

- **Dashboard.** New leads, leads in the last 30 days, and published and draft articles.
- **Leads.** Every Contact Us enquiry, with filters by status, practice area and search, and CSV export (opens in Excel). Each lead has a status (New, Contacted, Qualified, Converted, Closed, Spam), an assignee and a history of notes. Status and assignment changes are logged automatically.
- **Blog posts.** Write with a rich-text editor (headings, bold, links, lists, quotes, images). Each post can have a cover image, summary, category, author and SEO title and description. Save as a draft, preview it, publish it, or set a future publish date to schedule it.
- **Users.** Administrators add people (Administrator or Editor), disable them, reset passwords and delete accounts. Editors can work on leads and the blog but cannot manage users or delete leads. Each user changes their own password under "My account".

**On the website**

- `/blog` lists published posts, 9 per page, and `/blog/<web-address>` shows each article. Both are rendered on the server with full meta tags, Open Graph, `BlogPosting` and `BreadcrumbList` JSON-LD. They reuse the header and footer from `index.html`.
- The home page's "Legal Insights & Updates" section shows the three latest posts. It stays hidden until at least one post is published.
- `/blog/sitemap.xml` lists the published articles. It is referenced from `robots.txt`.

**New-lead email alerts** go to `LEAD_ALERT_TO` (corporate@resurgentlegal.com) once SMTP is set in `server/.env`. Until then, leads are still saved and the dashboard shows a reminder. The reply-to is the visitor's email, so replying from your inbox answers them directly.

**Security.** Passwords are hashed with scrypt. Sessions use HttpOnly, SameSite cookies, and every form carries a CSRF token. Sign-in locks for 15 minutes after 8 failed attempts. The contact form allows 10 enquiries per hour per IP and has a honeypot. Article HTML is cleaned on the server, and uploads must be real JPG, PNG, WebP or GIF images under 5 MB.

## Deploying on the VPS (nginx)

**1. Backend.** Install Node.js 22.13+ (e.g. from NodeSource), then copy `server/` to the VPS, outside the web root:

```
sudo mkdir -p /opt/resurgentlegal /var/lib/resurgentlegal
sudo cp -r server/* server/.env.example /opt/resurgentlegal/
cd /opt/resurgentlegal && sudo npm ci --omit=dev
sudo cp .env.example .env && sudo nano .env      # SITE_DIR=/var/www/resurgentlegal, DATA_DIR=/var/lib/resurgentlegal, SMTP_*
sudo chown -R www-data:www-data /var/lib/resurgentlegal
sudo -u www-data npm run create-user -- you@resurgentlegal.com "Your Name" admin
```

`/etc/systemd/system/resurgentlegal.service`:

```ini
[Unit]
Description=Resurgent Legal backend
After=network.target

[Service]
WorkingDirectory=/opt/resurgentlegal
ExecStart=/usr/bin/node --env-file=.env src/server.js
User=www-data
Restart=always

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl enable --now resurgentlegal
```

**2. nginx.** Static pages are served by nginx, and the backend's paths are proxied to it:

```nginx
server {
    server_name www.resurgentlegal.com;
    root /var/www/resurgentlegal;
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
    # Never serve the backend's source if it is ever copied into the web root.
    location ^~ /server/ { return 404; }
    location ^~ /nextjs/ { return 404; }

    # listen 443 ssl; + certificate lines are added by: sudo certbot --nginx -d www.resurgentlegal.com -d resurgentlegal.com
}
server { listen 80; server_name resurgentlegal.com www.resurgentlegal.com; return 301 https://www.resurgentlegal.com$request_uri; }
```

`/etc/nginx/proxy_params` (standard on Ubuntu/Debian) passes `Host`, `X-Real-IP`, `X-Forwarded-For` and `X-Forwarded-Proto`. In production, admin sign-in cookies are HTTPS-only, so set up the certificate before signing in.

**3. Backups.** Back up `/var/lib/resurgentlegal` (database and blog images). `npm run backup` writes a safe copy of the database to `data/backups/` and keeps the latest 30. For a nightly backup, add this to the root crontab:

```
30 2 * * * cd /opt/resurgentlegal && sudo -u www-data node --env-file=.env scripts/backup.js
```

After going live, submit `https://www.resurgentlegal.com/sitemap.xml` and `https://www.resurgentlegal.com/blog/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
