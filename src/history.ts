import { NATIONS } from './domain';
import { outcomeOf } from './guided/outcome';
import type { GameResult, Match, MatchSummary } from './types';

/**
 * How a saved game ended. Pure and shared: the server summarizes records with it, and the History
 * tab labels them with describeResult. A run that stopped at its phase limit is never a win, and a
 * win requires a country holding 18 of the 34 supply centers.
 */
export function resultOf(match: Match): GameResult {
  if (match.mode === 'sample') return { kind: 'sample' };
  if (match.status === 'running') return { kind: 'running' };
  // A record with no recorded position (an older or interrupted save) has no outcome to read yet.
  if (match.checkpoints.length === 0) return match.status === 'paused' ? { kind: 'paused' } : { kind: 'open' };
  const outcome = outcomeOf(match);
  switch (outcome.kind) {
    case 'won':
      return { kind: 'won', winner: outcome.winner, centers: outcome.centers };
    case 'budget':
      return { kind: 'budget' };
    case 'error':
      return { kind: 'error' };
    case 'limit':
      return { kind: 'limit' };
    case 'open':
      break;
  }
  if (match.checkpoints.at(-1)?.state.done) return { kind: 'draw' };
  return match.status === 'paused' ? { kind: 'paused' } : { kind: 'open' };
}

/** Summary row for one record. `knownIds` lets the caller flag an alternate timeline whose original is gone. */
export function summarizeMatch(match: Match, knownIds?: Set<string>): MatchSummary {
  const parentMissing = Boolean(match.parent && knownIds && !knownIds.has(match.parent.id));
  return {
    id: match.id,
    name: match.name,
    mode: match.mode,
    phases: match.turns.length,
    phaseLimit: match.limits.maxPhases,
    createdAt: match.createdAt,
    status: match.status,
    parent: match.parent ? { ...match.parent } : undefined,
    parentMissing,
    result: resultOf(match),
    // A sample record written before editions were numbered is the first edition.
    ...(match.mode === 'sample' ? { sampleVersion: match.sampleVersion ?? 1 } : {}),
    calls: match.usage.calls,
    costUsd: match.mode === 'live' ? match.usage.estimatedUsd : 0,
  };
}

export type ResultTone = 'won' | 'limit' | 'live' | 'neutral' | 'warn' | 'bad';

/** Plain-language result for the History list. Each state has its own words; none is a guess. */
export function describeResult(s: Pick<MatchSummary, 'result' | 'phases' | 'phaseLimit'>): {
  title: string;
  tone: ResultTone;
} {
  const r = s.result;
  switch (r.kind) {
    case 'sample':
      return { title: 'Recorded sample · teaching replay', tone: 'neutral' };
    case 'running':
      return { title: 'Playing now', tone: 'live' };
    case 'paused':
      return { title: `Paused after ${s.phases} of ${s.phaseLimit} phases`, tone: 'neutral' };
    case 'open':
      return { title: `${s.phases} of ${s.phaseLimit} phases played`, tone: 'neutral' };
    case 'won':
      return {
        title: `${NATIONS[r.winner].name} won with ${r.centers} of 34 centers`,
        tone: 'won',
      };
    case 'limit':
      return {
        title: `Stopped at the phase limit after ${s.phases} phases · no country reached 18 centers`,
        tone: 'limit',
      };
    case 'budget':
      return { title: 'Stopped at the budget ceiling', tone: 'warn' };
    case 'draw':
      return { title: `Ended without a winner after ${s.phases} phases`, tone: 'neutral' };
    case 'error':
      return { title: 'Stopped by an error · open it to read the message', tone: 'bad' };
  }
}

/** Mode names for the list. Kept apart from the in-game labels so the History tab reads on its own. */
export function modeName(mode: MatchSummary['mode']) {
  return mode === 'live' ? 'AI countries' : mode === 'sandbox' ? 'Local sandbox' : 'Recorded sample';
}
