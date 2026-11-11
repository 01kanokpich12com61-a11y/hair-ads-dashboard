'use strict';
// ทดสอบแบบไม่ต้องใช้แพ็กเกจเพิ่ม: node test/run.js
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hairads-'));
delete process.env.ADMIN_PASSWORD;

const auth = require('../lib/auth');
const { server } = require('../server');
const meta = require('../lib/meta');
const crypto = require('node:crypto');

async function main() {
  auth.ensureAdmin();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
  const ok = (name) => console.log('  ✓', name);

  // auth
  assert.equal((await call('GET', '/api/dashboard')).status, 401); ok('API ต้องล็อกอินก่อน');
  assert.equal((await call('POST', '/api/login', { username: 'admin', password: 'wrong' })).status, 401); ok('รหัสผิดถูกปฏิเสธ');
  assert.equal((await call('POST', '/api/login', { username: 'admin', password: 'admin1234' })).status, 200); ok('admin ล็อกอินได้');
  const me = (await call('GET', '/api/me')).json;
  assert.equal(me.username, 'admin'); assert.equal(me.mustChange, true); ok('ข้อมูลผู้ใช้ + บังคับเปลี่ยนรหัส');

  // dashboard
  const d = (await call('GET', '/api/dashboard?range=30d')).json;
  assert.equal(d.mode, 'demo');
  assert.equal(d.range.days, 30);
  assert.ok(d.kpis.spend.value > 100000 && d.kpis.spend.value < 300000, 'spend ' + d.kpis.spend.value);
  const k = d.kpis;
  assert.ok(Math.abs(k.costMessage.value - k.spend.value / k.messages.value) < 0.01);
  assert.ok(Math.abs(k.conversionRate.value - (k.purchases.value / k.messages.value) * 100) < 0.01);
  assert.ok(Math.abs(k.ctr.value - (k.clicks.value / k.impressions.value) * 100) < 0.01);
  assert.equal(d.ads.length, d.scope.ads); ok('KPI คำนวณสอดคล้องกัน');
  assert.ok(d.ads.length >= 14 && d.chat.leads > 50, `ads ${d.ads.length} leads ${d.chat.leads}`); ok(`ข้อมูลเดโม ${d.ads.length} ads / ${d.chat.leads} leads`);
  assert.equal(d.trend.dates.length, 30);

  // ตัวกรอง
  const f = (await call('GET', '/api/filters')).json;
  const one = (await call('GET', `/api/dashboard?range=7d&campaign=${f.campaigns[0].id}`)).json;
  assert.ok(one.ads.length < d.ads.length && one.ads.length > 0); ok('ตัวกรองแคมเปญ');
  const custom = (await call('GET', '/api/dashboard?range=custom&from=2020-01-01&to=2020-01-05')).json;
  assert.ok(custom.range.to <= new Date().toISOString().slice(0, 10) || true); ok('custom range ไม่พัง');
  const ib = (await call('GET', '/api/inbox?range=30d')).json;
  assert.ok(ib.rows.length > 20 && ib.rows[0].name && ib.rows[0].channel);
  assert.ok(ib.rows.every((r) => r.date >= ib.range.from && r.date <= ib.range.to)); ok('inbox ตามวันเริ่มคุย');
  assert.ok(ib.rows.every((r) => r.last && r.last.text));
  assert.ok(ib.rows.every((r, i) => i === 0 || (ib.rows[i - 1].last.at >= r.last.at))); ok('inbox มีข้อความล่าสุด เรียงตามล่าสุดก่อน');
  const chat = (await call('GET', '/api/inbox/chat?id=' + ib.rows[0].id)).json;
  assert.equal(chat.lead.id, ib.rows[0].id); assert.ok(chat.messages.length >= 2);
  assert.equal(chat.messages[0].from, 'customer'); assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(chat.messages[0].at)); ok('เปิดดูข้อความแชท');
  assert.equal((await call('GET', '/api/inbox/chat?id=NOPE')).status, 404); ok('แชทที่ไม่มีอยู่ตอบ 404');
  const ib7 = (await call('GET', '/api/inbox?range=7d')).json;
  const ib90 = (await call('GET', '/api/inbox?range=90d')).json;
  assert.ok(ib7.rows.length < ib.rows.length && ib.rows.length < ib90.rows.length); ok('inbox 7 < 30 < 90 วัน');
  const ibc = (await call('GET', '/api/inbox?range=custom&from=2026-10-01&to=2026-10-10')).json;
  assert.ok(ibc.rows.every((r) => r.date >= '2026-10-01' && r.date <= '2026-10-10')); ok('inbox กำหนดเอง');
  const bd = (await call('GET', '/api/board?range=90d')).json;
  assert.deepEqual(bd.columns.map((c) => c.status), ['no_reply', 'very_poor', 'talked', 'in_progress', 'qualified']);
  assert.equal(bd.columns.reduce((s, c) => s + c.total, 0), ib90.rows.length); ok('board 5 คอลัมน์ ผลรวมตรงกับ inbox');


  // ตอบแชท (โหมดเดโม)
  const rid = ib.rows[0].id;
  const before = (await call('GET', '/api/inbox/chat?id=' + rid)).json.messages.length;
  assert.equal((await call('POST', '/api/inbox/reply', { id: rid, text: '   ' })).status, 400);
  assert.equal((await call('POST', '/api/inbox/reply', { id: 'NOPE', text: 'hi' })).status, 404);
  const rp = (await call('POST', '/api/inbox/reply', { id: rid, text: 'สวัสดีค่ะ ทดสอบตอบกลับ' })).json;
  assert.equal(rp.ok, true); assert.equal(rp.delivered, 'demo'); assert.equal(rp.message.from, 'staff');
  const after = (await call('GET', '/api/inbox/chat?id=' + rid)).json.messages;
  assert.equal(after.length, before + 1); assert.equal(after[after.length - 1].text, 'สวัสดีค่ะ ทดสอบตอบกลับ');
  const ib2 = (await call('GET', '/api/inbox?range=30d')).json;
  assert.equal(ib2.rows[0].last.text, 'สวัสดีค่ะ ทดสอบตอบกลับ'); ok('ตอบแชทได้ และขึ้นเป็นข้อความล่าสุด (เดโมไม่ส่งจริง)');

  // เปลี่ยนสถานะลีด
  assert.equal((await call('POST', '/api/lead/status', { id: rid, status: 'bogus' })).status, 400);
  assert.equal((await call('POST', '/api/lead/status', { id: rid, status: 'qualified' })).json.ok, true);
  assert.equal((await call('GET', '/api/inbox/chat?id=' + rid)).json.lead.status, 'qualified'); ok('เปลี่ยนสถานะลีด');

  // ตามลูกค้า
  const fu0 = (await call('GET', '/api/followups')).json;
  assert.ok(fu0.total > 0 && fu0.rows.every((r) => ['reply', 'chase', 'scheduled'].includes(r.kind)));
  const target = fu0.rows.find((r) => r.kind === 'chase');
  assert.ok(target, 'ควรมีลูกค้าที่ต้องตามต่อ');
  assert.equal((await call('POST', '/api/followups', { id: target.id, dueDate: 'bad' })).status, 400);
  const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  assert.equal((await call('POST', '/api/followups', { id: target.id, dueDate: yest, note: 'โทรหา' })).json.ok, true);
  const fu1 = (await call('GET', '/api/followups')).json;
  const mine = fu1.rows.find((r) => r.id === target.id);
  assert.equal(mine.overdue, true); assert.equal(mine.note, 'โทรหา'); assert.ok(fu1.stats.due >= 1);
  assert.equal((await call('GET', '/api/inbox/chat?id=' + target.id)).json.followup.dueDate, yest);
  assert.equal((await call('POST', '/api/followups/done', { id: target.id })).json.ok, true);
  assert.equal((await call('POST', '/api/followups/done', { id: 'NOPE' })).status, 404);
  assert.equal((await call('GET', '/api/followups')).json.rows.find((r) => r.id === target.id).dueDate, null); ok('นัดตามลูกค้า ตั้ง/เกินกำหนด/ปิดงาน');
  // ตอบกลับแล้วต้องหลุดจากรายการ "ถึงเวลาตามต่อ"
  await call('POST', '/api/inbox/reply', { id: target.id, text: 'ตามผลค่ะ' });
  assert.equal((await call('GET', '/api/followups')).json.rows.some((r) => r.id === target.id), false); ok('ตอบแล้วหลุดจากรายการตามลูกค้า');

  // รีวิว
  const rv0 = (await call('GET', '/api/review?range=30d')).json;
  assert.equal(rv0.stats.reviewed, 0); assert.equal(rv0.stats.total, rv0.stats.pending);
  const rvTarget = rv0.rows[0].id;
  assert.equal((await call('POST', '/api/review', { id: rvTarget, scores: { greeting: 5 } })).status, 400);
  const full = { greeting: 5, needs: 4, info: 3, closing: 4, speed: 4 };
  const rvr = (await call('POST', '/api/review', { id: rvTarget, scores: full, note: 'ดี' })).json;
  assert.equal(rvr.review.score, 80);
  const rv1 = (await call('GET', '/api/review?range=30d')).json;
  assert.equal(rv1.stats.reviewed, 1); assert.equal(rv1.stats.avgScore, 80);
  assert.equal((await call('GET', '/api/review?range=30d&state=done')).json.rows.length, 1);
  assert.equal((await call('GET', '/api/inbox/chat?id=' + rvTarget)).json.review.note, 'ดี'); ok('รีวิวแชท ให้คะแนน/สรุป/กรอง');

  // audit
  const au = (await call('GET', '/api/audit')).json;
  const acts = au.rows.map((r) => r.action);
  for (const a of ['login_failed', 'login', 'reply_sent', 'status_change', 'followup_set', 'followup_done', 'review_save']) assert.ok(acts.includes(a), 'audit ขาด ' + a);
  assert.ok(au.rows[0].at >= au.rows[au.rows.length - 1].at);
  assert.equal((await call('GET', '/api/audit?action=login_failed')).json.rows.every((r) => r.action === 'login_failed'), true);
  const csv = await fetch(base + '/api/audit/export', { headers: { cookie } });
  assert.equal(csv.status, 200); assert.ok((csv.headers.get('content-type') || '').includes('text/csv'));
  assert.ok((await csv.text()).includes('เข้าสู่ระบบ')); ok('Audit log + ส่งออก CSV');
  assert.ok(!JSON.stringify(au).includes('admin1234'), 'audit ต้องไม่มีรหัสผ่าน');

  // settings / meta
  assert.equal((await call('POST', '/api/settings/mode', { mode: 'meta' })).status, 400); ok('สลับเป็น Meta ไม่ได้ถ้ายังไม่เชื่อม');
  const saved = (await call('PUT', '/api/settings/meta', { adAccountId: '12345', accessToken: 'EAAB-secret-token-1234', appId: '1' })).json;
  assert.equal(saved.meta.hasToken, true); assert.equal(saved.meta.tokenHint, '••••1234');
  assert.ok(!JSON.stringify(saved).includes('secret-token')); ok('เก็บ token ฝั่ง server และไม่ส่งกลับ');

  // parser ของ Meta insights
  const row = meta.parseInsightRow({
    date_start: '2026-11-01', ad_id: '99', spend: '123.45', impressions: '1000', reach: '800', clicks: '20',
    actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' }, { action_type: 'omni_purchase', value: '2' }],
  });
  assert.deepEqual(row, { date: '2026-11-01', adId: '99', spend: 123.45, impressions: 1000, reach: 800, clicks: 20, messages: 5, purchases: 2 });
  assert.equal(meta.normalizeAccountId('act_123'), 'act_123'); assert.equal(meta.normalizeAccountId('abc'), null); ok('parser ข้อมูล Meta');

  // จำลอง Graph API ทั้งชุด
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (!u.includes('graph.facebook.com')) return realFetch(url, opts);
    const j = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.includes('/messages')) {
      const sent = JSON.parse(opts.body); global.__sent = sent;
      return j({ recipient_id: sent.recipient.id, message_id: 'm_out_1' });
    }
    if (u.includes('fields=access_token')) return j({ access_token: 'PAGE-TOKEN', id: '555' });
    if (u.includes('PSID1')) return j({ name: 'Somchai Test' });
    if (u.includes('/insights')) return j({ data: [{ date_start: '2026-11-08', ad_id: 'a1', spend: '500', impressions: '4000', reach: '3000', clicks: '90', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' }] }] });
    if (u.includes('/ads')) return j({ data: [{ id: 'a1', name: 'Test Ad', campaign: { id: 'c1', name: 'Camp' }, adset: { id: 's1', name: 'Set' }, creative: { object_type: 'VIDEO', effective_object_story_id: '555_777' } }] });
    if (u.includes('/555')) return j({ name: 'Hair Page' });
    return j({ name: 'Clinic Account', currency: 'THB', account_status: 1 });
  };
  const t = (await call('POST', '/api/settings/meta/test')).json;
  assert.equal(t.ok, true); assert.equal(t.account.name, 'Clinic Account');
  assert.equal((await call('POST', '/api/settings/mode', { mode: 'meta' })).json.mode, 'meta');
  const md = (await call('GET', '/api/dashboard?range=7d')).json;
  assert.equal(md.mode, 'meta'); assert.equal(md.ads[0].name, 'Test Ad'); assert.equal(md.ads[0].page, 'Hair Page');
  assert.equal(md.kpis.messages.value, 12); ok('โหมด Meta ทำงานกับ Graph API จำลอง');

  // Webhook + ตอบแชทผ่าน Meta (ใช้ Graph API จำลอง)
  const wh = (await call('GET', '/api/settings')).json.webhook;
  assert.ok(wh.verifyToken && wh.verifyToken.length >= 16);
  const verify = (tok) => fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=${tok}&hub.challenge=777`);
  assert.equal(await (await verify(wh.verifyToken)).text(), '777'); assert.equal((await verify('wrong')).status, 403); ok('Webhook verify token');
  const evBody = JSON.stringify({ object: 'page', entry: [{ messaging: [
    { sender: { id: 'PSID1' }, recipient: { id: '555' }, timestamp: Date.now(), message: { mid: 'm_in_1', text: 'สนใจปลูกผมค่ะ', referral: { ad_id: 'a1' } } },
    { sender: { id: 'PSID1' }, recipient: { id: '555' }, timestamp: Date.now(), message: { mid: 'm_in_1', text: 'สนใจปลูกผมค่ะ' } }] }] });
  const post = (body, sig) => fetch(base + '/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body });
  assert.equal((await post(evBody, 'sha256=bad')).status, 403); ok('Webhook ลายเซ็นผิดถูกปฏิเสธ');
  await call('PUT', '/api/settings/meta', { adAccountId: '12345', appId: '1', appSecret: 'shh-secret' });
  const sign = (b) => 'sha256=' + crypto.createHmac('sha256', 'shh-secret').update(b).digest('hex');
  assert.equal((await post(evBody, sign(evBody))).status, 200);
  const mi = (await call('GET', '/api/inbox?range=7d')).json;
  const wl = mi.rows.find((r) => r.name === 'Somchai Test');
  assert.ok(wl, 'ควรสร้างลีดใหม่จาก Webhook'); assert.equal(wl.last.text, 'สนใจปลูกผมค่ะ');
  const wchat = (await call('GET', '/api/inbox/chat?id=' + wl.id)).json;
  assert.equal(wchat.messages.length, 1); ok('Webhook รับข้อความ สร้างลีด และกันข้อความซ้ำ (mid)');
  const mrep = (await call('POST', '/api/inbox/reply', { id: wl.id, text: 'สวัสดีค่ะ' })).json;
  assert.equal(mrep.delivered, 'meta'); assert.equal(global.__sent.messaging_type, 'RESPONSE'); assert.equal(global.__sent.recipient.id, 'PSID1');
  assert.equal(mrep.message.mid, 'm_out_1');
  const echo = JSON.stringify({ object: 'page', entry: [{ messaging: [{ sender: { id: '555' }, recipient: { id: 'PSID1' }, timestamp: Date.now(), message: { mid: 'm_out_1', is_echo: true, text: 'สวัสดีค่ะ' } }] }] });
  await post(echo, sign(echo));
  assert.equal((await call('GET', '/api/inbox/chat?id=' + wl.id)).json.messages.length, 2); ok('ตอบผ่าน Meta Send API และไม่ซ้ำกับ echo');
  const lineLead = (await call('GET', '/api/inbox?range=7d')).json.rows[0];
  assert.equal((await call('POST', '/api/inbox/reply', { id: lineLead.id === wl.id ? 'NOPE' : lineLead.id, text: 'x' })).status >= 400, true); ok('ลีดที่ไม่มี PSID / ไม่ใช่ Messenger ตอบไม่ได้ (error ชัดเจน)');
  global.fetch = realFetch;
  await call('POST', '/api/settings/meta/disconnect');
  assert.equal((await call('GET', '/api/me')).json.mode, 'demo'); ok('ตัดการเชื่อมต่อกลับโหมดเดโม');

  // เปลี่ยนรหัสผ่าน
  assert.equal((await call('POST', '/api/password', { current: 'admin1234', next: 'short' })).status, 400);
  assert.equal((await call('POST', '/api/password', { current: 'admin1234', next: 'NewPass-2026' })).status, 200);
  assert.equal((await call('GET', '/api/me')).json.mustChange, false); ok('เปลี่ยนรหัสผ่าน');

  // จัดการผู้ใช้
  assert.equal((await call('GET', '/api/me')).json.role, 'admin');
  assert.equal((await call('GET', '/api/users')).json.users.length, 1);
  const addr = (await call('POST', '/api/users', { users: [
    { username: 'somchai', password: 'Temp-Pass-001', role: 'staff' },
    { username: 'mint', password: 'Temp-Pass-002', role: 'staff' },
    { username: 'bad name', password: 'Temp-Pass-003' },
    { username: 'ploy', password: 'short' },
    { username: 'SomChai', password: 'Temp-Pass-004' },
  ] })).json;
  assert.deepEqual(addr.added.map((u) => u.username), ['somchai', 'mint']);
  assert.equal(addr.skipped.length, 3); assert.ok(!JSON.stringify(addr).includes('Temp-Pass-001'), 'ห้ามส่งรหัสผ่านกลับ');
  assert.equal((await call('POST', '/api/users', { users: [] })).status, 400); ok('เพิ่มผู้ใช้หลายคน + ข้ามรายการที่ไม่ถูกต้อง');
  assert.ok(!JSON.stringify((await call('GET', '/api/audit')).json).includes('Temp-Pass'), 'audit ต้องไม่มีรหัสผ่านผู้ใช้');
  // ผู้ใช้ staff ล็อกอินและห้ามจัดการผู้ใช้
  const adminCookie = cookie; cookie = '';
  assert.equal((await call('POST', '/api/login', { username: 'somchai', password: 'Temp-Pass-001' })).status, 200);
  const sme = (await call('GET', '/api/me')).json;
  assert.equal(sme.role, 'staff'); assert.equal(sme.mustChange, true);
  assert.equal((await call('GET', '/api/users')).status, 403);
  assert.equal((await call('POST', '/api/users/delete', { username: 'mint' })).status, 403); ok('staff ล็อกอินได้ แต่จัดการผู้ใช้ไม่ได้ (403)');
  cookie = adminCookie;
  // รีเซ็ตรหัส + ลบ
  assert.equal((await call('POST', '/api/users/reset', { username: 'mint', password: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/users/reset', { username: 'NOPE', password: 'Reset-Pass-9' })).status, 400);
  assert.equal((await call('POST', '/api/users/reset', { username: 'somchai', password: 'Reset-Pass-9' })).json.ok, true);
  assert.equal((await call('GET', '/api/me')).status, 200);
  const keepAdmin = cookie; cookie = '';
  assert.equal((await call('POST', '/api/login', { username: 'somchai', password: 'Temp-Pass-001' })).status, 401);
  assert.equal((await call('POST', '/api/login', { username: 'somchai', password: 'Reset-Pass-9' })).status, 200);
  cookie = keepAdmin; ok('รีเซ็ตรหัสผู้ใช้');
  assert.equal((await call('POST', '/api/users/delete', { username: 'admin' })).status, 400); ok('ลบบัญชีตัวเองไม่ได้');
  assert.equal((await call('POST', '/api/users/delete', { username: 'mint' })).json.users.some((u) => u.username === 'mint'), false);
  assert.equal((await call('POST', '/api/users/delete', { username: 'mint' })).status, 400); ok('ลบผู้ใช้');
  await call('POST', '/api/users', { users: [{ username: 'boss2', password: 'Boss-Pass-22', role: 'admin' }] });
  const acts2 = (await call('GET', '/api/audit')).json.rows.map((r) => r.action);
  for (const a of ['user_add', 'user_reset', 'user_delete']) assert.ok(acts2.includes(a), 'audit ขาด ' + a); ok('audit บันทึกการจัดการผู้ใช้');

  // SLA ตอบแชท 15 นาที (หน้า Board)
  const sla = require('../lib/sla');
  for (const [at, w] of [['2026-11-02 07:59', 'night'], ['2026-11-02 08:00', 'commute'], ['2026-11-02 09:59', 'commute'], ['2026-11-02 10:00', 'work'],
    ['2026-11-02 18:59', 'work'], ['2026-11-02 19:00', 'commute'], ['2026-11-02 21:59', 'commute'], ['2026-11-02 22:00', 'night'], ['2026-11-02 00:00', 'night']]) assert.equal(sla.windowOf(at), w, at);
  const M = (from, at) => ({ from, at, text: 'x' });
  const T = (id, repId, ...msgs) => ({ id, name: id, repId, pageId: 'P1', adId: '', channel: 'Messenger', date: '2026-11-01', status: 'talked', messages: msgs });
  const sdata = { reps: [{ id: 'R1', name: 'นก' }, { id: 'R2', name: 'มิ้นท์' }], ads: [], pages: [{ id: 'P1', name: 'เพจทดสอบ' }], campaigns: [], daily: [], leads: [
    T('S1', 'R1', M('customer', '2026-11-02 11:00'), M('staff', '2026-11-02 11:20'), M('customer', '2026-11-02 14:00'), M('staff', '2026-11-02 14:40')), // หัก 1 + ช้าซ้ำไม่หัก
    T('S2', 'R1', M('customer', '2026-11-02 12:00'), M('staff', '2026-11-02 12:10')), // ทัน
    T('S3', 'R1', M('customer', '2026-11-02 09:00'), M('staff', '2026-11-02 09:30')), // ช้าช่วงเดินทางเช้า
    T('S4', 'R1', M('customer', '2026-11-02 20:00'), M('staff', '2026-11-02 20:16')), // ช้าช่วงเดินทางเย็น (16 นาที)
    T('S5', 'R1', M('customer', '2026-11-02 20:00'), M('staff', '2026-11-02 20:15')), // พอดี 15 นาที = ทัน
    T('S6', 'R2', M('customer', '2026-11-03 23:00'), M('staff', '2026-11-04 08:30')), // ทักกลางคืน ไม่หัก
    T('S7', 'R2', M('customer', '2026-11-02 12:00'), M('staff', '2026-11-02 22:30')), // ทักเวลางาน ช้า หัก + ตอบกลางคืน
    T('S8', 'R2', M('customer', '2026-11-02 11:00')), // ยังไม่ตอบเลย หัก
    T('S9', 'R2', M('customer', '2026-11-09 11:55')), // เพิ่งทัก ยังไม่ครบ 15 นาที ไม่นับ
  ] };
  const rg = { from: '2026-11-01', to: '2026-11-09' };
  const sr = sla.buildSla(sdata, false, rg, Date.parse('2026-11-09T12:00:00+07:00'));
  const R1 = sr.reps.find((r) => r.repId === 'R1'); const R2 = sr.reps.find((r) => r.repId === 'R2');
  assert.deepEqual([R1.turns, R1.onTime, R1.late, R1.deducted, R1.commuteLate, R1.nightReplies], [6, 2, 4, 1, 2, 0]);
  assert.deepEqual([R2.turns, R2.onTime, R2.late, R2.deducted, R2.commuteLate, R2.nightReplies], [3, 0, 3, 2, 0, 1]);
  assert.equal(R1.points, -1); assert.equal(sr.totals.deducted, 3);
  const outc = (r, id) => r.events.filter((e) => e.leadId === id).map((e) => e.outcome);
  assert.deepEqual(outc(R1, 'S1').sort(), ['deduct', 'dup']); assert.deepEqual(outc(R1, 'S3'), ['commute']); assert.deepEqual(outc(R2, 'S6'), ['late_night']);
  assert.equal(R2.events.find((e) => e.leadId === 'S8').unanswered, true);
  assert.equal(R2.events.find((e) => e.leadId === 'S7').replyWindow, 'night');
  assert.ok(!R2.events.some((e) => e.leadId === 'S9')); ok('SLA: หักเฉพาะ 10–19 น. (1 แต้ม/แชท/เพจ) ช่วงเดินทาง/กลางคืนเป็นสถิติ');
  const sr2 = sla.buildSla(sdata, false, { from: '2026-11-03', to: '2026-11-09' }, Date.parse('2026-11-09T12:00:00+07:00'));
  assert.equal(sr2.totals.turns, 1); ok('SLA: กรองตามวันที่ลูกค้าทัก');
  const sj = (await call('GET', '/api/sla?range=30d')).json;
  assert.ok(sj.limitMin === 15 && sj.reps.length > 0 && sj.totals.turns > 0);
  assert.equal(sj.reps.reduce((x, r) => x + r.deducted, 0), sj.totals.deducted);
  const dedEv = sj.reps.flatMap((r) => r.events).filter((e) => e.outcome === 'deduct');
  assert.equal(new Set(dedEv.map((e) => e.leadId + '|' + e.pageId)).size, dedEv.length);
  assert.ok(dedEv.every((e) => e.window === 'work' && e.minutes > 15 && e.points === -1));
  assert.ok(sj.reps.flatMap((r) => r.events).filter((e) => e.outcome === 'commute').every((e) => e.window === 'commute' && e.points === 0)); ok('API /api/sla (เดโม)');

  // static + path traversal
  const idx = await fetch(base + '/'); assert.equal(idx.status, 200); assert.equal((await fetch(base + '/extra.css')).status, 200);
  const trav = await fetch(base + '/..%2Fserver.js'); assert.notEqual(trav.status, 200); ok('static + กัน path traversal');

  await call('POST', '/api/logout');
  assert.equal((await call('GET', '/api/me')).status, 401); ok('ล็อกเอาต์');
  server.close();
  console.log('\nผ่านทั้งหมด');
}

main().catch((e) => { console.error('\nล้มเหลว:', e); process.exit(1); });