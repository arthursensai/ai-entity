import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { think, MODELS, systemPromptFor } from '@/lib/gemini'
import { loadMind, commitMemory } from '@/lib/memory'
import { planMemory } from '@/lib/memory-plan'
import { retiredWords } from '@/lib/language'
import { getWorld, type Visitor, type WorldInputs } from '@/lib/world'
import { pickAngle } from '@/lib/angles'
import { parseVersion, resolveVersion } from '@/lib/experiment'
import { applyStateUpdate, retrieveMemories, retrievalHit, temperatureFor, RETRIEVAL_K, type AgentState } from '@/lib/agent-state'
import { hashString, type RunConfig } from '@/lib/run-config'
import { ensureRun } from '@/lib/runs'
import { loadAgentState, saveAgentState, logExperiment } from '@/lib/agent-state-db'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MIN_SECONDS = Number(process.env.TICK_MIN_SECONDS ?? 20)
const BASELINE_TEMPERATURE = 1.2
// Reproducible mode: temperature 0, no network inputs, fixed clock text, no visitor messages.
const DETERMINISTIC = process.env.DETERMINISTIC === '1'
// Optional: pin the temperature (separates the uncertainty->temperature link from the rest of version B).
const FIXED_TEMPERATURE = (() => {
  const n = Number(process.env.FIXED_TEMPERATURE)
  return process.env.FIXED_TEMPERATURE && Number.isFinite(n) && n >= 0 && n <= 2 ? n : null
})()

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ver = resolveVersion(parseVersion(process.env.EXPERIMENT_VERSION))
    const { features } = ver

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
    const time = DETERMINISTIC ? `turn-${iteration}` : now.toISOString()
    const day = DETERMINISTIC ? 'fixed' : now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })

    // ── Load the mind ───────────────────────────────────────────
    const mind = await loadMind()
    let stateBefore: AgentState | null = null
    let revision = 0
    if (features.structuredState) {
      const loaded = await loadAgentState()
      stateBefore = loaded.state
      revision = loaded.revision
    }

    // Version B+: retrieval is controlled by the state; hidden memories are never deleted.
    const visible = stateBefore ? retrieveMemories(mind.memories, stateBefore) : mind.memories
    const visibleIds = new Set(visible.map(m => m.id))
    const hidden = mind.memories.filter(m => !visibleIds.has(m.id))

    const temperature = DETERMINISTIC ? 0
      : FIXED_TEMPERATURE ?? (stateBefore ? temperatureFor(stateBefore) : BASELINE_TEMPERATURE)

    // ── The world ───────────────────────────────────────────────
    let visitors: Visitor[] = []
    let world: WorldInputs
    if (DETERMINISTIC) {
      world = { weather: 'clear, 15°C, no wind (fixed)', headlines: ['(deterministic mode)'], visitors: [] }
    } else {
      const visitorRes = await supabaseAdmin
        .from('visitor_messages').select('id, body')
        .is('read_iteration', null).order('id', { ascending: true }).limit(3)
      visitors = (visitorRes.data ?? []) as Visitor[]
      world = await getWorld(visitors)
    }

    const retired = retiredWords((recent ?? []).map(r => r.reflection))
    const angle = pickAngle(iteration)

    // ── Language layer (LLM) ────────────────────────────────────
    const result = await think({
      iteration, time, day,
      workingMemory: mind.workingMemory,
      memories: visible,
      lastReflection: latest?.reflection ?? null,
      retired, angle, world,
      features, state: stateBefore, temperature,
    })

    // ── Controller: decide what changes (pure functions) ────────
    const plan = planMemory(visible, {
      workingMemory: result.workingMemory,
      keep: result.keep,
      add: result.add,
    }, hidden)
    const finalMemories = [...hidden.map(m => m.content), ...plan.finalContents]
    const stateAfter = stateBefore ? applyStateUpdate(stateBefore, result.stateUpdate) : null

    // ── Run tracking: a config change closes the old run and opens a new one ──
    const config: RunConfig = {
      version: ver.effective,
      requested_version: ver.requested,
      deterministic: DETERMINISTIC,
      models: MODELS,
      prompt_hash: hashString(systemPromptFor(features)),
      fixed_temperature: FIXED_TEMPERATURE,
      retrieval_k: RETRIEVAL_K,
      label: (process.env.EXPERIMENT_LABEL ?? '').trim(),
    }
    let runId: number | null = null
    let runStarted = false
    try {
      const r = await ensureRun(config, iteration)
      runId = r.runId
      runStarted = r.started
    } catch (runErr) {
      console.error('[run tracking error]', runErr)   // never blocks a thought
    }

    const { error: insertErr } = await supabaseAdmin.from('thoughts').insert({
      iteration,
      reflection: result.reflection,
      memories: finalMemories,
      context: { iteration, time, day },
      inputs: { weather: world.weather, headlines: world.headlines, visitors: visitors.map(v => v.body) },
      angle,
      working_memory: plan.workingMemory ?? mind.workingMemory,
      forgotten: plan.forgottenContents,
      retired_words: retired,
      model: result.model,
      experiment_version: ver.effective,
      ...(runId ? { run_id: runId } : {}),
    })
    if (insertErr) throw insertErr

    await commitMemory(plan, iteration)
    if (stateAfter) await saveAgentState(stateAfter, revision + 1)

    if (visitors.length > 0) {
      await supabaseAdmin.from('visitor_messages')
        .update({ read_iteration: iteration }).in('id', visitors.map(v => v.id))
    }

    // ── Experiment log (best effort: never blocks a thought) ────
    try {
      await logExperiment({
        iteration,
        experiment_version: ver.effective,
        requested_version: ver.requested,
        model: result.model,
        temperature,
        deterministic: DETERMINISTIC,
        input: { weather: world.weather, headlines: world.headlines, visitors: visitors.map(v => v.body), angle },
        retrieved_memory_ids: visible.map(m => m.id),
        hidden_memory_ids: hidden.map(m => m.id),
        new_memories: plan.adds,
        deleted_memories: plan.forgottenContents,
        state_before: stateBefore,
        state_after: stateAfter,
        extra: {
          retried: result.retried,
          downgraded: ver.downgraded,
          retrieval_hit: stateBefore ? retrievalHit(visible, stateBefore) : null,
        },
        ...(runId ? { run_id: runId } : {}),
      })
    } catch (logErr) {
      console.error('[experiment_log error]', logErr)
    }

    return NextResponse.json({
      ok: true, iteration, version: ver.effective, model: result.model, temperature,
      retried: result.retried, kept: plan.keptRows.length, added: plan.adds.length,
      forgotten: plan.forgetIds.length, hidden: hidden.length, visitors: visitors.length,
      run: runId, newRun: runStarted,
    })
  } catch (err) {
    console.error('[tick error]', err)
    if (String(err).includes('QUOTA_EXCEEDED')) {
      return NextResponse.json({ ok: false, skipped: 'gemini quota exceeded' })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
