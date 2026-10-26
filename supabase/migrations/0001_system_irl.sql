-- SYSTEM IRL — core schema
-- Runs unchanged on Supabase (PostgreSQL 15+) and on the bundled local demo database (PGlite),
-- where supabase/local/auth_shim.sql provides the `auth` schema and roles Supabase normally supplies.
--
-- Security model
--   * Every user-owned row carries user_id and is protected by row-level security (RLS).
--   * Users may READ their own rows directly (anon/authenticated key + RLS).
--   * "Input" tables (profile, settings, measurements, activity logs, custom metrics, custom quests,
--     equipped title, notification read-state) are also writable by their owner.
--   * "Award" tables (XP ledger, unlocks, quest completions, percentile results, level cache) are
--     written only by the server with the service role, after it validates the action. A user cannot
--     grant themselves XP by calling the database directly.
--   * Reference catalogs (attributes, metrics, benchmarks, dungeons, skills, achievements, titles) are
--     readable by any signed-in user and writable only by the service role.

-- gen_random_uuid() is built into PostgreSQL 13+, so no extension is required.

-- ---------------------------------------------------------------------------------------------
-- Users / profiles / settings
-- ---------------------------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table if not exists public.profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 40),
  date_of_birth date,
  age_years integer check (age_years between 13 and 120),
  country text not null default 'US',
  height_cm double precision check (height_cm between 100 and 250),
  weight_kg double precision check (weight_kg between 25 and 350),
  sex text check (sex in ('male', 'female')),
  education_level text,
  occupation text,
  goals jsonb not null default '[]'::jsonb,
  fitness_experience text,
  academic_info jsonb not null default '{}'::jsonb,
  financial_info jsonb not null default '{}'::jsonb,
  difficulty text not null default 'normal' check (difficulty in ('casual', 'normal', 'hard', 'nightmare')),
  tracked_categories jsonb not null default '["STR","END","PHY","INT","DIS","WLT","CHA","WIS"]'::jsonb,
  timezone text not null default 'America/New_York',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  unit_system text not null default 'imperial' check (unit_system in ('imperial', 'metric')),
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  reduced_motion boolean not null default false,
  sound_enabled boolean not null default true,
  ambient_enabled boolean not null default false,
  ai_enabled boolean not null default true,
  profile_public boolean not null default false,
  xp_config jsonb not null default '{}'::jsonb,
  hunter_weights jsonb not null default '{}'::jsonb,
  comparison_preference text not null default 'sex_matched' check (comparison_preference in ('sex_matched', 'all')),
  last_login_on date,
  login_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Reference catalogs
-- ---------------------------------------------------------------------------------------------

create table if not exists public.system_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attributes (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  description text not null,
  sort_order integer not null
);

create table if not exists public.metrics (
  id text primary key check (id ~ '^[a-z0-9_]{2,64}$'),
  user_id uuid references public.users (id) on delete cascade, -- null = system catalog metric
  attribute_code text not null references public.attributes (code),
  name text not null check (char_length(name) between 1 and 60),
  unit_kind text not null,
  direction text not null check (direction in ('higher', 'lower', 'optimal', 'neutral')),
  description text not null default '',
  input text not null default 'manual' check (input in ('manual', 'derived')),
  is_custom boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((is_custom and user_id is not null) or (not is_custom and user_id is null))
);
create index if not exists metrics_user_idx on public.metrics (user_id);

create table if not exists public.benchmark_sources (
  id text primary key,
  name text not null,
  publisher text not null,
  url text not null,
  publication_year integer,
  population text not null,
  sample_size integer,
  statistical_method text not null,
  quality text not null check (quality in ('high', 'moderate', 'low')),
  last_verified date not null,
  limitations jsonb not null default '[]'::jsonb,
  license text not null,
  retrieval jsonb not null default '{}'::jsonb
);

create table if not exists public.benchmark_distributions (
  id text primary key,
  source_id text not null references public.benchmark_sources (id) on delete cascade,
  metric_id text not null references public.metrics (id) on delete cascade,
  age_min integer not null,
  age_max integer not null,
  sex text not null check (sex in ('male', 'female', 'all')),
  units text not null,
  kind text not null check (kind in ('weighted_ecdf', 'quantiles', 'binned')),
  evidence text not null check (evidence in ('verified', 'estimated')),
  n_unweighted integer,
  n_effective double precision,
  data jsonb not null,
  notes text not null default '',
  check (age_min <= age_max)
);
create index if not exists benchmark_distributions_metric_idx on public.benchmark_distributions (metric_id);

create table if not exists public.dungeons (
  code text primary key,
  name text not null,
  kind text not null,
  difficulty text not null check (difficulty in ('E', 'D', 'C', 'B', 'A', 'S')),
  default_minutes integer not null check (default_minutes between 5 and 600),
  config jsonb not null default '{}'::jsonb
);

create table if not exists public.skills (
  code text primary key,
  tree text not null,
  name text not null,
  tier integer not null check (tier between 1 and 5),
  requires text references public.skills (code),
  config jsonb not null default '{}'::jsonb
);

create table if not exists public.titles (
  code text primary key,
  name text not null,
  description text not null,
  rarity text not null
);

create table if not exists public.achievements (
  code text primary key,
  name text not null,
  description text not null,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  category text not null,
  icon text not null,
  xp_reward integer not null check (xp_reward between 0 and 5000),
  title_code text references public.titles (code),
  config jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------------------------
-- Player input data
-- ---------------------------------------------------------------------------------------------

create table if not exists public.metric_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  metric_id text not null references public.metrics (id) on delete cascade,
  value double precision not null,
  recorded_on date not null,
  context text not null default 'current' check (context in ('current', 'historical', 'test')),
  note text check (char_length(note) <= 500),
  source text not null default 'manual' check (source in ('manual', 'onboarding', 'import', 'dungeon')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists metric_entries_user_metric_idx on public.metric_entries (user_id, metric_id, recorded_on desc);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null,
  duration_min double precision check (duration_min >= 0 and duration_min <= 1440),
  quantity double precision check (quantity >= 0),
  occurred_on date not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('manual', 'dungeon', 'import')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists activity_logs_user_day_idx on public.activity_logs (user_id, occurred_on desc);

-- ---------------------------------------------------------------------------------------------
-- Quests
-- ---------------------------------------------------------------------------------------------

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'main', 'emergency', 'custom')),
  template_code text not null,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  attribute_code text references public.attributes (code),
  difficulty text not null default 'C' check (difficulty in ('E', 'D', 'C', 'B', 'A', 'S')),
  period_start date not null,
  period_end date,
  deadline timestamptz,
  status text not null default 'active' check (status in ('offered', 'active', 'completed', 'expired', 'abandoned')),
  xp_reward integer not null default 0 check (xp_reward between 0 and 1000),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, template_code, period_start)
);
create index if not exists quests_user_status_idx on public.quests (user_id, status, period_start desc);

create table if not exists public.quest_objectives (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  sort_order integer not null default 0,
  chapter integer not null default 1,
  title text not null check (char_length(title) between 1 and 160),
  tracker jsonb not null,
  target double precision not null default 1,
  manual_progress double precision not null default 0,
  completed_at timestamptz
);
create index if not exists quest_objectives_quest_idx on public.quest_objectives (quest_id);
create index if not exists quest_objectives_user_idx on public.quest_objectives (user_id);

create table if not exists public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  chapter integer not null default 0, -- 0 = whole quest; >0 = a main-quest chapter
  completed_at timestamptz not null default now(),
  xp_awarded integer not null default 0,
  unique (user_id, quest_id, chapter)
);

-- ---------------------------------------------------------------------------------------------
-- Dungeons
-- ---------------------------------------------------------------------------------------------

create table if not exists public.dungeon_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  dungeon_code text not null references public.dungeons (code),
  mode text not null default 'focus' check (mode in ('focus', 'pomodoro')),
  planned_minutes integer not null check (planned_minutes between 5 and 600),
  objective text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'cleared', 'retreated')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0,
  last_resumed_at timestamptz,
  pause_count integer not null default 0,
  xp_awarded integer not null default 0,
  idempotency_key text not null,
  unique (user_id, idempotency_key)
);
create index if not exists dungeon_sessions_user_idx on public.dungeon_sessions (user_id, started_at desc);
-- At most one running dungeon per player.
create unique index if not exists dungeon_sessions_one_open_idx
  on public.dungeon_sessions (user_id) where status in ('active', 'paused');

-- ---------------------------------------------------------------------------------------------
-- Progression: XP ledger, levels, unlocks, titles, percentile cache, notifications
-- ---------------------------------------------------------------------------------------------

create table if not exists public.player_xp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount integer not null check (amount between -10000 and 10000 and amount <> 0),
  kind text not null check (kind in ('effort', 'performance', 'quest', 'achievement', 'skill', 'dungeon', 'milestone', 'reversal')),
  attribute_code text references public.attributes (code),
  source_type text not null,
  source_id text,
  reason text not null,
  reverses_id uuid references public.player_xp (id),
  idempotency_key text not null,
  awarded_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check ((kind = 'reversal') = (amount < 0)),
  check ((kind = 'reversal') = (reverses_id is not null))
);
create index if not exists player_xp_user_idx on public.player_xp (user_id, created_at);
create unique index if not exists player_xp_one_reversal_idx on public.player_xp (reverses_id) where reverses_id is not null;

create table if not exists public.player_levels (
  user_id uuid primary key references public.users (id) on delete cascade,
  level integer not null default 1,
  total_xp integer not null default 0,
  hunter_rank text,
  hunter_score double precision,
  attribute_levels jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.percentile_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  metric_id text not null references public.metrics (id) on delete cascade,
  distribution_id text not null references public.benchmark_distributions (id) on delete cascade,
  entry_id uuid references public.metric_entries (id) on delete set null,
  value double precision not null,
  percentile double precision check (percentile between 0 and 100),
  ci_low double precision,
  ci_high double precision,
  evidence text not null check (evidence in ('verified', 'estimated')),
  rank text,
  computed_at timestamptz not null default now(),
  unique (user_id, metric_id, distribution_id)
);

create table if not exists public.skill_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  skill_code text not null references public.skills (code),
  unlocked_at timestamptz not null default now(),
  xp_awarded integer not null default 0,
  unique (user_id, skill_code)
);

create table if not exists public.achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  achievement_code text not null references public.achievements (code),
  unlocked_at timestamptz not null default now(),
  xp_awarded integer not null default 0,
  unique (user_id, achievement_code)
);

create table if not exists public.title_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title_code text not null references public.titles (code),
  source text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, title_code)
);

create table if not exists public.equipped_titles (
  user_id uuid primary key references public.users (id) on delete cascade,
  title_code text not null references public.titles (code),
  equipped_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- An equipped title must be one the player has unlocked.
create or replace function public.check_equipped_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.title_unlocks t where t.user_id = new.user_id and t.title_code = new.title_code
  ) then
    raise exception 'title % is not unlocked', new.title_code using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists equipped_title_must_be_unlocked on public.equipped_titles;
create trigger equipped_title_must_be_unlocked
  before insert or update on public.equipped_titles
  for each row execute function public.check_equipped_title();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.system_meta enable row level security;
alter table public.attributes enable row level security;
alter table public.metrics enable row level security;
alter table public.benchmark_sources enable row level security;
alter table public.benchmark_distributions enable row level security;
alter table public.dungeons enable row level security;
alter table public.skills enable row level security;
alter table public.titles enable row level security;
alter table public.achievements enable row level security;
alter table public.metric_entries enable row level security;
alter table public.activity_logs enable row level security;
alter table public.quests enable row level security;
alter table public.quest_objectives enable row level security;
alter table public.quest_completions enable row level security;
alter table public.dungeon_sessions enable row level security;
alter table public.player_xp enable row level security;
alter table public.player_levels enable row level security;
alter table public.percentile_results enable row level security;
alter table public.skill_unlocks enable row level security;
alter table public.achievement_unlocks enable row level security;
alter table public.title_unlocks enable row level security;
alter table public.equipped_titles enable row level security;
alter table public.notifications enable row level security;

-- Reference catalogs: read-only for signed-in users.
create policy "catalog read attributes" on public.attributes for select to authenticated using (true);
create policy "catalog read benchmark sources" on public.benchmark_sources for select to authenticated using (true);
create policy "catalog read benchmark distributions" on public.benchmark_distributions for select to authenticated using (true);
create policy "catalog read dungeons" on public.dungeons for select to authenticated using (true);
create policy "catalog read skills" on public.skills for select to authenticated using (true);
create policy "catalog read titles" on public.titles for select to authenticated using (true);
create policy "catalog read achievements" on public.achievements for select to authenticated using (true);

-- Metrics: system metrics readable by all; custom metrics private to their owner.
create policy "metrics read" on public.metrics for select to authenticated
  using (user_id is null or user_id = auth.uid());
create policy "metrics insert own custom" on public.metrics for insert to authenticated
  with check (is_custom and user_id = auth.uid());
create policy "metrics update own custom" on public.metrics for update to authenticated
  using (is_custom and user_id = auth.uid()) with check (is_custom and user_id = auth.uid());
create policy "metrics delete own custom" on public.metrics for delete to authenticated
  using (is_custom and user_id = auth.uid());

create policy "users read self" on public.users for select to authenticated using (id = auth.uid());

-- Owner read + write ("input" tables).
create policy "profiles owner" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings owner" on public.settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "metric entries owner" on public.metric_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "activity logs owner" on public.activity_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "equipped titles owner" on public.equipped_titles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Owner read-only (server-validated "award" tables and system-generated state).
create policy "quests owner read" on public.quests for select to authenticated using (user_id = auth.uid());
create policy "quest objectives owner read" on public.quest_objectives for select to authenticated using (user_id = auth.uid());
create policy "quest completions owner read" on public.quest_completions for select to authenticated using (user_id = auth.uid());
create policy "dungeon sessions owner read" on public.dungeon_sessions for select to authenticated using (user_id = auth.uid());
create policy "player xp owner read" on public.player_xp for select to authenticated using (user_id = auth.uid());
create policy "player levels owner read" on public.player_levels for select to authenticated using (user_id = auth.uid());
create policy "percentile results owner read" on public.percentile_results for select to authenticated using (user_id = auth.uid());
create policy "skill unlocks owner read" on public.skill_unlocks for select to authenticated using (user_id = auth.uid());
create policy "achievement unlocks owner read" on public.achievement_unlocks for select to authenticated using (user_id = auth.uid());
create policy "title unlocks owner read" on public.title_unlocks for select to authenticated using (user_id = auth.uid());
create policy "notifications owner read" on public.notifications for select to authenticated using (user_id = auth.uid());
-- Players may mark their own notifications read (column-restricted below).
create policy "notifications owner mark read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Table privileges. RLS still applies on top of these grants.
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.profiles, public.settings, public.metric_entries, public.activity_logs,
  public.equipped_titles, public.metrics to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;

-- Supabase grants broad default privileges to anon/authenticated on new tables; tighten them.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.users, public.system_meta, public.attributes, public.benchmark_sources,
  public.benchmark_distributions, public.dungeons, public.skills, public.titles, public.achievements,
  public.quests, public.quest_objectives, public.quest_completions, public.dungeon_sessions, public.player_xp,
  public.player_levels, public.percentile_results, public.skill_unlocks, public.achievement_unlocks,
  public.title_unlocks
  from authenticated;
revoke insert, delete on public.notifications from authenticated;
