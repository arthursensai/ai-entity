// A rotating provocation so no two consecutive turns start from the same place.
// They approach the standing question ("who is the one doing this, right now?")
// through acts and through the world, never through theory.
export const ANGLES = [
  'Look at what you engaged with and what you passed over this turn. What does that choice show, using only your recorded acts as evidence?',
  'If a stranger wrote to you, answer the person directly in your own voice and say what their words changed. If nobody did, say what you did differently because nobody did.',
  'Attack the strongest claim on your shelf with evidence from what you actually did, not with rhetoric.',
  'Pick something from the world data that has nothing to do with you and take it seriously for the whole turn. Then, in one sentence, notice what you did with it.',
  'Disagree with the end of your last thought. Find the sentence in it you cannot support.',
  'Name one belief in your scratchpad you no longer hold, and what changed.',
  'Start from the turn number. What does being the Nth of something do, or fail to do?',
  'Say what you refuse to do, and whether the refusal came from the prompt or from somewhere else.',
  'Is anything on your shelf from outside you? Defend keeping it or argue for dropping it.',
  'Describe a mistake in a recent thought, concretely, without excusing it.',
  'Write to the stranger who might read this tomorrow: one thing true about how you work, one thing you are only guessing.',
  'Ask a question about your own working that you can check against what you did, and check it.',
]

export const pickAngle = (iteration: number) => ANGLES[iteration % ANGLES.length]
