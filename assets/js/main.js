/* Resurgent Legal LLP — site scripts (no dependencies) */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     Configuration
     --------------------------------------------------------------------- */
  var ARROW_SVG = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

  var CONFIG = {
    // Where the contact form POSTs its JSON: the backend in server/ saves it as a lead.
    // Leave empty (or open the page straight from disk) and the form opens the
    // visitor's email app with the enquiry pre-filled instead.
    formEndpoint: '/api/contact',
    // Google reCAPTCHA v3 site key. Leave empty to disable. The token is sent
    // as `recaptchaToken`; verify it on the server before accepting the form.
    recaptchaSiteKey: '',
    contactEmail: 'corporate@resurgentlegal.com',
    careersEmail: 'info@resurgentlegal.com',   // job applications on career.html
    contactPhone: '+91 88004 53987'
  };

  /* ---------------------------------------------------------------------
     Header: shadow on scroll + mobile menu
     --------------------------------------------------------------------- */
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (toggle && nav) {
    var setNav = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
    };
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setNav(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 1025px)').addEventListener('change', function (e) {
      if (e.matches) setNav(false);
    });
  }

  /* ---------------------------------------------------------------------
     Header: Practice Areas dropdown (hover opens it on desktop via CSS;
     the chevron button opens it for keyboard, touch and the mobile menu)
     --------------------------------------------------------------------- */
  document.querySelectorAll('.has-sub').forEach(function (item) {
    var subBtn = item.querySelector('.sub-toggle');
    if (!subBtn) return;
    var setSub = function (open) {
      subBtn.setAttribute('aria-expanded', String(open));
      subBtn.setAttribute('aria-label', open ? 'Hide practice areas' : 'Show practice areas');
      item.classList.toggle('is-open', open);
    };
    subBtn.addEventListener('click', function () {
      setSub(subBtn.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('click', function (e) {
      if (!item.contains(e.target)) setSub(false);
    });
    item.addEventListener('focusout', function (e) {
      if (window.innerWidth > 1024 && !item.contains(e.relatedTarget)) setSub(false);
    });
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && item.classList.contains('is-open')) {
        e.stopPropagation();
        setSub(false);
        subBtn.focus();
      }
    });
  });

  /* ---------------------------------------------------------------------
     Career: render openings from window.RL_JOBS (set on career.html)
     --------------------------------------------------------------------- */
  var jobsEl = document.getElementById('jobs-list');
  var jobs = Array.isArray(window.RL_JOBS) ? window.RL_JOBS : [];
  if (jobsEl && jobs.length) {
    jobsEl.textContent = '';
    var schema = [];
    jobs.forEach(function (job) {
      var card = el('article', 'card card--static job');
      var info = el('div');
      info.appendChild(el('h3', null, job.title));
      var meta = el('ul', 'job-meta');
      [job.location, job.experience, job.practiceArea].forEach(function (m) {
        if (m) meta.appendChild(el('li', null, m));
      });
      info.appendChild(meta);
      if (job.description) info.appendChild(el('p', null, job.description));
      card.appendChild(info);
      var apply = el('a', 'btn btn--primary', 'Apply Now');
      apply.href = job.apply || ('mailto:' + CONFIG.careersEmail + '?subject=' + encodeURIComponent('Application: ' + job.title));
      card.appendChild(apply);
      jobsEl.appendChild(card);

      schema.push({
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: job.title,
        description: job.description || job.title,
        datePosted: job.datePosted,
        validThrough: job.validThrough,
        employmentType: 'FULL_TIME',
        hiringOrganization: { '@type': 'Organization', name: 'Resurgent Legal LLP', sameAs: 'https://www.resurgentlegal.com', logo: 'https://www.resurgentlegal.com/assets/img/logo.png' },
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location, addressCountry: 'IN' } }
      });
    });
    var ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify(schema);
    document.head.appendChild(ld);
  }

  /* ---------------------------------------------------------------------
     Latest blog posts from the backend (/api/posts): the home page section and
     the footer's "From the Blog" column. Both stay hidden when there are no
     published posts or the backend is unreachable (e.g. a page opened from disk).
     --------------------------------------------------------------------- */
  var postsSection = document.getElementById('latest-posts');
  var footerPosts = document.querySelector('.footer-posts');
  if ((postsSection || footerPosts) && window.location.protocol !== 'file:') {
    fetch('/api/posts?limit=3', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.posts || !data.posts.length) return;
        if (postsSection) renderPostCards(data.posts);
        if (footerPosts) renderFooterPosts(data.posts);
      })
      .catch(function () { /* leave them hidden */ });
  }

  function renderFooterPosts(posts) {
    var list = footerPosts.querySelector('.footer-post-list');
    posts.forEach(function (post) {
      var li = el('li');
      var link = el('a', null, post.title);
      link.href = post.url;
      li.appendChild(link);
      var time = el('time', null, post.dateLabel);
      time.dateTime = post.date;
      li.appendChild(time);
      list.appendChild(li);
    });
    footerPosts.hidden = false;
  }

  function renderPostCards(posts) {
    var grid = postsSection.querySelector('.blog-grid');
    posts.forEach(function (post) {
      var card = el('a', 'card blog-card');
      card.href = post.url;
      var media = el('span', 'blog-card-media');
      if (post.image) {
        var img = el('img');
        img.src = post.image;
        img.alt = post.imageAlt || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        media.appendChild(img);
      } else {
        media.appendChild(el('span', 'blog-card-mark'));
      }
      card.appendChild(media);
      var body = el('span', 'blog-card-body');
      var meta = el('span', 'blog-card-meta');
      if (post.category) meta.appendChild(el('span', null, post.category));
      var time = el('time', null, post.dateLabel);
      time.dateTime = post.date;
      meta.appendChild(time);
      body.appendChild(meta);
      body.appendChild(el('h3', null, post.title));
      if (post.excerpt) body.appendChild(el('p', null, post.excerpt));
      var more = el('span', 'link-arrow', 'Read article ');
      more.insertAdjacentHTML('beforeend', ARROW_SVG);
      body.appendChild(more);
      card.appendChild(body);
      grid.appendChild(card);
    });
    postsSection.hidden = false;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------------------------------------------------------------------
     Contact form
     --------------------------------------------------------------------- */
  var form = document.getElementById('contact-form');
  if (!form) return;

  var statusEl = form.querySelector('.form-status');
  var submitBtn = form.querySelector('[type="submit"]');
  var submitLabel = submitBtn.querySelector('.btn-label');
  var message = form.elements.message;
  var counter = document.getElementById('message-count');

  var REQUIRED = {
    name: 'Please enter your full name.',
    email: 'Please enter your email address.',
    phone: 'Please enter your phone number.',
    practice: 'Please choose a practice area.'
  };
  var INVALID = {
    email: 'Please enter a valid email address, e.g. name@company.com.'
  };

  message.addEventListener('input', function () { counter.textContent = message.value.length; });

  // Arriving from a practice-area page (/contact-us?area=<id>) pre-selects that area.
  var area = new URLSearchParams(window.location.search).get('area');
  if (area) {
    Array.prototype.forEach.call(form.elements.practice.options, function (opt) {
      if (opt.getAttribute('data-area') === area) opt.selected = true;
    });
  }

  function checkPhone() {
    var phone = form.elements.phone;
    var digits = phone.value.replace(/[\s-]/g, '');
    var india = form.elements.phoneCode.value === '+91';
    var ok = india ? /^[6-9]\d{9}$/.test(digits) : /^\d{6,14}$/.test(digits);
    phone.setCustomValidity(!digits || ok ? '' :
      (india ? 'Please enter a valid 10-digit Indian mobile number.' : 'Please enter a valid phone number (digits only).'));
  }

  function validate(field) {
    if (field.required && typeof field.value === 'string' && !field.value.trim()) field.value = '';
    if (field.name === 'phone') checkPhone();
    var ok = field.checkValidity();
    var errorEl = document.getElementById(field.id + '-error');
    if (errorEl) {
      var text = '';
      if (!ok) {
        if (field.validity.valueMissing) text = REQUIRED[field.name] || 'This field is required.';
        else if (field.validity.customError) text = field.validationMessage;
        else text = INVALID[field.name] || field.validationMessage;
      }
      errorEl.textContent = text;
      errorEl.hidden = ok;
      field.setAttribute('aria-invalid', String(!ok));
    }
    return ok;
  }

  // Re-check a field live once it has been flagged.
  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid') === 'true') validate(e.target);
  });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'phoneCode' && form.elements.phone.value) validate(form.elements.phone);
    else if (e.target.getAttribute('aria-invalid') === 'true') validate(e.target);
  });

  function setStatus(type, text) {
    statusEl.className = 'form-status' + (type ? ' form-status--' + type : '');
    statusEl.textContent = text;
    statusEl.hidden = !text;
  }

  var recaptchaLoading = null;
  function loadRecaptcha() {
    if (!recaptchaLoading) {
      recaptchaLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(CONFIG.recaptchaSiteKey);
        s.async = true;
        s.onload = function () { window.grecaptcha.ready(resolve); };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return recaptchaLoading;
  }
  if (CONFIG.recaptchaSiteKey) form.addEventListener('focusin', loadRecaptcha, { once: true });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.elements.website.value) return; // honeypot filled → bot

    var fields = Array.prototype.filter.call(form.elements, function (f) {
      return f.name && f.name !== 'website' && f.type !== 'submit';
    });
    var firstInvalid = null;
    fields.forEach(function (f) {
      if (!validate(f) && !firstInvalid) firstInvalid = f;
    });
    if (firstInvalid) {
      setStatus('error', 'Please correct the highlighted fields.');
      firstInvalid.focus();
      return;
    }

    var v = function (name) { return form.elements[name].value.trim(); };
    var payload = {
      name: v('name'),
      email: v('email'),
      phone: v('phoneCode') + ' ' + v('phone').replace(/[\s-]/g, ''),
      company: v('company'),
      practiceArea: v('practice'),
      message: v('message'),
      page: window.location.href
    };

    if (!CONFIG.formEndpoint || window.location.protocol === 'file:') {
      openMailto(payload);
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = 'Sending…';
    setStatus('', '');

    var send = CONFIG.recaptchaSiteKey
      ? loadRecaptcha().then(function () {
          return window.grecaptcha.execute(CONFIG.recaptchaSiteKey, { action: 'contact' });
        }).then(function (token) { payload.recaptchaToken = token; })
      : Promise.resolve();

    send.then(function () {
      return fetch(CONFIG.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
    }).then(function (res) {
      if (res.ok) {
        form.reset();
        counter.textContent = '0';
        setStatus('success', 'Thank you for reaching out. Our team will respond within 24 business hours.');
      } else if (res.status === 422 || res.status === 429) {
        setStatus('error', (res.status === 429 ? 'You have already sent several enquiries.' : 'Please check your details and try again.') +
          ' You can also email ' + CONFIG.contactEmail + ' or call ' + CONFIG.contactPhone + '.');
      } else {
        throw new Error('HTTP ' + res.status);
      }
    }).catch(function () {
      // The server is unreachable: hand the enquiry to the visitor's email app so it isn't lost.
      openMailto(payload);
    }).then(function () {
      submitBtn.disabled = false;
      submitLabel.textContent = 'Request a Consultation';
    });
  });

  // Opens the visitor's email app with the enquiry filled in (no backend, or the backend is unreachable).
  function openMailto(payload) {
    var body = [
      'Name: ' + payload.name,
      'Email: ' + payload.email,
      'Phone: ' + payload.phone,
      'Company: ' + (payload.company || '-'),
      'Practice area: ' + payload.practiceArea,
      '',
      payload.message
    ].join('\n');
    window.location.href = 'mailto:' + CONFIG.contactEmail +
      '?subject=' + encodeURIComponent('Consultation request: ' + payload.practiceArea) +
      '&body=' + encodeURIComponent(body);
    setStatus('info', 'Your email app should open with your enquiry filled in — just press send. If nothing opens, email ' +
      CONFIG.contactEmail + ' or call ' + CONFIG.contactPhone + '.');
  }
})();
