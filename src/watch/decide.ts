/**
 * The watch session's only decision: may the client ask for the next phase now?
 *
 * A watch session is an explicit user choice (Start game or Resume game). It asks the server for
 * ONE phase at a time, and only when nothing else is in flight, the viewer is not reading an open
 * guide card, and no limit or error has stopped the game. Pause, leaving the match, a refresh, or
 * a closed tab all end the session, so no further request is ever issued without a user action.
 */
export interface WatchInput {
  /** The viewer has chosen to watch (Start or Resume) and has not paused since. */
  playing: boolean;
  /** Server status of the match as last reported. */
  status?: 'paused' | 'running' | 'complete' | 'error';
  /** Phases recorded so far. */
  turns: number;
  /** Phase limit for this match. */
  maxPhases: number;
  /** The last recorded position has a winner or can no longer advance. */
  finished: boolean;
  /** A guide card is open: the viewer is reading, so presentation waits. */
  reading: boolean;
  /** A run request from this session is still in flight. */
  inFlight: boolean;
  /** A run or status error the viewer has not dismissed. */
  error?: string;
}

export type WatchDecision =
  | { type: 'run' }
  | { type: 'wait'; reason: 'in-flight' | 'running' | 'reading' }
  | { type: 'stop'; reason: 'paused' | 'finished' | 'limit' | 'error' };

export function decideNext(input: WatchInput): WatchDecision {
  if (!input.playing) return { type: 'stop', reason: 'paused' };
  if (input.error) return { type: 'stop', reason: 'error' };
  if (input.finished || input.status === 'complete') return { type: 'stop', reason: 'finished' };
  if (input.turns >= input.maxPhases) return { type: 'stop', reason: 'limit' };
  if (input.status === 'error') return { type: 'stop', reason: 'error' };
  if (input.inFlight) return { type: 'wait', reason: 'in-flight' };
  if (input.status === 'running') return { type: 'wait', reason: 'running' };
  if (input.reading) return { type: 'wait', reason: 'reading' };
  return { type: 'run' };
}

/** Why a watch stopped, in words for the status line and the end screen. */
export function stopText(reason: 'paused' | 'finished' | 'limit' | 'error', budgetStopped = false) {
  switch (reason) {
    case 'paused':
      return 'Paused. No further requests will be sent.';
    case 'finished':
      return 'The game has a winner or can no longer advance.';
    case 'limit':
      return 'Stopped at the phase limit you chose.';
    case 'error':
      return budgetStopped ? 'Stopped at the budget ceiling.' : 'Stopped by an error. See the message above.';
  }
}
