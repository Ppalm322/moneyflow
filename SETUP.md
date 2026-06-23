# ตั้งค่าให้ใช้ได้หลายเครื่องหลายคน + Login Facebook

ระบบใช้ **Supabase** (ฐานข้อมูล + Auth) เป็น backend ทำตาม 4 ขั้น แล้วใส่คีย์ 2 ตัวในไฟล์ `app.js`

> **URL เว็บคงที่ (ใช้ค่านี้ทุกที่ที่ต้องลงทะเบียน):** `https://moneyflow-pp.vercel.app`
> (เป็น alias ถาวร ไม่เปลี่ยนตาม deploy — เอาไปใส่ใน Facebook OAuth Redirect / Supabase Site URL ได้เลย)

## 1) สร้าง Supabase project
1. ไปที่ https://supabase.com → Sign in (ใช้ GitHub/อีเมลก็ได้) → **New project**
2. ตั้งชื่อ + ตั้งรหัส database → รอสร้างเสร็จ
3. ไปที่ **SQL Editor → New query** → วางเนื้อหาไฟล์ [`supabase-schema.sql`](supabase-schema.sql) → **Run**
   (สร้างตาราง `transactions` + สิทธิ์ + เปิด realtime)

## 2) เปิด Facebook เป็นวิธีล็อกอิน
1. สร้าง Facebook App: https://developers.facebook.com → **My Apps → Create App** → ชนิด **Authenticate and request data from users with Facebook Login**
2. ใน Supabase: **Authentication → Providers → Facebook** → เปิด (Enable)
   - ช่อง **Callback URL** ที่ Supabase แสดง (เช่น `https://xxxx.supabase.co/auth/v1/callback`) → ก๊อปไปใส่ใน Facebook App ที่ **Facebook Login → Settings → Valid OAuth Redirect URIs**
   - เอา **App ID** + **App Secret** จาก Facebook (App settings → Basic) → วางใน Supabase Facebook provider → **Save**
3. ใน Supabase: **Authentication → URL Configuration**
   - **Site URL** = URL เว็บที่ deploy (เช่น `https://<โดเมนของคุณ>`)
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
`git push` (Vercel จะ build ให้อัตโนมัติ) — เสร็จแล้วเปิดเว็บ จะเจอหน้า **เข้าสู่ระบบด้วย Facebook** ก่อนเข้าใช้งาน
ข้อมูลทุกเครื่องที่ล็อกอินจะเห็นชุดเดียวกัน + sync สดผ่าน realtime

---

### ข้อควรรู้
- **โดเมนต้องคงที่**: Facebook/Supabase ผูกกับ URL ที่ลงทะเบียนไว้ ถ้าใช้ลิงก์ Vercel ที่มี hash (เปลี่ยนทุก deploy) จะต้องแก้ค่าทุกครั้ง → แนะนำตั้ง **custom domain** หรือใช้ production domain ที่นิ่ง
- **สมุดเดียวร่วมกัน vs ของใครของมัน**: ค่าเริ่มต้นคือ "ผู้ล็อกอินทุกคนเห็น/แก้ข้อมูลชุดเดียวกัน" (เหมาะกับครอบครัว/ทีม) ถ้าอยากให้แต่ละคนมีสมุดส่วนตัว ดูคอมเมนต์ท้ายไฟล์ `supabase-schema.sql`
- Facebook App จะอยู่โหมด **Development** ตอนแรก (เฉพาะคุณ+tester ล็อกอินได้) ถ้าจะเปิดให้คนทั่วไปต้องกด **Live** (อาจต้องใส่ Privacy Policy URL)
