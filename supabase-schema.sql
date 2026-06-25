-- ============================================================
-- MoneyFlow — Supabase schema + RLS
-- รันใน Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  amount     numeric not null,
  category   text not null,
  note       text,
  date       text not null,        -- 'YYYY-MM-DD' (เก็บเป็น text ให้ตรงกับฝั่งเว็บ)
  time       text,                 -- 'HH:MM'
  receipt    text,                 -- รูปสลิป (base64 data URL) — เว้นว่างได้
  created_by text,                 -- ชื่อผู้เพิ่ม (จาก Facebook)
  edited_by  text,                 -- ชื่อผู้แก้ไขล่าสุด
  created_at timestamptz default now(),
  edited_at  timestamptz
);

-- ชื่อ "เจ้าของสมุด" (โปรไฟล์คน เช่น ตัวเอง/ลูก/แม่) — สมุดแยกของใครของมัน
-- หมายเหตุ: ต่างจากคอลัมน์ owner (uuid) ด้านล่างที่ใช้แยกสิทธิ์ผู้ใช้
alter table public.transactions add column if not exists profile text;

alter table public.transactions enable row level security;

-- ===== โหมด "สมุดเดียวใช้ร่วมกัน" (หลายคนเห็น/แก้ข้อมูลชุดเดียวกัน) =====
-- ผู้ที่ล็อกอินแล้ว (authenticated) ทุกคน อ่าน/เพิ่ม/แก้/ลบ ได้
drop policy if exists "read"   on public.transactions;
drop policy if exists "insert" on public.transactions;
drop policy if exists "update" on public.transactions;
drop policy if exists "delete" on public.transactions;
create policy "read"   on public.transactions for select to authenticated using (true);
create policy "insert" on public.transactions for insert to authenticated with check (true);
create policy "update" on public.transactions for update to authenticated using (true);
create policy "delete" on public.transactions for delete to authenticated using (true);

-- เปิด realtime ให้ทุกเครื่อง sync กันสด ๆ (รันซ้ำได้ ไม่ error ถ้าเพิ่มไว้แล้ว)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

-- ------------------------------------------------------------
-- ทางเลือก: ถ้าอยากให้ "ต่างคนต่างมีสมุดของตัวเอง" (ไม่เห็นของคนอื่น)
-- ให้เพิ่มคอลัมน์ owner แล้วเปลี่ยน policy เป็น owner = auth.uid()
-- ------------------------------------------------------------
-- alter table public.transactions add column owner uuid default auth.uid();
-- drop policy "read" on public.transactions;
-- drop policy "insert" on public.transactions;
-- drop policy "update" on public.transactions;
-- drop policy "delete" on public.transactions;
-- create policy "read"   on public.transactions for select to authenticated using (owner = auth.uid());
-- create policy "insert" on public.transactions for insert to authenticated with check (owner = auth.uid());
-- create policy "update" on public.transactions for update to authenticated using (owner = auth.uid());
-- create policy "delete" on public.transactions for delete to authenticated using (owner = auth.uid());
