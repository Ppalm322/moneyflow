# MoneyFlow

แอปบัญชีรายรับรายจ่ายส่วนตัว — สร้างแยกเป็น **3 เพจจริงตามแพลตฟอร์ม** (เว็บ / iPad / มือถือ) ที่ **แชร์ data logic ชุดเดียวกัน** เก็บข้อมูลในเครื่องด้วย `localStorage` ใช้งานออฟไลน์ได้

## โครงสร้าง

```
index.html              landing — เลือกแพลตฟอร์ม
shared/
  core.js               data layer + business logic + ตัวสร้าง UI + chrome (toast/modals)
  base.css              design tokens + คอมโพเนนต์ร่วม (การ์ด/กราฟ/ฟอร์ม/รายการ/โมดัล)
web/    index.html style.css app.js     เดสก์ท็อป — sidebar เต็ม + กริด 4 คอลัมน์
ipad/   index.html style.css app.js     แท็บเล็ต — split-view + segmented control + ฟอร์มลอยขวา
mobile/ index.html style.css app.js     มือถือ — single-view + bottom nav + ปุ่ม ＋ ลอย
uploads/expense-dashboard-premium-v3/   ตัวต้นฉบับ responsive เดิม (อ้างอิง)
```

แต่ละเพจมีแค่ **layout shell + CSS เฉพาะแพลตฟอร์ม + ตัว wiring สั้น ๆ** ส่วนตรรกะทั้งหมด (เพิ่ม/แก้ไข/ลบ/ค้นหา/กรอง/CSV/บีบอัดรูป/หมวดหมู่/สี/โมดัล) อยู่ใน `shared/core.js` เปิดผ่าน `window.MF`

## รันในเครื่อง

ต้องเปิดผ่าน HTTP server (เพจโหลดไฟล์ `shared/*` แบบ relative):

```bash
cd moneyflow
python3 -m http.server 8755
# เปิด http://localhost:8755/
```

ข้อมูลของทั้ง 3 เพจ sync กันผ่าน `localStorage` ของ origin เดียวกัน (เพิ่มรายการบนเว็บ → เห็นบนมือถือทันทีถ้าเปิดที่ origin เดียวกัน)

## ฟีเจอร์

- บันทึกรายรับ/รายจ่าย พร้อมหมวดหมู่ + แนบรูปสลิป (บีบอัดอัตโนมัติ)
- การ์ดสรุปยอดวันนี้/สะสม + กราฟวงแหวนสัดส่วนค่าใช้จ่าย (วันนี้/ทั้งหมด)
- ค้นหา + ตัวกรอง (วันนี้ / 7 วัน / เดือนนี้ / รายรับ / รายจ่าย)
- แก้ไข/ลบรายการ, ลบรายการวันนี้, ส่งออก CSV, ดูสลิปแบบ lightbox
- เปลี่ยนวันอัตโนมัติ (ยอดรายวันเริ่มนับใหม่ ประวัติ/ยอดสะสมคงเดิม)

เก็บข้อมูลในเบราว์เซอร์ (ไม่มี backend) — พร้อมต่อ API ภายหลังผ่าน Data Layer (`Store`) ใน `core.js`
