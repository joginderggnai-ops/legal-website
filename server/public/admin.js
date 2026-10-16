/* Admin panel helpers: confirm dialogs, web-address preview, upload size check. */
(function () {
  'use strict';

  // <form data-confirm="…"> asks before submitting (deletes, password resets).
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // Suggest the web address from the title while the address field is untouched.
  var source = document.querySelector('[data-slug-source]');
  var target = document.querySelector('[data-slug-target]');
  if (source && target) {
    var auto = !target.value;
    target.placeholder = 'created from the title';
    target.addEventListener('input', function () { auto = !target.value; });
    source.addEventListener('input', function () {
      if (!auto) return;
      target.placeholder = source.value
        .normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'created from the title';
    });
  }

  // Catch oversized images before the upload starts.
  document.addEventListener('change', function (e) {
    var input = e.target;
    if (input.type !== 'file' || !input.files || !input.files[0]) return;
    if (input.files[0].size > 5 * 1024 * 1024) {
      window.alert('This image is larger than 5 MB. Please choose a smaller image.');
      input.value = '';
    }
  });
})();
