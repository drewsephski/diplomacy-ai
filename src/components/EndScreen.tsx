import { Flag, GitBranch, RotateCcw } from 'lucide-react';
import { NATIONS } from '../domain';
import type { Outcome } from '../guided/outcome';
import type { Match } from '../types';

/**
 * The end-of-game panel. It states what actually stopped the game, using recorded state, and offers
 * only follow-ups that are true for that reason. An extension continues the same timeline.
 */
export function EndScreen({
  match,
  outcome,
  busy,
  onExtend,
  onReplay,
  onBranch,
  onRaiseBudget,
}: {
  match: Match;
  outcome: Outcome;
  busy: boolean;
  onExtend: (maxPhases: number) => void;
  onReplay: () => void;
  onBranch: () => void;
  onRaiseBudget: (budgetUsd: number) => void;
}) {
  const cp = match.checkpoints.at(-1)!;
  const sample = match.mode === 'sample';
  let title: string;
  let body: string;
  let action: React.ReactNode = null;
  if (sample) {
    title = 'The recorded sample has ended';
    body = `The sample is a fixed, checked record of ${match.turns.length} phases. Replay it, or try a different decision from any moment.`;
  }
  switch (sample ? 'sample' : outcome.kind) {
    case 'won':
      title = `${NATIONS[outcome.winner].name} won the game`;
      body = `It holds ${outcome.centers} of the 34 supply centers, the 18 needed to win. The game stopped at that point. This is a simulated alternate history, not a forecast or a record of what happened in 1901.`;
      break;
    case 'limit':
      title = 'Stopped at the phase limit';
      body = `The game reached its limit of ${match.limits.maxPhases} phases. No country holds 18 supply centers yet, so no one has won. Nothing is played until you choose to extend it.`;
      if (!sample) {
        action = (
          <button className="button" disabled={busy} onClick={() => onExtend(match.limits.maxPhases + 6)}>
            Extend this game by 6 phases
          </button>
        );
      }
      break;
    case 'budget':
      title = 'Stopped at the budget ceiling';
      body = `No further model call was sent once the $${match.limits.budgetUsd.toFixed(2)} ceiling was reached. No country has won yet. Raise the ceiling to continue this same game.`;
      if (!sample) {
        action = (
          <button className="button" disabled={busy} onClick={() => onRaiseBudget(match.limits.budgetUsd + 2)}>
            Raise the budget by $2 and continue
          </button>
        );
      }
      break;
    case 'sample':
      break;
    case 'error':
      title = 'Stopped by an error';
      body = outcome.message;
      break;
    default:
      title = cp.state.done ? 'The game is over' : 'The game is paused';
      body = `${match.turns.length} phases played so far. Resume to continue, or replay the record.`;
  }
  return (
    <section className="end-screen" aria-labelledby="end-title" role="region">
      <span className="eyebrow">{sample ? 'RECORDED SAMPLE' : 'GAME OVER'}</span>
      <h2 id="end-title">
        <Flag size={18} aria-hidden="true" /> {title}
      </h2>
      <p>{body}</p>
      <div className="end-actions">
        {action}
        <button className="button ghost" onClick={onReplay}>
          <RotateCcw size={15} /> Replay the record from the start
        </button>
        <button className="text-button" onClick={onBranch}>
          <GitBranch size={14} /> Try a different decision
        </button>
      </div>
    </section>
  );
}
