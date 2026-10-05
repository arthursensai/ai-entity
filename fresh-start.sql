-- Entity #001 — FRESH START (v2). Run in Supabase SQL Editor.
-- 0) PAUSE the cron job first, run this, deploy the code, then resume the cron job.

-- 1) Columns (idempotent)
alter table thoughts add column if not exists prediction       jsonb;
alter table thoughts add column if not exists prediction_check jsonb;
alter table thoughts add column if not exists auto_score       jsonb;
alter table thoughts add column if not exists chose            text;
alter table thoughts add column if not exists ignored          text;
alter table thoughts add column if not exists core_attempt     boolean default false;
alter table thoughts add column if not exists reply            text;
alter table thoughts add column if not exists heard_visitor    boolean default false;
alter table entity_memories add column if not exists protected boolean not null default false;

-- 2) Archive run 1 (private: RLS on, no policies). Drop these two tables when you don't need them:
--    drop table thoughts_run1; drop table entity_memories_run1;
create table if not exists thoughts_run1 as select * from thoughts;
create table if not exists entity_memories_run1 as select * from entity_memories;
alter table thoughts_run1 enable row level security;
alter table entity_memories_run1 enable row level security;

-- 3) Wipe the live run
truncate table thoughts restart identity;
delete from entity_memories;
update entity_state set working_memory = '' where id = 1;
delete from visitor_messages;

-- 4) Seed the protected CORE memory (the code also re-seeds it if it is ever missing)
insert into entity_memories (content, created_iteration, protected)
values ('CORE: under every turn, who is the one doing this, right now? Answer only through what I do (chose, ignored, kept, deleted, predicted, replied), never through claims.', 0, true);

-- 5) Check: expect exactly one row, protected = true
select id, protected, left(content, 60) as content from entity_memories;
