// Run configuration + fingerprint (pure, no imports).
// A "run" = a stretch of iterations produced under ONE configuration.
// Whenever the fingerprint changes, a new run starts automatically.

export type RunConfig = {
  version: string              // effective version that actually ran
  requested_version: string
  deterministic: boolean
  models: string[]             // model priority list
  prompt_hash: string          // hash of the system prompt actually used
  fixed_temperature: number | null
  retrieval_k: number
  label: string                // EXPERIMENT_LABEL: lets the researcher start a new run on purpose
}

/** FNV-1a 32-bit, hex. Deterministic and dependency-free. */
export function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(x ?? null)
}

export const fingerprint = (c: RunConfig): string => hashString(stable(c))

/** What changed between two configs: { key: [old, new] } */
export function diffConfig(a: unknown, b: unknown): Record<string, [unknown, unknown]> {
  const A = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
  const B = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
  const out: Record<string, [unknown, unknown]> = {}
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (stable(A[k]) !== stable(B[k])) out[k] = [A[k] ?? null, B[k] ?? null]
  }
  return out
}
