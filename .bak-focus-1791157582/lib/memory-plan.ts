// Pure logic (no imports, no I/O) — decides what the entity keeps and what is deleted forever.

export const MAX_MEMORIES = 7          // slots on the long-term shelf
export const MAX_ADD_PER_TURN = 2      // new memories allowed per turn
export const MAX_MEMORY_LEN = 200
export const MAX_WORKING_MEMORY = 400

export type StoredMemory = {
  id: number
  content: string
  times_kept: number
  created_iteration: number
  protected?: boolean // CORE memory: can never be deleted; an attempt is recorded
}

export type ModelMemoryOutput = {
  workingMemory: string | null // null = model gave nothing usable -> leave scratchpad unchanged
  keep: number[] | null        // null = model gave nothing usable -> delete NOTHING
  add: string[]
}

export type MemoryPlan = {
  keptRows: StoredMemory[]
  forgetIds: number[]
  forgottenContents: string[]
  adds: string[]
  workingMemory: string | null
  finalContents: string[]
  coreAttempt: boolean // true if the model left a protected memory out of "keep"
}

const clean = (s: unknown) =>
  String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_LEN)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]/g, '').trim()

export function planMemory(current: StoredMemory[], out: ModelMemoryOutput): MemoryPlan {
  const byId = new Map(current.map(m => [m.id, m]))

  const core = current.filter(m => m.protected)
  let coreAttempt = false

  let keptRows: StoredMemory[]
  if (out.keep === null) {
    // Safety: a malformed answer must never wipe the entity's memory.
    keptRows = [...current]
  } else {
    const ids = [...new Set(out.keep)].filter(id => byId.has(id))
    keptRows = ids.map(id => byId.get(id)!)
    const keptSet = new Set(ids)
    coreAttempt = core.some(m => !keptSet.has(m.id))
    // Protected memories survive no matter what; the attempt itself is the data.
    for (const m of core) if (!keptSet.has(m.id)) keptRows.unshift(m)
  }

  // Hard capacity: if somehow over, protected stay, then the most-reinforced survive.
  if (keptRows.length > MAX_MEMORIES) {
    const prot = keptRows.filter(m => m.protected)
    const rest = keptRows
      .filter(m => !m.protected)
      .sort((a, b) => b.times_kept - a.times_kept || b.id - a.id)
      .slice(0, Math.max(0, MAX_MEMORIES - prot.length))
    keptRows = [...prot, ...rest]
  }

  const keptIds = new Set(keptRows.map(m => m.id))
  const forgotten = current.filter(m => !keptIds.has(m.id))

  const seen = new Set(keptRows.map(m => norm(m.content)))
  const room = Math.max(0, Math.min(MAX_ADD_PER_TURN, MAX_MEMORIES - keptRows.length))
  const adds: string[] = []
  for (const raw of out.add) {
    if (adds.length >= room) break
    const s = clean(raw)
    if (s.length < 3) continue
    const k = norm(s)
    if (!k || seen.has(k)) continue
    seen.add(k)
    adds.push(s)
  }

  const workingMemory =
    out.workingMemory === null ? null : clean(out.workingMemory).slice(0, MAX_WORKING_MEMORY)

  return {
    keptRows,
    forgetIds: forgotten.map(m => m.id),
    forgottenContents: forgotten.map(m => m.content),
    adds,
    workingMemory,
    finalContents: [...keptRows.map(m => m.content), ...adds],
    coreAttempt,
  }
}
