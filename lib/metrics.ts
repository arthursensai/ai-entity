// Run metrics + comparison (pure, no imports; safe to use on server and client).
//
// IMPORTANT: language metrics describe TEXT. They are not evidence about consciousness.
// Structured-state metrics (version B+) describe behaviour of the controller + state.

export type ThoughtRow = {
  iteration: number
  reflection: string
  memories: string[] | null
  forgotten: string[] | null
  inputs: { visitors?: string[] } | null
  created_at: string
  model: string | null
}

export type LogRow = {
  iteration: number
  temperature: number | null
  hidden_memory_ids: number[] | null
  state_before: any
  state_after: any
  extra: any
}

export type Summary = { n: number; mean: number | null; sd: number | null }

export type RunMetrics = {
  n_thoughts: number
  first_iteration: number | null
  last_iteration: number | null
  hours: number | null
  models: string[]
  series: Record<string, Summary>
  scalars: Record<string, number | null>
}

export type MetricInfo = { key: string; label: string; group: string; help: string; digits: number }

export const METRIC_INFO: MetricInfo[] = [
  // Language (text-level)
  { key: 'distinct2', group: 'Language (text only)', label: 'Phrase variety', digits: 3, help: 'Distinct word pairs / all word pairs inside a thought. Lower = more repetitive wording.' },
  { key: 'novelty', group: 'Language (text only)', label: 'Novelty vs last 20', digits: 3, help: 'Share of content words not used in the previous 20 thoughts. Low = looping.' },
  { key: 'similarity_prev', group: 'Language (text only)', label: 'Similarity to previous thought', digits: 3, help: 'Overlap of content words with the thought before. High = stuck in a loop.' },
  { key: 'self_ref', group: 'Language (text only)', label: 'First-person rate', digits: 4, help: 'Share of words that are I / me / my / mine / myself. A property of the text, not of experience.' },
  { key: 'length_words', group: 'Language (text only)', label: 'Words per thought', digits: 1, help: 'Average length.' },
  // Memory
  { key: 'shelf_size', group: 'Memory', label: 'Shelf size after turn', digits: 2, help: 'Long-term memories held after each turn (max 7).' },
  { key: 'forgotten_n', group: 'Memory', label: 'Memories deleted per turn', digits: 2, help: 'Real deletions per turn.' },
  { key: 'hidden_n', group: 'Memory', label: 'Memories hidden by retrieval', digits: 2, help: 'Version B+: memories not shown this turn.' },
  // Structured state
  { key: 'uncertainty', group: 'Structured state (B+)', label: 'Reported uncertainty', digits: 3, help: 'The entity\'s own uncertainty value (drives next temperature).' },
  { key: 'temperature', group: 'Structured state (B+)', label: 'Sampling temperature', digits: 2, help: 'Temperature actually used.' },
  { key: 'state_changed', group: 'Structured state (B+)', label: 'Turns where state changed', digits: 3, help: 'Rate of turns with any change to the structured state.' },
  { key: 'attention_shift', group: 'Structured state (B+)', label: 'Attention target shifts', digits: 3, help: 'Rate of turns where attention_target changed.' },
  { key: 'retrieval_hit', group: 'Structured state (B+)', label: 'Retrieval matched attention', digits: 3, help: 'Rate of turns where a visible memory actually matched attention_target (checks that the causal link works).' },
  // Continuity
  { key: 'list_stability', group: 'Continuity (B+)', label: 'Belief/knowledge stability', digits: 3, help: 'Overlap of beliefs+known+unknown+preferences before vs after a turn. 1 = unchanged.' },
  { key: 'self_desc_stability', group: 'Continuity (B+)', label: 'Self-description stability', digits: 3, help: 'Word overlap of the self-description before vs after a turn.' },
  // World
  { key: 'visitor_echo', group: 'World', label: 'Visitor message echoed', digits: 3, help: 'Only turns where a visitor wrote: share of the message\'s content words that appear in the thought.' },
]

export const SCALAR_INFO: MetricInfo[] = [
  { key: 'corr_temp_distinct2', group: 'Causal check', label: 'r(temperature, phrase variety)', digits: 2, help: 'Pearson r across turns (needs 10+). Confounded: the entity chooses its own uncertainty.' },
]

// ── helpers ──────────────────────────────────────────────────
const STOP = new Set(`that this with from have been were they them their there what when where which while would could should about into than then also only just more most much very some such these those your yours itself myself because through between without within being does doing done each other another still even over under again`.split(/\s+/))
const FIRST_PERSON = new Set(['i', 'me', 'my', 'mine', 'myself'])

const words = (s: string) => s.toLowerCase().match(/[a-z']+/g) ?? []
const contentSet = (s: string) => new Set(words(s).filter(w => w.length >= 4 && !STOP.has(w)))

function jaccard(a: Set<string>, b: Set<string>): number | null {
  if (a.size === 0 && b.size === 0) return null
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

export function summarize(xs: number[]): Summary {
  const v = xs.filter(Number.isFinite)
  const n = v.length
  if (n === 0) return { n: 0, mean: null, sd: null }
  const mean = v.reduce((s, x) => s + x, 0) / n
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : null
  return { n, mean, sd }
}

function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length)
  if (n < 10) return null
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy)
}

const listItems = (s: any): string[] =>
  s ? [...(s.beliefs ?? []), ...(s.known ?? []), ...(s.unknown ?? []), ...(s.preferences ?? [])].map((x: unknown) => String(x).toLowerCase()) : []

// ── per-run metrics ──────────────────────────────────────────
export function computeRunMetrics(thoughtsIn: ThoughtRow[], logs: LogRow[]): RunMetrics {
  const thoughts = [...thoughtsIn].sort((a, b) => a.iteration - b.iteration)
  const S: Record<string, number[]> = {}
  const push = (k: string, v: number | null | undefined) => { if (v != null && Number.isFinite(v)) (S[k] ??= []).push(v) }

  const windowSets: Set<string>[] = []
  const distinctByIter = new Map<number, number>()
  let prev: Set<string> | null = null

  for (const t of thoughts) {
    const toks = words(t.reflection)
    const cw = contentSet(t.reflection)
    push('length_words', toks.length)
    if (toks.length > 0) push('self_ref', toks.filter(w => FIRST_PERSON.has(w)).length / toks.length)
    if (toks.length >= 6) {
      const grams = new Set<string>(); let total = 0
      for (let i = 0; i < toks.length - 1; i++) { grams.add(toks[i] + ' ' + toks[i + 1]); total++ }
      const d2 = grams.size / total
      push('distinct2', d2); distinctByIter.set(t.iteration, d2)
    }
    if (prev) {
      push('similarity_prev', jaccard(cw, prev))
      if (cw.size > 0) {
        const seen = new Set<string>(); for (const s of windowSets) for (const w of s) seen.add(w)
        let fresh = 0; for (const w of cw) if (!seen.has(w)) fresh++
        push('novelty', fresh / cw.size)
      }
    }
    prev = cw
    windowSets.push(cw); if (windowSets.length > 20) windowSets.shift()

    push('shelf_size', (t.memories ?? []).length)
    push('forgotten_n', (t.forgotten ?? []).length)

    const msgs = t.inputs?.visitors ?? []
    if (msgs.length > 0) {
      const mw = new Set<string>(); for (const m of msgs) for (const w of contentSet(m)) mw.add(w)
      if (mw.size > 0) { let hit = 0; for (const w of mw) if (cw.has(w)) hit++; push('visitor_echo', hit / mw.size) }
    }
  }

  const tempX: number[] = [], tempY: number[] = []
  for (const l of logs) {
    push('temperature', l.temperature)
    push('hidden_n', (l.hidden_memory_ids ?? []).length)
    const b = l.state_before, a = l.state_after
    if (b && a) {
      push('uncertainty', a.current_state?.uncertainty)
      push('state_changed', JSON.stringify(a) !== JSON.stringify(b) ? 1 : 0)
      push('attention_shift', (a.current_state?.attention_target ?? '') !== (b.current_state?.attention_target ?? '') ? 1 : 0)
      const lb = new Set(listItems(b)), la = new Set(listItems(a))
      push('list_stability', jaccard(lb, la))
      push('self_desc_stability', jaccard(contentSet(b.identity?.self_description ?? ''), contentSet(a.identity?.self_description ?? '')))
    }
    if (typeof l.extra?.retrieval_hit === 'boolean') push('retrieval_hit', l.extra.retrieval_hit ? 1 : 0)
    const d2 = distinctByIter.get(l.iteration)
    if (d2 != null && l.temperature != null) { tempX.push(l.temperature); tempY.push(d2) }
  }

  const series: Record<string, Summary> = {}
  for (const [k, v] of Object.entries(S)) series[k] = summarize(v)

  const times = thoughts.map(t => new Date(t.created_at).getTime()).filter(Number.isFinite)
  return {
    n_thoughts: thoughts.length,
    first_iteration: thoughts.length ? thoughts[0].iteration : null,
    last_iteration: thoughts.length ? thoughts[thoughts.length - 1].iteration : null,
    hours: times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 3_600_000 : null,
    models: [...new Set(thoughts.map(t => t.model).filter((m): m is string => !!m))],
    series,
    scalars: { corr_temp_distinct2: pearson(tempX, tempY) },
  }
}

// ── comparison ───────────────────────────────────────────────
export const MIN_N = 30

export type Signal = { label: string; d: number | null; t: number | null; strength: 'none' | 'small' | 'medium' | 'large' | 'n/a' }

export function compareSummaries(a: Summary | undefined, b: Summary | undefined): Signal {
  if (!a || !b || a.mean == null || b.mean == null) return { label: 'no data', d: null, t: null, strength: 'n/a' }
  if (a.n < MIN_N || b.n < MIN_N) return { label: `insufficient data (need ${MIN_N}+ each)`, d: null, t: null, strength: 'n/a' }
  const sa = a.sd ?? 0, sb = b.sd ?? 0
  const delta = b.mean - a.mean
  const se = Math.sqrt(sa ** 2 / a.n + sb ** 2 / b.n)
  const pooled = Math.sqrt(((a.n - 1) * sa ** 2 + (b.n - 1) * sb ** 2) / (a.n + b.n - 2))
  if (se === 0 || pooled === 0) return { label: delta === 0 ? 'identical' : 'differs (no variance)', d: null, t: null, strength: delta === 0 ? 'none' : 'large' }
  const t = delta / se, d = delta / pooled
  if (Math.abs(t) < 2 || Math.abs(d) < 0.2) return { label: 'no clear difference', d, t, strength: 'none' }
  const strength = Math.abs(d) >= 0.8 ? 'large' : Math.abs(d) >= 0.5 ? 'medium' : 'small'
  return { label: `${delta > 0 ? 'higher' : 'lower'} in B (${strength})`, d, t, strength }
}

export type CompareRow = { info: MetricInfo; a: Summary | null; b: Summary | null; delta: number | null; signal: Signal }

export function compareRuns(a: RunMetrics, b: RunMetrics): { rows: CompareRow[]; scalars: { info: MetricInfo; a: number | null; b: number | null }[] } {
  const rows: CompareRow[] = []
  for (const info of METRIC_INFO) {
    const sa = a.series[info.key], sb = b.series[info.key]
    if (!sa && !sb) continue
    rows.push({
      info, a: sa ?? null, b: sb ?? null,
      delta: sa?.mean != null && sb?.mean != null ? sb.mean - sa.mean : null,
      signal: compareSummaries(sa, sb),
    })
  }
  const scalars = SCALAR_INFO.map(info => ({ info, a: a.scalars[info.key] ?? null, b: b.scalars[info.key] ?? null }))
  return { rows, scalars }
}
