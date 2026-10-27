-- SYSTEM IRL: rewards. Gold, reward chests, items and a player-stocked reward shop.
-- Safe to run more than once.

-- Gold ledger: like player_xp, append-only and written by the server only.
create table if not exists public.gold_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount integer not null check (amount between -100000 and 100000 and amount <> 0),
  kind text not null check (kind in ('quest', 'bonus', 'chest', 'purchase', 'penalty', 'reversal')),
  source_type text not null,
  source_id text,
  reason text not null check (char_length(reason) <= 200),
  idempotency_key text not null,
  awarded_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists gold_ledger_user_idx on public.gold_ledger (user_id, created_at);

-- Chests and items. Server-written; the player opens or uses them through the game API.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  item_code text not null check (item_code in ('chest', 'xp_elixir', 'penalty_shield', 'recovery_pass')),
  rarity text check (rarity in ('common', 'rare', 'epic', 'legendary')),
  source text not null check (source in ('chest', 'shop', 'system')),
  source_id text,
  data jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  acquired_at timestamptz not null default now(),
  used_at timestamptz,
  used_on date,
  unique (user_id, idempotency_key)
);
create index if not exists inventory_items_user_idx on public.inventory_items (user_id, used_at);

-- Real-life rewards the player stocks their shop with, priced in gold.
create table if not exists public.shop_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  price integer not null check (price between 1 and 1000000),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shop_rewards_user_idx on public.shop_rewards (user_id);

alter table public.gold_ledger enable row level security;
alter table public.inventory_items enable row level security;
alter table public.shop_rewards enable row level security;

drop policy if exists "gold ledger owner read" on public.gold_ledger;
create policy "gold ledger owner read" on public.gold_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists "inventory owner read" on public.inventory_items;
create policy "inventory owner read" on public.inventory_items for select to authenticated using (user_id = auth.uid());
drop policy if exists "shop rewards owner" on public.shop_rewards;
create policy "shop rewards owner" on public.shop_rewards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.gold_ledger, public.inventory_items, public.shop_rewards from anon;
revoke all on public.gold_ledger, public.inventory_items from authenticated;
grant select on public.gold_ledger, public.inventory_items to authenticated;
grant select, insert, update, delete on public.shop_rewards to authenticated;
grant all on public.gold_ledger, public.inventory_items, public.shop_rewards to service_role;

-- Lets the app detect that this migration has been applied (independently of 0003).
insert into public.system_meta (key, value) values ('migration_0004', 'applied')
  on conflict (key) do update set value = excluded.value, updated_at = now();
