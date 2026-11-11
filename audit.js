'use strict';
// บันทึกกิจกรรม (Audit log) เก็บใน data/audit.json เก็บล่าสุด 5,000 รายการ
// ห้ามใส่ค่าลับ (รหัสผ่าน/token) ลงใน detail
const crypto = require('node:crypto');
const store = require('./store');

const MAX = 5000;

const LABELS = {
  login: 'เข้าสู่ระบบ', login_failed: 'เข้าสู่ระบบไม่สำเร็จ', logout: 'ออกจากระบบ',
  password_change: 'เปลี่ยนรหัสผ่าน', settings_save: 'บันทึกการตั้งค่า Meta', meta_test: 'ทดสอบการเชื่อมต่อ Meta',
  meta_extend: 'แลก token อายุยาว', meta_disconnect: 'ตัดการเชื่อมต่อ Meta', mode_change: 'เปลี่ยนแหล่งข้อมูล',
  reply_sent: 'ส่งข้อความตอบลูกค้า', reply_failed: 'ส่งข้อความไม่สำเร็จ', status_change: 'เปลี่ยนสถานะลีด',
  followup_set: 'ตั้งนัดตามลูกค้า', followup_done: 'ปิดงานตามลูกค้า', review_save: 'บันทึกผลรีวิวแชท',
  webhook_rejected: 'Webhook ถูกปฏิเสธ',
  user_add: 'เพิ่มผู้ใช้', user_reset: 'รีเซ็ตรหัสผ่านผู้ใช้', user_delete: 'ลบผู้ใช้',
  leads_upload: 'นำเข้า Leads (CSV)',
};

function log(user, action, detail, ip) {
  const list = store.read('audit.json', []);
  list.push({
    id: crypto.randomBytes(6).toString('hex'),
    at: new Date().toISOString(),
    user: user || '—', action, detail: String(detail || '').slice(0, 300), ip: ip || '',
  });
  store.write('audit.json', list.length > MAX ? list.slice(-MAX) : list);
}

function query({ action, user, q, from, to, limit = 100, offset = 0 } = {}) {
  const all = store.read('audit.json', []);
  const needle = String(q || '').trim().toLowerCase();
  const fromMs = from ? Date.parse(from + 'T00:00:00+07:00') : null;
  const toMs = to ? Date.parse(to + 'T23:59:59+07:00') : null;
  const rows = all.filter((r) => (!action || r.action === action) && (!user || r.user === user)
    && (fromMs === null || Date.parse(r.at) >= fromMs) && (toMs === null || Date.parse(r.at) <= toMs)
    && (!needle || [r.detail, r.user, r.ip, LABELS[r.action]].some((x) => String(x || '').toLowerCase().includes(needle))))
    .reverse();
  return {
    total: rows.length,
    rows: rows.slice(offset, offset + limit).map((r) => ({ ...r, label: LABELS[r.action] || r.action })),
    actions: Object.entries(LABELS).map(([key, label]) => ({ key, label })),
    users: [...new Set(all.map((r) => r.user))].sort(),
  };
}

// ป้องกัน CSV injection เมื่อเปิดใน Excel
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
function toCsv(rows) {
  const head = ['เวลา', 'ผู้ใช้', 'การกระทำ', 'รายละเอียด', 'IP'];
  const lines = rows.map((r) => [r.at, r.user, r.label, r.detail, r.ip].map(cell).join(','));
  return '\ufeff' + [head.map(cell).join(','), ...lines].join('\r\n');
}

module.exports = { log, query, toCsv, LABELS };