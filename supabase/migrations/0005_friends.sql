-- SYSTEM IRL: usernames and friends. Safe to run more than once.

-- Unique, lowercase usernames (a-z, 0-9, underscore; 3–20 characters).
alter table public.profiles add column if not exists username text;
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index if not exists profiles_username_unique on public.profiles (username) where username is not null;

-- The progress summary friends may see (no measurements, finances, notes or logs). Written by the server.
alter table public.player_levels add column if not exists stats jsonb not null default '{}'::jsonb;

-- Friend requests and friendships. Written by the server only; each side can read its own.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users (id) on delete cascade,
  addressee_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;
drop policy if exists "friendships member read" on public.friendships;
create policy "friendships member read" on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

revoke all on public.friendships from anon;
revoke all on public.friendships from authenticated;
grant select on public.friendships to authenticated;
grant all on public.friendships to service_role;

-- Lets the app detect that this migration has been applied.
insert into public.system_meta (key, value) values ('migration_0005', 'applied')
  on conflict (key) do update set value = excluded.value, updated_at = now();
