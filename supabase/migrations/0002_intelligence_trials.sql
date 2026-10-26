-- SYSTEM IRL: System Trials (INT is ranked on tests the System administers, not GPA)

-- Question sets the player imports (or optionally generates with AI). Owner-only data.
create table if not exists public.question_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  deck text not null default 'General' check (char_length(deck) between 1 and 60),
  topic text not null default 'General' check (char_length(topic) between 1 and 60),
  prompt text not null check (char_length(prompt) between 3 and 1000),
  choices jsonb not null,
  answer_index integer not null check (answer_index between 0 and 5),
  explanation text check (char_length(explanation) <= 1000),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  source text not null default 'import' check (source in ('import', 'ai')),
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 6)
);
create index if not exists question_items_user_idx on public.question_items (user_id, deck);

-- Trial sessions. `state` holds the answer key and is hidden from clients (column-level grants);
-- only the server (service role) reads it.
create table if not exists public.trial_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('reasoning', 'memory', 'speed', 'knowledge')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  seed integer not null,
  state jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  score double precision,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists trial_sessions_user_idx on public.trial_sessions (user_id, started_at desc);
create unique index if not exists trial_sessions_one_active_idx on public.trial_sessions (user_id) where status = 'active';

alter table public.question_items enable row level security;
alter table public.trial_sessions enable row level security;

create policy "question items owner" on public.question_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "trial sessions owner read" on public.trial_sessions for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.question_items to authenticated;
revoke all on public.trial_sessions from authenticated;
grant select (id, user_id, kind, status, seed, results, score, started_at, completed_at) on public.trial_sessions to authenticated;
revoke all on public.question_items, public.trial_sessions from anon;
grant all on public.question_items, public.trial_sessions to service_role;

-- Trial completions are logged as activities.
alter table public.activity_logs drop constraint if exists activity_logs_source_check;
alter table public.activity_logs add constraint activity_logs_source_check check (source in ('manual', 'dungeon', 'import', 'trial'));
