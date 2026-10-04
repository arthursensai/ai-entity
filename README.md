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
