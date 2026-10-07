'use client'

import { useEffect, useMemo, useState } from 'react'
import { compareRuns, type MetricInfo, type RunMetrics } from '@/lib/metrics'

type Run = {
  id: number
  label: string | null
  version: string
  config: Record<string, unknown>
  changes: Record<string, [unknown, unknown]> | null
  started_at: string
  ended_at: string | null
  start_iteration: number
  end_iteration: number | null
  metrics: RunMetrics | null
}

const mono = { fontFamily: 'monospace' } as const
const dim = { color: '#444', fontSize: '0.75rem' } as const

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s == null ? '—' : s.length > 28 ? s.slice(0, 26) + '…' : s
}
const fmt = (x: number | null | undefined, digits: number) =>
  x == null || !Number.isFinite(x) ? '—' : x.toFixed(digits)

const title = (r: Run) => `#${r.id} · ${r.label || `version ${r.version}`}`

function signalColor(label: string) {
  if (label.startsWith('higher') || label.startsWith('lower') || label.startsWith('differs')) return '#e0b34a'
  if (label.startsWith('no clear') || label === 'identical') return '#6a6a6a'
  return '#3a3a3a'
}

export default function Experiments() {
  const [runs, setRuns] = useState<Run[]>([])
  const [info, setInfo] = useState<MetricInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aId, setAId] = useState<number | null>(null)
  const [bId, setBId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/experiments')
      .then(r => r.json())
      .then(j => {
        if (j.error) throw new Error(j.error)
        const rs = (j.runs ?? []) as Run[]
        setRuns(rs)
        setInfo(j.metricInfo ?? [])
        if (rs.length > 0) setBId(rs[0].id)
        if (rs.length > 1) setAId(rs[1].id)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const a = runs.find(r => r.id === aId)
  const b = runs.find(r => r.id === bId)

  const cmp = useMemo(
    () => (a?.metrics && b?.metrics ? compareRuns(a.metrics, b.metrics) : null),
    [a, b]
  )

  const groups = useMemo(() => {
    const g = new Map<string, NonNullable<typeof cmp>['rows']>()
    for (const row of cmp?.rows ?? []) g.set(row.info.group, [...(g.get(row.info.group) ?? []), row])
    return [...g.entries()]
  }, [cmp])

  const select = (value: number | null, set: (n: number) => void) => (
    <select
      value={value ?? ''}
      onChange={e => set(Number(e.target.value))}
      style={{ background: '#0e0e0e', color: '#d4d4d4', border: '1px solid #1c1c1c', borderRadius: '4px', padding: '0.5rem', width: '100%', ...mono, fontSize: '0.8rem' }}
    >
      {runs.map(r => <option key={r.id} value={r.id}>{title(r)}</option>)}
    </select>
  )

  return (
    <main style={{ maxWidth: '700px', margin: '0 auto', padding: '3.5rem 1.5rem 6rem' }}>
      <a href="/" style={{ ...dim, ...mono, textDecoration: 'none' }}>← entity</a>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 400, color: '#f0f0f0', margin: '1rem 0 0.5rem' }}>Experiments</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: 1.8, marginBottom: '2rem' }}>
        A new run starts automatically whenever the configuration changes (version, model list,
        prompt, temperature mode, or label). Each run keeps its own measurements so runs can be compared.
      </p>

      {loading && <p style={{ ...dim, ...mono }}>loading…</p>}
      {error && <p style={{ color: '#a55', ...mono, fontSize: '0.8rem' }}>{error}</p>}
      {!loading && !error && runs.length === 0 && (
        <p style={{ ...dim, ...mono }}>
          no runs yet — run migrations/003_experiment_runs.sql, then wait for the next thought.
        </p>
      )}

      {/* Timeline of runs */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {runs.map(r => {
          const m = r.metrics
          const ch = Object.entries((r.changes ?? {}) as Record<string, [unknown, unknown]>)
          return (
            <div key={r.id} style={{ borderLeft: `2px solid ${r.ended_at ? '#1a1a1a' : '#4ade80'}`, paddingLeft: '1rem' }}>
              <div style={{ color: '#d4d4d4', fontSize: '0.95rem' }}>{title(r)}</div>
              <div style={{ ...dim, ...mono, marginTop: '0.25rem' }}>
                {r.ended_at ? 'closed' : 'running'} · turns {r.start_iteration}–{r.end_iteration ?? 'now'} ·{' '}
                {m ? `${m.n_thoughts} thoughts` : '—'} · {new Date(r.started_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
              {m && m.models.length > 0 && <div style={{ ...dim, ...mono }}>{m.models.join(', ')}</div>}
              {ch.length > 0 && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#8b7a3a', ...mono, lineHeight: 1.7 }}>
                  {ch.map(([k, [from, to]]) => (
                    <div key={k}>{k === 'prompt_hash' ? 'prompt changed' : `${k}: ${short(from)} → ${short(to)}`}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>

      {/* Comparison */}
      {runs.length > 1 && (
        <section>
          <div style={{ color: '#3a3a3a', ...mono, fontSize: '0.7rem', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>COMPARE</div>
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}><div style={{ ...dim, marginBottom: 4 }}>A (reference)</div>{select(aId, setAId)}</div>
            <div style={{ flex: 1 }}><div style={{ ...dim, marginBottom: 4 }}>B</div>{select(bId, setBId)}</div>
          </div>

          {!cmp && <p style={{ ...dim, ...mono }}>metrics not available for one of these runs yet.</p>}

          {groups.map(([group, rows]) => (
            <div key={group} style={{ marginBottom: '1.75rem' }}>
              <div style={{ color: '#555', fontSize: '0.8rem', marginBottom: '0.6rem' }}>{group}</div>
              {rows.map(row => (
                <div key={row.info.key} style={{ padding: '0.55rem 0', borderTop: '1px solid #141414' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#c8c8c8', fontSize: '0.85rem' }}>{row.info.label}</span>
                    <span style={{ ...mono, fontSize: '0.8rem', color: '#9a9a9a' }}>
                      {fmt(row.a?.mean, row.info.digits)} → {fmt(row.b?.mean, row.info.digits)}
                      {row.delta != null && <span style={{ color: '#666' }}> ({row.delta >= 0 ? '+' : ''}{fmt(row.delta, row.info.digits)})</span>}
                    </span>
                  </div>
                  <div style={{ ...mono, fontSize: '0.7rem', color: signalColor(row.signal.label), marginTop: 2 }}>
                    {row.signal.label}
                    {row.signal.d != null && ` · d=${fmt(row.signal.d, 2)}`}
                    <span style={{ color: '#333' }}> · n={row.a?.n ?? 0} vs {row.b?.n ?? 0}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#3a3a3a', marginTop: 2, lineHeight: 1.6 }}>{row.info.help}</div>
                </div>
              ))}
            </div>
          ))}

          {cmp && cmp.scalars.some(s => s.a != null || s.b != null) && (
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ color: '#555', fontSize: '0.8rem', marginBottom: '0.6rem' }}>Causal check</div>
              {cmp.scalars.map(s => (
                <div key={s.info.key} style={{ padding: '0.55rem 0', borderTop: '1px solid #141414' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#c8c8c8', fontSize: '0.85rem' }}>{s.info.label}</span>
                    <span style={{ ...mono, fontSize: '0.8rem', color: '#9a9a9a' }}>{fmt(s.a, s.info.digits)} → {fmt(s.b, s.info.digits)}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#3a3a3a', marginTop: 2, lineHeight: 1.6 }}>{s.info.help}</div>
                </div>
              ))}
            </div>
          )}

          <p style={{ color: '#3a3a3a', fontSize: '0.72rem', lineHeight: 1.8 }}>
            “Different” = Welch |t| ≥ 2 and |Cohen&apos;s d| ≥ 0.2 with 30+ turns in each run. Turns are not
            independent samples (each depends on the last), so this is a screening signal, not a
            significance test. Runs under different models are not directly comparable.
          </p>
        </section>
      )}

      <p style={{ marginTop: '4rem', paddingTop: '1.5rem', borderTop: '1px solid #161616', color: '#3a3a3a', fontSize: '0.75rem', lineHeight: 1.8 }}>
        This experiment investigates functional properties associated with agency, self-modeling,
        memory, metacognition, and autonomous behavior. These measurements do not establish
        phenomenal consciousness.
      </p>
    </main>
  )
}
