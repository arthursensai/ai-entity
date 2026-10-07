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
