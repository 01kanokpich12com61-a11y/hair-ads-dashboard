'use strict';
const config = require('./config');

const DAY = 864e5;

function today() {
  return new Date(Date.now() + config.tzOffsetHours * 3600e3).toISOString().slice(0, 10);
}
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY); }
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s)); }
function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// หาช่วงวันที่ปัจจุบัน และช่วงก่อนหน้าที่ยาวเท่ากัน
function resolveRange(q) {
  const t = today();
  let from, to, days;
  if (q.range === 'custom' && isDate(q.from) && isDate(q.to) && q.from <= q.to) {
    to = q.to > t ? t : q.to;
    from = q.from > to ? to : q.from;
    days = diffDays(from, to) + 1;
    if (days > 366) { from = addDays(to, -365); days = 366; }
  } else {
    days = { '7d': 7, '30d': 30, '90d': 90 }[q.range] || 30;
    to = t;
    from = addDays(t, -(days - 1));
  }
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const key = q.range === 'custom' ? 'custom' : `${days}d`;
  return { key, from, to, days, prevFrom, prevTo };
}

// เวลาแบบ 'YYYY-MM-DD HH:MM' (เวลาไทย) ใช้กับข้อความแชท
function nowStamp(ms = Date.now()) {
  return new Date(ms + config.tzOffsetHours * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
}
function stampMs(at) { return Date.parse(String(at).replace(' ', 'T') + ':00+07:00'); }

module.exports = { today, addDays, diffDays, eachDay, isDate, resolveRange, nowStamp, stampMs };
