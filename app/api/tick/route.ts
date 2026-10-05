import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { think, type Prediction, type LastContact } from '@/lib/gemini'
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
      .select('iteration, reflection, created_at, prediction, inputs, reply')
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

    // What the last stranger said and how it answered (shown for one more turn so it can follow up).
    const prevVisitors = ((latest?.inputs as { visitors?: string[] } | null)?.visitors ?? []).filter(Boolean)
    const lastContact: LastContact | null = prevVisitors.length
      ? { visitors: prevVisitors, reply: (latest?.reply as string | null) ?? null }
      : null

    const retired = retiredWords((recent ?? []).map(r => r.reflection))
    const angle = pickAngle(iteration)

    const result = await think({
      iteration, time, day,
      workingMemory: mind.workingMemory,
      memories: mind.memories,
      lastReflection: latest?.reflection ?? null,
      retired, angle, world,
      lastPrediction: (latest?.prediction as Prediction | null) ?? null,
      lastContact,
    })

    // Decide what survives (pure function), record the thought, THEN delete for real.
    const plan = planMemory(mind.memories, {
      workingMemory: result.workingMemory,
      keep: result.keep,
      add: result.add,
    })

    // Objective score of last turn's prediction (not self-graded), with a dumb baseline:
    // "it keeps everything and deletes nothing". If the entity cannot beat the baseline,
    // its predictions say nothing about a model of itself.
    let autoScore: Record<string, unknown> | null = null
    const lastP = (latest?.prediction as Prediction | null) ?? null
    if (lastP && result.keep !== null) {
      const shelfIds = mind.memories.filter(m => !m.protected).map(m => m.id)   // what existed at turn start
      const actual = new Set(plan.keptRows.filter(m => !m.protected).map(m => m.id))
      const jac = (A: Set<number>, B: Set<number>) => {
        const u = new Set([...A, ...B])
        if (u.size === 0) return null
        return Number(([...A].filter(x => B.has(x)).length / u.size).toFixed(2))
      }
      const predicted = new Set((lastP.keeps ?? []).filter(id => shelfIds.includes(id)))
      const actualDeletes = plan.forgetIds.length
      autoScore = {
        predicted_keeps: [...predicted],
        actual_keeps: [...actual],
        jaccard: jac(predicted, actual),
        baseline_jaccard: jac(new Set(shelfIds), actual),
        predicted_deletes: lastP.deletes,
        actual_deletes: actualDeletes,
        deletes_match: lastP.deletes === null ? null : lastP.deletes === actualDeletes,
        baseline_deletes_match: actualDeletes === 0,
      }
    }

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
      chose: result.chose,
      ignored: result.ignored,
      prediction: result.prediction,
      prediction_check: result.predictionCheck,
      auto_score: autoScore,
      core_attempt: plan.coreAttempt,
      reply: result.reply,
      heard_visitor: visitors.length > 0,
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
      visitors: visitors.length, replied: !!result.reply, coreAttempt: plan.coreAttempt,
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
