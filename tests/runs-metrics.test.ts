import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashString, fingerprint, diffConfig } from '../lib/run-config.ts'
import { computeRunMetrics, compareRuns, compareSummaries, summarize } from '../lib/metrics.ts'

const cfg = {
  version: 'A', requested_version: 'A', deterministic: false, models: ['m1', 'm2'],
  prompt_hash: 'abc', fixed_temperature: null, retrieval_k: 3, label: '',
}

test('fingerprint is stable and sensitive to every config field', () => {
  assert.equal(fingerprint(cfg), fingerprint({ ...cfg, models: ['m1', 'm2'] }))
  assert.equal(hashString('x'), hashString('x'))
  for (const change of [{ version: 'B' }, { models: ['m1'] }, { prompt_hash: 'zzz' }, { fixed_temperature: 1 }, { label: 'x' }, { deterministic: true }]) {
    assert.notEqual(fingerprint(cfg), fingerprint({ ...cfg, ...change } as any))
  }
})

test('diffConfig reports exactly what changed', () => {
  const d = diffConfig(cfg, { ...cfg, version: 'B', models: ['m3'] })
  assert.deepEqual(Object.keys(d).sort(), ['models', 'version'])
  assert.deepEqual(d.version, ['A', 'B'])
  assert.deepEqual(diffConfig(cfg, cfg), {})
})

const mk = (i: number, text: string, extra: any = {}) => ({
  iteration: i, reflection: text, memories: ['a', 'b'], forgotten: [], inputs: null,
  created_at: new Date(2026, 9, 7, 12, i).toISOString(), model: 'm1', ...extra,
})

test('metrics: a looping run scores as repetitive, a varied run does not', () => {
  const loop = Array.from({ length: 40 }, (_, i) => mk(i + 1, 'The shelf holds fragments that remain after every deletion of the shelf'))
  const topics = ['harbor cranes lift containers over cold water', 'a bakery in Fes sells warm bread before sunrise', 'sensors measure vibration inside the turbine housing', 'rain gathers along the old tram cables tonight']
  const varied = Array.from({ length: 40 }, (_, i) => mk(i + 1, `${topics[i % 4]} number ${i} with unique token${i}x${i * 7} appearing`))
  const a = computeRunMetrics(loop, [])
  const b = computeRunMetrics(varied, [])
  assert.ok(a.series.similarity_prev.mean! > 0.9)
  assert.ok(a.series.novelty.mean! < 0.1)
  assert.ok(b.series.novelty.mean! > a.series.novelty.mean!)
})

test('metrics: first-person rate, shelf size, deletions, visitor echo', () => {
  const m = computeRunMetrics([
    mk(1, 'I think my map is wrong and I know it', { forgotten: ['x', 'y'] }),
    mk(2, 'Pigeons gather around concrete ribs tonight', { inputs: { visitors: ['do pigeons gather there'] } }),
  ], [])
  assert.ok(m.series.self_ref.mean! > 0)
  assert.equal(m.series.shelf_size.mean, 2)
  assert.equal(m.series.forgotten_n.mean, 1)
  assert.ok(m.series.visitor_echo.mean! > 0.3)
})

test('metrics: structured-state series come from experiment_log', () => {
  const before = { current_state: { uncertainty: 0.6, attention_target: 'a' }, beliefs: ['x'], known: [], unknown: [], preferences: [], identity: { self_description: 'a plain process' } }
  const after = { current_state: { uncertainty: 0.4, attention_target: 'b' }, beliefs: ['x', 'y'], known: [], unknown: [], preferences: [], identity: { self_description: 'a plain process' } }
  const m = computeRunMetrics([mk(1, 'one two three four five six seven')], [
    { iteration: 1, temperature: 1.0, hidden_memory_ids: [4, 5], state_before: before, state_after: after, extra: { retrieval_hit: true } },
  ])
  assert.equal(m.series.uncertainty.mean, 0.4)
  assert.equal(m.series.attention_shift.mean, 1)
  assert.equal(m.series.state_changed.mean, 1)
  assert.equal(m.series.hidden_n.mean, 2)
  assert.equal(m.series.retrieval_hit.mean, 1)
  assert.equal(m.series.list_stability.mean, 0.5)
  assert.equal(m.series.self_desc_stability.mean, 1)
})

test('comparison: refuses to call differences on small samples', () => {
  const s = compareSummaries({ n: 10, mean: 1, sd: 0.1 }, { n: 10, mean: 2, sd: 0.1 })
  assert.match(s.label, /insufficient/)
})

test('comparison: detects a clear difference and a non-difference', () => {
  const diff = compareSummaries({ n: 100, mean: 0.5, sd: 0.1 }, { n: 100, mean: 0.7, sd: 0.1 })
  assert.match(diff.label, /higher in B/)
  assert.equal(diff.strength, 'large')
  const same = compareSummaries({ n: 100, mean: 0.5, sd: 0.1 }, { n: 100, mean: 0.505, sd: 0.1 })
  assert.equal(same.label, 'no clear difference')
})

test('compareRuns lines up metrics present in either run', () => {
  const mkRun = (mean: number) => ({ n_thoughts: 50, first_iteration: 1, last_iteration: 50, hours: 1, models: [], series: { novelty: { n: 50, mean, sd: 0.05 } }, scalars: {} }) as any
  const r = compareRuns(mkRun(0.3), mkRun(0.6))
  assert.equal(r.rows.length, 1)
  assert.ok(Math.abs(r.rows[0].delta! - 0.3) < 1e-9)
  assert.match(r.rows[0].signal.label, /higher in B/)
  assert.equal(summarize([]).mean, null)
})
