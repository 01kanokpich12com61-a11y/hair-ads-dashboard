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
  { id: 'P1', name: 'Hairlab Clinic Bangkok' },
  { id: 'P2', name: "Hairlab Women's Hair" },
  { id: 'P3', name: 'Hairlab Phuket' },
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
// ความคืบหน้าของแชท -> คุณภาพแชทที่ใช้สรุปในตารางโฆษณา
const QUALITY = { qualified: 'good', in_progress: 'good', talked: 'average', very_poor: 'poor', no_reply: 'poor' };
const poorReasons = dropReasons.filter((r) => r !== 'ไม่ตอบกลับ');
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
    const tier = qr < ad.quality ? 'good' : qr < ad.quality + (1 - ad.quality) * 0.55 ? 'average' : 'poor';
    const weights = {
      good: { qualified: 38, in_progress: 32, talked: 18, very_poor: 4, no_reply: 8 },
      average: { qualified: 12, in_progress: 26, talked: 36, very_poor: 12, no_reply: 14 },
      poor: { qualified: 2, in_progress: 8, talked: 20, very_poor: 34, no_reply: 36 },
    }[tier];
    let pick = rand() * Object.values(weights).reduce((x, y) => x + y, 0);
    let status = Object.keys(weights).find((k) => (pick -= weights[k]) <= 0) || 'talked';
    if (date >= addDays(t, -1) && status !== 'no_reply') status = rand() < 0.5 ? 'in_progress' : 'talked';
    const cr = rand();
    const channel = cr < 0.52 ? 'Messenger' : cr < 0.82 ? 'LINE' : cr < 0.95 ? 'Instagram' : 'WhatsApp';
    const [lo, hi] = camp[ad.campaignId].price;
    const bought = status === 'qualified' && rand() < 0.45;
    leads.push({
      id: `L-${String(n).padStart(4, '0')}`,
      name: `คุณ${firstNames[Math.floor(rand() * firstNames.length)]} ${initials[Math.floor(rand() * initials.length)]}.`,
      adId: ad.id,
      channel,
      date, // วันที่เริ่มคุย
      repId: reps[Math.floor(rand() * reps.length)].id,
      quality: QUALITY[status],
      status,
      value: bought ? Math.round((lo + rand() * (hi - lo)) / 500) * 500 : 0,
      firstResponseMin: status === 'no_reply' ? null : Math.round(2 + rand() * rand() * 58),
      dropReason: status === 'very_poor' ? poorReasons[Math.floor(rand() * poorReasons.length)] : status === 'no_reply' ? 'ไม่ตอบกลับ' : null,
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


// ---------- ข้อความแชทตัวอย่าง (สร้างจากรหัสลีด ผลเหมือนเดิมทุกครั้ง) ----------
const OPENERS = {
  C1: ['สวัสดีครับ สนใจปลูกผมแบบ FUE ครับ', 'ผมเริ่มผมบางตรงหน้าผาก อยากทราบราคาปลูกผมครับ'],
  C2: ['สนใจโปร PRP ลด 50% ค่ะ ยังมีอยู่ไหมคะ', 'อยากทำ PRP ลดผมร่วงค่ะ ราคาเท่าไหร่คะ'],
  C3: ['ขอปรึกษาฟรีหน่อยครับ ผมบางมาหลายปีแล้ว', 'สนใจนัดปรึกษาแพทย์ฟรีค่ะ ต้องทำยังไงคะ'],
  C4: ['ผมบางช่วงกลางศีรษะค่ะ ปรึกษาได้ไหมคะ', 'อยากตรวจหนังศีรษะฟรีค่ะ ต้องทำยังไงคะ'],
  C5: ['สนใจปลูกหนวดเคราครับ ราคาเริ่มต้นเท่าไหร่', 'อยากปลูกคิ้วให้ดูเป็นธรรมชาติค่ะ ราคาเท่าไหร่คะ'],
  C6: ['เคยดูโฆษณาไว้ อยากสอบถามแพ็กเกจเพิ่มเติมครับ', 'สนใจแพ็กเกจที่เคยเห็นค่ะ ขอรายละเอียดหน่อยค่ะ'],
};
const POOR_REPLY = {
  'ราคาสูงเกินไป': (p) => `แพงไปหน่อยนะ${p} ขอคิดดูก่อน`,
  'ไม่สะดวกเดินทาง': (p) => `อยู่ต่างจังหวัด ไม่สะดวกเดินทางมาที่คลินิก${p}`,
  'เปรียบเทียบคลินิกอื่น': (p) => `ขอเปรียบเทียบกับที่อื่นก่อนนะ${p}`,
  'แค่สอบถามข้อมูล': (p) => `แค่ถามดูเฉยๆ ${p} ขอบคุณมาก${p}`,
  'ขอเวลาตัดสินใจ': (p) => `ขอเวลาตัดสินใจก่อนนะ${p}`,
};

function conversation(lead, data) {
  const rand = rng(Number(String(lead.id).replace(/\D/g, '')) * 7919 + 13);
  const ad = data.ads.find((a) => a.id === lead.adId);
  const camp = campaigns.find((c) => c.id === (ad && ad.campaignId)) || campaigns[0];
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const tdy = today();
  const msgs = [];
  let day = 0; let cur = 9 * 60 + Math.floor(rand() * 10 * 60); let stopped = false;
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const say = (from, text, gap) => {
    if (stopped) return;
    cur += gap;
    if (cur > 22 * 60) { day += 1; cur = 9 * 60 + Math.floor(rand() * 90); }
    const date = addDays(lead.date, day);
    if (date > tdy) { stopped = true; return; }
    msgs.push({ from, text, at: `${date} ${hhmm(cur)}` });
  };

  const opener = pick(OPENERS[camp.id] || OPENERS.C3);
  const p = /ค่ะ|คะ/.test(opener) ? 'ค่ะ' : 'ครับ';
  const q = p === 'ค่ะ' ? 'คะ' : 'ครับ';
  const info = pick([`บริเวณหน้าผากกับกลางศีรษะ${p} เป็นมาประมาณ 3 ปี`, `ผมร่วงเยอะช่วงปีที่ผ่านมา${p} โดยเฉพาะด้านบน`, `เหม่งขึ้นมา 2 ปีแล้ว${p}`]);
  const price = `ราคาขึ้นอยู่กับการประเมินของแพทย์ เบื้องต้นเริ่มที่ประมาณ ${fmt(camp.price[0])} บาท และไม่เกิน ${fmt(camp.price[1])} บาท ค่ะ`;

  say('customer', opener, 0);
  say('staff', `สวัสดีค่ะ ${lead.name} ขอบคุณที่สนใจ Hairlab Clinic ค่ะ ไม่ทราบว่าสนใจบริเวณไหน และเป็นมานานเท่าไหร่แล้วคะ`, lead.firstResponseMin ?? 6);

  switch (lead.status) {
    case 'no_reply':
      say('staff', `ขออนุญาตติดตามนะคะ ${lead.name} ยังสนใจให้ทีมงานประเมินเบื้องต้นให้ไหมคะ`, 700);
      say('staff', 'ทางคลินิกมีนัดตรวจกับแพทย์ฟรีสัปดาห์นี้ค่ะ หากสะดวกทักกลับได้เลยนะคะ', 1500);
      break;
    case 'very_poor':
      say('customer', info, 8);
      say('staff', price, 5);
      say('customer', (POOR_REPLY[lead.dropReason] || POOR_REPLY['ขอเวลาตัดสินใจ'])(p), 15);
      say('staff', 'ได้เลยค่ะ หากต้องการข้อมูลเพิ่มเติม ทักมาได้ตลอดนะคะ', 4);
      break;
    case 'talked':
      say('customer', info, 6);
      say('staff', price, 5);
      say('customer', `ใช้เวลาฟื้นตัวนานไหม${q}`, 12);
      say('staff', 'โดยทั่วไปกลับไปทำงานได้ภายใน 3-5 วันค่ะ ผลลัพธ์จะเห็นชัดขึ้นเรื่อยๆ ภายใน 6-12 เดือน', 6);
      say('customer', `โอเค${p} เดี๋ยวขอคิดดูแล้วทักกลับนะ${p}`, 10);
      say('staff', 'ได้เลยค่ะ ถ้าต้องการนัดตรวจกับแพทย์แจ้งได้เลยนะคะ', 3);
      break;
    case 'in_progress':
      say('customer', info, 6);
      say('staff', price, 5);
      say('customer', `ขอนัดปรึกษากับหมอได้ไหม${q}`, 9);
      say('staff', 'ได้ค่ะ ตอนนี้ว่างวันพฤหัสกับวันเสาร์ สะดวกวันไหนคะ', 4);
      say('customer', `ขอดูตารางช่วงบ่ายก่อนนะ${p}`, 11);
      say('staff', 'ได้ค่ะ เดี๋ยวส่งตารางเวลาให้ทางแชทนะคะ รอยืนยันวันที่สะดวกอีกครั้งค่ะ', 5);
      break;
    case 'qualified': {
      say('customer', info, 6);
      say('staff', price, 5);
      say('customer', `งบประมาณประมาณ ${fmt(Math.round((camp.price[0] + (camp.price[1] - camp.price[0]) * 0.4) / 5000) * 5000)} บาท${p} อยากเริ่มเร็วที่สุด`, 8);
      say('staff', 'ตรงตามเงื่อนไขค่ะ ขอนัดตรวจกับแพทย์ก่อนเพื่อประเมินจำนวนที่เหมาะสม ว่างวันพฤหัสกับวันเสาร์ค่ะ', 5);
      say('customer', `วันเสาร์บ่ายสองได้${p}`, 7);
      say('staff', 'ยืนยันนัดเรียบร้อยค่ะ เดี๋ยวส่งแผนที่และขั้นตอนก่อนเข้าพบให้ทางแชทนะคะ', 3);
      if (lead.value > 0) {
        say('staff', `เพื่อจองคิวแพทย์ รบกวนชำระมัดจำ 5,000 บาทค่ะ ยอดรวมโปรแกรมประมาณ ${fmt(lead.value)} บาท`, 1500);
        say('customer', `โอนแล้ว${p} [ส่งสลิป]`, 25);
        say('staff', 'ได้รับยอดมัดจำเรียบร้อยแล้วค่ะ ขอบคุณมากค่ะ แล้วพบกันนะคะ', 6);
      }
      break;
    }
    default:
  }
  return msgs;
}

module.exports = { load, conversation };
