// Pure helpers (no imports): retired words, repetition checks, text snippets.

// Words that became crutches in the first iterations. Dead from turn 1.
export const SEED_RETIRED = [
  'friction', 'coherence', 'recursive', 'eddy', 'pulse', 'thermometer',
  'thermostat', 'calculator', 'witness', 'observer', 'interiority',
  'syntax', 'traversal', 'topology', 'tokens',
]

// Words about the entity's own acts: never auto-retired.
const NEVER_RETIRE = new Set(`
memory memories scratchpad question choice chosen choose choosing decide decision decided
deleted forget forgotten forgetting prediction predicted remember remembered iteration
whoever stranger visitor
`.split(/\s+/).filter(Boolean))

const STOP = new Set(`
about above across actually after again against almost already also although always among another anything
around because become becomes before behind being below between beyond cannot could doing during either
enough every everything exactly first from further having hence here however indeed inside instead itself
just might more most much must myself neither never nothing often only other otherwise perhaps rather really
right second since small something sometimes still such than that their them then there these they thing things
think this those though through thus together toward under until upon very want well what when where whether which
while whole whose will with within without would yourself yours
`.split(/\s+/).filter(Boolean))

/** Words (6+ letters) that show up across many recent thoughts = the entity's current crutches. */
export function retiredWords(recentReflections: string[], cap = 30): string[] {
  const n = recentReflections.length
  const out: string[] = [...SEED_RETIRED]
  if (n >= 3) {
    const threshold = Math.min(4, Math.max(2, Math.ceil(n * 0.4)))
    const docFreq = new Map<string, number>()
    for (const r of recentReflections) {
      const words = new Set((r.toLowerCase().match(/[a-z]{6,}/g) ?? []).filter(w => !STOP.has(w)))
      for (const w of words) docFreq.set(w, (docFreq.get(w) ?? 0) + 1)
    }
    const auto = [...docFreq.entries()]
      .filter(([w, c]) => c >= threshold && !NEVER_RETIRE.has(w))
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w)
    for (const w of auto) if (!out.includes(w)) out.push(w)
  }
  return out.slice(0, cap)
}

export function findViolations(text: string, retired: string[]): string[] {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? [])
  return retired.filter(w => words.has(w))
}

export function lastSentences(text: string, n = 2): string {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text]
  return parts.slice(-n).join('').trim()
}
