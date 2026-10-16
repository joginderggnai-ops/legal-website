/* Blog post editor (Quill). The article HTML is copied into a hidden field on save and cleaned on the server. */
(function () {
  'use strict';
  var form = document.getElementById('post-form');
  var holder = document.getElementById('editor');
  if (!form || !holder || !window.Quill) return;

  var csrf = form.querySelector('input[name="_csrf"]').value;
  var dirty = false;

  var quill = new window.Quill(holder, {
    theme: 'snow',
    placeholder: 'Write the article here. Use "Heading" for section titles.',
    modules: {
      toolbar: {
        container: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline', 'link'],
          [{ list: 'ordered' }, { list: 'bullet' }, 'blockquote'],
          [{ align: [] }],
          ['image', 'clean']
        ],
        handlers: { image: pickImage }
      }
    }
  });
  quill.on('text-change', function () { dirty = true; });

  function pickImage() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { window.alert('This image is larger than 5 MB.'); return; }
      var data = new FormData();
      data.append('image', file);
      var range = quill.getSelection(true);
      fetch('/admin/uploads', { method: 'POST', body: data, headers: { 'X-CSRF-Token': csrf }, credentials: 'same-origin' })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (r) {
          if (!r.ok || !r.body.url) throw new Error(r.body.error || 'Upload failed.');
          quill.insertEmbed(range.index, 'image', r.body.url, 'user');
          quill.setSelection(range.index + 1, 0);
        })
        .catch(function (err) { window.alert(err.message || 'The image could not be uploaded.'); });
    });
    input.click();
  }

  form.addEventListener('input', function () { dirty = true; });
  form.addEventListener('submit', function () {
    var empty = quill.getText().trim() === '' && !quill.root.querySelector('img');
    document.getElementById('body-input').value = empty ? '' : quill.getSemanticHTML();
    dirty = false;
  });
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
