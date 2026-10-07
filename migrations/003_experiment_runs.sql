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
