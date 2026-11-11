import type { ReactNode } from 'react';
import { Flag, GitBranch, RotateCcw } from 'lucide-react';
import { NATIONS } from '../domain';
import type { Outcome } from '../guided/outcome';
import type { Match } from '../types';

interface Copy {
  title: string;
  body: string;
  action: ReactNode;
}

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
  const sample = match.mode === 'sample';
  const done = match.checkpoints.at(-1)!.state.done;
  const copy: Copy = sample
    ? {
        title: 'The recorded sample has ended',
        body: `The sample is a fixed, checked record of ${match.turns.length} phases. Replay it, or try a different decision from any moment.`,
        action: null,
      }
    : outcomeCopy(outcome, match, done, busy, onExtend, onRaiseBudget);
  return (
    <section className="end-screen" aria-labelledby="end-title" role="region">
      <span className="eyebrow">{sample ? 'RECORDED SAMPLE' : 'GAME OVER'}</span>
      <h2 id="end-title">
        <Flag size={18} aria-hidden="true" /> {copy.title}
      </h2>
      <p>{copy.body}</p>
      <div className="end-actions">
        {copy.action}
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

function outcomeCopy(
  outcome: Outcome,
  match: Match,
  done: boolean,
  busy: boolean,
  onExtend: (maxPhases: number) => void,
  onRaiseBudget: (budgetUsd: number) => void,
): Copy {
  switch (outcome.kind) {
    case 'won':
      return {
        title: `${NATIONS[outcome.winner].name} won the game`,
        body: `It holds ${outcome.centers} of the 34 supply centers, the 18 needed to win. The game stopped at that point. This is a simulated alternate history, not a forecast or a record of what happened in 1901.`,
        action: null,
      };
    case 'limit':
      return {
        title: 'Stopped at the phase limit',
        body: `The game reached its limit of ${match.limits.maxPhases} phases. No country holds 18 supply centers yet, so no one has won. Nothing is played until you choose to extend it.`,
        action: (
          <button className="button" disabled={busy} onClick={() => onExtend(match.limits.maxPhases + 6)}>
            Extend this game by 6 phases
          </button>
        ),
      };
    case 'budget':
      return {
        title: 'Stopped at the budget ceiling',
        body: `No further model call was sent once the $${match.limits.budgetUsd.toFixed(2)} ceiling was reached. No country has won yet. Raise the ceiling to continue this same game.`,
        action: (
          <button className="button" disabled={busy} onClick={() => onRaiseBudget(match.limits.budgetUsd + 2)}>
            Raise the budget by $2 and continue
          </button>
        ),
      };
    case 'error':
      return { title: 'Stopped by an error', body: outcome.message, action: null };
    default:
      return {
        title: done ? 'The game is over' : 'The game is paused',
        body: `${match.turns.length} phases played so far. Resume to continue, or replay the record.`,
        action: null,
      };
  }
}
