'use strict';
// Creates an admin panel user and prints a temporary password.
//   npm run create-user -- you@resurgentlegal.com "Your Name" admin
// The role is "admin" (default for the first user) or "editor". Uses the same database as the app:
// Postgres when DATABASE_URL is set in .env (e.g. copied from Vercel), otherwise the local SQLite file.
const db = require('../src/db');
const auth = require('../src/auth');

async function main() {
  const [emailArg, name, roleArg] = process.argv.slice(2);
  const email = String(emailArg || '').trim().toLowerCase();
  if (!email || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error('Usage: npm run create-user -- <email> "<full name>" [admin|editor]');
  }
  await db.ready();
  const isFirst = (await db.get('SELECT COUNT(*) AS n FROM users')).n === 0;
  const role = roleArg === 'editor' || roleArg === 'admin' ? roleArg : isFirst ? 'admin' : 'editor';
  if (await db.get('SELECT 1 AS taken FROM users WHERE email = ?', [email])) {
    throw new Error(`A user with the email ${email} already exists.`);
  }
  const password = auth.generatePassword();
  await db.run('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)', [email, name, role, auth.hashPassword(password)]);
  console.log(`\nCreated ${role} account for ${name} <${email}>`);
  console.log(`Temporary password: ${password}`);
  console.log('Sign in at /admin and change it under "My account".\n');
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => db.close());
