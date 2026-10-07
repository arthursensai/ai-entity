// Structured agent state (pure, no imports).
//
// RULE: a variable only counts as "causal" if the CONTROLLER (code, not prose) reads it and
// something measurable changes. Everything else is "recorded only" and is labelled as such,
// so the dashboard and the analysis never over-claim.

export const STATE_SCHEMA = 1
export const LIST_CAP = 8
export const ITEM_LEN = 160
export const RETRIEVAL_K = 3

export type AgentState = {
  schema: number
  identity: { name: string; self_description: string; identity_confidence: number }
  current_state: { focus: string; uncertainty: number; attention_target: string; energy: number }
  beliefs: string[]
  known: string[]
  unknown: string[]
  preferences: string[]
  // Reserved for versions C-G. Stay empty in A/B.
  goals: unknown[]
  recent_actions: unknown[]
  recent_outcomes: unknown[]
  self_model: Record<string, unknown>
}

/** What the controller actually does with each variable (version B). */
export const CAUSAL_WIRING: Record<string, string> = {
  'current_state.uncertainty': 'sets the sampling temperature of the NEXT turn (controller)',
  'current_state.attention_target': 'selects which long-term memories are retrieved into the next prompt (controller)',
  'beliefs | known | unknown | preferences': 'fed back into the next prompt (content-level influence only)',
}
export const RECORDED_ONLY = [
  'identity.self_description',
  'identity.identity_confidence',
  'current_state.focus',
  'current_state.energy',
]

export function defaultState(): AgentState {
  return {
    schema: STATE_SCHEMA,
    identity: { name: 'Entity #001', self_description: '', identity_confidence: 0 },
    current_state: { focus: '', uncertainty: 0.6, attention_target: '', energy: 1 },
    beliefs: [], known: [], unknown: [], preferences: [],
    goals: [], recent_actions: [], recent_outcomes: [], self_model: {},
  }
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

const clampUnit = (x: unknown, fallback: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback

const text = (x: unknown, fallback: string, max: number) =>
  typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : fallback

function list(x: unknown, fallback: string[]): string[] {
  if (!Array.isArray(x)) return fallback               // absent / malformed -> unchanged
  const out: string[] = []
  for (const item of x) {
    const s = text(item, '', ITEM_LEN)
    if (s && !out.some(o => o.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  return out.slice(-LIST_CAP)                           // keep the most recent LIST_CAP
}

/**
 * Apply a model-proposed update. The model can only change what it is allowed to:
 * not the name, not `energy`, not the reserved fields. Bad input leaves the old value untouched.
 */
export function applyStateUpdate(prev: AgentState, update: unknown): AgentState {
  if (!isObj(update)) return prev
  const idn = isObj(update.identity) ? update.identity : {}
  return {
    ...prev,
    identity: {
      name: prev.identity.name,
      self_description: text(idn.self_description, prev.identity.self_description, 300),
      identity_confidence: clampUnit(idn.identity_confidence, prev.identity.identity_confidence),
    },
    current_state: {
      focus: text(update.focus, prev.current_state.focus, 120),
      uncertainty: clampUnit(update.uncertainty, prev.current_state.uncertainty),
      attention_target: text(update.attention_target, prev.current_state.attention_target, 120),
      energy: prev.current_state.energy,
    },
    beliefs: list(update.beliefs, prev.beliefs),
    known: list(update.known, prev.known),
    unknown: list(update.unknown, prev.unknown),
    preferences: list(update.preferences, prev.preferences),
  }
}

/** Load a stored state defensively (also what a researcher intervention will pass through). */
export const normalizeState = (raw: unknown): AgentState => applyStateUpdate(defaultState(), {
  ...(isObj(raw) ? raw : {}),
  focus: isObj(raw) && isObj(raw.current_state) ? raw.current_state.focus : undefined,
  uncertainty: isObj(raw) && isObj(raw.current_state) ? raw.current_state.uncertainty : undefined,
  attention_target: isObj(raw) && isObj(raw.current_state) ? raw.current_state.attention_target : undefined,
})

/** Causal link #1: uncertainty -> sampling temperature. 0.6 uncertainty == the baseline's 1.2. */
export function temperatureFor(state: AgentState): number {
  const t = 0.6 + state.current_state.uncertainty
  return Math.round(Math.min(1.6, Math.max(0.6, t)) * 100) / 100
}

const tokens = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9\u0600-\u06ff]{3,}/g) ?? []))

type Mem = { id: number; content: string; times_kept: number }

/**
 * Causal link #2: attention_target -> which memories are visible next turn.
 * Deterministic: overlap score, then times_kept, then recency. Empty target -> everything visible.
 */
export function retrieveMemories<T extends Mem>(memories: T[], state: AgentState, k = RETRIEVAL_K): T[] {
  if (memories.length <= k) return memories
  const q = tokens(state.current_state.attention_target)
  if (q.size === 0) return memories
  const score = (m: T) => { let n = 0; for (const t of tokens(m.content)) if (q.has(t)) n++; return n }
  return [...memories]
    .sort((a, b) => score(b) - score(a) || b.times_kept - a.times_kept || b.id - a.id)
    .slice(0, k)
    .sort((a, b) => a.id - b.id)
}

/** The part of the state the model gets to see. Reserved (empty) fields are left out. */
export function promptView(state: AgentState) {
  return {
    identity: state.identity,
    current_state: state.current_state,
    beliefs: state.beliefs,
    known: state.known,
    unknown: state.unknown,
    preferences: state.preferences,
  }
}

/** Did retrieval actually follow attention? null when nothing was attended to. (Logged per turn.) */
export function retrievalHit(visible: { content: string }[], state: AgentState): boolean | null {
  const q = tokens(state.current_state.attention_target)
  if (q.size === 0) return null
  return visible.some(m => { for (const t of tokens(m.content)) if (q.has(t)) return true; return false })
}
