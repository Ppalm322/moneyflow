# Design: Private-by-default + per-profile sharing & permissions

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation
**App:** MoneyFlow (static HTML + app.js + Supabase)

## Problem

Today the Supabase RLS is "one shared book": every authenticated user reads/writes
ALL rows (`using (true)`). The new "profile/person" feature is only a text label +
client-side filter inside that shared book — not real per-user isolation.

We want: **each user sees only their own data by default**, and can **share a
specific profile (person) to another user by email**, choosing whether that person
gets **view-only** or **editor** access.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Default visibility | Private per user (`user_id = auth.uid()`) |
| Share granularity | Per **profile** (e.g. share just "ลูก", not the whole account) |
| Permission levels | Chosen per share: `viewer` (read) or `editor` (read+write) |
| Invite identity | By **email**; matched via `auth.jwt() ->> 'email'` (works before invitee signs up) |
| Existing cloud rows | Backfilled to owner **ooo15252@gmail.com** |
| Local (no-cloud) mode | Sharing is cloud-only; local mode keeps current single-user behavior |

## Data model (Supabase)

### `transactions` — add owner column
```sql
alter table public.transactions add column if not exists user_id uuid default auth.uid();
-- backfill existing rows to the primary account
update public.transactions
set user_id = (select id from auth.users where email = 'ooo15252@gmail.com')
where user_id is null;
alter table public.transactions alter column user_id set not null;
```
Keeps existing `profile text` (person label within an owner's book).

### `profile_shares` — new table
```sql
create table if not exists public.profile_shares (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email       text not null default (auth.jwt() ->> 'email'),  -- for display on recipient side
  profile           text not null,                                   -- which person/profile is shared
  shared_with_email text not null,
  role              text not null default 'viewer' check (role in ('viewer','editor')),
  created_at        timestamptz default now(),
  unique (owner_id, profile, shared_with_email)
);
alter table public.profile_shares enable row level security;
```

## RLS

### Access helper (security definer — avoids recursive RLS in policies)
```sql
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
```

### `transactions` policies (replace the old permissive ones)
```sql
drop policy if exists "read"   on public.transactions;
drop policy if exists "insert" on public.transactions;
drop policy if exists "update" on public.transactions;
drop policy if exists "delete" on public.transactions;

create policy "tx_read" on public.transactions for select to authenticated
using ( user_id = auth.uid() or public.can_access_profile(user_id, profile, false) );

create policy "tx_insert" on public.transactions for insert to authenticated
with check ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) );

create policy "tx_update" on public.transactions for update to authenticated
using      ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) )
with check ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) );

create policy "tx_delete" on public.transactions for delete to authenticated
using ( user_id = auth.uid() or public.can_access_profile(user_id, profile, true) );
```

### `profile_shares` policies
```sql
drop policy if exists "shares_owner_all"      on public.profile_shares;
drop policy if exists "shares_recipient_read" on public.profile_shares;

-- owner manages their own shares
create policy "shares_owner_all" on public.profile_shares for all to authenticated
using ( owner_id = auth.uid() ) with check ( owner_id = auth.uid() );

-- recipient may read shares addressed to them (so the app can list "shared to me")
create policy "shares_recipient_read" on public.profile_shares for select to authenticated
using ( lower(shared_with_email) = lower(auth.jwt() ->> 'email') );
```

### Realtime
Add `profile_shares` to the `supabase_realtime` publication (idempotent DO block,
same pattern as the existing one for `transactions`).

## App changes

### Identity
`user.id` (auth uid) is already captured in `setUserFromSession`. Use it as the
owner id for "my" rows.

### Book context (replaces the plain `activeProfile` string)
The active selection becomes one of:
- `{ kind:'own', profile }` → rows where `user_id == me && profile == p`
- `{ kind:'shared', ownerId, ownerEmail, profile, role }` → rows where `user_id == ownerId && profile == p`

`activeEntries()` filters by this context (owner id + profile), not just profile text.

### Profile switcher (top bar) — two groups
- **ของฉัน**: distinct `profile` where `user_id == me`
- **แชร์มาให้ฉัน**: from `profile_shares` where `shared_with_email == my email`,
  each shown as `"<profile> · จาก <owner_email> 👁/✎"`

### Cloud load
1. `select *` from `transactions` (RLS returns my rows + shared rows).
2. `select *` from `profile_shares` (returns shares I own + shares to me).
3. Build my-profiles (from my rows) and shared-to-me list (from shares to me + matching rows).

### Writing
- `entryToRow`/`rowToEntry` include `user_id`.
- New entry: `user_id = (context.kind==='shared' ? context.ownerId : me)`; `profile = context.profile`.
- Edit/delete allowed only when `kind==='own'` OR `role==='editor'`.

### Read-only UI
When `kind==='shared' && role==='viewer'`: hide the add form / edit (✎) / delete (🗑)
controls; show a "อ่านอย่างเดียว (แชร์มา)" badge.

### Settings — sharing controls
Per **own** profile row, add a **"แชร์"** action:
- Input email + choose role (👁 viewer / ✎ editor) → upsert into `profile_shares`.
- List existing shares for that profile (email + role) with a **revoke** (delete) button.
- Block sharing to your own email.

### Profile rename/delete consistency (cloud)
- Rename own profile → also `update profile_shares set profile=new where owner_id=me and profile=old`.
- Delete own profile → also delete its `profile_shares` rows.

## Migration order (run in Supabase SQL Editor)
1. Add `user_id` column + backfill to primary account + set not null.
2. Create `profile_shares` + enable RLS.
3. Create `can_access_profile` function.
4. Drop old permissive policies; create new `tx_*` + `shares_*` policies.
5. Add `profile_shares` to realtime publication.

**Deploy order:** run SQL first, then deploy the new client. (The new client sends
`user_id`; the new RLS expects it. Running them out of order breaks reads/writes.)

## Edge cases
- Share to an email with no account yet → no match until they sign up & log in (natural "pending").
- Duplicate share (same owner+profile+email) → unique constraint; treat as role update (upsert).
- Owner display name: recipient shows `owner_email` (stored on the share row).
- Empty shared profile (no rows yet) → still appears via the share row; list is empty until data added.
- Editor adds entry → row's `user_id = ownerId` so it lands in the owner's book.

## Risks
- **Largest change so far**: rewires RLS + auth identity + multiple UI areas.
- A botched migration can temporarily hide data (recoverable — data isn't deleted).
- Recommend implementing in a **fresh session** (current session cost is very high)
  with the SQL applied to a checkpoint/backup-aware moment.

## Testing plan (two accounts A & B)
1. Migration: A logs in → sees all backfilled data; B (new account) → sees nothing.
2. A shares profile "ลูก" → B as `viewer` → B sees "ลูก" read-only; no add/edit/delete.
3. A upgrades B to `editor` → B can add (row lands in A's book), edit, delete within "ลูก".
4. A revokes → B no longer sees "ลูก".
5. B's own profiles remain private to B throughout.
6. Realtime: changes by A appear on B without manual refresh.

## Out of scope (future)
- Group/household sharing, share-by-link, notifications/invites email, audit log,
  category-management UI, cross-profile combined view.
