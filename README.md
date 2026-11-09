# Hair Clinic Ads Dashboard

แดชบอร์ดดูผลโฆษณา Facebook ของคลินิกปลูกผม — ค่าโฆษณา, ข้อความ/แชท, คุณภาพแชท, ทีมขาย และลีดที่หลุด
ตอนนี้ใช้ **ข้อมูลเดโม** อยู่ และเตรียมระบบเชื่อม **Meta Marketing API** ไว้แล้ว (กรอก token ในหน้า Setting ได้เลย)

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม ใช้แค่ Node.js 18 ขึ้นไป

## เริ่มใช้งาน

```bash
cd hair-ads-dashboard
node server.js          # หรือ npm start
```

เปิด http://localhost:3000

- ชื่อผู้ใช้: `admin`
- รหัสผ่านเริ่มต้น: `admin1234` (ระบบจะเตือนให้เปลี่ยนหลังล็อกอิน ที่เมนู **Setting → เปลี่ยนรหัสผ่าน**)
- ถ้าอยากตั้งรหัสเองตั้งแต่แรก: คัดลอก `.env.example` เป็น `.env` แล้วใส่ `ADMIN_PASSWORD=...` ก่อนรันครั้งแรก

## เมนูในระบบ

| เมนู | สถานะ |
|---|---|
| Dashboard (Ads Performance, Ads & Chat, Sales Performance, Trend, Dropped) | ใช้งานได้ ตัวกรอง 7D/30D/90D/Custom, เพจ, แคมเปญ, เอเจนซี่, เซลส์, สถานะ |
| Board | ใช้งานได้ — ลีดแยกตามสถานะ (ข้อมูลเดโม) |
| Setting | ใช้งานได้ — เชื่อม Meta, สลับโหมด, เปลี่ยนรหัสผ่าน |
| Inbox / Upload / Quality | ยังเป็นหน้าว่าง รอต่อระบบแชทจริง |

## เชื่อมต่อ Meta (ทำตอนพร้อม)

1. สร้างแอปที่ developers.facebook.com (ประเภท Business) และเพิ่ม Marketing API
2. Business Settings → สร้าง **System User** → ให้สิทธิ์เข้าถึง Ad Account (View performance)
3. Generate token เลือกสิทธิ์ `ads_read` และ `read_insights`
4. เข้าเว็บ → **Setting** → ใส่ Ad Account ID + Access Token → กด **บันทึกและทดสอบการเชื่อมต่อ**
5. เมื่อสำเร็จ กด **ใช้ข้อมูล Meta** (กลับไปโหมดเดโมได้ทุกเมื่อ)

ข้อมูลที่ดึงจาก Meta: spend, impressions, reach, clicks, ข้อความที่เริ่มสนทนา
(`onsite_conversion.messaging_conversation_started_7d`) และ purchases รายวันระดับ ad พร้อมชื่อแคมเปญ/ad set/ประเภทครีเอทีฟ/เพจ
ผลจะถูกแคช 10 นาที (ปุ่ม Refresh ล้างแคช)

> **ข้อควรรู้**
> - ยังไม่ได้ทดสอบกับบัญชี Meta จริง (ทดสอบกับ Graph API จำลองแล้ว) ตอนเชื่อมจริงถ้ามีข้อผิดพลาด ระบบจะแสดงข้อความจาก Meta ให้ในหน้า Setting
> - Reach ที่รวมหลายวันเป็นผลรวมของ reach รายวัน จึงอาจมากกว่า unique reach ที่ Ads Manager แสดง
> - Purchases ต้องมี Pixel / Conversions API ส่ง event ซื้อ ถ้าคลินิกวัดผลเป็นการนัดหมายหรือมัดจำ ต้องส่งเป็น custom event แล้วปรับ `parseInsightRow` ใน `lib/meta.js`
> - **คุณภาพแชท / ทีมขาย / ลีดที่หลุด** ไม่มีใน Ads API ต้องมาจากระบบแชทของคลินิก ในโหมด Meta ส่วนนี้จะว่างจนกว่าจะต่อเพิ่ม
>   (ใส่ลีดในไฟล์ `data/leads.json` รูปแบบเดียวกับ `lib/demo.js` หรือต่อ Messenger Platform/ระบบ CRM ต่อไป)
> - Access token เก็บในไฟล์ `data/settings.json` ฝั่งเซิร์ฟเวอร์ (สิทธิ์ 600) ไม่ส่งกลับไปที่เบราว์เซอร์ อย่า commit โฟลเดอร์ `data/`

## ขึ้นใช้งานจริง

- ตั้ง `HOST=0.0.0.0` และใช้งานหลัง HTTPS (reverse proxy เช่น Nginx/Caddy) พร้อมตั้ง `COOKIE_SECURE=1`
- เปลี่ยนรหัสผ่านเริ่มต้นก่อนเปิดให้คนอื่นเข้าถึง
- ระบบมีจำกัดการลองรหัสผ่านผิด (5 ครั้ง/10 นาที) และ session หมดอายุ 12 ชั่วโมง

## โครงสร้าง

```
server.js          เซิร์ฟเวอร์ HTTP + API
lib/auth.js        ล็อกอิน (scrypt), session, เปลี่ยนรหัสผ่าน
lib/demo.js        ข้อมูลเดโมคลินิกปลูกผม
lib/meta.js        เชื่อม Meta Graph API
lib/metrics.js     คำนวณ KPI เทียบช่วงก่อนหน้า, ตารางแอด, เทรนด์
lib/providers.js   เลือกแหล่งข้อมูล demo / meta
public/            หน้าเว็บ (HTML/CSS/JS ล้วน ไม่ต้อง build)
test/run.js        ชุดทดสอบ  →  npm test
```
