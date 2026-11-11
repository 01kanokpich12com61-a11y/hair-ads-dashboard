'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./lib/config');
const auth = require('./lib/auth');
const store = require('./lib/store');
const meta = require('./lib/meta');
const providers = require('./lib/providers');
const ops = require('./lib/ops');
const audit = require('./lib/audit');
const sla = require('./lib/sla');
const { resolveRange, isDate } = require('./lib/dates');
const { buildDashboard, buildBoard, buildInbox, leadRow, listFilters } = require('./lib/metrics');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reject(Object.assign(new Error('Content-Type ต้องเป็น application/json'), { status: 415 }));
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100_000) { reject(Object.assign(new Error('ข้อมูลใหญ่เกินไป'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON ไม่ถูกต้อง'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const clean = (v, max = 400) => String(v ?? '').trim().slice(0, max);

function clientIp(req) {
  if (config.trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}

function readRaw(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('ข้อมูลใหญ่เกินไป'), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Verify Token สำหรับ Webhook: สร้างอัตโนมัติครั้งแรก
function webhookToken() {
  const m = meta.getSettings().meta || {};
  if (m.webhookVerifyToken) return m.webhookVerifyToken;
  const t = crypto.randomBytes(16).toString('hex');
  meta.saveSettings({ meta: { webhookVerifyToken: t } });
  return t;
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// รับข้อความจาก Meta Webhook (Messenger) แล้วบันทึกเป็นแชท
async function handleWebhook(body) {
  if (body.object !== 'page') return;
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      const msg = ev.message;
      if (!msg || (!msg.text && !(msg.attachments && msg.attachments.length))) continue;
      const echo = Boolean(msg.is_echo); // ข้อความที่เพจส่งออกเอง (เช่นตอบจาก Business Suite)
      const pageId = String(echo ? ev.sender.id : ev.recipient.id);
      const psid = String(echo ? ev.recipient.id : ev.sender.id);
      const ref = msg.referral || ev.referral || {};
      let lead = (store.read('leads.json', [])).find((l) => l.psid === psid && l.pageId === pageId);
      if (!lead) {
        const name = await meta.fetchProfileName(pageId, psid);
        lead = ops.findOrCreateLead({ psid, pageId, name, adId: ref.ad_id ? String(ref.ad_id) : '' }).lead;
      }
      ops.addMessage(lead.id, {
        from: echo ? 'staff' : 'customer', text: msg.text || '[ไฟล์แนบ]', mid: msg.mid || undefined,
        at: ops.nowStamp(ev.timestamp || Date.now()), via: 'webhook',
      });
    }
  }
}

function publicSettings() {
  const s = meta.getSettings();
  const m = s.meta || {};
  return {
    mode: providers.currentMode(),
    clinicName: s.clinicName || 'Hairlab Clinic',
    meta: {
      appId: m.appId || '',
      hasSecret: Boolean(m.appSecret),
      hasToken: Boolean(m.accessToken),
      tokenHint: m.accessToken ? `••••${m.accessToken.slice(-4)}` : '',
      adAccountId: m.adAccountId || '',
      apiVersion: m.apiVersion || config.metaApiVersion,
      accountName: m.accountName || '',
      currency: m.currency || '',
      connectedAt: m.connectedAt || null,
    },
    webhook: { path: '/webhook', verifyToken: webhookToken(), hasSecret: Boolean(m.appSecret) },
  };
}

async function api(req, res, url, session) {
  const route = `${req.method} ${url.pathname}`;
  const q = Object.fromEntries(url.searchParams);

  if (route === 'GET /api/me') {
    return send(res, 200, {
      username: session.user.username, mustChange: Boolean(session.user.mustChange),
      role: auth.isAdmin(session.user) ? 'admin' : 'staff',
      mode: providers.currentMode(), clinicName: publicSettings().clinicName,
    });
  }

  /* ---------- จัดการผู้ใช้ (เฉพาะ admin) ---------- */
  if (url.pathname === '/api/users' || url.pathname.startsWith('/api/users/')) {
    if (!auth.isAdmin(session.user)) return send(res, 403, { error: 'เฉพาะผู้ดูแล (admin) เท่านั้น' });

    if (route === 'GET /api/users') return send(res, 200, { users: auth.listUsers() });

    if (route === 'POST /api/users') {
      const b = await readJson(req);
      const items = Array.isArray(b.users) ? b.users.slice(0, 100) : [];
      if (!items.length) return send(res, 400, { error: 'ไม่มีรายชื่อผู้ใช้ที่จะเพิ่ม' });
      const out = auth.addUsers(items);
      // ไม่บันทึกรหัสผ่านลง audit
      if (out.added.length) audit.log(session.user.username, 'user_add', out.added.map((u) => `${u.username} (${u.role})`).join(', '), clientIp(req));
      return send(res, 200, { ok: true, ...out, users: auth.listUsers() });
    }

    if (route === 'POST /api/users/reset') {
      const b = await readJson(req);
      const err = auth.resetPassword(clean(b.username, 60), String(b.password || ''));
      if (err) return send(res, 400, { error: err });
      audit.log(session.user.username, 'user_reset', clean(b.username, 60), clientIp(req));
      return send(res, 200, { ok: true });
    }

    if (route === 'POST /api/users/delete') {
      const b = await readJson(req);
      const err = auth.deleteUser(clean(b.username, 60), session.user.username);
      if (err) return send(res, 400, { error: err });
      audit.log(session.user.username, 'user_delete', clean(b.username, 60), clientIp(req));
      return send(res, 200, { ok: true, users: auth.listUsers() });
    }
  }

  if (route === 'GET /api/filters') {
    const range = resolveRange({ range: '30d' });
    return send(res, 200, listFilters(await providers.load(range)));
  }

  if (route === 'GET /api/dashboard') {
    if (q.refresh) meta.clearCache();
    const range = resolveRange(q);
    const data = await providers.load(range);
    return send(res, 200, { mode: providers.currentMode(), ...buildDashboard(data, range, q) });
  }

  if (route === 'GET /api/board') {
    const range = resolveRange(q);
    return send(res, 200, { mode: providers.currentMode(), ...buildBoard(await providers.load(range), range) });
  }

  if (route === 'GET /api/sla') {
    const range = resolveRange(q);
    const data = await providers.load(range);
    return send(res, 200, { mode: providers.currentMode(), ...sla.buildSla(data, providers.currentMode() === 'demo', range) });
  }

  if (route === 'GET /api/inbox') {
    const range = resolveRange(q);
    const data = await providers.load(range);
    const out = buildInbox(data, range);
    const isDemo = providers.currentMode() === 'demo';
    const byId = new Map(data.leads.map((l) => [l.id, l]));
    const overlay = store.read('messages.json', {});
    for (const r of out.rows) {
      const l = byId.get(r.id);
      const msgs = ops.messagesFor(l, data, isDemo, overlay);
      r.last = msgs.length ? msgs[msgs.length - 1] : null; // ข้อความล่าสุด ใช้แสดงในรายการแชท
    }
    out.rows.sort((a, b) => {
      const x = a.last ? a.last.at : a.date; const y = b.last ? b.last.at : b.date;
      return x === y ? 0 : x < y ? 1 : -1;
    });
    return send(res, 200, { mode: providers.currentMode(), ...out });
  }

  if (route === 'GET /api/inbox/chat') {
    const data = await providers.load(resolveRange({ range: '90d' }));
    const lead = data.leads.find((l) => l.id === q.id);
    if (!lead) return send(res, 404, { error: 'ไม่พบแชทนี้' });
    const isDemo = providers.currentMode() === 'demo';
    // โหมด Meta: ข้อความมาจาก Webhook หรือฟิลด์ messages ของลีด ถ้ายังไม่ได้ต่อจะว่าง
    const messages = ops.messagesFor(lead, data, isDemo);
    return send(res, 200, {
      demo: isDemo, lead: leadRow(data, lead), messages,
      review: ops.getReview(lead.id), followup: ops.getFollowup(lead.id),
    });
  }

  if (route === 'POST /api/inbox/reply') {
    const b = await readJson(req);
    const text = clean(b.text, 2000);
    if (!text) return send(res, 400, { error: 'กรุณาพิมพ์ข้อความ' });
    const data = await providers.load(resolveRange({ range: '90d' }));
    const lead = data.leads.find((l) => l.id === b.id);
    if (!lead) return send(res, 404, { error: 'ไม่พบแชทนี้' });
    const isDemo = providers.currentMode() === 'demo';
    const msgs = ops.messagesFor(lead, data, isDemo);
    let mid;
    if (!isDemo) {
      const lastCustomer = [...msgs].reverse().find((m) => m.from === 'customer');
      try { ({ mid } = await meta.sendMessage(lead, text, lastCustomer && lastCustomer.at)); }
      catch (e) {
        audit.log(session.user.username, 'reply_failed', `${lead.id} ${lead.name}: ${e.message}`, clientIp(req));
        return send(res, 502, { error: e.message });
      }
    }
    // ไม่ให้ข้อความใหม่มีเวลาก่อนข้อความล่าสุด (เช่นข้อมูลเดโมที่สร้างล่วงหน้า)
    const lastAt = msgs.length ? msgs[msgs.length - 1].at : '';
    const now = ops.nowStamp();
    const message = { from: 'staff', text, at: now < lastAt ? lastAt : now, by: session.user.username, ...(mid ? { mid } : {}) };
    ops.addMessage(lead.id, message);
    audit.log(session.user.username, 'reply_sent', `${lead.id} ${lead.name} (${isDemo ? 'เดโม ไม่ได้ส่งจริง' : 'ส่งผ่าน Meta'}) ${text.length} ตัวอักษร`, clientIp(req));
    return send(res, 200, { ok: true, delivered: isDemo ? 'demo' : 'meta', message });
  }

  if (route === 'POST /api/lead/status') {
    const b = await readJson(req);
    if (!ops.STATUSES.includes(b.status)) return send(res, 400, { error: 'สถานะไม่ถูกต้อง' });
    const data = await providers.load(resolveRange({ range: '90d' }));
    const lead = data.leads.find((l) => l.id === b.id);
    if (!lead) return send(res, 404, { error: 'ไม่พบแชทนี้' });
    if (lead.status !== b.status) {
      ops.setStatus(lead.id, b.status);
      audit.log(session.user.username, 'status_change', `${lead.id} ${lead.name}: ${lead.status} → ${b.status}`, clientIp(req));
    }
    return send(res, 200, { ok: true, status: b.status });
  }

  if (route === 'GET /api/followups') {
    const data = await providers.load(resolveRange({ range: '90d' }));
    return send(res, 200, { mode: providers.currentMode(), ...ops.buildFollowups(data, providers.currentMode() === 'demo', q) });
  }

  if (route === 'POST /api/followups') {
    const b = await readJson(req);
    if (!isDate(b.dueDate)) return send(res, 400, { error: 'วันที่นัดไม่ถูกต้อง' });
    const data = await providers.load(resolveRange({ range: '90d' }));
    const lead = data.leads.find((l) => l.id === b.id);
    if (!lead) return send(res, 404, { error: 'ไม่พบแชทนี้' });
    const fu = ops.setFollowup(lead.id, { dueDate: b.dueDate, note: clean(b.note, 300) }, session.user.username);
    audit.log(session.user.username, 'followup_set', `${lead.id} ${lead.name}: นัด ${fu.dueDate}${fu.note ? ' — ' + fu.note : ''}`, clientIp(req));
    return send(res, 200, { ok: true, followup: fu });
  }

  if (route === 'POST /api/followups/done') {
    const b = await readJson(req);
    const fu = ops.doneFollowup(String(b.id || ''), session.user.username);
    if (!fu) return send(res, 404, { error: 'ไม่พบนัดตามลูกค้านี้' });
    audit.log(session.user.username, 'followup_done', `${b.id}`, clientIp(req));
    return send(res, 200, { ok: true, followup: fu });
  }

  if (route === 'GET /api/review') {
    const range = resolveRange(q);
    return send(res, 200, { mode: providers.currentMode(), ...ops.buildReview(await providers.load(range), range, q) });
  }

  if (route === 'POST /api/review') {
    const b = await readJson(req);
    const data = await providers.load(resolveRange({ range: '90d' }));
    const lead = data.leads.find((l) => l.id === b.id);
    if (!lead) return send(res, 404, { error: 'ไม่พบแชทนี้' });
    const r = ops.saveReview(lead.id, b.scores, b.note, session.user.username);
    if (r.error) return send(res, 400, { error: r.error });
    audit.log(session.user.username, 'review_save', `${lead.id} ${lead.name}: ${r.review.score}%`, clientIp(req));
    return send(res, 200, { ok: true, review: r.review });
  }

  if (route === 'POST /api/upload/leads') {
    if (!auth.isAdmin(session.user)) return send(res, 403, { error: 'เฉพาะผู้ดูแล (admin) เท่านั้น' });
    const b = await readJson(req);
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
    if (!rows.length) return send(res, 400, { error: 'ไม่มีข้อมูลที่จะนำเข้า' });
    const existing = store.read('leads.json', []);
    const CHANNELS = ['Messenger', 'LINE', 'Instagram', 'WhatsApp'];
    const added = []; const errors = [];
    for (const [i, r] of rows.entries()) {
      const name = clean(r.name, 100);
      const channel = CHANNELS.includes(r.channel) ? r.channel : 'Messenger';
      const adId = clean(r.adId, 50);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) ? r.date : null;
      if (!name) { errors.push({ row: i + 1, reason: 'ชื่อว่าง' }); continue; }
      if (!date) { errors.push({ row: i + 1, reason: 'วันที่ไม่ถูกต้อง' }); continue; }
      const id = `U-${Date.now().toString(36)}-${String(i).padStart(3, '0')}`;
      const lead = {
        id, name, channel, adId: adId || '', date,
        repId: clean(r.repId || r.rep, 30) || '',
        status: 'talked', quality: 'average', value: 0, firstResponseMin: null, dropReason: null,
      };
      existing.push(lead);
      added.push(lead);
    }
    if (added.length) store.write('leads.json', existing);
    audit.log(session.user.username, 'leads_upload', `นำเข้า ${added.length} leads`, clientIp(req));
    return send(res, 200, { ok: true, added: added.length, errors });
  }

  if (route === 'GET /api/upload/history') {
    const logs = (store.read('audit.json', [])).filter((l) => l.action === 'leads_upload').slice(-20).reverse();
    const history = logs.map((l) => ({
      at: l.at,
      user: l.user,
      count: parseInt((l.detail || '0').match(/\d+/)?.[0] || '0', 10),
    }));
    return send(res, 200, { history });
  }

  if (route === 'GET /api/audit') {
    return send(res, 200, audit.query({ ...q, limit: Math.min(Number(q.limit) || 100, 500), offset: Math.max(Number(q.offset) || 0, 0) }));
  }

  if (route === 'GET /api/audit/export') {
    const out = audit.query({ ...q, limit: 5000, offset: 0 });
    return send(res, 200, audit.toCsv(out.rows), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audit-log.csv"' });
  }

  if (route === 'GET /api/settings') return send(res, 200, publicSettings());

  if (route === 'PUT /api/settings/meta') {
    const b = await readJson(req);
    const cur = meta.getSettings().meta || {};
    const next = {
      appId: clean(b.appId, 40),
      adAccountId: clean(b.adAccountId, 40),
      apiVersion: /^v\d+\.\d+$/.test(clean(b.apiVersion, 10)) ? clean(b.apiVersion, 10) : config.metaApiVersion,
    };
    // ค่าลับจะถูกเขียนทับเฉพาะเมื่อกรอกค่าใหม่เท่านั้น
    if (clean(b.appSecret, 200)) next.appSecret = clean(b.appSecret, 200);
    if (clean(b.accessToken, 1000)) next.accessToken = clean(b.accessToken, 1000);
    if (next.accessToken && next.accessToken !== cur.accessToken) { next.connectedAt = null; next.accountName = ''; }
    meta.saveSettings({ clinicName: clean(b.clinicName, 80) || undefined, meta: next });
    meta.clearCache();
    const changed = [next.accessToken && next.accessToken !== cur.accessToken ? 'token' : '', next.appSecret ? 'app secret' : ''].filter(Boolean);
    audit.log(session.user.username, 'settings_save', `Ad Account ${next.adAccountId || '—'}${changed.length ? ' · เปลี่ยน ' + changed.join(', ') : ''}`, clientIp(req));
    return send(res, 200, publicSettings());
  }

  if (route === 'POST /api/settings/meta/test') {
    const m = meta.getSettings().meta || {};
    try {
      const info = await meta.testConnection(m);
      meta.saveSettings({ meta: { accountName: info.name, currency: info.currency, connectedAt: new Date().toISOString() } });
      audit.log(session.user.username, 'meta_test', `สำเร็จ: ${info.name}`, clientIp(req));
      return send(res, 200, { ok: true, account: info, settings: publicSettings() });
    } catch (e) {
      audit.log(session.user.username, 'meta_test', `ไม่สำเร็จ: ${e.message}`, clientIp(req));
      return send(res, 200, { ok: false, error: e.message });
    }
  }

  if (route === 'POST /api/settings/meta/extend') {
    const m = meta.getSettings().meta || {};
    if (!m.appId || !m.appSecret || !m.accessToken) return send(res, 400, { error: 'ต้องกรอก App ID, App Secret และ Access Token ก่อน' });
    try {
      const token = await meta.exchangeLongLived(m);
      meta.saveSettings({ meta: { accessToken: token } });
      audit.log(session.user.username, 'meta_extend', 'แลกเป็น token อายุยาว', clientIp(req));
      return send(res, 200, { ok: true, settings: publicSettings() });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }

  if (route === 'POST /api/settings/meta/disconnect') {
    const s = meta.getSettings();
    store.write('settings.json', { ...s, mode: 'demo', meta: {} });
    meta.clearCache();
    audit.log(session.user.username, 'meta_disconnect', 'ลบ token และกลับโหมดเดโม', clientIp(req));
    return send(res, 200, publicSettings());
  }

  if (route === 'POST /api/settings/mode') {
    const b = await readJson(req);
    const m = meta.getSettings().meta || {};
    if (b.mode === 'meta' && !m.connectedAt) return send(res, 400, { error: 'ต้องทดสอบการเชื่อมต่อ Meta ให้สำเร็จก่อน' });
    meta.saveSettings({ mode: b.mode === 'meta' ? 'meta' : 'demo' });
    audit.log(session.user.username, 'mode_change', `เปลี่ยนเป็นโหมด ${b.mode === 'meta' ? 'Meta' : 'เดโม'}`, clientIp(req));
    return send(res, 200, publicSettings());
  }

  if (route === 'POST /api/password') {
    const b = await readJson(req);
    const err = auth.changePassword(session.user.username, b.current, b.next);
    if (err) return send(res, 400, { error: err });
    audit.log(session.user.username, 'password_change', 'เปลี่ยนรหัสผ่านของตัวเอง', clientIp(req));
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'ไม่พบ API นี้' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(config.publicDir, rel));
  if (!file.startsWith(config.publicDir + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const ip = clientIp(req);

    // Webhook จาก Meta (ไม่ใช้ session แต่ตรวจลายเซ็น X-Hub-Signature-256 ด้วย App Secret)
    if (url.pathname === '/webhook') {
      if (req.method === 'GET') {
        const okTok = url.searchParams.get('hub.mode') === 'subscribe' && safeEq(url.searchParams.get('hub.verify_token') || '', webhookToken());
        if (!okTok) { audit.log('meta-webhook', 'webhook_rejected', 'Verify Token ไม่ถูกต้อง', ip); return send(res, 403, 'Forbidden'); }
        return send(res, 200, clean(url.searchParams.get('hub.challenge'), 100));
      }
      if (req.method === 'POST') {
        const raw = await readRaw(req);
        const secret = (meta.getSettings().meta || {}).appSecret;
        const sig = String(req.headers['x-hub-signature-256'] || '');
        const good = secret && safeEq(sig, 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'));
        if (!good) { audit.log('meta-webhook', 'webhook_rejected', secret ? 'ลายเซ็นไม่ถูกต้อง' : 'ยังไม่ได้บันทึก App Secret', ip); return send(res, 403, 'Forbidden'); }
        let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, 'Bad request'); }
        try { await handleWebhook(body); } catch (e) { console.error('webhook', e); }
        return send(res, 200, 'EVENT_RECEIVED'); // ตอบ 200 เสมอเมื่อลายเซ็นถูก เพื่อไม่ให้ Meta ส่งซ้ำ
      }
      return send(res, 405, 'Method not allowed');
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const b = await readJson(req);
      const r = auth.login(b.username, b.password, ip);
      if (r.error) { audit.log(clean(b.username, 60) || '—', 'login_failed', r.error, ip); return send(res, r.status, { error: r.error }); }
      audit.log(r.user.username, 'login', 'เข้าสู่ระบบสำเร็จ', ip);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(r.token, 12 * 3600) });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const s = auth.getSession(req);
      if (s) { auth.destroy(s.token); audit.log(s.user.username, 'logout', 'ออกจากระบบ', ip); }
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader('', 0) });
    }

    if (url.pathname.startsWith('/api/')) {
      const session = auth.getSession(req);
      if (!session) return send(res, 401, { error: 'กรุณาเข้าสู่ระบบ' });
      return await api(req, res, url, session);
    }

    return serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? 'เกิดข้อผิดพลาดภายในระบบ' : e.message });
  }
});

if (require.main === module) {
  const created = auth.ensureAdmin();
  server.listen(config.port, config.host, () => {
    console.log(`\n  Hair Clinic Ads Dashboard → http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    if (created) console.log(`  สร้างผู้ใช้ "${config.adminUser}" แล้ว${config.usingDefaultPassword ? ' (รหัสผ่านเริ่มต้น: admin1234 — ระบบจะให้เปลี่ยนหลังล็อกอิน)' : ''}`);
    console.log(`  โหมดข้อมูล: ${providers.currentMode() === 'meta' ? 'Meta' : 'Demo'}\n`);
  });
}

module.exports = { server };