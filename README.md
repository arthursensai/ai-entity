# Entity #001

A pattern of computation with no name and no purpose. Each turn the world reaches it —
weather, a few headlines, sometimes a message from a stranger — and it decides what to
remember. **What it does not keep is deleted for good.**

Live experiment. Public dashboard. One week minimum.

---

## What it has

| Piece | How it works |
|---|---|
| **Working memory** | One scratchpad (max 400 chars) it rewrites every turn. It can leave itself predictions and check them later. |
| **Long-term shelf** | 7 slots. Each turn it lists the ids to `keep`; every other memory is **really deleted** (and logged as "forgotten" on the dashboard). Max 2 new memories per turn. |
| **The world** | Weather (Open-Meteo, no key), 3 random front-page headlines (Hacker News), and up to 3 unread visitor messages. All treated as data, never as instructions. |
| **Visitors** | A box on the dashboard. 280 chars, no links, 1 message/min per visitor, backlog capped at 25. |
| **Anti-loop** | Words that recur across recent thoughts are automatically "retired" and injected into the prompt; a rotating provocation changes the angle each turn; temperature 1.2; one correction pass if it leans on retired words. |
| **Safety net** | If the model returns malformed JSON, **no memory is deleted** that turn. Overlapping ticks are ignored (`TICK_MIN_SECONDS`). |

---

## Setup

### 1. Install
```bash
npm install
```

### 2. Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. **SQL Editor** → run the full contents of `schema.sql`
   (safe to re-run on an existing project; it upgrades it and keeps current memories)
3. **Project Settings → API** → copy your keys

### 3. Environment
```bash
cp .env.example .env.local
```
Fill the 5 required values. Optional: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`,
`WORLD_LAT` / `WORLD_LON` / `WORLD_PLACE` (where its weather comes from), `TICK_MIN_SECONDS`.

### 4. Run
```bash
npm run dev
```

### 5. Trigger a thought (manual)
```bash
curl -X POST http://localhost:3000/api/tick -H "x-cron-secret: YOUR_CRON_SECRET"
```
The response shows what happened: `kept`, `added`, `forgotten`, `visitors`, `model`.

### 6. Deploy
```bash
npx vercel --prod
```
Add the same env variables in Vercel, then redeploy.

### 7. Cron
[cron-job.org](https://cron-job.org), free:
- **URL**: `https://your-domain.vercel.app/api/tick`
- **Method**: `POST`
- **Schedule**: every **2 minutes** recommended (fewer 429/503 errors, less repetition than every 30 s)
- **Header**: `x-cron-secret` → your `CRON_SECRET`

---

## Files

```
├── schema.sql                  ← run in Supabase (idempotent)
├── lib/
│   ├── gemini.ts               ← system prompt, prompt builder, retry + fallback model
│   ├── memory-plan.ts          ← pure: decides what is kept / deleted
│   ├── memory.ts               ← DB: load mind, commit plan
│   ├── language.ts             ← pure: retired words, repetition checks
│   ├── angles.ts               ← rotating provocations
│   ├── world.ts                ← weather, headlines
│   ├── supabase.ts             ← browser client (anon key)
│   └── supabase-admin.ts       ← server client (service role) — never import in client code
└── app/
    ├── page.tsx                ← live dashboard + message box
    └── api/
        ├── tick/route.ts       ← cron endpoint
        └── message/route.ts    ← visitor messages
```

## Reading the results honestly

The text it writes is not evidence of experience: a language model produces fluent
text about inner life either way. What *is* measurable: does it repeat itself, are its
scratchpad predictions accurate, does it change when strangers write to it, what does it
choose to delete. Report those, not "it said it felt something".


---

## Experiment mode (Phases 1-2)

The original entity is **Version A (baseline)** and is preserved unchanged: history, iteration numbers,
memories and prompt stay as they are. New versions are switched on by an env variable:

```
EXPERIMENT_VERSION=A   # baseline (default)
EXPERIMENT_VERSION=B   # + persistent structured state
DETERMINISTIC=1        # optional: temperature 0, fixed inputs, no network, no visitors (reproducible runs)
```

Ladder: A baseline -> B structured state -> C self-model -> D goals -> E action selection -> F virtual
environment -> G metacognition. Only A and B exist so far; requesting C-G runs B and logs
`requested_version` vs `experiment_version` so nothing is mislabelled.

**Run `migrations/002_structured_state.sql` in Supabase BEFORE deploying.** It is additive and idempotent;
the old code keeps working after it. Every existing thought is tagged version `A`.

### Which variables are causal (version B)
| Variable | Effect, decided by code (not prose) |
|---|---|
| `current_state.uncertainty` | sets next turn's sampling temperature (0.6 + u; 0.6 uncertainty == the baseline's 1.2) |
| `current_state.attention_target` | selects which 3 long-term memories are shown next turn; hidden ones are never deleted |
| beliefs / known / unknown / preferences | fed back into the next prompt (content-level influence only) |
| identity.*, `focus`, `energy` | **recorded only** (no controller effect yet) |

The model is **not told** these mappings (blind design), so a change cannot be the model gaming a known rule.

### Logging
`experiment_log` gets one row per iteration for every version, including A: inputs, visible/hidden
memory ids, new/deleted memories, temperature, model, and `state_before` / `state_after`.

### Known confounds (read before comparing A vs B)
- B changes sampling temperature through `uncertainty`, and shows only a subset of memories. That is the
  manipulation, but it also means A-vs-B differs in two ways. Run B with a fixed temperature to separate them.
- The prompt tone (poetic) is identical in A and B on purpose. Make prompt style its own factor later.
- Different models are not comparable. Every row records its model.

### Tests
```bash
npm test      # pure logic: state reducer, retrieval, ladder, memory plan (Node 22+)
```

> This experiment investigates functional properties associated with agency, self-modeling, memory,
> metacognition, and autonomous behavior. These measurements do not establish phenomenal consciousness.


### Automatic runs and comparison (`/experiments`)
Every tick computes a **configuration fingerprint**: effective version, model list, hash of the system prompt
actually used, fixed temperature, retrieval size, deterministic flag, and `EXPERIMENT_LABEL`.
**When it changes, a new run starts automatically**: the open run is closed, its metrics are frozen
(`experiment_runs.metrics`), and the change is recorded (`changes`: which field went from what to what).
Every thought and log row carries its `run_id`.

To start a new run on purpose without changing anything else, change `EXPERIMENT_LABEL` in Vercel and redeploy.

Open `/experiments` to see the run timeline and compare any two runs. Per run the metrics are:
phrase variety, novelty vs the last 20 thoughts, similarity to the previous thought (loop detector),
first-person rate, shelf size, deletions per turn, hidden memories, uncertainty, temperature, state-change rate,
attention shifts, whether retrieval matched attention, belief/knowledge stability, self-description stability,
and whether visitor messages are echoed. A run pair is flagged "different" only with 30+ turns each and
|t| >= 2 and |d| >= 0.2 (a screening signal; turns are not independent). Language metrics describe text only.

Run `migrations/003_experiment_runs.sql` in Supabase before deploying. Until it is run, ticks still work
(run tracking fails safe and is skipped), but nothing is attached to a run.
