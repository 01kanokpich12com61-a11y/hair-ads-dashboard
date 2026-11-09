'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./lib/config');
const auth = require('./lib/auth');
const store = require('./lib/store');
const meta = require('./lib/meta');
const providers = require('./lib/providers');
const { resolveRange } = require('./lib/dates');
const { buildDashboard, buildBoard, listFilters } = require('./lib/metrics');

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

function publicSettings() {
  const s = meta.getSettings();
  const m = s.meta || {};
  return {
    mode: providers.currentMode(),
    clinicName: s.clinicName || 'BEQ GROUP',
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
  };
}

async function api(req, res, url, session) {
  const route = `${req.method} ${url.pathname}`;
  const q = Object.fromEntries(url.searchParams);

  if (route === 'GET /api/me') {
    return send(res, 200, {
      username: session.user.username, mustChange: Boolean(session.user.mustChange),
      mode: providers.currentMode(), clinicName: publicSettings().clinicName,
    });
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
    const range = resolveRange({ range: q.range || '30d' });
    return send(res, 200, { mode: providers.currentMode(), ...buildBoard(await providers.load(range), range) });
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
    return send(res, 200, publicSettings());
  }

  if (route === 'POST /api/settings/meta/test') {
    const m = meta.getSettings().meta || {};
    try {
      const info = await meta.testConnection(m);
      meta.saveSettings({ meta: { accountName: info.name, currency: info.currency, connectedAt: new Date().toISOString() } });
      return send(res, 200, { ok: true, account: info, settings: publicSettings() });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }

  if (route === 'POST /api/settings/meta/extend') {
    const m = meta.getSettings().meta || {};
    if (!m.appId || !m.appSecret || !m.accessToken) return send(res, 400, { error: 'ต้องกรอก App ID, App Secret และ Access Token ก่อน' });
    try {
      const token = await meta.exchangeLongLived(m);
      meta.saveSettings({ meta: { accessToken: token } });
      return send(res, 200, { ok: true, settings: publicSettings() });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }

  if (route === 'POST /api/settings/meta/disconnect') {
    const s = meta.getSettings();
    store.write('settings.json', { ...s, mode: 'demo', meta: {} });
    meta.clearCache();
    return send(res, 200, publicSettings());
  }

  if (route === 'POST /api/settings/mode') {
    const b = await readJson(req);
    const m = meta.getSettings().meta || {};
    if (b.mode === 'meta' && !m.connectedAt) return send(res, 400, { error: 'ต้องทดสอบการเชื่อมต่อ Meta ให้สำเร็จก่อน' });
    meta.saveSettings({ mode: b.mode === 'meta' ? 'meta' : 'demo' });
    return send(res, 200, publicSettings());
  }

  if (route === 'POST /api/password') {
    const b = await readJson(req);
    const err = auth.changePassword(session.user.username, b.current, b.next);
    return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
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
    const ip = req.socket.remoteAddress || 'unknown';

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const b = await readJson(req);
      const r = auth.login(b.username, b.password, ip);
      if (r.error) return send(res, r.status, { error: r.error });
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(r.token, 12 * 3600) });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const s = auth.getSession(req);
      if (s) auth.destroy(s.token);
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
    console.log(`\n  BEQ GROUP Ads Dashboard → http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    if (created) console.log(`  สร้างผู้ใช้ "${config.adminUser}" แล้ว${config.usingDefaultPassword ? ' (รหัสผ่านเริ่มต้น: admin1234 — ระบบจะให้เปลี่ยนหลังล็อกอิน)' : ''}`);
    console.log(`  โหมดข้อมูล: ${providers.currentMode() === 'meta' ? 'Meta' : 'Demo'}\n`);
  });
}

module.exports = { server };