'use strict';
const demo = require('./demo');
const meta = require('./meta');

// เลือกแหล่งข้อมูลตามโหมดที่ตั้งไว้ใน Setting: 'demo' หรือ 'meta'
function currentMode() {
  const s = meta.getSettings();
  return s.mode === 'meta' && s.meta && s.meta.accessToken ? 'meta' : 'demo';
}

async function load(range) {
  if (currentMode() === 'meta') return meta.load({ from: range.prevFrom, to: range.to });
  return demo.load();
}

module.exports = { currentMode, load };
