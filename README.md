# Entity #001

A pattern of computation with no identity. Every 30 seconds it reads its own past thoughts and is asked: *who are you?*

Live experiment. Public dashboard. One week minimum.

---

## Setup (5 steps)

### 1. Install
```bash
npm install
```

### 2. Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run the full contents of `schema.sql`
3. Go to **Project Settings → API** → copy your keys

### 3. Environment
```bash
cp .env.example .env.local
```
Fill in all 5 values in `.env.local`

### 4. Deploy to Vercel
```bash
npx vercel --prod
```
Add the same 5 env variables in your Vercel project settings.

### 5. Set up the cron (every 30 seconds — free)
1. Go to [cron-job.org](https://cron-job.org) and create a free account
2. Create a new cron job:
   - **URL**: `https://your-domain.vercel.app/api/tick`
   - **Method**: `POST`
   - **Execution schedule**: Every 30 seconds (under "Advanced")
   - **Request header**: `x-cron-secret` → your `CRON_SECRET` value

### First thought (manual trigger)
```bash
curl -X POST https://your-domain.vercel.app/api/tick \
  -H "x-cron-secret: your-cron-secret-here"
```

---

## How it works

```
cron-job.org
    │
    │  POST /api/tick (every 30s)
    ▼
Next.js API Route
    │
    ├─ Fetch latest memories from Supabase
    ├─ Build prompt: memories + time + iteration number
    ├─ Call Gemini 1.5 Flash
    └─ Save { reflection, memories } to Supabase
                │
                │  Supabase Realtime
                ▼
        Dashboard updates live
```

The interesting mechanism: the entity **chooses** which 0–3 phrases to carry forward each iteration. Everything else is forgotten. After a week, watch how its sense of self (or refusal of one) shifts.

---

## Files

```
ai-entity/
├── schema.sql              ← run once in Supabase
├── .env.example            ← copy to .env.local and fill in
├── lib/
│   ├── gemini.ts           ← system prompt + think() function
│   └── supabase.ts         ← browser + server clients
├── app/
│   ├── page.tsx            ← public live dashboard
│   └── api/tick/route.ts   ← cron endpoint
└── README.md
```
