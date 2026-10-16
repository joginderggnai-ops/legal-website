'use strict';
// Server-rendered admin panel pages.
const { esc, formatDate, toLocalInput, LEAD_STATUSES, statusLabel, PRACTICE_AREAS } = require('../util');

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  leads: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  posts: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  site: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const FLASH = {
  saved: 'Changes saved.',
  created: 'Created.',
  deleted: 'Deleted.',
  published: 'Published. The article is now live.',
  password: 'Your password has been changed.',
  note: 'Note added.',
  status: 'Status updated.'
};

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

function qs(params) {
  const s = new URLSearchParams(Object.entries(params).filter(([k, v]) => v !== '' && v != null && !(k === 'page' && v === 1))).toString();
  return s ? `?${s}` : '';
}

function layout({ title, user, active, body, flash, csrf }) {
  const nav = [
    ['dashboard', '/admin', 'Dashboard'],
    ['leads', '/admin/leads', 'Leads'],
    ['posts', '/admin/posts', 'Blog posts'],
    ...(user.role === 'admin' ? [['users', '/admin/users', 'Users']] : []),
    ['account', '/admin/account', 'My account']
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Resurgent Legal Admin</title>
<link rel="icon" href="/assets/img/favicon.png" type="image/png">
<link rel="stylesheet" href="/admin/static/admin.css">
</head>
<body>
<div class="shell">
  <aside class="side">
    <a class="brand" href="/admin"><img src="/assets/img/logo.png" alt="Resurgent Legal" width="756" height="160"><span>Admin</span></a>
    <nav aria-label="Admin">
      ${nav.map(([key, href, label]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ''}>${icon(key)}<span>${label}</span></a>`).join('\n      ')}
      <a href="/" target="_blank" rel="noopener">${icon('site')}<span>View website</span></a>
    </nav>
    <div class="side-user">
      <span><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></span>
      <form method="post" action="/admin/logout">${csrfField(csrf)}<button class="link" type="submit">Sign out</button></form>
    </div>
  </aside>
  <main class="content" id="main">
    ${flash && FLASH[flash] ? `<p class="flash" role="status">${esc(FLASH[flash])}</p>` : ''}
    ${body}
  </main>
</div>
<script src="/admin/static/admin.js" defer></script>
</body>
</html>`;
}

function loginPage({ error = '', next = '', email = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in · Resurgent Legal Admin</title>
<link rel="icon" href="/assets/img/favicon.png" type="image/png">
<link rel="stylesheet" href="/admin/static/admin.css">
</head>
<body class="login-body">
<main class="login">
  <img src="/assets/img/logo.png" alt="Resurgent Legal" width="756" height="160">
  <h1>Sign in to the admin panel</h1>
  ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/admin/login">
    <input type="hidden" name="next" value="${esc(next)}">
    <label>Email<input type="email" name="email" value="${esc(email)}" autocomplete="username" required autofocus></label>
    <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn" type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;
}

const badge = (status) => `<span class="badge badge--${esc(status)}">${esc(statusLabel(status))}</span>`;
const postBadge = (p) => {
  if (p.status !== 'published') return '<span class="badge badge--draft">Draft</span>';
  if (p.scheduled) return '<span class="badge badge--scheduled">Scheduled</span>';
  return '<span class="badge badge--published">Published</span>';
};

function dashboard({ stats, recent, mailEnabled, isAdmin }) {
  const tiles = [
    ['New leads', stats.newLeads, '/admin/leads?status=new'],
    ['Leads in the last 30 days', stats.leads30, '/admin/leads'],
    ['All leads', stats.leadsTotal, '/admin/leads'],
    ['Published articles', stats.published, '/admin/posts'],
    ['Drafts', stats.drafts, '/admin/posts']
  ];
  return `
    <header class="page-head"><h1>Dashboard</h1></header>
    ${!mailEnabled && isAdmin ? '<p class="alert alert--warn">Email alerts for new leads are off because SMTP is not set up yet. Leads are still saved here. See the README for the SMTP settings.</p>' : ''}
    <div class="tiles">
      ${tiles.map(([label, n, href]) => `<a class="tile" href="${href}"><strong>${n}</strong><span>${esc(label)}</span></a>`).join('\n      ')}
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Latest leads</h2><a href="/admin/leads">View all</a></div>
      ${recent.length ? leadTable(recent) : '<p class="empty">No leads yet. Enquiries from the Contact Us form will appear here.</p>'}
    </section>`;
}

function leadTable(leads) {
  return `<div class="table-wrap"><table>
        <thead><tr><th>Received</th><th>Name</th><th>Company</th><th>Practice area</th><th>Status</th></tr></thead>
        <tbody>
        ${leads.map((l) => `<tr class="${l.status === 'new' ? 'is-new' : ''}">
          <td class="nowrap">${esc(formatDate(l.created_at, true))}</td>
          <td><a class="row-link" href="/admin/leads/${l.id}">${esc(l.name)}</a><small>${esc(l.email)}</small></td>
          <td>${esc(l.company || '—')}</td>
          <td>${esc(l.practice_area)}</td>
          <td>${badge(l.status)}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>`;
}

function leadsList({ leads, filters, pageNo, pages, total, counts }) {
  const tabs = [{ id: '', label: 'All', n: counts.all }].concat(LEAD_STATUSES.map((s) => ({ id: s.id, label: s.label, n: counts[s.id] || 0 })));
  const base = { q: filters.q, area: filters.area };
  return `
    <header class="page-head">
      <h1>Leads</h1>
      <a class="btn btn--ghost" href="/admin/leads.csv${qs({ ...base, status: filters.status })}">Export CSV</a>
    </header>
    <nav class="tabs" aria-label="Filter by status">
      ${tabs.map((t) => `<a href="/admin/leads${qs({ ...base, status: t.id })}"${t.id === filters.status ? ' aria-current="page"' : ''}>${esc(t.label)} <span>${t.n}</span></a>`).join('')}
    </nav>
    <form class="filters" method="get" action="/admin/leads">
      <input type="hidden" name="status" value="${esc(filters.status)}">
      <input type="search" name="q" value="${esc(filters.q)}" placeholder="Search name, email, phone, company or message" aria-label="Search leads">
      <select name="area" aria-label="Practice area">
        <option value="">All practice areas</option>
        ${PRACTICE_AREAS.map((a) => `<option${a === filters.area ? ' selected' : ''}>${esc(a)}</option>`).join('')}
      </select>
      <button class="btn" type="submit">Filter</button>
      ${filters.q || filters.area ? `<a href="/admin/leads${qs({ status: filters.status })}">Clear</a>` : ''}
    </form>
    <section class="panel">
      ${leads.length ? leadTable(leads) : '<p class="empty">No leads match these filters.</p>'}
      ${pager('/admin/leads', { ...base, status: filters.status }, pageNo, pages, total)}
    </section>`;
}

function pager(path, params, pageNo, pages, total) {
  if (pages <= 1) return total ? `<p class="pager"><span>${total} in total</span></p>` : '';
  return `<p class="pager">
      ${pageNo > 1 ? `<a href="${path}${qs({ ...params, page: pageNo - 1 })}">&larr; Previous</a>` : '<span></span>'}
      <span>Page ${pageNo} of ${pages} · ${total} in total</span>
      ${pageNo < pages ? `<a href="${path}${qs({ ...params, page: pageNo + 1 })}">Next &rarr;</a>` : '<span></span>'}
    </p>`;
}

function leadDetail({ lead, activity, users, csrf, isAdmin }) {
  const phoneDigits = lead.phone.replace(/[^\d+]/g, '');
  return `
    <p class="back"><a href="/admin/leads">&larr; All leads</a></p>
    <header class="page-head">
      <h1>${esc(lead.name)}</h1>
      ${badge(lead.status)}
    </header>
    <div class="cols">
      <section class="panel">
        <h2>Enquiry</h2>
        <dl class="facts">
          <dt>Email</dt><dd><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></dd>
          <dt>Phone</dt><dd><a href="tel:${esc(phoneDigits)}">${esc(lead.phone)}</a></dd>
          <dt>Company</dt><dd>${esc(lead.company || '—')}</dd>
          <dt>Practice area</dt><dd>${esc(lead.practice_area)}</dd>
          <dt>Received</dt><dd>${esc(formatDate(lead.created_at, true))}</dd>
          <dt>Sent from</dt><dd class="break">${esc(lead.page || '—')}</dd>
        </dl>
        <h3>Message</h3>
        <p class="message">${esc(lead.message || '(No message)')}</p>
        ${isAdmin ? `
        <form method="post" action="/admin/leads/${lead.id}/delete" data-confirm="Delete this lead permanently? This cannot be undone.">
          ${csrfField(csrf)}<button class="btn btn--danger" type="submit">Delete lead</button>
        </form>` : ''}
      </section>
      <section class="panel">
        <h2>Follow-up</h2>
        <form class="stack" method="post" action="/admin/leads/${lead.id}">
          ${csrfField(csrf)}
          <label>Status
            <select name="status">${LEAD_STATUSES.map((s) => `<option value="${s.id}"${s.id === lead.status ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
          </label>
          <label>Assigned to
            <select name="assigned_to"><option value="">Nobody</option>${users.map((u) => `<option value="${u.id}"${u.id === lead.assigned_to ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
          </label>
          <label>Add a note <span class="hint">(optional, e.g. "Called, sending engagement letter")</span>
            <textarea name="note" rows="3" maxlength="2000"></textarea>
          </label>
          <button class="btn" type="submit">Save</button>
        </form>
        <h3>History</h3>
        ${activity.length ? `<ol class="activity">${activity.map((a) => `<li><p>${esc(a.body)}</p><small>${esc(a.user_name || 'System')} · ${esc(formatDate(a.created_at, true))}</small></li>`).join('')}</ol>` : '<p class="empty">No notes yet.</p>'}
      </section>
    </div>`;
}

function postsList({ posts }) {
  return `
    <header class="page-head">
      <h1>Blog posts</h1>
      <a class="btn" href="/admin/posts/new">New post</a>
    </header>
    <section class="panel">
      ${posts.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Status</th><th>Publish date</th><th>Last updated</th><th></th></tr></thead>
        <tbody>
        ${posts.map((p) => `<tr>
          <td><a class="row-link" href="/admin/posts/${p.id}">${esc(p.title)}</a><small>/blog/${esc(p.slug)}</small></td>
          <td>${postBadge(p)}</td>
          <td class="nowrap">${esc(formatDate(p.published_at, true) || '—')}</td>
          <td class="nowrap">${esc(formatDate(p.updated_at, true))}</td>
          <td class="nowrap">${p.status === 'published' && !p.scheduled ? `<a href="/blog/${esc(p.slug)}" target="_blank" rel="noopener">View</a>` : `<a href="/admin/posts/${p.id}/preview" target="_blank" rel="noopener">Preview</a>`}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>` : '<p class="empty">No posts yet. Click "New post" to write the first one. The three latest published posts appear on the home page.</p>'}
    </section>`;
}

function postForm({ post, errors = {}, csrf, categories }) {
  const isNew = !post.id;
  const err = (k) => (errors[k] ? `<span class="field-error">${esc(errors[k])}</span>` : '');
  return `
    <p class="back"><a href="/admin/posts">&larr; All posts</a></p>
    <header class="page-head">
      <h1>${isNew ? 'New post' : 'Edit post'}</h1>
      ${!isNew ? `<a class="btn btn--ghost" href="/admin/posts/${post.id}/preview" target="_blank" rel="noopener">Preview</a>` : ''}
    </header>
    ${Object.keys(errors).length ? '<p class="alert" role="alert">Please fix the highlighted fields.</p>' : ''}
    <form class="post-form" method="post" action="/admin/posts/${isNew ? 'new' : post.id}" enctype="multipart/form-data" id="post-form">
      ${csrfField(csrf)}
      <div class="post-grid">
        <div class="stack">
          <label>Title ${err('title')}
            <input type="text" name="title" value="${esc(post.title)}" maxlength="160" required data-slug-source>
          </label>
          <label>Web address <span class="hint">(leave blank to create it from the title)</span> ${err('slug')}
            <span class="prefix-input"><span>/blog/</span><input type="text" name="slug" value="${esc(post.slug)}" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" data-slug-target></span>
          </label>
          <label>Summary <span class="hint">(shown on the blog cards and under the title; about 1–2 sentences)</span>
            <textarea name="excerpt" rows="2" maxlength="300">${esc(post.excerpt)}</textarea>
          </label>
          <div class="field">
            <span class="label">Article ${err('body')}</span>
            <div id="editor" class="editor">${post.body || ''}</div>
            <input type="hidden" name="body" id="body-input">
          </div>
        </div>
        <div class="stack side-fields">
          <fieldset class="panel">
            <legend>Publishing</legend>
            <label>Status
              <select name="status">
                <option value="draft"${post.status !== 'published' ? ' selected' : ''}>Draft (not public)</option>
                <option value="published"${post.status === 'published' ? ' selected' : ''}>Published</option>
              </select>
            </label>
            <label>Publish date <span class="hint">(India time; a future date schedules it)</span> ${err('published_at')}
              <input type="datetime-local" name="published_at" value="${esc(toLocalInput(post.published_at))}">
            </label>
            <button class="btn" type="submit">${isNew ? 'Save post' : 'Save changes'}</button>
          </fieldset>
          <fieldset class="panel">
            <legend>Details</legend>
            <label>Category <span class="hint">(e.g. Insolvency)</span>
              <input type="text" name="category" value="${esc(post.category)}" maxlength="60" list="categories">
              <datalist id="categories">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
            </label>
            <label>Author
              <input type="text" name="author_name" value="${esc(post.author_name)}" maxlength="100">
            </label>
          </fieldset>
          <fieldset class="panel">
            <legend>Cover image</legend>
            ${post.cover_image ? `<img class="cover-preview" src="${esc(post.cover_image)}" alt="">
            <label class="check"><input type="checkbox" name="remove_cover" value="1"> Remove this image</label>` : ''}
            <label>${post.cover_image ? 'Replace with' : 'Upload'} <span class="hint">(JPG, PNG or WebP, up to 5 MB; 1200×675 works best)</span> ${err('cover')}
              <input type="file" name="cover" accept="image/jpeg,image/png,image/webp">
            </label>
            <label>Image description <span class="hint">(for screen readers and Google)</span>
              <input type="text" name="cover_alt" value="${esc(post.cover_alt)}" maxlength="200">
            </label>
          </fieldset>
          <fieldset class="panel">
            <legend>Search engines <span class="hint">(optional)</span></legend>
            <label>SEO title <span class="hint">(defaults to the post title)</span>
              <input type="text" name="meta_title" value="${esc(post.meta_title)}" maxlength="70">
            </label>
            <label>SEO description <span class="hint">(defaults to the summary)</span>
              <textarea name="meta_description" rows="3" maxlength="170">${esc(post.meta_description)}</textarea>
            </label>
          </fieldset>
        </div>
      </div>
    </form>
    ${!isNew ? `
    <form class="danger-zone" method="post" action="/admin/posts/${post.id}/delete" data-confirm="Delete this post permanently? This cannot be undone.">
      ${csrfField(csrf)}<button class="btn btn--danger" type="submit">Delete post</button>
    </form>` : ''}
    <link rel="stylesheet" href="/admin/vendor/quill/quill.snow.css">
    <script src="/admin/vendor/quill/quill.js" defer></script>
    <script src="/admin/static/editor.js" defer></script>`;
}

function usersList({ users, me, csrf, created, errors = {}, form = {} }) {
  return `
    <header class="page-head"><h1>Users</h1></header>
    ${created ? `<div class="alert alert--ok" role="status">
      <p><strong>${esc(created.label)}</strong></p>
      <p>Email: <code>${esc(created.email)}</code><br>Temporary password: <code class="secret">${esc(created.password)}</code></p>
      <p>Copy this now and send it to them securely. It won't be shown again. They can change it under "My account".</p>
    </div>` : ''}
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
        <tbody>
        ${users.map((u) => `<tr>
          <td><strong>${esc(u.name)}</strong>${u.id === me.id ? ' <span class="hint">(you)</span>' : ''}<small>${esc(u.email)}</small></td>
          <td>${u.role === 'admin' ? 'Administrator' : 'Editor'}</td>
          <td>${u.active ? 'Active' : '<span class="badge badge--closed">Disabled</span>'}</td>
          <td class="nowrap">${esc(formatDate(u.last_login_at, true) || 'Never')}</td>
          <td class="actions">${u.id === me.id ? '' : `
            <form method="post" action="/admin/users/${u.id}/role">${csrfField(csrf)}<input type="hidden" name="role" value="${u.role === 'admin' ? 'editor' : 'admin'}"><button class="link" type="submit">Make ${u.role === 'admin' ? 'editor' : 'administrator'}</button></form>
            <form method="post" action="/admin/users/${u.id}/active">${csrfField(csrf)}<input type="hidden" name="active" value="${u.active ? 0 : 1}"><button class="link" type="submit">${u.active ? 'Disable' : 'Enable'}</button></form>
            <form method="post" action="/admin/users/${u.id}/reset" data-confirm="Create a new temporary password for ${esc(u.name)}? Their current password will stop working.">${csrfField(csrf)}<button class="link" type="submit">Reset password</button></form>
            <form method="post" action="/admin/users/${u.id}/delete" data-confirm="Delete ${esc(u.name)}'s account? Their notes stay on leads.">${csrfField(csrf)}<button class="link link--danger" type="submit">Delete</button></form>`}
          </td>
        </tr>`).join('')}
        </tbody>
      </table></div>
      <p class="hint">Administrators can manage users and delete leads. Editors can work on leads and blog posts.</p>
    </section>
    <section class="panel narrow">
      <h2>Add a user</h2>
      <form class="stack" method="post" action="/admin/users">
        ${csrfField(csrf)}
        <label>Full name ${errors.name ? `<span class="field-error">${esc(errors.name)}</span>` : ''}<input type="text" name="name" value="${esc(form.name)}" maxlength="100" required></label>
        <label>Email ${errors.email ? `<span class="field-error">${esc(errors.email)}</span>` : ''}<input type="email" name="email" value="${esc(form.email)}" maxlength="150" required></label>
        <label>Role
          <select name="role"><option value="editor">Editor (leads and blog)</option><option value="admin"${form.role === 'admin' ? ' selected' : ''}>Administrator (also manages users)</option></select>
        </label>
        <button class="btn" type="submit">Create user</button>
        <p class="hint">A temporary password is generated and shown once.</p>
      </form>
    </section>`;
}

function accountPage({ user, csrf, errors = {} }) {
  const err = (k) => (errors[k] ? `<span class="field-error">${esc(errors[k])}</span>` : '');
  return `
    <header class="page-head"><h1>My account</h1></header>
    <section class="panel narrow">
      <h2>Profile</h2>
      <form class="stack" method="post" action="/admin/account/profile">
        ${csrfField(csrf)}
        <label>Full name ${err('name')}<input type="text" name="name" value="${esc(user.name)}" maxlength="100" required></label>
        <label>Email<input type="email" value="${esc(user.email)}" disabled></label>
        <button class="btn" type="submit">Save</button>
      </form>
    </section>
    <section class="panel narrow">
      <h2>Change password</h2>
      <form class="stack" method="post" action="/admin/account/password">
        ${csrfField(csrf)}
        <label>Current password ${err('current')}<input type="password" name="current" autocomplete="current-password" required></label>
        <label>New password <span class="hint">(at least 10 characters)</span> ${err('password')}<input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
        <label>Repeat new password ${err('confirm')}<input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
        <button class="btn" type="submit">Change password</button>
        <p class="hint">Changing your password signs you out on other devices.</p>
      </form>
    </section>`;
}

function errorPage(message) {
  return `<section class="panel"><h1>Something went wrong</h1><p>${esc(message)}</p><p><a href="/admin">Back to the dashboard</a></p></section>`;
}

module.exports = {
  layout, loginPage, dashboard, leadsList, leadDetail, postsList, postForm, usersList, accountPage, errorPage
};
