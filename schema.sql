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
