'use strict';
// ที่เก็บข้อมูลแบบ SQLite (node:sqlite, ต้องใช้ Node >= 22.5) เก็บใน data/app.db
// API เหมือนเดิม: read(name, fallback) / write(name, value) จึงไม่ต้องแก้ไฟล์อื่น
// - ถ้ายังไม่มีข้อมูลใน DB แต่มีไฟล์ JSON เดิม จะนำเข้าให้อัตโนมัติ
// - ถ้า Node ไม่มี node:sqlite จะถอยกลับไปใช้ไฟล์ JSON ตามเดิม
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const jsonFile = (name) => path.join(config.dataDir, name);

/* ---------- แบบไฟล์ JSON (สำรอง) ---------- */
function jsonRead(name, fallback) {
  try { return JSON.parse(fs.readFileSync(jsonFile(name), 'utf8')); } catch { return fallback; }
}
function jsonWrite(name, value) {
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const tmp = jsonFile(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, jsonFile(name));
}

/* ---------- แบบ SQLite ---------- */
let db = null;
let stmts = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(path.join(config.dataDir, 'app.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS kv (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  try { fs.chmodSync(path.join(config.dataDir, 'app.db'), 0o600); } catch { /* ไม่สำคัญ */ }
  stmts = {
    get: db.prepare('SELECT value FROM kv WHERE name = ?'),
    put: db.prepare('INSERT INTO kv (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'),
  };
} catch {
  db = null;
}

function read(name, fallback) {
  if (!db) return jsonRead(name, fallback);
  const row = stmts.get.get(name);
  if (row) { try { return JSON.parse(row.value); } catch { return fallback; } }
  // ยังไม่มีใน DB: นำเข้าจากไฟล์ JSON เดิมครั้งเดียว
  try {
    const legacy = JSON.parse(fs.readFileSync(jsonFile(name), 'utf8'));
    stmts.put.run(name, JSON.stringify(legacy), new Date().toISOString());
    return legacy;
  } catch { return fallback; }
}

function write(name, value) {
  if (!db) return jsonWrite(name, value);
  stmts.put.run(name, JSON.stringify(value), new Date().toISOString());
}

module.exports = { read, write, backend: db ? 'sqlite' : 'json' };