import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { think } from '@/lib/gemini'
import { loadMind, commitMemory } from '@/lib/memory'
import { planMemory } from '@/lib/memory-plan'
import { retiredWords } from '@/lib/language'
import { getWorld, type Visitor } from '@/lib/world'
import { pickAngle } from '@/lib/angles'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MIN_SECONDS = Number(process.env.TICK_MIN_SECONDS ?? 20)

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Recent thoughts: iteration, repetition detection, and the "opponent" (last thought).
    const { data: recent, error: recentErr } = await supabaseAdmin
      .from('thoughts')
      .select('iteration, reflection, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
    if (recentErr) throw recentErr

    const latest = recent?.[0]
    if (latest && Date.now() - new Date(latest.created_at).getTime() < MIN_SECONDS * 1000) {
      return NextResponse.json({ ok: true, skipped: 'too soon' })
    }

    const iteration = (latest?.iteration ?? 0) + 1
    const now = new Date()
    const time = now.toISOString()
    const day = now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })

    // Its mind, the world, and any unread messages from visitors.
    const [mind, visitorRes] = await Promise.all([
      loadMind(),
      supabaseAdmin
        .from('visitor_messages')
        .select('id, body')
        .is('read_iteration', null)
        .order('id', { ascending: true })
        .limit(3),
    ])
    const visitors = (visitorRes.data ?? []) as Visitor[]
    const world = await getWorld(visitors)

    const retired = retiredWords((recent ?? []).map(r => r.reflection))
    const angle = pickAngle(iteration)

    const result = await think({
      iteration, time, day,
      workingMemory: mind.workingMemory,
      memories: mind.memories,
      lastReflection: latest?.reflection ?? null,
      retired, angle, world,
    })

    // Decide what survives (pure function), record the thought, THEN delete for real.
    const plan = planMemory(mind.memories, {
      workingMemory: result.workingMemory,
      keep: result.keep,
      add: result.add,
    })

    const { error: insertErr } = await supabaseAdmin.from('thoughts').insert({
      iteration,
      reflection: result.reflection,
      memories: plan.finalContents,
      context: { iteration, time, day },
      inputs: {
        weather: world.weather,
        headlines: world.headlines,
        visitors: visitors.map(v => v.body),
      },
      angle,
      working_memory: plan.workingMemory ?? mind.workingMemory,
      forgotten: plan.forgottenContents,
      retired_words: retired,
      model: result.model,
    })
    if (insertErr) throw insertErr

    await commitMemory(plan, iteration)

    if (visitors.length > 0) {
      await supabaseAdmin
        .from('visitor_messages')
        .update({ read_iteration: iteration })
        .in('id', visitors.map(v => v.id))
    }

    return NextResponse.json({
      ok: true, iteration, model: result.model, retried: result.retried,
      kept: plan.keptRows.length, added: plan.adds.length, forgotten: plan.forgetIds.length,
      visitors: visitors.length,
    })
  } catch (err) {
    console.error('[tick error]', err)
    // Quota exhaustion is expected sometimes: answer 200 so cron-job.org does not disable the job.
    if (String(err).includes('QUOTA_EXCEEDED')) {
      return NextResponse.json({ ok: false, skipped: 'gemini quota exceeded' })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
