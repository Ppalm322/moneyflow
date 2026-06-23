# ตั้งค่าให้ใช้ได้หลายเครื่องหลายคน + Login อีเมล/รหัสผ่าน

ระบบใช้ **Supabase** (ฐานข้อมูล + Auth) เป็น backend ทำตาม 4 ขั้น แล้วใส่คีย์ 2 ตัวในไฟล์ `app.js`

> **URL เว็บคงที่ (ใช้ค่านี้ทุกที่ที่ต้องลงทะเบียน):** `https://moneyflow-pp.vercel.app`
> (เป็น alias ถาวร ไม่เปลี่ยนตาม deploy — เอาไปใส่ใน Supabase Site URL / Redirect URLs ได้เลย)

## 1) สร้าง Supabase project
1. ไปที่ https://supabase.com → Sign in (ใช้ GitHub/อีเมลก็ได้) → **New project**
2. ตั้งชื่อ + ตั้งรหัส database → รอสร้างเสร็จ
3. ไปที่ **SQL Editor → New query** → วางเนื้อหาไฟล์ [`supabase-schema.sql`](supabase-schema.sql) → **Run**
   (สร้างตาราง `transactions` + สิทธิ์ + เปิด realtime)

## 2) เปิดล็อกอินแบบอีเมล + รหัสผ่าน
ระบบใช้หน้าสมัคร/ล็อกอินในตัวแอป (อีเมล + รหัสผ่าน) ผ่าน Supabase Auth ไม่ต้องใช้ Facebook
1. ใน Supabase: **Authentication → Sign In / Providers → Email** → ตรวจว่า **Enable** อยู่ (ค่าเริ่มต้นเปิดอยู่แล้ว)
2. **แนะนำ:** ปิด **Confirm email** (ในหน้า Email provider เดียวกัน) เพื่อให้สมัครแล้วเข้าใช้งานได้ทันที
   - ถ้าเปิดไว้ ผู้ใช้ต้องกดยืนยันลิงก์ในอีเมลก่อนถึงจะล็อกอินได้
3. ใน Supabase: **Authentication → URL Configuration**
   - **Site URL** = `https://moneyflow-pp.vercel.app`
   - **Redirect URLs** = ใส่ URL เว็บเดียวกัน (รองรับหลายอันได้)

## 3) ใส่คีย์ในเว็บ
ใน Supabase: **Project Settings → API** จะมี
- **Project URL**
- **anon public key**

เปิดไฟล์ `app.js` แก้ 2 บรรทัดบนสุดของบล็อก CLOUD:
```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGci...";   // anon public (ปลอดภัยที่จะอยู่ในเว็บ — มี RLS ป้องกัน)
```
> เว้นว่าง 2 บรรทัดนี้ = แอปกลับไปทำงานแบบเก็บในเครื่อง (offline) เหมือนเดิม

## 4) deploy
`git push` (Vercel จะ build ให้อัตโนมัติ) — เสร็จแล้วเปิดเว็บ จะเจอหน้า **เข้าสู่ระบบ / สมัครสมาชิก** (อีเมล + รหัสผ่าน) ก่อนเข้าใช้งาน
ข้อมูลทุกเครื่องที่ล็อกอินจะเห็นชุดเดียวกัน + sync สดผ่าน realtime

---

### ข้อควรรู้
- **โดเมนต้องคงที่**: Supabase ผูกกับ URL ที่ลงทะเบียนไว้ใน URL Configuration ถ้าใช้ลิงก์ Vercel ที่มี hash (เปลี่ยนทุก deploy) จะต้องแก้ค่าทุกครั้ง → แนะนำใช้ production domain ที่นิ่ง เช่น `https://moneyflow-pp.vercel.app`
- **สมุดเดียวร่วมกัน vs ของใครของมัน**: ค่าเริ่มต้นคือ "ผู้ล็อกอินทุกคนเห็น/แก้ข้อมูลชุดเดียวกัน" (เหมาะกับครอบครัว/ทีม) ถ้าอยากให้แต่ละคนมีสมุดส่วนตัว ดูคอมเมนต์ท้ายไฟล์ `supabase-schema.sql`
- **การยืนยันอีเมล**: ถ้าเปิด **Confirm email** ใน Supabase ผู้ใช้ต้องกดลิงก์ยืนยันในอีเมลก่อนล็อกอิน — ถ้าอยากให้สมัครแล้วใช้ได้เลย ให้ปิดตัวเลือกนี้ (Authentication → Email provider)
