'use strict';
const { addDays, eachDay } = require('./dates');

// ความคืบหน้าของแชท เรียงตามคอลัมน์ใน Board
const STATUSES = ['no_reply', 'very_poor', 'talked', 'in_progress', 'qualified'];

const div = (a, b) => (b ? a / b : null);
const round = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

function aggregate(rows) {
  const t = { spend: 0, impressions: 0, reach: 0, clicks: 0, messages: 0, purchases: 0 };
  for (const r of rows) for (const k of Object.keys(t)) t[k] += r[k] || 0;
  return {
    ...t,
    cpm: div(t.spend, t.impressions) === null ? null : (t.spend / t.impressions) * 1000,
    ctr: div(t.clicks, t.impressions) === null ? null : (t.clicks / t.impressions) * 100,
    cpc: div(t.spend, t.clicks),
    costMessage: div(t.spend, t.messages),
    costPurchase: div(t.spend, t.purchases),
    conversionRate: div(t.purchases, t.messages) === null ? null : (t.purchases / t.messages) * 100,
  };
}

// [key, inverse]  inverse = ยิ่งต่ำยิ่งดี (ต้นทุน)
const KPI_DEFS = [
  ['spend', false], ['reach', false], ['impressions', false], ['cpm', true],
  ['clicks', false], ['ctr', false], ['cpc', true],
  ['messages', false], ['costMessage', true], ['purchases', false], ['conversionRate', false], ['costPurchase', true],
];

function kpis(cur, prev) {
  const out = {};
  for (const [k, inverse] of KPI_DEFS) {
    const c = cur[k]; const p = prev[k];
    out[k] = {
      value: round(c, 4),
      prev: round(p, 4),
      delta: c === null || p === null || p === 0 ? null : round(((c - p) / p) * 100, 1),
      inverse,
    };
  }
  return out;
}

function qualityLabel(score) {
  if (score === null) return 'none';
  if (score >= 55) return 'excellent';
  if (score >= 35) return 'good';
  if (score >= 20) return 'average';
  return 'poor';
}

function listFilters(data) {
  return {
    pages: data.pages, campaigns: data.campaigns, agencies: data.agencies, reps: data.reps,
    statuses: STATUSES,
  };
}

function buildDashboard(data, range, q = {}) {
  const campName = Object.fromEntries(data.campaigns.map((c) => [c.id, c.name]));
  const pageName = Object.fromEntries(data.pages.map((p) => [p.id, p.name]));
  const repName = Object.fromEntries(data.reps.map((r) => [r.id, r.name]));

  const ads = data.ads.filter((a) =>
    (!q.page || a.pageId === q.page) && (!q.campaign || a.campaignId === q.campaign) && (!q.agency || a.agencyId === q.agency));
  const adIds = new Set(ads.map((a) => a.id));

  const daily = data.daily.filter((r) => adIds.has(r.adId));
  const cur = daily.filter((r) => r.date >= range.from && r.date <= range.to);
  const prev = daily.filter((r) => r.date >= range.prevFrom && r.date <= range.prevTo);

  const inLeadScope = (l) => adIds.has(l.adId) && (!q.rep || l.repId === q.rep) && (!q.status || l.status === q.status);
  const leadsCur = data.leads.filter((l) => inLeadScope(l) && l.date >= range.from && l.date <= range.to);
  const leadsPrev = data.leads.filter((l) => inLeadScope(l) && l.date >= range.prevFrom && l.date <= range.prevTo);

  // ตารางแคมเปญ/โฆษณา
  const sparkFrom = addDays(range.to, -13);
  const rows = ads.map((a) => {
    const rowsCur = cur.filter((r) => r.adId === a.id);
    const m = aggregate(rowsCur);
    const ls = leadsCur.filter((l) => l.adId === a.id);
    const good = ls.filter((l) => l.quality === 'good').length;
    const score = ls.length ? Math.round((good / ls.length) * 100) : null;
    const byDay = Object.fromEntries(rowsCur.map((r) => [r.date, r.messages]));
    return {
      id: a.id, name: a.name, campaign: campName[a.campaignId] || '', adset: a.adset,
      page: pageName[a.pageId] || '', creative: a.creative, thumb: a.thumb || null,
      reach: m.reach, impressions: m.impressions, cpm: round(m.cpm), ctr: round(m.ctr), costMessage: round(m.costMessage),
      cqc: good ? round(m.spend / good) : null, purchases: m.purchases, spend: round(m.spend), cpc: round(m.cpc),
      leads: ls.length, qualityChats: good, qualityScore: score, qualityLabel: qualityLabel(score),
      spark: eachDay(sparkFrom, range.to).map((d) => byDay[d] || 0),
    };
  }).filter((r) => r.spend > 0 || r.impressions > 0);

  // Trend รายวัน
  const dates = eachDay(range.from, range.to);
  const dayMap = {};
  for (const r of cur) {
    const d = (dayMap[r.date] ||= { spend: 0, messages: 0, purchases: 0, clicks: 0, leads: 0 });
    d.spend += r.spend; d.messages += r.messages; d.purchases += r.purchases; d.clicks += r.clicks;
  }
  for (const l of leadsCur) (dayMap[l.date] ||= { spend: 0, messages: 0, purchases: 0, clicks: 0, leads: 0 }).leads += 1;
  const trend = {
    dates,
    spend: dates.map((d) => round((dayMap[d] || {}).spend || 0)),
    messages: dates.map((d) => (dayMap[d] || {}).messages || 0),
    purchases: dates.map((d) => (dayMap[d] || {}).purchases || 0),
    leads: dates.map((d) => (dayMap[d] || {}).leads || 0),
  };

  // แชทและคุณภาพ
  const count = (arr, f) => arr.filter(f).length;
  const resp = leadsCur.map((l) => l.firstResponseMin).filter((v) => typeof v === 'number');
  const chat = {
    leads: leadsCur.length,
    leadsPrev: leadsPrev.length,
    qualityChats: count(leadsCur, (l) => l.quality === 'good'),
    avgFirstResponse: resp.length ? round(resp.reduce((a, b) => a + b, 0) / resp.length, 1) : null,
    quality: ['good', 'average', 'poor'].map((k) => ({ key: k, count: count(leadsCur, (l) => l.quality === k) })),
    funnel: STATUSES.map((k) => ({ key: k, count: count(leadsCur, (l) => l.status === k) })),
    costPerLead: leadsCur.length ? round(aggregate(cur).spend / leadsCur.length) : null,
  };

  // ทีมขาย
  const sales = data.reps.map((r) => {
    const ls = leadsCur.filter((l) => l.repId === r.id);
    const closed = ls.filter((l) => l.value > 0);
    const rt = ls.map((l) => l.firstResponseMin).filter((v) => typeof v === 'number');
    return {
      id: r.id, name: r.name, leads: ls.length,
      qualified: count(ls, (l) => l.status === 'qualified'),
      closed: closed.length,
      revenue: closed.reduce((s, l) => s + l.value, 0),
      closeRate: ls.length ? round((closed.length / ls.length) * 100, 1) : null,
      avgFirstResponse: rt.length ? round(rt.reduce((s, v) => s + v, 0) / rt.length, 1) : null,
    };
  }).filter((r) => r.leads > 0);
  const revenue = sales.reduce((s, r) => s + r.revenue, 0);

  // ลีดที่หลุด
  const dropped = leadsCur.filter((l) => l.status === 'no_reply' || l.status === 'very_poor');
  const reasons = {};
  for (const l of dropped) reasons[l.dropReason || 'ไม่ระบุ'] = (reasons[l.dropReason || 'ไม่ระบุ'] || 0) + 1;
  const adName = Object.fromEntries(data.ads.map((a) => [a.id, a.name]));

  return {
    range,
    scope: { ads: rows.length, leads: leadsCur.length, records: cur.length },
    kpis: kpis(aggregate(cur), aggregate(prev)),
    ads: rows,
    trend,
    chat,
    sales: { reps: sales, revenue, closed: sales.reduce((s, r) => s + r.closed, 0) },
    dropped: {
      total: dropped.length,
      rate: leadsCur.length ? round((dropped.length / leadsCur.length) * 100, 1) : null,
      reasons: Object.entries(reasons).map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count),
      list: dropped.slice(0, 25).map((l) => ({
        id: l.id, name: l.name, date: l.date, reason: l.dropReason, ad: adName[l.adId] || l.adId, rep: repName[l.repId] || '',
      })),
    },
  };
}

function leadRows(data, range) {
  const adName = Object.fromEntries(data.ads.map((a) => [a.id, a.name]));
  const repName = Object.fromEntries(data.reps.map((r) => [r.id, r.name]));
  return data.leads
    .filter((l) => l.date >= range.from && l.date <= range.to) // นับจากวันที่เริ่มคุย
    .map((l) => ({
      id: l.id, name: l.name, channel: l.channel || '—', date: l.date, status: l.status,
      ad: adName[l.adId] || '', rep: repName[l.repId] || '', value: l.value || 0, reason: l.dropReason || null,
    }))
    .sort((x, y) => (x.date !== y.date ? (x.date < y.date ? 1 : -1) : x.id < y.id ? 1 : -1));
}

function buildBoard(data, range) {
  const rows = leadRows(data, range);
  return {
    range, total: rows.length,
    columns: STATUSES.map((status) => {
      const c = rows.filter((r) => r.status === status);
      return { status, total: c.length, cards: c.slice(0, 40) };
    }),
  };
}

function buildInbox(data, range) {
  const rows = leadRows(data, range);
  return { range, total: rows.length, rows: rows.slice(0, 2000) };
}

function leadRow(data, l) {
  const ad = data.ads.find((a) => a.id === l.adId);
  const rep = data.reps.find((r) => r.id === l.repId);
  return {
    id: l.id, name: l.name, channel: l.channel || '—', date: l.date, status: l.status,
    ad: ad ? ad.name : '', rep: rep ? rep.name : '', value: l.value || 0, reason: l.dropReason || null,
  };
}

module.exports = { buildDashboard, buildBoard, buildInbox, leadRow, listFilters, aggregate, STATUSES };
