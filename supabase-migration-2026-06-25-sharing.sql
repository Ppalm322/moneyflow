-- ============================================================
-- MoneyFlow migration: private-by-default + per-profile sharing
-- รันใน Supabase Dashboard -> SQL Editor -> New query -> Run
-- รันทั้งไฟล์นี้ได้เลย (idempotent — รันซ้ำได้)
-- ⚠️ รัน SQL นี้ "ก่อน" deploy โค้ดเว็บเวอร์ชันใหม่
-- ============================================================

-- 1) เจ้าของแถว -------------------------------------------------
alter table public.transactions add column if not exists user_id uuid default auth.uid();

-- backfill แถวเดิมทั้งหมด -> บัญชีหลัก
-- หาอีเมลก่อน (ไม่สนตัวพิมพ์/ช่องว่าง) ถ้าไม่เจอ -> ยกให้บัญชีแรกสุดที่สร้าง (= ตัวคุณ)
update public.transactions
set user_id = coalesce(
  (select id from auth.users where lower(trim(email)) = lower('ooo15252@gmail.com')),
  (select id from auth.users order by created_at asc limit 1)
)
where user_id is null;

-- บังคับ not null หลัง backfill (ถ้ายังมี null = ไม่มี account ใน auth.users เลย)
alter table public.transactions alter column user_id set not null;

-- 2) ตารางแชร์รายโปรไฟล์ --------------------------------------
create table if not exists public.profile_shares (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email       text not null default (auth.jwt() ->> 'email'),
  profile           text not null,
  shared_with_email text not null,
  role              text not null default 'viewer' check (role in ('viewer','editor')),
  created_at        timestamptz default now(),
  unique (owner_id, profile, shared_with_email)
);
alter table public.profile_shares enable row level security;

-- 3) ฟังก์ชันเช็คสิทธิ์ (security definer กัน RLS วนซ้ำ) -------
create or replace function public.can_access_profile(_owner uuid, _profile text, _need_edit boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profile_shares s
    where s.owner_id = _owner
      and s.profile = _profile
      and lower(s.shared_with_email) = lower(auth.jwt() ->> 'email')
      and (not _need_edit or s.role = 'editor')
  );
$$;

-- 4) RLS ใหม่ของ transactions (แทนของเดิมที่ใช้ร่วมกัน) -------
drop policy if exists "read"   on public.transactions;
drop policy if exists "insert" on public.transactions;
drop policy if exists "update" on public.transactions;
drop policy if exists "delete" on public.transactions;
drop policy if exists "tx_read"   on public.transactions;
drop policy if exists "tx_insert" on public.transactions;
drop policy if exists "tx_update" on public.transactions;
drop policy if exists "tx_delete" on public.transactions;

create policy "tx_read" on public.transactions for select to authenticated
using ( user_id = auth.uid() or public.can_access_profile(user_id, profile, false) );

create policy "tx_insert" on public.transactions for insert to authenticated
with check ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) );

create policy "tx_update" on public.transactions for update to authenticated
using      ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) )
with check ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) );

create policy "tx_delete" on public.transactions for delete to authenticated
using ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) );

-- 5) RLS ของ profile_shares -----------------------------------
drop policy if exists "shares_owner_all"      on public.profile_shares;
drop policy if exists "shares_recipient_read" on public.profile_shares;

create policy "shares_owner_all" on public.profile_shares for all to authenticated
using ( owner_id = auth.uid() ) with check ( owner_id = auth.uid() );

create policy "shares_recipient_read" on public.profile_shares for select to authenticated
using ( lower(shared_with_email) = lower(auth.jwt() ->> 'email') );

-- 6) realtime ให้ profile_shares (รันซ้ำได้) ------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profile_shares'
  ) then
    alter publication supabase_realtime add table public.profile_shares;
  end if;
end $$;
