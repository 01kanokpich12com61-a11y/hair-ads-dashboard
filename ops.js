'use strict';
// งานปฏิบัติการของทีมขาย: ข้อความที่ส่ง/รับเพิ่ม, สถานะลีดที่แก้ไข, นัดตามลูกค้า, รีวิวแชท
const store = require('./store');
const demo = require('./demo');
const { today, addDays, nowStamp, stampMs } = require('./dates');

const QUALITY = { qualified: 'good', in_progress: 'good', talked: 'average', very_poor: 'poor', no_reply: 'poor' };
const STATUSES = ['no_reply', 'very_poor', 'talked', 'in_progress', 'qualified'];

/* ---------- ข้อความ ---------- */
const readOverlay = () => store.read('messages.json', {});

function messagesFor(lead, data, isDemo, overlay = readOverlay()) {
  const base = isDemo ? demo.conversation(lead, data) : (Array.isArray(lead.messages) ? lead.messages : []);
  const extra = overlay[lead.id] || [];
  if (!extra.length) return base;
  return [...base, ...extra].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// คืน false ถ้าข้อความนี้ (mid เดียวกัน) เคยบันทึกแล้ว
function addMessage(leadId, msg) {
  const ov = readOverlay();
  const list = ov[leadId] || (ov[leadId] = []);
  if (msg.mid && list.some((m) => m.mid === msg.mid)) return false;
  list.push(msg);
  store.write('messages.json', ov);
  return true;
}

/* ---------- ลีด ---------- */
function applyOverrides(data) {
  const ov = store.read('leadmeta.json', {});
  if (!Object.keys(ov).length) return data;
  return {
    ...data,
    leads: data.leads.map((l) => (ov[l.id] ? { ...l, status: ov[l.id].status, quality: QUALITY[ov[l.id].status] || l.quality } : l)),
  };
}
function setStatus(id, status) {
  const ov = store.read('leadmeta.json', {});
  ov[id] = { status, at: new Date().toISOString() };
  store.write('leadmeta.json', ov);
}

// ลีดใหม่จาก Webhook (โหมด Meta) เก็บใน data/leads.json
function findOrCreateLead({ psid, pageId, name, channel, adId }) {
  const leads = store.read('leads.json', []);
  let lead = leads.find((l) => l.psid === psid && l.pageId === pageId);
  if (lead) return { lead, created: false };
  let id = `M-${String(psid).slice(-8)}`;
  while (leads.some((l) => l.id === id)) id += 'x';
  lead = {
    id, name: name || 'ลูกค้า Messenger', channel: channel || 'Messenger', date: today(), status: 'talked',
    quality: QUALITY.talked, adId: adId || '', psid, pageId, repId: '', value: 0, firstResponseMin: null, dropReason: null,
  };
  leads.push(lead);
  store.write('leads.json', leads);
  return { lead, created: true };
}

/* ---------- นัดตามลูกค้า ---------- */
function setFollowup(id, { dueDate, note }, user) {
  const all = store.read('followups.json', {});
  all[id] = { dueDate, note, done: false, createdBy: user, createdAt: new Date().toISOString() };
  store.write('followups.json', all);
  return all[id];
}
function doneFollowup(id, user) {
  const all = store.read('followups.json', {});
  if (!all[id]) return null;
  all[id] = { ...all[id], done: true, doneBy: user, doneAt: new Date().toISOString() };
  store.write('followups.json', all);
  return all[id];
}

function buildFollowups(data, isDemo, q = {}) {
  const fus = store.read('followups.json', {});
  const ov = readOverlay();
  const now = Date.now(); const t = today(); const oldest = addDays(t, -90);
  const repName = Object.fromEntries(data.reps.map((r) => [r.id, r.name]));
  const adName = Object.fromEntries(data.ads.map((a) => [a.id, a.name]));
  const rows = [];
  for (const l of data.leads) {
    if (l.date < oldest || l.value > 0) continue;
    if (q.rep && l.repId !== q.rep) continue;
    const msgs = messagesFor(l, data, isDemo, ov);
    const last = msgs[msgs.length - 1] || null;
    const fu = fus[l.id] && !fus[l.id].done ? fus[l.id] : null;
    const hours = last ? (now - stampMs(last.at)) / 3600e3 : null;
    let kind = null;
    if (last && last.from === 'customer') kind = 'reply';
    else if (fu) kind = 'scheduled';
    else if (last && last.from === 'staff' && ['no_reply', 'talked', 'in_progress', 'qualified'].includes(l.status) && hours >= 24 && hours <= 720) kind = 'chase';
    if (!kind) continue;
    const overdue = Boolean(fu && fu.dueDate <= t);
    const rank = kind === 'reply' ? 0 : overdue ? 1 : kind === 'chase' ? 2 : 3;
    rows.push({
      id: l.id, name: l.name, channel: l.channel || '—', status: l.status, rep: repName[l.repId] || '', ad: adName[l.adId] || '',
      kind, rank, overdue, hours: hours === null ? null : Math.round(hours * 10) / 10,
      lastText: last ? last.text : '', lastFrom: last ? last.from : '', lastAt: last ? last.at : '',
      dueDate: fu ? fu.dueDate : null, note: fu ? fu.note : '',
    });
  }
  rows.sort((a, b) => a.rank - b.rank
    || (a.rank === 1 || a.rank === 3 ? (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) : (b.hours || 0) - (a.hours || 0)));
  const count = (f) => rows.filter(f).length;
  return {
    stats: { reply: count((r) => r.kind === 'reply'), chase: count((r) => r.kind === 'chase'), due: count((r) => r.overdue), scheduled: count((r) => r.dueDate) },
    total: rows.length,
    rows: rows.slice(0, 300),
  };
}

/* ---------- รีวิวแชท ---------- */
const CRITERIA = ['greeting', 'needs', 'info', 'closing', 'speed'];

function saveReview(id, scores, note, user) {
  const clean = {};
  for (const k of CRITERIA) {
    const v = Number(scores && scores[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return { error: 'ต้องให้คะแนนครบทุกข้อ (1–5)' };
    clean[k] = v;
  }
  const score = Math.round((CRITERIA.reduce((s, k) => s + clean[k], 0) / (CRITERIA.length * 5)) * 100);
  const all = store.read('reviews.json', {});
  all[id] = { id, scores: clean, score, note: String(note || '').trim().slice(0, 600), reviewer: user, at: new Date().toISOString() };
  store.write('reviews.json', all);
  return { review: all[id] };
}
const getReview = (id) => store.read('reviews.json', {})[id] || null;
const getFollowup = (id) => store.read('followups.json', {})[id] || null;

function buildReview(data, range, q = {}) {
  const reviews = store.read('reviews.json', {});
  const repName = Object.fromEntries(data.reps.map((r) => [r.id, r.name]));
  const adName = Object.fromEntries(data.ads.map((a) => [a.id, a.name]));
  const all = data.leads.filter((l) => l.date >= range.from && l.date <= range.to && (!q.rep || l.repId === q.rep)).map((l) => {
    const rv = reviews[l.id];
    return {
      id: l.id, name: l.name, channel: l.channel || '—', date: l.date, status: l.status, rep: repName[l.repId] || '', repId: l.repId || '', ad: adName[l.adId] || '',
      firstResponseMin: typeof l.firstResponseMin === 'number' ? l.firstResponseMin : null,
      reviewed: Boolean(rv), score: rv ? rv.score : null, reviewer: rv ? rv.reviewer : '', reviewedAt: rv ? rv.at : '', note: rv ? rv.note : '',
    };
  });
  const done = all.filter((r) => r.reviewed);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, r) => s + r.score, 0) / arr.length) : null);
  const byRep = {};
  for (const r of all) { const b = (byRep[r.rep || '—'] ||= { rep: r.rep || '—', total: 0, reviewed: 0, items: [] }); b.total += 1; if (r.reviewed) { b.reviewed += 1; b.items.push(r); } }
  let rows = all;
  if (q.state === 'pending') rows = all.filter((r) => !r.reviewed);
  if (q.state === 'done') rows = done;
  rows = [...rows].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.id < b.id ? 1 : -1));
  return {
    range,
    stats: { total: all.length, reviewed: done.length, pending: all.length - done.length, avgScore: avg(done) },
    byRep: Object.values(byRep).map((b) => ({ rep: b.rep, total: b.total, reviewed: b.reviewed, avgScore: avg(b.items) })).sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1)),
    total: rows.length,
    rows: rows.slice(0, 300),
  };
}

module.exports = {
  STATUSES, QUALITY, CRITERIA, messagesFor, addMessage, applyOverrides, setStatus, findOrCreateLead,
  setFollowup, doneFollowup, buildFollowups, saveReview, getReview, getFollowup, buildReview, nowStamp, stampMs,
};
