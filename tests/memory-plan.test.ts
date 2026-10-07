import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planMemory, MAX_MEMORIES, MAX_WORKING_MEMORY } from '../lib/memory-plan.ts'

const mk = (id: number, kept = 0) => ({ id, content: `memory ${id}`, times_kept: kept, created_iteration: id })
const cur = [mk(1, 1), mk(2, 2), mk(3, 3)]

test('memory deletion: anything not kept is deleted, kept rows survive', () => {
  const p = planMemory(cur, { workingMemory: null, keep: [1], add: [] })
  assert.deepEqual(p.forgetIds, [2, 3])
  assert.deepEqual(p.forgottenContents, ['memory 2', 'memory 3'])
  assert.deepEqual(p.finalContents, ['memory 1'])
})

test('memory safety: unusable answer (keep = null) deletes NOTHING', () => {
  const p = planMemory(cur, { workingMemory: null, keep: null, add: [] })
  assert.deepEqual(p.forgetIds, [])
  assert.equal(p.finalContents.length, 3)
})

test('memory persistence: unknown ids are ignored, adds are cleaned and de-duplicated', () => {
  const p = planMemory(cur, { workingMemory: null, keep: [1, 2, 3, 99], add: ['  new   one ', 'MEMORY 1', 'x'] })
  assert.deepEqual(p.forgetIds, [])
  assert.deepEqual(p.adds, ['new one'])
})

test('working memory (scratchpad) is cleaned and clamped; null means unchanged', () => {
  const p = planMemory(cur, { workingMemory: 'a'.repeat(900), keep: null, add: [] })
  assert.ok((p.workingMemory ?? '').length <= MAX_WORKING_MEMORY)
  assert.equal(planMemory(cur, { workingMemory: null, keep: null, add: [] }).workingMemory, null)
  assert.equal(planMemory(cur, { workingMemory: '', keep: null, add: [] }).workingMemory, '')
})

test('hidden (unseen) memories are never deleted and count against capacity', () => {
  const unseen = Array.from({ length: MAX_MEMORIES - 3 }, (_, i) => mk(100 + i))
  const p = planMemory(cur, { workingMemory: null, keep: [1, 2, 3], add: ['brand new'] }, unseen)
  assert.deepEqual(p.forgetIds, [])
  assert.deepEqual(p.adds, [])                                   // shelf is full: no room
  const dup = planMemory(cur, { workingMemory: null, keep: [1], add: ['memory 100'] }, unseen)
  assert.deepEqual(dup.adds, [])                                 // duplicate of a hidden memory
})
