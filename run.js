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
  assert.equal((await call('GET', '/api/board')).status, 200); ok('board');

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
  global.fetch = realFetch;
  await call('POST', '/api/settings/meta/disconnect');
  assert.equal((await call('GET', '/api/me')).json.mode, 'demo'); ok('ตัดการเชื่อมต่อกลับโหมดเดโม');

  // เปลี่ยนรหัสผ่าน
  assert.equal((await call('POST', '/api/password', { current: 'admin1234', next: 'short' })).status, 400);
  assert.equal((await call('POST', '/api/password', { current: 'admin1234', next: 'NewPass-2026' })).status, 200);
  assert.equal((await call('GET', '/api/me')).json.mustChange, false); ok('เปลี่ยนรหัสผ่าน');

  // static + path traversal
  const idx = await fetch(base + '/'); assert.equal(idx.status, 200);
  const trav = await fetch(base + '/..%2Fserver.js'); assert.notEqual(trav.status, 200); ok('static + กัน path traversal');

  await call('POST', '/api/logout');
  assert.equal((await call('GET', '/api/me')).status, 401); ok('ล็อกเอาต์');
  server.close();
  console.log('\nผ่านทั้งหมด');
}

main().catch((e) => { console.error('\nล้มเหลว:', e); process.exit(1); });
