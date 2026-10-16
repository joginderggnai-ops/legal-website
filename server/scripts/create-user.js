'use strict';
// Creates an admin panel user and prints a temporary password.
//   npm run create-user -- you@resurgentlegal.com "Your Name" admin
// The role is "admin" (default for the first user) or "editor".
const { db } = require('../src/db');
const auth = require('../src/auth');

const [email, name, roleArg] = process.argv.slice(2);
if (!email || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Usage: npm run create-user -- <email> "<full name>" [admin|editor]');
  process.exit(1);
}
const isFirst = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
const role = roleArg === 'editor' || roleArg === 'admin' ? roleArg : isFirst ? 'admin' : 'editor';

if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
  console.error(`A user with the email ${email} already exists.`);
  process.exit(1);
}

const password = auth.generatePassword();
db.prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
  .run(email.toLowerCase(), name, role, auth.hashPassword(password));

console.log(`\nCreated ${role} account for ${name} <${email}>`);
console.log(`Temporary password: ${password}`);
console.log('Sign in at /admin and change it under "My account".\n');
