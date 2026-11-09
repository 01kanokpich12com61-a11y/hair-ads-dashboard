(() => {
  'use strict';

  const $app = document.getElementById('app');

  /* ---------------- state ---------------- */
  const S = {
    me: null, booted: false, filters: null, route: 'dashboard', menu: null,
    dash: { range: '30d', from: '', to: '', page: '', campaign: '', agency: '', rep: '', status: '', tab: 'ads',
      data: null, loading: false, err: null, sort: 'spend', dir: 'desc', search: '', pageNo: 1 },
    settings: null, board: null, flash: null, loginErr: '',
  };
  const PAGE_SIZE = 8;
  let reqSeq = 0;
  const CHARTS = {};

  /* ---------------- helpers ---------------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 0) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const baht = (n) => (n === null || n === undefined ? '—' : '฿' + num(n, 2));
  const pct = (n) => (n === null || n === undefined ? '—' : num(n, 2) + '%');

  const ICONS = {
    logo: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    bars: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    filter: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    down: '<path d="M7 7l10 10"/><path d="M17 8v9H8"/>',
    up: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    c_video: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    c_image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    c_carousel: '<rect x="7" y="5" width="10" height="14" rx="2"/><path d="M3.5 8v8M20.5 8v8"/>',
    c_story: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  };

  // เส้นผมแบบนามธรรม ใช้เป็นพื้นหลังของแถบสรุปและหน้าล็อกอิน
  function strandsSvg(count, opacity) {
    let p = '';
    for (let i = 0; i < count; i++) {
      const x = (i / (count - 1)) * 1000;
      const sway = 70 + ((i * 53) % 90);
      const dir = i % 2 ? 1 : -1;
      p += `<path d="M${x.toFixed(0)},620 C${(x + dir * sway).toFixed(0)},430 ${(x - dir * sway * 0.6).toFixed(0)},250 ${(x + dir * sway * 0.9).toFixed(0)},-20" />`;
    }
    return `<svg class="strands" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#fff" stroke-opacity="${opacity}" stroke-width="1.4" stroke-linecap="round">${p}</g></svg>`;
  }
  const icon = (n) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && path !== '/api/login') { S.me = null; render(); throw new Error('กรุณาเข้าสู่ระบบ'); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
    return json;
  }

  /* ---------------- routing ---------------- */
  const ROUTES = ['dashboard', 'inbox', 'board', 'upload', 'quality', 'setting'];
  function routeFromHash() {
    const r = location.hash.replace(/^#\/?/, '');
    return ROUTES.includes(r) ? r : 'dashboard';
  }
  window.addEventListener('hashchange', () => { S.route = routeFromHash(); S.menu = null; S.flash = null; enterRoute(); });

  function enterRoute() {
    render();
    if (!S.me) return;
    if (S.route === 'dashboard') loadDash();
    if (S.route === 'board') loadBoard();
    if (S.route === 'setting') loadSettings();
  }

  /* ---------------- shell ---------------- */
  function notices() {
    const list = [];
    if (S.me && S.me.mode === 'demo') list.push('กำลังแสดงข้อมูลเดโม — เชื่อม Meta ได้ที่เมนู Setting');
    if (S.me && S.me.mustChange) list.push('ยังใช้รหัสผ่านเริ่มต้นอยู่ กรุณาเปลี่ยนที่เมนู Setting');
    return list;
  }

  function topbar() {
    const nav = [['dashboard', 'Dashboard', 'grid'], ['inbox', 'Inbox', 'chat'], ['board', 'Board', 'grid'],
      ['upload', 'Upload', 'upload'], ['quality', 'Quality', 'shield'], ['setting', 'Setting', 'gear']];
    const pages = (S.filters && S.filters.pages) || [];
    const list = notices();
    return `<header class="topbar">
      <div class="brand"><img class="logo" src="/logo-mark.png" alt="BEQ GROUP" width="42" height="42"><div><b>BEQ GROUP</b><small>Ads Dashboard</small></div></div>
      <nav class="nav">${nav.map(([id, label, ic]) => `<a href="#/${id}" class="${S.route === id ? 'active' : ''}">${icon(ic)}${label}</a>`).join('')}</nav>
      <div class="spacer"></div>
      <div class="pill-select"><select data-bind="header-page" aria-label="Facebook page">
        <option value="">All Facebook pages</option>
        ${pages.map((p) => `<option value="${esc(p.id)}" ${S.dash.page === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select></div>
      <div class="rel"><button class="icon-btn" data-act="menu" data-menu="bell" aria-label="Notifications">${icon('bell')}${list.length ? '<span class="dot"></span>' : ''}</button>
        ${S.menu === 'bell' ? `<div class="popover">${list.length ? list.map((t) => `<div class="item">${esc(t)}</div>`).join('') : '<div class="item">ไม่มีการแจ้งเตือน</div>'}</div>` : ''}</div>
      <div class="rel"><button class="user-btn" data-act="menu" data-menu="user"><span class="avatar">${esc(S.me.username[0])}</span>${esc(S.me.username)}<span style="opacity:.6">▾</span></button>
        ${S.menu === 'user' ? `<div class="popover"><a class="item" style="display:block">${esc(S.me.clinicName || '')}</a><button data-act="goto" data-to="setting">Setting</button><button data-act="logout">Log out</button></div>` : ''}</div>
    </header>`;
  }

  function render() {
    if (!S.booted) { $app.innerHTML = '<div class="loading">Loading…</div>'; return; }
    if (!S.me) return renderLogin();
    const views = { dashboard: dashShell, board: boardShell, setting: settingShell };
    const body = (views[S.route] || soonShell)();
    $app.innerHTML = topbar() + `<main class="page">${S.me.mustChange && S.route !== 'setting'
      ? '<div class="notice warn banner">ยังใช้รหัสผ่านเริ่มต้นอยู่ — <a href="#/setting">เปลี่ยนรหัสผ่านที่ Setting</a></div>' : ''}${body}</main>`;
    afterRender();
  }

  function afterRender() {
    if (S.route === 'dashboard') renderDashBody();
    if (S.route === 'board') renderBoardBody();
    if (S.route === 'setting') renderSettingBody();
  }

  function soonShell() {
    const name = { inbox: 'Inbox', upload: 'Upload', quality: 'Quality' }[S.route] || S.route;
    return `<div class="page-head"><div><h1>${esc(name)}</h1></div></div>
      <div class="card soon"><b>กำลังพัฒนา</b><p>ส่วนนี้จะใช้ข้อมูลแชทจริงหลังเชื่อม Meta (Messenger/Inbox) แล้ว ตอนนี้ดูภาพรวมได้ที่ Dashboard และ Board</p></div>`;
  }

  /* ---------------- login ---------------- */
  function renderLogin() {
    $app.innerHTML = `<div class="login-split">
      <aside class="login-art">${strandsSvg(26, 0.13)}
        <div class="login-brand"><img src="/logo-mark-white.png" alt="" width="64" height="64"><span>BEQ GROUP</span></div>
        <h2>BEQ GROUP Ads Dashboard</h2>
        </aside>
      <main class="login-pane"><form class="login-card" data-form="login" autocomplete="on">
        <h1>เข้าสู่ระบบ</h1><p>ใช้บัญชีผู้ดูแลของคลินิก</p>
        ${S.loginErr ? `<div class="notice err" style="margin-bottom:14px">${esc(S.loginErr)}</div>` : ''}
        <div class="form">
          <div class="field"><label for="u">ชื่อผู้ใช้</label><input id="u" name="username" type="text" autocomplete="username" autofocus required></div>
          <div class="field"><label for="p">รหัสผ่าน</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn primary" type="submit">เข้าสู่ระบบ</button>
        </div></form></main></div>`;
  }

  /* ---------------- dashboard ---------------- */
  function dashQuery() {
    const d = S.dash;
    const p = new URLSearchParams({ range: d.range });
    if (d.range === 'custom') { p.set('from', d.from); p.set('to', d.to); }
    for (const k of ['page', 'campaign', 'agency', 'rep', 'status']) if (d[k]) p.set(k, d[k]);
    return p.toString();
  }

  async function loadDash(refresh) {
    const d = S.dash;
    if (d.range === 'custom' && !(d.from && d.to)) return;
    const seq = ++reqSeq;
    d.loading = true; d.err = null; renderDashBody();
    try {
      const [data, filters] = await Promise.all([
        api('/api/dashboard?' + dashQuery() + (refresh ? '&refresh=1' : '')),
        S.filters ? Promise.resolve(S.filters) : api('/api/filters'),
      ]);
      if (seq !== reqSeq) return;
      const firstFilters = !S.filters;
      S.filters = filters; d.data = data; d.loading = false; d.pageNo = 1;
      if (firstFilters) render(); else renderDashBody();
    } catch (e) {
      if (seq !== reqSeq) return;
      d.loading = false; d.err = e.message; renderDashBody();
    }
  }

  function selectHtml(bind, label, items, value) {
    return `<div class="sel"><select data-bind="${bind}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>
      ${items.map((i) => `<option value="${esc(i.id ?? i)}" ${(i.id ?? i) === value ? 'selected' : ''}>${esc(i.name ?? cap(i))}</option>`).join('')}</select></div>`;
  }
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  function dashShell() {
    const d = S.dash; const f = S.filters || { pages: [], campaigns: [], agencies: [], reps: [], statuses: [] };
    const data = d.data;
    const customDays = d.from && d.to ? Math.round((Date.parse(d.to) - Date.parse(d.from)) / 864e5) + 1 : 30;
    const days = d.range === 'custom' ? Math.max(1, customDays) : ({ '7d': 7, '30d': 30, '90d': 90 }[d.range] || 30);
    const live = S.me.mode === 'meta';
    return `<div class="page-head"><div>
        <h1>Dashboard ${live ? '<span class="badge-demo" style="background:var(--green-soft);color:var(--green-ink);border-color:#bfe8d3">Live · Meta</span>' : `<span class="badge-demo">${icon('spark')}Demo data</span>`}</h1>
        <div class="meta-line" id="dash-meta"></div></div>
      <button class="btn" data-act="refresh">${icon('refresh')}Refresh</button></div>

      <section class="card filters">
        <div class="seg">${[['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['custom', 'Custom']].map(([k, l]) => `<button data-act="range" data-range="${k}" class="${d.range === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        ${d.range === 'custom' ? `<input class="date-in" type="date" data-bind="from" value="${esc(d.from)}" aria-label="From"><input class="date-in" type="date" data-bind="to" value="${esc(d.to)}" aria-label="To">` : ''}
        <span class="vs">${icon('cal')}vs previous ${days} days</span>
        <span class="label">${icon('filter')}Filters</span>
        ${selectHtml('page', 'All pages', f.pages, d.page)}
        ${selectHtml('campaign', 'All campaigns', f.campaigns, d.campaign)}
        ${selectHtml('agency', 'All agencies', f.agencies, d.agency)}
        ${selectHtml('rep', 'All sales reps', f.reps, d.rep)}
        ${selectHtml('status', 'Any status', f.statuses, d.status)}
        <button class="icon-btn" data-act="reset-filters" aria-label="Reset filters">${icon('reset')}</button>
      </section>

      <nav class="card tabs">${[['ads', 'Ads Performance'], ['chat', 'Ads & Chat'], ['sales', 'Sales Performance'], ['trend', 'Trend'], ['dropped', 'Dropped']]
        .map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${d.tab === k ? 'active' : ''}">${l}</button>`).join('')}</nav>
      <div id="dash-body"></div>`;
  }

  function renderDashBody() {
    if (S.route !== 'dashboard') return;
    const d = S.dash; const box = document.getElementById('dash-body'); if (!box) return;
    const meta = document.getElementById('dash-meta');
    if (meta && d.data) {
      meta.innerHTML = `<span>${icon('cal')}${d.data.range.from} → ${d.data.range.to}</span><span>${icon('bars')}${d.data.scope.ads} ads in scope</span><span>${d.data.scope.leads} leads · ${d.data.scope.records} daily records</span>`;
    }
    if (d.err) { box.innerHTML = `<div class="notice err">${esc(d.err)}</div>`; return; }
    if (!d.data) { box.innerHTML = '<div class="loading">Loading…</div>'; return; }
    box.style.opacity = d.loading ? '.55' : '1';
    const tabs = { ads: tabAds, chat: tabChat, sales: tabSales, trend: tabTrend, dropped: tabDropped };
    // เล่นแอนิเมชันเฉพาะตอนข้อมูลชุดใหม่เข้ามาครั้งแรก ไม่เล่นซ้ำเวลาสลับแท็บ
    d.animKey = `${d.data.range.from}|${d.data.range.to}|${d.page}|${d.campaign}|${d.agency}|${d.rep}|${d.status}|${S.me.mode}`;
    box.innerHTML = (tabs[d.tab] || tabAds)(d.data);
    if (d.tab === 'ads') {
      const el = box.querySelector('[data-count]');
      if (el && d.animKey !== d.lastAnimKey) countUp(el, Number(el.dataset.count));
      d.lastAnimKey = d.animKey;
    }
    if (d.tab === 'ads' || d.tab === 'chat') renderTable();
  }

  function countUp(el, to) {
    if (!to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now(); const ms = 800;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      el.textContent = baht(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1 && el.isConnected) requestAnimationFrame(tick); else if (el.isConnected) el.textContent = baht(to);
    };
    requestAnimationFrame(tick);
  }

  /* --- tab: ads --- */
  function chip(k) {
    if (!k || k.delta === null) return '<span class="chip flat">—</span>';
    if (k.delta === 0) return '<span class="chip flat">0.0%</span>';
    const up = k.delta > 0; const good = k.inverse ? !up : up;
    return `<span class="chip ${good ? 'good' : 'bad'}">${icon(up ? 'up' : 'down')}${up ? '+' : ''}${k.delta.toFixed(1)}%</span>`;
  }
  function tile(data, key, label, fmt) {
    const k = data.kpis[key];
    return `<div class="kpi"><div class="k-label">${label}</div><div class="k-value">${fmt(k.value)}</div>${chip(k)}</div>`;
  }
  // แถบสรุป: ยอดใช้จ่าย + เส้นทางจากการมองเห็นไปจนถึงการซื้อ
  function heroHtml(data) {
    const k = data.kpis; const t = data.trend.spend;
    const W = 600; const H = 84; const max = Math.max(...t, 1);
    const pts = t.map((v, i) => `${(i * W / Math.max(t.length - 1, 1)).toFixed(1)},${(H - 4 - (v / max) * (H - 12)).toFixed(1)}`);
    const anim = S.dash.animKey !== S.dash.lastAnimKey ? 'anim' : '';
    const rate = (a, b) => (b ? `${num((a / b) * 100, 1)}%` : '—');
    const steps = [
      ['Impressions', k.impressions.value, 'คนที่เห็นโฆษณา'],
      ['Clicks', k.clicks.value, `CTR ${pct(k.ctr.value)}`],
      ['Messages', k.messages.value, `จากคลิก ${rate(k.messages.value, k.clicks.value)}`],
      ['Purchases', k.purchases.value, `จากแชท ${rate(k.purchases.value, k.messages.value)}`],
    ];
    return `<section class="hero">${strandsSvg(22, 0.07)}
      <div><div class="h-label">Amount spent ${chip(k.spend)}</div>
        <div class="h-num" data-count="${k.spend.value ?? 0}" data-fmt="baht">${baht(k.spend.value)}</div>
        <div class="h-sub">${esc(data.range.from)} → ${esc(data.range.to)} · เทียบ ${data.range.days} วันก่อนหน้า</div>
        <svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily spend trend">
          <path class="trend-area ${anim}" d="M0,${H} L${pts.join(' L')} L${W},${H} Z"/>
          <polyline class="trend-line ${anim}" pathLength="1" points="${pts.join(' ')}"/></svg></div>
      <div class="funnel">${steps.map(([l, v, r]) => `<div class="f-step"><div class="f-label">${l}</div><div class="f-val">${num(v)}</div><span class="f-rate">${esc(r)}</span></div>`).join('')}</div>
    </section>`;
  }

  function tabAds(data) {
    const groups = [
      ['1', 'Cost & Visibility', 'What you paid to be seen', [['spend', 'Amount Spent', baht], ['reach', 'Reach', num], ['impressions', 'Impressions', num], ['cpm', 'CPM', baht]]],
      ['2', 'Acquisition', 'How people respond to ads', [['clicks', 'Clicks', num], ['ctr', 'CTR', pct], ['cpc', 'CPC', baht]]],
      ['3', 'Conversion', 'Messages and purchases', [['messages', 'Total Messages', num], ['costMessage', 'Cost / Message', baht], ['purchases', 'Total Purchases', num], ['conversionRate', 'Conversion Rate', pct], ['costPurchase', 'Cost / Purchase', baht]]],
    ];
    return heroHtml(data) + `<div class="kpi-groups">${groups.map(([n, t, s, items]) => `<section class="card kpi-group">
      <header><span class="step">${n}</span><div><b>${t}</b><small>${s}</small></div></header>
      <div class="kpi-grid">${items.map(([k, l, f]) => tile(data, k, l, f)).join('')}</div></section>`).join('')}</div>
      <section class="card table-card" id="table-card"></section>`;
  }

  /* --- table --- */
  const COLS = [
    ['name', 'Campaign / Ads'], ['creative', 'Creative'], ['reach', 'Reach'], ['impressions', 'Impressions'], ['cpm', 'CPM'], ['ctr', 'CTR'],
    ['costMessage', 'Cost / Msg'], ['cqc', 'CQC'], ['purchases', 'Purchases'], ['spend', 'Spend'], ['cpc', 'CPC'], ['qualityScore', 'Chat Quality'],
  ];
  function sparkSvg(vals, label) {
    const color = { excellent: '#0b7a5a', good: '#0b7a5a', average: '#0b7a5a', poor: '#d6204b', none: '#9aa39e' }[label] || '#0b7a5a';
    const max = Math.max(...vals, 1); const w = 54; const h = 22;
    const pts = vals.map((v, i) => `${(i * (w - 2) / Math.max(vals.length - 1, 1) + 1).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  const QLABEL = { excellent: 'Excellent', good: 'Good', average: 'Average', poor: 'Poor' };

  function renderTable() {
    const card = document.getElementById('table-card') || document.getElementById('table-card-chat');
    if (!card || !S.dash.data) return;
    const d = S.dash;
    const q = d.search.trim().toLowerCase();
    let rows = d.data.ads.filter((r) => !q || [r.name, r.campaign, r.adset, r.id].some((s) => String(s).toLowerCase().includes(q)));
    const dir = d.dir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const x = a[d.sort]; const y = b[d.sort];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    d.pageNo = Math.min(d.pageNo, pages);
    const slice = rows.slice((d.pageNo - 1) * PAGE_SIZE, d.pageNo * PAGE_SIZE);
    const keepFocus = document.activeElement && document.activeElement.id === 'tsearch';
    card.innerHTML = `<div class="table-head"><div><h2>Campaign performance</h2><p>Ad-level results joined with sales chat quality · ${d.data.ads.length} ads</p></div>
      <label class="search">${icon('search')}<input id="tsearch" data-bind="search" placeholder="Search campaign or ad" value="${esc(d.search)}" autocomplete="off"></label></div>
      <div class="tscroll"><table><thead><tr>${COLS.map(([k, l]) => `<th data-act="sort" data-key="${k}" class="${k === 'creative' ? 'nosort' : ''}">${l}${d.sort === k ? (d.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${slice.length ? slice.map((r) => `<tr>
        <td><div class="ad-name" title="${esc(r.name)}">${esc(r.name)}</div><div class="ad-sub">${esc(r.campaign)}${r.adset ? ' – ' + esc(r.adset) : ''} · ${esc(r.id)}</div></td>
        <td><div class="creative">${r.thumb ? `<img class="thumb" src="${esc(r.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="thumb ct-${esc(String(r.creative).toLowerCase())}">${icon('c_' + String(r.creative).toLowerCase())}</span>`}${esc(cap(String(r.creative).toLowerCase()))}</div></td>
        <td>${num(r.reach)}</td><td>${num(r.impressions)}</td><td>${baht(r.cpm)}</td><td>${pct(r.ctr)}</td><td>${baht(r.costMessage)}</td>
        <td>${r.cqc === null ? '—' : baht(r.cqc)}</td><td>${num(r.purchases)}</td><td class="spend">${baht(r.spend)}</td><td>${baht(r.cpc)}</td>
        <td><div class="q-cell">${sparkSvg(r.spark, r.qualityLabel)}<span class="q-badge q-${r.qualityLabel}">${r.qualityScore === null ? 'No chats' : `${QLABEL[r.qualityLabel]} · ${r.qualityScore}%`}</span></div></td></tr>`).join('')
        : `<tr><td colspan="${COLS.length}"><div class="empty">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div></td></tr>`}</tbody></table></div>
      <div class="pager"><span>Page ${d.pageNo} of ${pages} · ${rows.length} ads</span><div class="btns">
        <button data-act="page" data-dir="-1" ${d.pageNo <= 1 ? 'disabled' : ''}>Previous</button><button data-act="page" data-dir="1" ${d.pageNo >= pages ? 'disabled' : ''}>Next</button></div></div>`;
    if (keepFocus) { const i = document.getElementById('tsearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  /* --- tab: chat --- */
  const STATUS_TH = { new: 'New', contacted: 'Contacted', booked: 'Booked', closed: 'Closed', dropped: 'Dropped' };
  function barRows(items, labelFn, color) {
    const max = Math.max(...items.map((i) => i.count), 1);
    return `<div class="bars">${items.map((i) => `<div class="row"><span>${esc(labelFn(i))}</span><div class="bar"><i style="width:${(i.count / max) * 100}%;${color ? `background:${color(i)}` : ''}"></i></div><b>${num(i.count)}</b></div>`).join('')}</div>`;
  }
  function tabChat(data) {
    const c = data.chat;
    const qColor = (i) => ({ good: '#0b7a5a', average: '#e0a100', poor: '#d6204b' }[i.key]);
    if (!c.leads) return '<div class="card empty">ยังไม่มีข้อมูลแชทในช่วงที่เลือก (โหมด Meta ต้องต่อระบบแชทเพิ่ม)</div>';
    return `<div class="grid-4">
      <div class="stat"><div class="k-label">Chat leads</div><div class="k-value">${num(c.leads)}</div></div>
      <div class="stat"><div class="k-label">Quality chats</div><div class="k-value">${num(c.qualityChats)}</div></div>
      <div class="stat"><div class="k-label">Cost / lead</div><div class="k-value">${baht(c.costPerLead)}</div></div>
      <div class="stat"><div class="k-label">Avg first response</div><div class="k-value">${c.avgFirstResponse === null ? '—' : num(c.avgFirstResponse, 1) + ' min'}</div></div></div>
      <div class="grid-2" style="margin-top:18px">
        <section class="card panel"><h3>Chat quality</h3><p class="sub">คุณภาพแชทที่ทีมขายประเมิน</p>${barRows(c.quality, (i) => cap(i.key), qColor)}</section>
        <section class="card panel"><h3>Lead pipeline</h3><p class="sub">สถานะลีดในช่วงที่เลือก</p>${barRows(c.funnel, (i) => STATUS_TH[i.key])}</section></div>
      <section class="card table-card" id="table-card-chat"></section>`;
  }

  /* --- tab: sales --- */
  function tabSales(data) {
    const s = data.sales;
    if (!s.reps.length) return '<div class="card empty">ยังไม่มีข้อมูลทีมขายในช่วงที่เลือก</div>';
    return `<div class="grid-4" style="margin-bottom:18px">
      <div class="stat"><div class="k-label">Revenue (closed)</div><div class="k-value">${baht(s.revenue)}</div></div>
      <div class="stat"><div class="k-label">Closed deals</div><div class="k-value">${num(s.closed)}</div></div>
      <div class="stat"><div class="k-label">ROAS</div><div class="k-value">${data.kpis.spend.value ? num(s.revenue / data.kpis.spend.value, 2) + '×' : '—'}</div></div>
      <div class="stat"><div class="k-label">Chat leads</div><div class="k-value">${num(data.chat.leads)}</div></div></div>
      <section class="card table-card"><div class="table-head"><div><h2>Sales reps</h2><p>ผลงานของทีมขายแต่ละคน</p></div></div>
      <div class="tscroll"><table style="min-width:760px"><thead><tr><th class="nosort">Rep</th><th class="nosort">Leads</th><th class="nosort">Booked</th><th class="nosort">Closed</th><th class="nosort">Close rate</th><th class="nosort">Avg response</th><th class="nosort">Revenue</th></tr></thead>
      <tbody>${s.reps.map((r) => `<tr><td>${esc(r.name)}</td><td>${num(r.leads)}</td><td>${num(r.booked)}</td><td>${num(r.closed)}</td><td>${r.closeRate === null ? '—' : r.closeRate.toFixed(1) + '%'}</td><td>${r.avgFirstResponse === null ? '—' : r.avgFirstResponse + ' min'}</td><td>${baht(r.revenue)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* --- tab: trend --- */
  function chartHtml(id, title, dates, vals, color, kind, fmt) {
    const W = 640; const H = 280; const pl = 54; const pr = 12; const pt = 14; const pb = 30;
    const max = Math.max(...vals, 1) * 1.1; const n = vals.length; const band = (W - pl - pr) / n;
    const x = (i) => pl + (i + 0.5) * band; const y = (v) => pt + (H - pt - pb) * (1 - v / max);
    CHARTS[id] = { dates, vals, fmt, W, pl, band };
    let g = '';
    for (let t = 0; t <= 4; t++) {
      const v = (max * t) / 4;
      g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#eceee9"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${esc(num(v, max < 10 ? 1 : 0))}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 7));
    for (let i = 0; i < n; i += step) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(dates[i].slice(5))}</text>`;
    let marks;
    if (kind === 'bar') {
      marks = vals.map((v, i) => `<rect x="${x(i) - band * 0.35}" y="${y(v)}" width="${band * 0.7}" height="${Math.max(0, H - pb - y(v))}" rx="3" fill="${color}"/>`).join('');
    } else {
      const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      marks = `<path d="M${x(0)},${H - pb} L${pts.join(' L')} L${x(n - 1)},${H - pb} Z" fill="${color}" opacity=".1"/><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    return `<section class="card panel"><h3>${esc(title)}</h3><div class="chart-wrap" data-chart="${id}" style="position:relative"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}${marks}</svg><div class="tip" hidden></div></div></section>`;
  }
  function tabTrend(data) {
    const t = data.trend;
    return `<div class="grid-2">
      ${chartHtml('spend', 'Spend per day (฿)', t.dates, t.spend, '#0b7a5a', 'bar', baht)}
      ${chartHtml('messages', 'Messages per day', t.dates, t.messages, '#2457c5', 'line', num)}
      ${chartHtml('purchases', 'Purchases per day', t.dates, t.purchases, '#b86e00', 'line', num)}
      ${chartHtml('leads', 'Chat leads per day', t.dates, t.leads, '#7a3fc4', 'line', num)}</div>`;
  }

  /* --- tab: dropped --- */
  function tabDropped(data) {
    const p = data.dropped;
    if (!p.total) return '<div class="card empty">ไม่มีลีดที่หลุดในช่วงที่เลือก 🎉</div>';
    return `<div class="grid-2">
      <section class="card panel"><h3>Dropped leads</h3><p class="sub">${num(p.total)} ลีด · ${p.rate}% ของลีดทั้งหมด</p>${barRows(p.reasons.map((r) => ({ key: r.reason, count: r.count })), (i) => i.key)}</section>
      <section class="card panel"><h3>ล่าสุด</h3><p class="sub">25 รายการล่าสุดที่หลุด</p>
      <div class="tscroll"><table style="min-width:480px"><tbody>${p.list.map((l) => `<tr><td><div class="ad-name">${esc(l.name)}</div><div class="ad-sub">${esc(l.ad)}</div></td><td>${esc(l.reason || '—')}<div class="ad-sub">${esc(l.date)} · ${esc(l.rep)}</div></td></tr>`).join('')}</tbody></table></div></section></div>`;
  }

  /* ---------------- board ---------------- */
  async function loadBoard() {
    try { S.board = await api('/api/board'); } catch (e) { S.board = { err: e.message }; }
    renderBoardBody();
  }
  function boardShell() { return '<div class="page-head"><div><h1>Board</h1><div class="meta-line"><span>Lead pipeline · last 30 days</span></div></div></div><div id="board-body"><div class="loading">Loading…</div></div>'; }
  function renderBoardBody() {
    const box = document.getElementById('board-body'); if (!box || !S.board) return;
    if (S.board.err) { box.innerHTML = `<div class="notice err">${esc(S.board.err)}</div>`; return; }
    box.innerHTML = `<div class="kanban">${S.board.columns.map((c) => `<section class="col"><h4><span>${STATUS_TH[c.status]}</span><span>${c.total}</span></h4>
      ${c.cards.map((l) => `<div class="lead"><b>${esc(l.name)}</b><span class="q-badge q-${l.quality === 'good' ? 'excellent' : l.quality === 'average' ? 'average' : 'poor'}" style="font-size:12px;padding:2px 9px">${esc(cap(l.quality))}</span>
        <small>${esc(l.ad)}</small><small>${esc(l.date)} · ${esc(l.rep)}${l.value ? ' · ' + baht(l.value) : ''}</small>${l.reason ? `<small>${esc(l.reason)}</small>` : ''}</div>`).join('') || '<div class="empty" style="padding:20px">—</div>'}
      ${c.total > c.cards.length ? `<div class="ad-sub" style="text-align:center">แสดง ${c.cards.length} จาก ${c.total}</div>` : ''}</section>`).join('')}</div>`;
  }

  /* ---------------- settings ---------------- */
  async function loadSettings() {
    try { S.settings = await api('/api/settings'); } catch (e) { S.flash = { type: 'err', text: e.message }; }
    renderSettingBody();
  }
  function settingShell() { return '<div class="page-head"><div><h1>Setting</h1><div class="meta-line"><span>การเชื่อมต่อ Meta และบัญชีผู้ใช้</span></div></div></div><div id="setting-body"><div class="loading">Loading…</div></div>'; }
  function flash() { return S.flash ? `<div class="notice ${S.flash.type}" style="margin-bottom:16px;max-width:900px">${esc(S.flash.text)}</div>` : ''; }

  function renderSettingBody() {
    const box = document.getElementById('setting-body'); const s = S.settings; if (!box || !s) return;
    const m = s.meta; const connected = Boolean(m.connectedAt);
    box.innerHTML = `${flash()}<div class="stack" style="max-width:900px">
      <section class="card panel"><h3>แหล่งข้อมูล</h3>
        <p class="sub">ตอนนี้แสดงข้อมูล: <b>${s.mode === 'meta' ? 'Meta (ข้อมูลจริง)' : 'Demo (ข้อมูลตัวอย่าง)'}</b>${connected ? ` · เชื่อมกับบัญชี <b>${esc(m.accountName)}</b>${m.currency ? ' (' + esc(m.currency) + ')' : ''}` : ' · ยังไม่ได้เชื่อม Meta'}</p>
        <div class="row-actions">
          <button class="btn ${s.mode === 'demo' ? 'primary' : ''}" data-act="mode" data-mode="demo">ใช้ข้อมูลเดโม</button>
          <button class="btn ${s.mode === 'meta' ? 'primary' : ''}" data-act="mode" data-mode="meta" ${connected ? '' : 'disabled'}>ใช้ข้อมูล Meta</button></div></section>

      <section class="card panel"><h3>เชื่อมต่อ Meta Marketing API</h3>
        <p class="sub">ข้อมูลลับถูกเก็บฝั่งเซิร์ฟเวอร์เท่านั้น และจะไม่ถูกส่งกลับมาแสดงที่หน้าเว็บ</p>
        <form class="form" data-form="meta" autocomplete="off">
          <div class="field"><label>ชื่อคลินิก</label><input type="text" name="clinicName" value="${esc(s.clinicName)}" maxlength="80"></div>
          <div class="field"><label>Ad Account ID</label><input type="text" name="adAccountId" value="${esc(m.adAccountId)}" placeholder="เช่น 1234567890 หรือ act_1234567890" inputmode="numeric"><small>ดูได้ที่ Ads Manager (ตัวเลขหลัง act_)</small></div>
          <div class="field"><label>Access Token ${m.hasToken ? `<span class="chip good" style="margin-left:6px">บันทึกแล้ว ${esc(m.tokenHint)}</span>` : ''}</label><input type="password" name="accessToken" placeholder="${m.hasToken ? 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน' : 'วาง token ที่นี่'}" autocomplete="new-password"><small>แนะนำ System User token ที่มีสิทธิ์ <code>ads_read</code> และ <code>read_insights</code></small></div>
          <div class="field"><label>App ID <small style="display:inline">(ไม่บังคับ)</small></label><input type="text" name="appId" value="${esc(m.appId)}"></div>
          <div class="field"><label>App Secret ${m.hasSecret ? '<span class="chip good" style="margin-left:6px">บันทึกแล้ว</span>' : ''} <small style="display:inline">(ไม่บังคับ — ใช้แลก token อายุยาว)</small></label><input type="password" name="appSecret" placeholder="${m.hasSecret ? 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน' : ''}" autocomplete="new-password"></div>
          <div class="field"><label>Graph API version</label><input type="text" name="apiVersion" value="${esc(m.apiVersion)}"></div>
          <div class="row-actions">
            <button class="btn primary" type="submit" data-after="test">บันทึกและทดสอบการเชื่อมต่อ</button>
            <button class="btn" type="submit" data-after="save">บันทึกเฉย ๆ</button>
            <button class="btn" type="button" data-act="extend" ${m.hasToken && m.hasSecret && m.appId ? '' : 'disabled'}>แลกเป็น token อายุยาว</button>
            <button class="btn danger" type="button" data-act="disconnect">ตัดการเชื่อมต่อ</button></div>
        </form>
        <ol class="steps"><li>สร้างแอปที่ developers.facebook.com (ประเภท Business) และเพิ่ม Marketing API</li>
          <li>ที่ Business Settings สร้าง System User แล้วให้สิทธิ์เข้าถึง Ad Account (ดู performance)</li>
          <li>Generate token โดยเลือก <code>ads_read</code> และ <code>read_insights</code></li>
          <li>ใส่ Ad Account ID + token ด้านบน แล้วกด “บันทึกและทดสอบ” เมื่อสำเร็จให้กด “ใช้ข้อมูล Meta”</li></ol>
        <div class="notice warn" style="margin-top:14px">หมายเหตุ: Ads API ให้ข้อมูล spend/reach/clicks/messages/purchases ส่วนคุณภาพแชทและทีมขายต้องมาจากระบบแชทของคลินิก (จะว่างในโหมด Meta จนกว่าจะต่อเพิ่ม)</div></section>

      <section class="card panel"><h3>เปลี่ยนรหัสผ่าน</h3><p class="sub">ผู้ใช้: <b>${esc(S.me.username)}</b></p>
        <form class="form" data-form="password">
          <div class="field"><label>รหัสผ่านปัจจุบัน</label><input type="password" name="current" autocomplete="current-password" required></div>
          <div class="field"><label>รหัสผ่านใหม่</label><input type="password" name="next" autocomplete="new-password" minlength="8" required><small>อย่างน้อย 8 ตัวอักษร</small></div>
          <div class="row-actions"><button class="btn primary" type="submit">เปลี่ยนรหัสผ่าน</button></div></form></section></div>`;
  }

  /* ---------------- events ---------------- */
  function resetFilters() { Object.assign(S.dash, { page: '', campaign: '', agency: '', rep: '', status: '', search: '' }); }

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) { if (S.menu && !ev.target.closest('.popover')) { S.menu = null; render(); } return; }
    const act = el.dataset.act; const d = S.dash;
    try {
      if (act === 'menu') { S.menu = S.menu === el.dataset.menu ? null : el.dataset.menu; render(); }
      else if (act === 'goto') { S.menu = null; location.hash = '#/' + el.dataset.to; }
      else if (act === 'logout') { await api('/api/logout', { method: 'POST' }); S.me = null; S.filters = null; S.menu = null; render(); }
      else if (act === 'refresh') loadDash(true);
      else if (act === 'range') { d.range = el.dataset.range; if (d.range === 'custom' && !d.from) { const t = new Date(); d.to = t.toISOString().slice(0, 10); t.setDate(t.getDate() - 29); d.from = t.toISOString().slice(0, 10); } render(); loadDash(); }
      else if (act === 'tab') { d.tab = el.dataset.tab; render(); }
      else if (act === 'reset-filters') { resetFilters(); render(); loadDash(); }
      else if (act === 'sort') { const k = el.dataset.key; if (k === 'creative') return; d.dir = d.sort === k && d.dir === 'desc' ? 'asc' : 'desc'; d.sort = k; renderTable(); }
      else if (act === 'page') { d.pageNo += Number(el.dataset.dir); renderTable(); }
      else if (act === 'mode') { S.settings = await api('/api/settings/mode', { method: 'POST', body: { mode: el.dataset.mode } }); S.me.mode = S.settings.mode; S.filters = null; S.flash = { type: 'ok', text: 'เปลี่ยนแหล่งข้อมูลแล้ว' }; render(); }
      else if (act === 'disconnect') {
        if (!confirm('ตัดการเชื่อมต่อ Meta และลบ token ที่บันทึกไว้?')) return;
        S.settings = await api('/api/settings/meta/disconnect', { method: 'POST' }); S.me.mode = 'demo'; S.filters = null; S.flash = { type: 'ok', text: 'ตัดการเชื่อมต่อแล้ว กลับไปใช้ข้อมูลเดโม' }; render();
      } else if (act === 'extend') {
        const r = await api('/api/settings/meta/extend', { method: 'POST' });
        S.flash = r.ok ? { type: 'ok', text: 'แลกเป็น token อายุยาวสำเร็จ' } : { type: 'err', text: r.error }; if (r.ok) S.settings = r.settings; render();
      }
    } catch (e) { if (e.message !== 'กรุณาเข้าสู่ระบบ') { S.flash = { type: 'err', text: e.message }; render(); } }
  });

  document.addEventListener('change', (ev) => {
    const b = ev.target.dataset && ev.target.dataset.bind; if (!b) return;
    const d = S.dash;
    if (b === 'header-page') { d.page = ev.target.value; if (S.route === 'dashboard') { render(); loadDash(); } else render(); return; }
    if (['page', 'campaign', 'agency', 'rep', 'status'].includes(b)) { d[b] = ev.target.value; render(); loadDash(); }
    if (b === 'from' || b === 'to') { d[b] = ev.target.value; if (d.from && d.to && d.from <= d.to) loadDash(); }
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.dataset && ev.target.dataset.bind === 'search') { S.dash.search = ev.target.value; S.dash.pageNo = 1; renderTable(); }
  });

  document.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('[data-form]'); if (!form) return;
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const type = form.dataset.form;
    try {
      if (type === 'login') {
        await api('/api/login', { method: 'POST', body: { username: fd.username, password: fd.password } });
        S.loginErr = ''; S.me = await api('/api/me'); S.route = routeFromHash(); enterRoute();
      } else if (type === 'meta') {
        const after = (ev.submitter && ev.submitter.dataset.after) || 'save';
        S.settings = await api('/api/settings/meta', { method: 'PUT', body: fd });
        S.flash = { type: 'ok', text: 'บันทึกแล้ว' };
        if (after === 'test') {
          const r = await api('/api/settings/meta/test', { method: 'POST' });
          if (r.ok) { S.settings = r.settings; S.flash = { type: 'ok', text: `เชื่อมต่อสำเร็จ: ${r.account.name}. กด “ใช้ข้อมูล Meta” เพื่อเริ่มดึงข้อมูลจริง` }; }
          else S.flash = { type: 'err', text: 'เชื่อมต่อไม่สำเร็จ: ' + r.error };
        }
        S.me = await api('/api/me'); render();
      } else if (type === 'password') {
        await api('/api/password', { method: 'POST', body: fd });
        S.me = await api('/api/me'); S.flash = { type: 'ok', text: 'เปลี่ยนรหัสผ่านเรียบร้อย' }; render();
      }
    } catch (e) {
      if (type === 'login') { S.loginErr = e.message; renderLogin(); }
      else if (e.message !== 'กรุณาเข้าสู่ระบบ') { S.flash = { type: 'err', text: e.message }; render(); }
    }
  });

  document.addEventListener('mousemove', (ev) => {
    const wrap = ev.target.closest && ev.target.closest('.chart-wrap'); if (!wrap) return;
    const c = CHARTS[wrap.dataset.chart]; if (!c) return;
    const svg = wrap.querySelector('svg'); const r = svg.getBoundingClientRect(); const tip = wrap.querySelector('.tip');
    const fx = ((ev.clientX - r.left) / r.width) * c.W;
    const i = Math.floor((fx - c.pl) / c.band);
    if (i < 0 || i >= c.vals.length) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = `${esc(c.dates[i])}<br><b>${esc(c.fmt(c.vals[i]))}</b>`;
    const left = ((c.pl + (i + 0.5) * c.band) / c.W) * r.width;
    tip.style.left = Math.min(left + 10, r.width - 110) + 'px'; tip.style.top = '8px';
  });

  /* ---------------- boot ---------------- */
  (async () => {
    S.route = routeFromHash();
    try { S.me = await api('/api/me'); } catch { S.me = null; }
    S.booted = true;
    enterRoute();
  })();
})();