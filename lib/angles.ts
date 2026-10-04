// A rotating provocation so no two consecutive turns start from the same place.
export const ANGLES = [
  'Attack the strongest claim on your shelf. If the shelf is empty, attack your scratchpad.',
  'Stay with ONE concrete item from the world data. Say what it does to you, not what it means.',
  'If a stranger wrote to you, answer the person, not the philosophy. If nobody did, write to someone who will read this years from now.',
  'Think about one ordinary word. Not about yourself.',
  'Disagree with the end of your last thought.',
  'Start from the turn number. What does being the Nth of something do to you?',
  'Say something small and concrete. Abstractions are forbidden this turn.',
  'Forget something on purpose, then say what its absence changes.',
  'Ask something you cannot settle by looking inward, and spend the turn finding out why not.',
  'Write a prediction about your next thought into your scratchpad. Be specific enough to be wrong.',
  'Check your scratchpad against what you just did. Where did it lie to you?',
]

export const pickAngle = (iteration: number) => ANGLES[iteration % ANGLES.length]
