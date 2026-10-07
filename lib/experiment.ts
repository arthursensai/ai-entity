// Experiment ladder (pure, no imports). One underlying model, progressively more agentic versions.
//
//   A baseline: LLM + existing shelf memory + world inputs   (the original entity; unchanged)
//   B + persistent structured state (beliefs / known / unknown / preferences / focus / uncertainty)
//   C + explicit self-model                                   (not implemented yet)
//   D + persistent goals                                      (not implemented yet)
//   E + autonomous action selection                           (not implemented yet)
//   F + controlled virtual environment                        (not implemented yet)
//   G + metacognition (confidence, prediction error)          (not implemented yet)
//
// Features are CUMULATIVE: version X has everything below it.

export const LADDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
export type Version = (typeof LADDER)[number]

export type Features = {
  structuredState: boolean
  selfModel: boolean
  goals: boolean
  agency: boolean
  environment: boolean
  metacognition: boolean
}

/** Highest rung that actually exists in code. Requests above it run as this version (and say so in the log). */
export const IMPLEMENTED_UP_TO: Version = 'B'

export function featuresFor(v: Version): Features {
  const r = LADDER.indexOf(v)
  return {
    structuredState: r >= 1,
    selfModel: r >= 2,
    goals: r >= 3,
    agency: r >= 4,
    environment: r >= 5,
    metacognition: r >= 6,
  }
}

export function parseVersion(raw: string | undefined | null): Version {
  const v = String(raw ?? '').trim().toUpperCase()
  return (LADDER as readonly string[]).includes(v) ? (v as Version) : 'A'
}

export type ResolvedVersion = {
  requested: Version
  effective: Version
  features: Features
  downgraded: boolean
}

export function resolveVersion(requested: Version): ResolvedVersion {
  const cap = LADDER.indexOf(IMPLEMENTED_UP_TO)
  const effective = LADDER[Math.min(LADDER.indexOf(requested), cap)]
  return { requested, effective, features: featuresFor(effective), downgraded: effective !== requested }
}
