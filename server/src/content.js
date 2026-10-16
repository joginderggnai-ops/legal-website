'use strict';
// Blog body sanitising and image uploads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');
const config = require('./config');

// Only the formatting the editor produces is kept; scripts, styles and event handlers are removed.
function sanitizeBody(html) {
  return sanitizeHtml(String(html || '').replace(/&nbsp;| /g, ' '), {
    allowedTags: [
      'p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
      'blockquote', 'img', 'figure', 'figcaption', 'hr', 'code', 'pre', 'sub', 'sup',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      p: ['class'], li: ['class'], h2: ['class'], h3: ['class'], h4: ['class']
    },
    allowedClasses: {
      p: ['ql-align-center', 'ql-align-right', 'ql-align-justify', /^ql-indent-\d$/],
      li: [/^ql-indent-\d$/],
      h2: ['ql-align-center'], h3: ['ql-align-center'], h4: ['ql-align-center']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const external = /^https?:\/\//i.test(attribs.href || '') && !(attribs.href || '').startsWith(config.baseUrl);
        if (external) return { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } };
        const { target, rel, ...rest } = attribs;
        return { tagName, attribs: rest };
      },
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } })
    },
    // Images must be uploaded here (/uploads/… or Vercel Blob) or come from an https address.
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^(\/uploads\/|https:\/\/)/.test(frame.attribs.src || '')
  });
}

// Uploads are held in memory, checked by their actual bytes (not the claimed type), then saved.
const MAX_BYTES = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 30, fieldSize: 2 * 1024 * 1024 }
});

function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a') return 'gif';
  return null;
}

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const BLOB_HOST = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

// Saves an uploaded image and returns its public URL, or throws a user-facing Error.
// Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise the local uploads folder.
async function saveImage(file) {
  if (!file || !file.buffer || !file.buffer.length) throw new Error('No image was uploaded.');
  const ext = sniffImage(file.buffer);
  if (!ext) throw new Error('Please upload a JPG, PNG, WebP or GIF image.');
  const now = new Date();
  const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;

  if (config.blobToken) {
    const { put } = require('@vercel/blob');
    const blob = await put(`blog/${dir}/${name}`, file.buffer, {
      access: 'public', contentType: MIME[ext], token: config.blobToken, addRandomSuffix: false
    });
    return blob.url;
  }
  if (config.onVercel) throw new Error('Image storage is not set up yet. Connect a Vercel Blob store to this project.');
  await fs.promises.mkdir(path.join(config.uploadsDir, dir), { recursive: true });
  await fs.promises.writeFile(path.join(config.uploadsDir, dir, name), file.buffer);
  return `/uploads/${dir}/${name}`;
}

// Deletes an image previously returned by saveImage (ignores anything else, e.g. external URLs).
async function deleteImage(url) {
  try {
    if (config.blobToken && BLOB_HOST.test(url || '')) {
      const { del } = require('@vercel/blob');
      await del(url, { token: config.blobToken });
      return;
    }
    const m = /^\/uploads\/(\d{4}\/\d{2}\/[a-f0-9]{16}\.(?:jpg|png|webp|gif))$/.exec(url || '');
    if (m) await fs.promises.rm(path.join(config.uploadsDir, m[1]), { force: true });
  } catch (err) {
    console.error('[content] could not delete image:', err.message);
  }
}

module.exports = { sanitizeBody, upload, saveImage, deleteImage, MAX_BYTES };
