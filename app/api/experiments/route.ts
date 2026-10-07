import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { metricsForRun } from '@/lib/runs'
import { METRIC_INFO, SCALAR_INFO } from '@/lib/metrics'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Read-only research endpoint. Closed runs return their frozen snapshot;
// the open run (and any closed run without a snapshot) is computed on the fly.
export async function GET() {
  try {
    const { data: runs, error } = await supabaseAdmin
      .from('experiment_runs').select('*').order('id', { ascending: false }).limit(30)
    if (error) throw error

    const out: Record<string, unknown>[] = []
    for (const run of runs ?? []) {
      let metrics = run.metrics
      if (!metrics) {
        try {
          metrics = await metricsForRun(run.id)
          if (run.ended_at) await supabaseAdmin.from('experiment_runs').update({ metrics }).eq('id', run.id)
        } catch (e) {
          console.error('[experiments metrics]', run.id, e)
        }
      }
      out.push({
        id: run.id, label: run.label, version: run.version, config: run.config, changes: run.changes,
        started_at: run.started_at, ended_at: run.ended_at,
        start_iteration: run.start_iteration, end_iteration: run.end_iteration, metrics,
      })
    }
    return NextResponse.json(
      { runs: out, metricInfo: METRIC_INFO, scalarInfo: SCALAR_INFO },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    )
  } catch (err) {
    console.error('[experiments error]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
