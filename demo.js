'use strict';
// ข้อมูลเดโมของคลินิกปลูกผม (สุ่มแบบคงที่ ผลเหมือนเดิมทุกครั้งที่รัน)
const { today, addDays } = require('./dates');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pages = [
  { id: 'P1', name: 'BEQ GROUP Bangkok' },
  { id: 'P2', name: "BEQ GROUP Women's Hair" },
  { id: 'P3', name: 'BEQ GROUP Phuket' },
];
const agencies = [
  { id: 'A1', name: 'In-house' },
  { id: 'A2', name: 'Growth Agency' },
  { id: 'A3', name: 'Pixel Studio' },
];
const reps = [
  { id: 'R1', name: 'นก' },
  { id: 'R2', name: 'มิ้นท์' },
  { id: 'R3', name: 'พลอย' },
  { id: 'R4', name: 'อาร์ม' },
];
const campaigns = [
  { id: 'C1', name: 'FUE Hair Transplant', price: [80000, 180000] },
  { id: 'C2', name: 'PRP & Hair Treatment', price: [12000, 40000] },
  { id: 'C3', name: 'Free Hair Consult', price: [15000, 90000] },
  { id: 'C4', name: "Women's Hair Thinning", price: [15000, 60000] },
  { id: 'C5', name: 'Beard & Eyebrow', price: [35000, 90000] },
  { id: 'C6', name: 'Retargeting 30D', price: [20000, 120000] },
];

// [id, campaign, adset, ชื่อ ad, creative, page, agency, น้ำหนักงบ, คุณภาพแชท 0-1]
const adDefs = [
  [1046, 'C1', 'Men 28–45 Bangkok', 'FUE · Reels · Before & After', 'VIDEO', 'P1', 'A1', 1.75, 0.62],
  [1045, 'C1', 'Lookalike Buyers', 'FUE · Reels · Result 12 Months', 'VIDEO', 'P1', 'A2', 1.6, 0.12],
  [1052, 'C2', 'Early Hair Loss 22–35', 'PRP · Static · Offer 50%', 'IMAGE', 'P1', 'A2', 1.55, 0.5],
  [1051, 'C2', 'Early Hair Loss 22–35', 'PRP · Reels · Before & After', 'VIDEO', 'P1', 'A2', 1.3, 0.42],
  [1056, 'C3', 'Broad Thailand 25–50', 'Consult · Carousel · Treatments', 'CAROUSEL', 'P1', 'A3', 1.25, 0.3],
  [1050, 'C1', 'Men 28–45 Bangkok', 'FUE · Reels · Doctor Explains', 'VIDEO', 'P1', 'A1', 1.2, 0.38],
  [1044, 'C6', 'Page Engagers', 'Retarget · Story · Testimonial', 'STORY', 'P1', 'A1', 1.15, 0.45],
  [1049, 'C1', 'Lookalike Buyers', 'FUE · Story · Testimonial', 'STORY', 'P1', 'A1', 1.1, 0.58],
  [1047, 'C4', 'Women 30–55', 'Women · Reels · Thinning Care', 'VIDEO', 'P2', 'A3', 1.0, 0.4],
  [1048, 'C4', 'Women 30–55', 'Women · Static · Free Scalp Check', 'IMAGE', 'P2', 'A3', 0.95, 0.34],
  [1053, 'C5', 'Men 25–40', 'Beard · Reels · Transformation', 'VIDEO', 'P1', 'A2', 0.9, 0.46],
  [1054, 'C5', 'Men 25–40', 'Eyebrow · Static · Natural Look', 'IMAGE', 'P1', 'A2', 0.8, 0.28],
  [1055, 'C3', 'Broad Thailand 25–50', 'Consult · Static · Free Consult', 'IMAGE', 'P3', 'A2', 0.8, 0.25],
  [1057, 'C6', 'Website Visitors', 'Retarget · Carousel · Packages', 'CAROUSEL', 'P3', 'A1', 0.7, 0.52],
  [1058, 'C2', 'Early Hair Loss 22–35', 'PRP · Story · Q&A', 'STORY', 'P3', 'A3', 0.65, 0.36],
  [1059, 'C4', 'Women 30–55', 'Women · Carousel · Before & After', 'CAROUSEL', 'P2', 'A3', 0.6, 0.48],
  [1060, 'C6', 'Page Engagers', 'Retarget · Reels · Doctor Intro', 'VIDEO', 'P3', 'A1', 0.5, 0.4],
  [1061, 'C5', 'Men 25–40', 'Beard · Story · Testimonial', 'STORY', 'P1', 'A1', 0.45, 0.33],
];

const firstNames = ['สมชาย', 'วิชัย', 'ณัฐพล', 'ปวีณา', 'กิตติ', 'อรทัย', 'ธนากร', 'สุรศักดิ์', 'พิมพ์ชนก',
  'ภาณุ', 'ชลธิชา', 'รัฐพล', 'นภัสสร', 'อนุชา', 'มณีรัตน์', 'ธีรพงษ์', 'กมลชนก', 'วรเชษฐ์'];
const initials = ['ส', 'ว', 'ก', 'ธ', 'พ', 'ป', 'จ', 'ม', 'ร', 'อ'];
const dropReasons = ['ราคาสูงเกินไป', 'ไม่สะดวกเดินทาง', 'เปรียบเทียบคลินิกอื่น', 'ไม่ตอบกลับ', 'แค่สอบถามข้อมูล', 'ขอเวลาตัดสินใจ'];

const HISTORY_DAYS = 200; // เผื่อเทียบช่วงก่อนหน้า 90 วัน
let cache = null;

function build() {
  const t = today();
  const rand = rng(20261109);
  const start = addDays(t, -(HISTORY_DAYS - 1));

  const ads = adDefs.map((d) => ({
    id: `AD-${d[0]}`, campaignId: d[1], adset: d[2], name: d[3], creative: d[4],
    pageId: d[5], agencyId: d[6], weight: d[7], quality: d[8],
  }));

  const daily = [];
  for (const ad of ads) {
    const cpm = 145 + rand() * 30;
    const ctr = 0.017 + rand() * 0.005;
    const costMsg = 36 + rand() * 9;
    const conv = 0.07 + rand() * 0.04;
    const launch = ad.id === 'AD-1058' || ad.id === 'AD-1059' || ad.id === 'AD-1060' || ad.id === 'AD-1061'
      ? 60 + Math.floor(rand() * 40) : 0;
    for (let i = 0; i < HISTORY_DAYS; i++) {
      if (i < launch) continue;
      const date = addDays(start, i);
      if (rand() < 0.04) continue; // วันที่ adหยุดรัน
      const age = (HISTORY_DAYS - 1 - i) / (HISTORY_DAYS - 1); // 1 = เก่าสุด
      const season = 1 + 0.18 * age; // งบลดลงเล็กน้อยในช่วงล่าสุด
      const weekend = [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay()) ? 0.9 : 1.05;
      const spend = 300 * ad.weight * season * weekend * (0.8 + rand() * 0.4);
      const impressions = Math.round((spend / (cpm * (0.97 + rand() * 0.06))) * 1000);
      const reach = Math.round(impressions * (0.62 + rand() * 0.07));
      const clicks = Math.round(impressions * ctr * (0.92 + rand() * 0.16));
      const messages = Math.max(0, Math.round(spend / (costMsg * (0.9 + rand() * 0.2))));
      const purchases = Math.floor(messages * conv * (0.8 + rand() * 0.4) + rand());
      daily.push({ date, adId: ad.id, spend: Math.round(spend * 100) / 100, impressions, reach, clicks, messages, purchases });
    }
  }

  // ลีดจากแชทที่ทีมขายบันทึก
  const leads = [];
  const totalW = ads.reduce((s, a) => s + a.weight, 0);
  const camp = Object.fromEntries(campaigns.map((c) => [c.id, c]));
  for (let n = 1; n <= 330; n++) {
    let r = rand() * totalW;
    const ad = ads.find((a) => (r -= a.weight) <= 0) || ads[0];
    const date = addDays(t, -Math.floor(Math.pow(rand(), 1.1) * 100));
    const qr = rand();
    const quality = qr < ad.quality ? 'good' : qr < ad.quality + (1 - ad.quality) * 0.55 ? 'average' : 'poor';
    const weights = {
      good: { closed: 35, booked: 30, contacted: 20, dropped: 10, new: 5 },
      average: { closed: 12, booked: 22, contacted: 30, dropped: 26, new: 10 },
      poor: { closed: 2, booked: 6, contacted: 22, dropped: 55, new: 15 },
    }[quality];
    const recent = date >= addDays(t, -1);
    let pick = rand() * Object.values(weights).reduce((a, b) => a + b, 0);
    let status = recent ? (rand() < 0.6 ? 'new' : 'contacted') : Object.keys(weights).find((k) => (pick -= weights[k]) <= 0);
    status = status || 'contacted';
    const [lo, hi] = camp[ad.campaignId].price;
    leads.push({
      id: `L-${String(n).padStart(4, '0')}`,
      name: `คุณ${firstNames[Math.floor(rand() * firstNames.length)]} ${initials[Math.floor(rand() * initials.length)]}.`,
      adId: ad.id,
      date,
      repId: reps[Math.floor(rand() * reps.length)].id,
      quality,
      status,
      value: status === 'closed' ? Math.round((lo + rand() * (hi - lo)) / 500) * 500 : 0,
      firstResponseMin: Math.round(2 + rand() * rand() * 58),
      dropReason: status === 'dropped' ? dropReasons[Math.floor(rand() * dropReasons.length)] : null,
    });
  }
  leads.sort((a, b) => (a.date < b.date ? 1 : -1));

  return { pages, agencies, reps, campaigns: campaigns.map(({ id, name }) => ({ id, name })), ads, daily, leads };
}

function load() {
  const key = today();
  if (!cache || cache.key !== key) cache = { key, data: build() };
  return cache.data;
}

module.exports = { load };