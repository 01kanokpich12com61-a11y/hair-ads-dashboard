'use strict';
const crypto = require('node:crypto');
const store = require('./store');
const config = require('./config');

const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> { username, exp }
const attempts = new Map(); // ip -> { count, until }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [type, saltHex, hashHex] = String(stored).split('$');
  if (type !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function ensureAdmin() {
  const db = store.read('users.json', null);
  if (db && Array.isArray(db.users) && db.users.length) return false;
  store.write('users.json', {
    users: [{
      username: config.adminUser,
      passwordHash: hashPassword(config.adminPassword),
      mustChange: config.usingDefaultPassword,
      createdAt: new Date().toISOString(),
    }],
  });
  return true;
}

function findUser(username) {
  const db = store.read('users.json', { users: [] });
  return db.users.find((u) => u.username === username);
}

function checkRateLimit(ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now() && a.count >= 5) return Math.ceil((a.until - Date.now()) / 1000);
  return 0;
}
function recordFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.until <= now) attempts.set(ip, { count: 1, until: now + 10 * 60 * 1000 });
  else a.count += 1;
}

function login(username, password, ip) {
  const wait = checkRateLimit(ip);
  if (wait) return { error: `ลองผิดหลายครั้งเกินไป กรุณารอ ${Math.ceil(wait / 60)} นาที`, status: 429 };
  const user = findUser(String(username || ''));
  // คำนวณ hash เสมอ เพื่อไม่ให้เดา username ได้จากเวลาตอบสนอง
  const ok = user ? verifyPassword(String(password || ''), user.passwordHash)
    : (verifyPassword('x', hashPassword('y')), false);
  if (!ok) { recordFailure(ip); return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', status: 401 }; }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: user.username, exp: Date.now() + SESSION_MS });
  return { token, user };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie).sid;
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(token); return null; }
  s.exp = Date.now() + SESSION_MS;
  const user = findUser(s.username);
  return user ? { token, user } : null;
}

function destroy(token) { sessions.delete(token); }

function cookieHeader(token, maxAgeSec) {
  const parts = [`sid=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.secureCookie) parts.push('Secure');
  return parts.join('; ');
}

function changePassword(username, current, next) {
  const db = store.read('users.json', { users: [] });
  const user = db.users.find((u) => u.username === username);
  if (!user || !verifyPassword(String(current || ''), user.passwordHash)) return 'รหัสผ่านปัจจุบันไม่ถูกต้อง';
  if (String(next || '').length < 8) return 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร';
  if (next === 'admin1234') return 'กรุณาเลือกรหัสผ่านอื่นที่ไม่ใช่ค่าเริ่มต้น';
  user.passwordHash = hashPassword(next);
  user.mustChange = false;
  store.write('users.json', db);
  return null;
}

module.exports = { ensureAdmin, login, getSession, destroy, cookieHeader, changePassword };
