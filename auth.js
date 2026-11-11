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

/* ---------- จัดการผู้ใช้ (เฉพาะ admin) ---------- */
// บัญชีเดิมที่ไม่มีฟิลด์ role ถือเป็น admin (ย้อนหลังเข้ากันได้)
const isAdmin = (user) => Boolean(user) && (user.role === 'admin' || !user.role);
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

function passwordProblem(pw) {
  if (String(pw || '').length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
  if (pw === 'admin1234') return 'ห้ามใช้รหัสผ่านเริ่มต้น';
  return null;
}

function listUsers() {
  const db = store.read('users.json', { users: [] });
  return db.users.map((u) => ({
    username: u.username, role: isAdmin(u) ? 'admin' : 'staff', mustChange: Boolean(u.mustChange), createdAt: u.createdAt || null,
  }));
}

// เพิ่มหลายคนในครั้งเดียว: items = [{ username, password, role }]  คืน { added: [...], skipped: [{ username, reason }] }
function addUsers(items) {
  const db = store.read('users.json', { users: [] });
  const added = []; const skipped = [];
  for (const it of Array.isArray(items) ? items : []) {
    const username = String(it.username || '').trim();
    const password = String(it.password || '');
    const role = it.role === 'admin' ? 'admin' : 'staff';
    let reason = null;
    if (!USERNAME_RE.test(username)) reason = 'ชื่อผู้ใช้ต้องเป็น a-z 0-9 _ . - ยาว 3–30 ตัว';
    else if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) reason = 'มีชื่อผู้ใช้นี้อยู่แล้ว';
    else reason = passwordProblem(password);
    if (reason) { skipped.push({ username, reason }); continue; }
    db.users.push({ username, passwordHash: hashPassword(password), role, mustChange: true, createdAt: new Date().toISOString() });
    added.push({ username, role });
  }
  if (added.length) store.write('users.json', db);
  return { added, skipped };
}

function destroyUserSessions(username) {
  for (const [token, s] of sessions) if (s.username === username) sessions.delete(token);
}

// admin ตั้งรหัสชั่วคราวใหม่ให้ผู้ใช้ (ผู้ใช้ต้องเปลี่ยนเองหลังล็อกอิน) คืนข้อความ error หรือ null
function resetPassword(username, password) {
  const problem = passwordProblem(password);
  if (problem) return problem;
  const db = store.read('users.json', { users: [] });
  const user = db.users.find((u) => u.username === username);
  if (!user) return 'ไม่พบผู้ใช้นี้';
  user.passwordHash = hashPassword(password);
  user.mustChange = true;
  store.write('users.json', db);
  destroyUserSessions(username);
  return null;
}

function deleteUser(username, actor) {
  if (username === actor) return 'ลบบัญชีของตัวเองไม่ได้';
  const db = store.read('users.json', { users: [] });
  const user = db.users.find((u) => u.username === username);
  if (!user) return 'ไม่พบผู้ใช้นี้';
  if (isAdmin(user) && db.users.filter(isAdmin).length <= 1) return 'ต้องเหลือผู้ดูแล (admin) อย่างน้อย 1 คน';
  db.users = db.users.filter((u) => u.username !== username);
  store.write('users.json', db);
  destroyUserSessions(username);
  return null;
}

module.exports = {
  ensureAdmin, login, getSession, destroy, cookieHeader, changePassword,
  isAdmin, listUsers, addUsers, resetPassword, deleteUser,
};