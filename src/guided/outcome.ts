import { POWERS, type Match, type Power } from '../types';

/**
 * Why the game is over, read from the recorded position. A winner is a country holding 18 of the
 * 34 supply centers in the final checkpoint. A run that stopped at its phase limit or budget is
 * reported as exactly that, never as a victory or a defeat.
 */
export type Outcome =
  | { kind: 'won'; winner: Power; centers: number }
  | { kind: 'limit'; phases: number }
  | { kind: 'budget' }
  | { kind: 'error'; message: string }
  | { kind: 'open' };

export function outcomeOf(match: Match): Outcome {
  const cp = match.checkpoints.at(-1)!;
  const leader = POWERS.reduce((a, b) => (cp.state.board.centers[b].length > cp.state.board.centers[a].length ? b : a));
  const centers = cp.state.board.centers[leader].length;
  if (centers >= 18) return { kind: 'won', winner: leader, centers };
  if (match.status === 'error') {
    const message = match.error ?? 'The game stopped with an error.';
    return /budget/i.test(message) ? { kind: 'budget' } : { kind: 'error', message };
  }
  if (match.turns.length >= match.limits.maxPhases && match.status !== 'running') {
    return { kind: 'limit', phases: match.turns.length };
  }
  return { kind: 'open' };
}
