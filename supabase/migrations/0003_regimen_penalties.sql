-- SYSTEM IRL: daily regimen, quest categories and penalties.
-- Safe to run more than once.

-- The player's daily regimen (targets for each day's quests). Player-editable, like other settings.
alter table public.settings add column if not exists regimen jsonb not null default '{}'::jsonb;

-- Penalty Zone quests; failed quests; quests waived with a recovery pass.
alter table public.quests drop constraint if exists quests_kind_check;
alter table public.quests add constraint quests_kind_check check (kind in ('daily', 'weekly', 'main', 'emergency', 'custom', 'penalty'));
alter table public.quests drop constraint if exists quests_status_check;
alter table public.quests add constraint quests_status_check check (status in ('offered', 'active', 'completed', 'expired', 'abandoned', 'failed', 'exempt'));

-- XP penalties are negative ledger rows of kind 'penalty' (written by the server only, like all XP).
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.player_xp'::regclass and contype = 'c' and conname <> 'player_xp_amount_check' loop
    execute format('alter table public.player_xp drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.player_xp add constraint player_xp_kind_check check (kind in ('effort', 'performance', 'quest', 'achievement', 'skill', 'dungeon', 'milestone', 'reversal', 'penalty'));
alter table public.player_xp add constraint player_xp_sign_check check ((kind in ('reversal', 'penalty')) = (amount < 0));
alter table public.player_xp add constraint player_xp_reversal_check check ((kind = 'reversal') = (reverses_id is not null));

-- Lets the app detect that this migration has been applied.
insert into public.system_meta (key, value) values ('schema_version', '3')
  on conflict (key) do update set value = excluded.value, updated_at = now();
