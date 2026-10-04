-- Entity #001 — focus patch (idempotent). Run in Supabase SQL Editor BEFORE deploying the code.
alter table thoughts add column if not exists prediction       jsonb;
alter table thoughts add column if not exists prediction_check jsonb;
alter table thoughts add column if not exists auto_score       jsonb;
alter table thoughts add column if not exists chose            text;
alter table thoughts add column if not exists ignored          text;
alter table thoughts add column if not exists core_attempt     boolean default false;

alter table entity_memories add column if not exists protected boolean not null default false;

-- The CORE memory: the standing question. Cannot be deleted by the entity.
insert into entity_memories (content, created_iteration, protected)
select 'CORE: under every turn, who is the one doing this, right now? Answer only through what I do (chose, ignored, kept, deleted, predicted), never through claims.',
       coalesce((select max(iteration) from thoughts), 0), true
where not exists (select 1 from entity_memories where protected);

-- ── Measuring acts (run any time) ───────────────────────────
-- Self-graded prediction record:
--   select count(*) filter (where (prediction_check->>'correct')='true')  as right,
--          count(*) filter (where (prediction_check->>'correct')='false') as wrong from thoughts;
-- Objective score (predicted keeps vs actual keeps, 1.0 = perfect):
--   select iteration, auto_score->>'jaccard' as score from thoughts where auto_score is not null order by iteration;
-- Times it tried to delete its core question:
--   select iteration, created_at from thoughts where core_attempt order by iteration;
-- Turns where a visitor was heard, and what it chose:
--   select iteration, chose, ignored from thoughts where jsonb_array_length(coalesce(inputs->'visitors','[]'::jsonb)) > 0;
