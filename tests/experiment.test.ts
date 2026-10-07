import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LADDER, featuresFor, parseVersion, resolveVersion } from '../lib/experiment.ts'

test('features are cumulative along the ladder', () => {
  const rank = (v: any) => Object.values(featuresFor(v)).filter(Boolean).length
  const ranks = LADDER.map(rank)
  assert.deepEqual(ranks, [0, 1, 2, 3, 4, 5, 6])
  assert.equal(featuresFor('A').structuredState, false)
  assert.equal(featuresFor('B').structuredState, true)
  assert.equal(featuresFor('G').metacognition, true)
})

test('parseVersion defaults to baseline A on bad input', () => {
  assert.equal(parseVersion(undefined), 'A')
  assert.equal(parseVersion('zzz'), 'A')
  assert.equal(parseVersion(' b '), 'B')
})

test('versions not implemented yet are downgraded and flagged', () => {
  const r = resolveVersion('E')
  assert.equal(r.requested, 'E')
  assert.equal(r.effective, 'B')
  assert.equal(r.downgraded, true)
  assert.equal(resolveVersion('A').downgraded, false)
})
