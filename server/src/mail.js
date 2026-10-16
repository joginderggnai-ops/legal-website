'use strict';
// New-lead email alerts over SMTP. Without SMTP settings, leads are still saved; alerts are skipped.
const nodemailer = require('nodemailer');
const config = require('./config');
const { esc, formatDate } = require('./util');

const { mail } = config;
const enabled = Boolean(mail.host && mail.from);

const transport = enabled
  ? nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined
    })
  : null;

if (!enabled) console.warn('[mail] SMTP_HOST / MAIL_FROM not set: new-lead email alerts are off.');

// Strips CR/LF so visitor input can never add mail headers.
const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

async function sendLeadAlert(lead) {
  if (!enabled) return;
  const rows = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Company', lead.company || '-'],
    ['Practice area', lead.practice_area],
    ['Received', formatDate(lead.created_at, true)],
    ['Page', lead.page]
  ];
  const adminUrl = `${config.baseUrl}/admin/leads/${lead.id}`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nMessage:\n${lead.message}\n\nOpen in admin: ${adminUrl}\n`;
  const html = `
    <p>A new enquiry came in through the website contact form.</p>
    <table cellpadding="6" style="border-collapse:collapse;font:14px/1.4 Arial,sans-serif">
      ${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}
    </table>
    <p style="font:14px/1.5 Arial,sans-serif;white-space:pre-wrap;border-left:3px solid #2D5794;padding-left:12px">${esc(lead.message)}</p>
    <p><a href="${esc(adminUrl)}">Open this lead in the admin panel</a></p>`;

  await transport.sendMail({
    from: mail.from,
    to: mail.leadAlertTo,
    replyTo: { name: oneLine(lead.name), address: oneLine(lead.email) },
    subject: oneLine(`New enquiry: ${lead.name} (${lead.practice_area})`).slice(0, 180),
    text,
    html
  });
}

module.exports = { mailEnabled: enabled, sendLeadAlert };
