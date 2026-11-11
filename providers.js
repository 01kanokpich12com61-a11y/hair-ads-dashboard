'use strict';
const demo = require('./demo');
const meta = require('./meta');
const store = require('./store');
const ops = require('./ops');

// เลือกแหล่งข้อมูลตามโหมดที่ตั้งไว้ใน Setting: 'demo' หรือ 'meta'
function currentMode() {
  const s = meta.getSettings();
  return s.mode === 'meta' && s.meta && s.meta.accessToken ? 'meta' : 'demo';
}

async function load(range) {
  let data;
  if (currentMode() === 'meta') {
    data = await meta.load({ from: range.prevFrom, to: range.to });
    // ลีดอ่านสดทุกครั้ง (Webhook เพิ่มลีดใหม่ได้ตลอด) ไม่ผ่านแคช 10 นาทีของ Ads
    data = { ...data, leads: store.read('leads.json', []) };
  } else data = demo.load();
  return ops.applyOverrides(data);
}

module.exports = { currentMode, load };
