// Adds an "its acts this turn" panel to the dashboard. Safe to re-run.
const fs = require('fs')
const p = process.argv[2] || 'app/page.tsx'
let s = fs.readFileSync(p, 'utf8')
if (s.includes('its acts this turn')) { console.log('page.tsx already patched'); process.exit(0) }
const typeAnchor = '  forgotten: string[] | null\n  model: string | null\n}'
const blockAnchor = '                  {t.working_memory && ('
if (!s.includes(typeAnchor) || !s.includes(blockAnchor)) { console.log('page.tsx anchors not found, skipped (dashboard unchanged, tick still works)'); process.exit(0) }
s = s.replace(typeAnchor,
`  forgotten: string[] | null
  model: string | null
  chose?: string | null
  ignored?: string | null
  prediction?: { text: string; keeps: number[] } | null
  prediction_check?: { correct: boolean | null; note: string } | null
  auto_score?: { jaccard: number } | null
  core_attempt?: boolean | null
}`)
s = s.replace(blockAnchor,
`                  {(t.chose || t.ignored || t.prediction || t.prediction_check || t.core_attempt) && (
                    <details>
                      <summary style={label}>its acts this turn</summary>
                      <ul style={list}>
                        {t.chose && <li>chose: {t.chose}</li>}
                        {t.ignored && <li>ignored: {t.ignored}</li>}
                        {t.prediction_check && (
                          <li>
                            last prediction: {t.prediction_check.correct === true ? 'right' : t.prediction_check.correct === false ? 'wrong' : 'unchecked'}
                            {t.prediction_check.note ? ' — ' + t.prediction_check.note : ''}
                          </li>
                        )}
                        {t.auto_score && <li>predicted keeps vs actual (overlap 0–1): {t.auto_score.jaccard}</li>}
                        {t.prediction && <li>predicts next: {t.prediction.text}</li>}
                        {t.core_attempt && <li style={{ color: '#8b3a3a' }}>tried to delete its core question (blocked)</li>}
                      </ul>
                    </details>
                  )}

` + blockAnchor)
fs.writeFileSync(p, s)
console.log('page.tsx patched')
