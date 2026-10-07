import { supabaseAdmin } from '@/lib/supabase-admin'
import { fingerprint, diffConfig, type RunConfig } from '@/lib/run-config'
import { computeRunMetrics, type LogRow, type RunMetrics, type ThoughtRow } from '@/lib/metrics'

const PAGE = 1000

async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  max = 4000
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** Metrics for one run, computed from its thoughts and experiment_log rows. */
export async function metricsForRun(runId: number, maxRows = 4000): Promise<RunMetrics> {
  const thoughts = await fetchAll<ThoughtRow>((a, b) =>
    supabaseAdmin.from('thoughts')
      .select('iteration, reflection, memories, forgotten, inputs, created_at, model')
      .eq('run_id', runId).order('iteration', { ascending: true }).range(a, b), maxRows)
  const logs = await fetchAll<LogRow>((a, b) =>
    supabaseAdmin.from('experiment_log')
      .select('iteration, temperature, hidden_memory_ids, state_before, state_after, extra')
      .eq('run_id', runId).order('iteration', { ascending: true }).range(a, b), maxRows)
  return computeRunMetrics(thoughts, logs)
}

/**
 * Called once per tick. If the configuration fingerprint differs from the open run's,
 * the open run is closed (metrics frozen) and a new run starts. Returns the run to attach.
 */
export async function ensureRun(config: RunConfig, iteration: number): Promise<{ runId: number; started: boolean }> {
  const fp = fingerprint(config)
  const { data: open, error } = await supabaseAdmin
    .from('experiment_runs').select('*').is('ended_at', null)
    .order('id', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (open && open.fingerprint === fp) return { runId: open.id as number, started: false }

  let parent: any = open
  if (open) {
    let metrics: RunMetrics | null = null
    try { metrics = await metricsForRun(open.id) } catch (e) { console.error('[run metrics snapshot]', e) }
    const { error: closeErr } = await supabaseAdmin.from('experiment_runs')
      .update({ ended_at: new Date().toISOString(), end_iteration: iteration - 1, metrics })
      .eq('id', open.id)
    if (closeErr) throw closeErr
  } else {
    const { data: last } = await supabaseAdmin.from('experiment_runs')
      .select('*').order('id', { ascending: false }).limit(1).maybeSingle()
    parent = last
  }

  const { data: created, error: insErr } = await supabaseAdmin.from('experiment_runs').insert({
    label: config.label || null,
    version: config.version,
    fingerprint: fp,
    config,
    changes: parent ? diffConfig(parent.config, config) : {},
    start_iteration: iteration,
    parent_run_id: parent?.id ?? null,
  }).select('id').single()
  if (insErr) throw insErr
  return { runId: created.id as number, started: true }
}
