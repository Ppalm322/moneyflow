-- ============================================================
-- MoneyFlow migration: ประวัติการใช้งาน (activity log)
-- บันทึกว่าใครเพิ่ม/แก้/ลบ ในสมุดที่แชร์ร่วมกัน
-- รันใน Supabase Dashboard -> SQL Editor -> Run (idempotent)
-- ⚠️ รันไฟล์นี้ก่อน deploy โค้ดเว็บที่มีหน้าประวัติ
-- ============================================================

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,            -- เจ้าของสมุด/โปรไฟล์ที่เกิดเหตุ
  profile     text not null,            -- โปรไฟล์
  actor_email text,                     -- อีเมลคนที่ทำ
  actor_name  text,                     -- ชื่อที่แสดง
  action      text not null,            -- add | edit | delete | clear
  amount      numeric,
  category    text,
  note        text,
  tx_date     text,
  created_at  timestamptz default now()
);
alter table public.activity_log enable row level security;

-- อ่าน log ได้ถ้าเป็นเจ้าของ หรือมีสิทธิ์เข้าถึงโปรไฟล์นั้น (รวมคนที่ถูกแชร์)
drop policy if exists "log_read"   on public.activity_log;
drop policy if exists "log_insert" on public.activity_log;

create policy "log_read" on public.activity_log for select to authenticated
using ( owner_id = auth.uid() or public.can_access_profile(owner_id, profile, false) );

-- เขียน log ได้ถ้าเป็นเจ้าของ หรือเป็น editor ของโปรไฟล์นั้น
create policy "log_insert" on public.activity_log for insert to authenticated
with check ( owner_id = auth.uid() or public.can_access_profile(owner_id, profile, true) );

-- realtime (รันซ้ำได้)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;
