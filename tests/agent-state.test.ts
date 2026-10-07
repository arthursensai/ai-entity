import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultState, applyStateUpdate, normalizeState, temperatureFor, retrieveMemories, promptView,
  LIST_CAP, ITEM_LEN,
} from '../lib/agent-state.ts'

test('default state matches the schema and is baseline-compatible', () => {
  const s = defaultState()
  assert.equal(s.identity.name, 'Entity #001')
  assert.equal(temperatureFor(s), 1.2)            // uncertainty 0.6 == baseline temperature
})

test('state update: valid fields apply, numbers are clamped', () => {
  const s = applyStateUpdate(defaultState(), {
    focus: 'memory test', attention_target: 'shelf deletion', uncertainty: 7,
    identity: { self_description: 'a process', identity_confidence: -3 },
  })
  assert.equal(s.current_state.focus, 'memory test')
  assert.equal(s.current_state.uncertainty, 1)
  assert.equal(s.identity.identity_confidence, 0)
})

test('state update: model cannot change name, energy or reserved fields', () => {
  const s = applyStateUpdate(defaultState(), {
    identity: { name: 'Hacked' }, energy: 0, goals: [{ x: 1 }], self_model: { a: 1 },
  })
  assert.equal(s.identity.name, 'Entity #001')
  assert.equal(s.current_state.energy, 1)
  assert.deepEqual(s.goals, [])
  assert.deepEqual(s.self_model, {})
})

test('state update: malformed input leaves state unchanged', () => {
  const base = defaultState()
  assert.equal(applyStateUpdate(base, null), base)
  assert.equal(applyStateUpdate(base, 'oops'), base)
  const s = applyStateUpdate(base, { uncertainty: 'high', beliefs: 'not a list' })
  assert.equal(s.current_state.uncertainty, 0.6)
  assert.deepEqual(s.beliefs, [])
})

test('lists: dedupe, truncate items, cap length, empty array clears', () => {
  const many = Array.from({ length: 20 }, (_, i) => `belief ${i}`)
  const s = applyStateUpdate(defaultState(), { beliefs: [...many, 'BELIEF 3', 'x'.repeat(500)] })
  assert.equal(s.beliefs.length, LIST_CAP)
  assert.ok(s.beliefs.every(b => b.length <= ITEM_LEN))
  const cleared = applyStateUpdate(s, { beliefs: [] })
  assert.deepEqual(cleared.beliefs, [])
  const kept = applyStateUpdate(s, {})            // key absent -> unchanged
  assert.deepEqual(kept.beliefs, s.beliefs)
})

test('persistence round-trip: JSON -> normalizeState preserves values', () => {
  const a = applyStateUpdate(defaultState(), {
    focus: 'f', attention_target: 'a b c', uncertainty: 0.25,
    identity: { self_description: 'sd', identity_confidence: 0.4 }, known: ['k1'],
  })
  const b = normalizeState(JSON.parse(JSON.stringify(a)))
  assert.deepEqual(b, a)
})

test('causal link 1: uncertainty -> temperature is monotonic and bounded', () => {
  const t = (u: number) => temperatureFor(applyStateUpdate(defaultState(), { uncertainty: u }))
  assert.ok(t(0) < t(0.5) && t(0.5) < t(1))
  assert.equal(t(0), 0.6)
  assert.equal(t(1), 1.6)
})

const mems = [
  { id: 1, content: 'cooling towers use groundwater', times_kept: 1 },
  { id: 2, content: 'forty gigabytes were deleted', times_kept: 5 },
  { id: 3, content: 'the shelf is a field of influence', times_kept: 2 },
  { id: 4, content: 'weather is sixteen degrees', times_kept: 0 },
  { id: 5, content: 'magnetic semiconductors headline', times_kept: 0 },
]

test('causal link 2: attention_target decides which memories are retrieved', () => {
  const s = applyStateUpdate(defaultState(), { attention_target: 'semiconductors headline' })
  const got = retrieveMemories(mems, s, 2).map(m => m.id)
  assert.ok(got.includes(5))
  assert.equal(got.length, 2)
  const s2 = applyStateUpdate(defaultState(), { attention_target: 'groundwater cooling' })
  assert.ok(retrieveMemories(mems, s2, 2).map(m => m.id).includes(1))
})

test('retrieval is deterministic, id-sorted, and shows everything when nothing is attended', () => {
  const s = applyStateUpdate(defaultState(), { attention_target: 'shelf field' })
  const a = retrieveMemories(mems, s, 3).map(m => m.id)
  const b = retrieveMemories([...mems].reverse(), s, 3).map(m => m.id)
  assert.deepEqual(a, b)
  assert.deepEqual(a, [...a].sort((x, y) => x - y))
  assert.equal(retrieveMemories(mems, defaultState(), 3).length, mems.length)
})

test('prompt view hides reserved (empty) fields', () => {
  const v = promptView(defaultState()) as Record<string, unknown>
  assert.equal('goals' in v, false)
  assert.equal('self_model' in v, false)
})
