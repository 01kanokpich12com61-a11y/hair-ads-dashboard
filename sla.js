'use strict';
// SLA การตอบแชทของเซลส์: ต้องตอบลูกค้าภายใน 15 นาที
//
// กติกา (เวลาไทย) — ช่วงเวลาดูจาก "เวลาที่ลูกค้าส่งข้อความที่เริ่มรอคำตอบ"
//   10:00–19:00  ตอบเกิน 15 นาที = หัก 1 แต้ม (สูงสุด 1 แต้มต่อ 1 แชทต่อ 1 เพจ ไม่ว่าจะช้ากี่ครั้ง)
//   08:00–10:00 และ 19:00–22:00  ตอบเกิน 15 นาที = ไม่หักแต้ม แต่นับเป็นสถิติตอบช้า
//   22:00–08:00  ไม่หักแต้ม ถ้าเซลส์ "ตอบ" ในช่วงนี้ (ดูจากเวลาที่ตอบ) นับเป็นสถิติตอบนอกเวลา
// ข้อความลูกค้าที่ยังไม่มีใครตอบ และเกิน 15 นาทีแล้ว ถือว่าตอบช้า (replyAt = null)
const store = require('./store');
const ops = require('./ops');
const { stampMs } = require('./dates');

const LIMIT_MIN = 15;
const MAX_EVENTS_PER_REP = 300;

// 'work' | 'commute' | 'night' จาก 'YYYY-MM-DD HH:MM'
function windowOf(at) {
  const [h, m] = String(at).slice(11, 16).split(':').map(Number);
  const t = h * 60 + m;
  if (t >= 600 && t < 1140) return 'work'; // 10:00–19:00
  if ((t >= 480 && t < 600) || (t >= 1140 && t < 1320)) return 'commute'; // 08:00–10:00, 19:00–22:00
  return 'night'; // 22:00–08:00
}

// แปลงข้อความในแชทเป็น "รอบรอคำตอบ": ข้อความลูกค้าแรกหลังพนักงานตอบล่าสุด → ข้อความพนักงานถัดไป
function turnsOf(msgs) {
  const turns = []; let waiting = null;
  for (const m of msgs) {
    if (m.from === 'customer') { if (!waiting) waiting = m.at; }
    else if (m.from === 'staff' && waiting) { turns.push({ customerAt: waiting, replyAt: m.at }); waiting = null; }
  }
  if (waiting) turns.push({ customerAt: waiting, replyAt: null });
  return turns;
}

const r1 = (n) => Math.round(n * 10) / 10;

function buildSla(data, isDemo, range, nowMs = Date.now()) {
  const overlay = store.read('messages.json', {});
  const repName = Object.fromEntries(data.reps.map((r) => [r.id, r.name]));
  const adById = new Map(data.ads.map((a) => [a.id, a]));
  const pageName = Object.fromEntries(data.pages.map((p) => [p.id, p.name]));
  const reps = new Map();
  const deducted = new Set(); // `${chat}|${page}` ที่ถูกหักแต้มไปแล้ว

  const repOf = (id) => {
    if (!reps.has(id)) {
      reps.set(id, { repId: id, rep: repName[id] || 'ไม่ระบุเซลส์', turns: 0, onTime: 0, late: 0, deducted: 0, commuteLate: 0, nightReplies: 0, sumMin: 0, nMin: 0, events: [] });
    }
    return reps.get(id);
  };

  for (const l of data.leads) {
    const msgs = ops.messagesFor(l, data, isDemo, overlay);
    if (!msgs.length) continue;
    const ad = adById.get(l.adId);
    const pageId = l.pageId || (ad && ad.pageId) || 'unknown';
    const key = `${l.id}|${pageId}`;
    for (const t of turnsOf(msgs)) {
      const day = t.customerAt.slice(0, 10);
      if (day < range.from || day > range.to) continue;
      const minutes = t.replyAt ? (stampMs(t.replyAt) - stampMs(t.customerAt)) / 60000 : (nowMs - stampMs(t.customerAt)) / 60000;
      if (!t.replyAt && minutes <= LIMIT_MIN) continue; // ยังอยู่ในเวลา 15 นาที ยังไม่ตัดสิน
      const window = windowOf(t.customerAt);
      const replyWindow = t.replyAt ? windowOf(t.replyAt) : null;
      const late = minutes > LIMIT_MIN;
      let outcome = 'ontime';
      if (late) {
        if (window === 'work') { if (deducted.has(key)) outcome = 'dup'; else { deducted.add(key); outcome = 'deduct'; } }
        else outcome = window === 'commute' ? 'commute' : 'late_night';
      }
      const rp = repOf(l.repId || '');
      rp.turns += 1;
      if (late) rp.late += 1; else rp.onTime += 1;
      if (outcome === 'deduct') rp.deducted += 1;
      if (outcome === 'commute') rp.commuteLate += 1;
      if (replyWindow === 'night') rp.nightReplies += 1;
      if (t.replyAt && window !== 'night') { rp.sumMin += minutes; rp.nMin += 1; }
      if (outcome !== 'ontime' || replyWindow === 'night') {
        rp.events.push({
          leadId: l.id, name: l.name, channel: l.channel || '—', leadDate: l.date, page: pageName[pageId] || '', pageId,
          customerAt: t.customerAt, replyAt: t.replyAt, minutes: r1(minutes), unanswered: !t.replyAt,
          window, replyWindow, outcome, points: outcome === 'deduct' ? -1 : 0,
        });
      }
    }
  }

  const list = [...reps.values()].map((r) => {
    const events = r.events.sort((a, b) => (a.customerAt < b.customerAt ? 1 : a.customerAt > b.customerAt ? -1 : 0));
    return {
      repId: r.repId, rep: r.rep, turns: r.turns, onTime: r.onTime, late: r.late, deducted: r.deducted, points: -r.deducted,
      commuteLate: r.commuteLate, nightReplies: r.nightReplies, avgMin: r.nMin ? r1(r.sumMin / r.nMin) : null,
      eventTotal: events.length, events: events.slice(0, MAX_EVENTS_PER_REP),
    };
  }).sort((a, b) => b.deducted - a.deducted || b.late - a.late || a.rep.localeCompare(b.rep));

  const sum = (k) => list.reduce((s, r) => s + r[k], 0);
  return {
    range, limitMin: LIMIT_MIN,
    totals: { turns: sum('turns'), onTime: sum('onTime'), late: sum('late'), deducted: sum('deducted'), points: -sum('deducted'), commuteLate: sum('commuteLate'), nightReplies: sum('nightReplies') },
    reps: list,
  };
}

module.exports = { buildSla, windowOf, turnsOf, LIMIT_MIN };