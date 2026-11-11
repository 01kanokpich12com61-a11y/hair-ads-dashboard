'use strict';
const fs = require('node:fs');
const path = require('node:path');

// โหลด .env แบบง่าย ๆ (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
(function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined && val !== '') process.env[m[1]] = val;
  }
})();

module.exports = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  publicDir: path.join(__dirname, '..', 'public'),
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin1234',
  usingDefaultPassword: !process.env.ADMIN_PASSWORD,
  secureCookie: process.env.COOKIE_SECURE === '1',
  metaApiVersion: process.env.META_API_VERSION || 'v25.0',
  trustProxy: process.env.TRUST_PROXY === '1', // อยู่หลัง Nginx/Caddy: ใช้ X-Forwarded-For เป็น IP ลูกค้า
  tzOffsetHours: 7, // Asia/Bangkok
};
