-- Entity #001 — full schema.
-- Safe to run on a fresh project AND to re-run on your existing one (idempotent).

-- ─── thoughts ────────────────────────────────────────────────
create table if not exists thoughts (
  id          bigserial primary key,
  iteration   integer      not null,
  reflection  text         not null,
  memories    text[]       default '{}',
  context     jsonb        default '{}',
  created_at  timestamptz  default now()
);
alter table thoughts add column if not exists inputs        jsonb  default '{}';
alter table thoughts add column if not exists angle         text;
alter table thoughts add column if not exists working_memory text  default '';
alter table thoughts add column if not exists forgotten     text[] default '{}';
alter table thoughts add column if not exists retired_words text[] default '{}';
alter table thoughts add column if not exists model         text;

-- ─── the entity's mind ───────────────────────────────────────
-- Working memory: one scratchpad row, rewritten every turn.
create table if not exists entity_state (
  id             int primary key default 1 check (id = 1),
  working_memory text not null default '',
  updated_at     timestamptz default now()
);
insert into entity_state (id) values (1) on conflict do nothing;

-- Long-term memory: a small shelf. Anything not kept is DELETED for real.
create table if not exists entity_memories (
  id                bigserial primary key,
  content           text not null,
  created_iteration int  not null,
  times_kept        int  not null default 0,
  created_at        timestamptz default now()
);

-- Carry over the memories the entity already had (only if the shelf is still empty).
insert into entity_memories (content, created_iteration)
select m, t.iteration
from (select iteration, memories from thoughts order by created_at desc limit 1) t,
     unnest(t.memories) as m
where not exists (select 1 from entity_memories);

-- ─── messages from visitors ──────────────────────────────────
create table if not exists visitor_messages (
  id             bigserial primary key,
  body           text not null check (char_length(body) between 1 and 280),
  ip_hash        text,
  created_at     timestamptz default now(),
  read_iteration int
);

-- ─── security: public can read the mind, only the server writes ─
alter table thoughts         enable row level security;
alter table entity_state     enable row level security;
alter table entity_memories  enable row level security;
alter table visitor_messages enable row level security;   -- no public policy: server only

drop policy if exists "Public read" on thoughts;
create policy "Public read" on thoughts        for select using (true);
drop policy if exists "Public read" on entity_state;
create policy "Public read" on entity_state    for select using (true);
drop policy if exists "Public read" on entity_memories;
create policy "Public read" on entity_memories for select using (true);

-- Newer Supabase projects do not grant table privileges automatically.
grant usage on schema public to anon, authenticated, service_role;
grant select on thoughts, entity_state, entity_memories to anon, authenticated;
grant all on thoughts, entity_state, entity_memories, visitor_messages to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ─── realtime for the live dashboard ─────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'thoughts'
  ) then
    alter publication supabase_realtime add table thoughts;
  end if;
end $$;

-- Two overlapping ticks can never write the same iteration twice.
do $$
begin
  create unique index if not exists thoughts_iteration_key on thoughts (iteration);
exception when others then
  raise notice 'skipped unique index on thoughts.iteration (duplicates already exist)';
end $$;

-- ─── structured agent state (Phase 2) ───
-- Phase 2: structured agent state + experiment log.
-- Additive and idempotent: safe to run on the live database, existing history is untouched.
-- Every existing thought is tagged version 'A' (the baseline) by the column default.

alter table thoughts add column if not exists experiment_version text not null default 'A';

-- Persistent structured state (one row; the full history lives in experiment_log snapshots).
create table if not exists agent_state (
  id         int primary key default 1 check (id = 1),
  state      jsonb not null,
  revision   int   not null default 0,
  updated_at timestamptz default now()
);

-- One row per iteration, ALL versions (including the baseline), for later analysis.
create table if not exists experiment_log (
  id                   bigserial primary key,
  iteration            int  not null,
  created_at           timestamptz default now(),
  experiment_version   text not null,      -- version that actually ran
  requested_version    text,               -- version requested in config (differs if not implemented yet)
  model                text,
  temperature          numeric,
  deterministic        boolean default false,
  input                jsonb  default '{}',  -- weather / headlines / visitor messages / provocation
  retrieved_memory_ids bigint[] default '{}',-- memories the entity could see
  hidden_memory_ids    bigint[] default '{}',-- memories hidden by retrieval this turn
  new_memories         text[]  default '{}',
  deleted_memories     text[]  default '{}',
  state_before         jsonb,
  state_after          jsonb,
  extra                jsonb   default '{}'
);
create index if not exists experiment_log_iteration_idx on experiment_log (iteration);
create index if not exists thoughts_version_idx on thoughts (experiment_version);

alter table agent_state    enable row level security;
alter table experiment_log enable row level security;

drop policy if exists "Public read" on agent_state;
create policy "Public read" on agent_state    for select using (true);
drop policy if exists "Public read" on experiment_log;
create policy "Public read" on experiment_log for select using (true);

grant select on agent_state, experiment_log to anon, authenticated;
grant all on agent_state, experiment_log to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ─── experiment runs (Phase 2b) ───
-- Phase 2b: automatic experiment runs. Additive and idempotent.
-- A "run" = consecutive iterations produced under ONE configuration. When the configuration
-- changes (version, model list, prompt, temperature mode, label...), the server closes the open
-- run, freezes its metrics, and opens a new one.

create table if not exists experiment_runs (
  id              bigserial primary key,
  label           text,
  version         text not null,
  fingerprint     text not null,
  config          jsonb not null,
  changes         jsonb default '{}',   -- what differs from the previous run: { key: [old, new] }
  started_at      timestamptz default now(),
  ended_at        timestamptz,
  start_iteration int not null,
  end_iteration   int,
  metrics         jsonb,                -- frozen snapshot, written when the run is closed
  parent_run_id   bigint
);

-- At most ONE open run at any time.
create unique index if not exists experiment_runs_one_open on experiment_runs ((1)) where ended_at is null;

alter table thoughts       add column if not exists run_id bigint;
alter table experiment_log add column if not exists run_id bigint;
create index if not exists thoughts_run_idx       on thoughts (run_id);
create index if not exists experiment_log_run_idx on experiment_log (run_id);

-- Everything that already exists becomes one closed "legacy" baseline run.
insert into experiment_runs (label, version, fingerprint, config, changes, started_at, ended_at, start_iteration, end_iteration)
select 'Baseline A (history before run tracking)', 'A', 'legacy', '{"legacy": true}', '{}',
       min(created_at), max(created_at), min(iteration), max(iteration)
from thoughts
where run_id is null
  and not exists (select 1 from experiment_runs)
having count(*) > 0;

update thoughts       set run_id = (select id from experiment_runs where fingerprint = 'legacy')
 where run_id is null and exists (select 1 from experiment_runs where fingerprint = 'legacy');
update experiment_log set run_id = (select id from experiment_runs where fingerprint = 'legacy')
 where run_id is null and exists (select 1 from experiment_runs where fingerprint = 'legacy');

alter table experiment_runs enable row level security;
drop policy if exists "Public read" on experiment_runs;
create policy "Public read" on experiment_runs for select using (true);
grant select on experiment_runs to anon, authenticated;
grant all on experiment_runs to service_role;
grant usage, select on all sequences in schema public to service_role;
