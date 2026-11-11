/**
 * The watch session's only decision: may the client ask the server for the next phase now?
 *
 * A session is an explicit viewer choice (Start game, Resume game, or Play next phase) for ONE match.
 * It asks for one phase at a time, only when nothing is in flight and the server is idle. In guided
 * view every phase that resolves during the session holds the session ("reading") until the viewer
 * presses Continue watching; closing, hiding, or navigating away ends the session instead, so nothing
 * ever resumes without another explicit press. A "once" session (Play next phase) ends after its phase.
 */
export interface WatchInput {
  kind: 'watch' | 'once';
  /** The session has already sent its run request (once sessions send exactly one). */
  fired: boolean;
  /** Server status of the match as last reported. */
  status?: 'paused' | 'running' | 'complete' | 'error';
  /** Phases recorded so far. */
  turns: number;
  /** Phase limit for this match. */
  maxPhases: number;
  /** The last recorded position has a winner or can no longer advance. */
  finished: boolean;
  /** Guided view is on: each new phase waits for the viewer. */
  guided: boolean;
  /** Phases the viewer has cleared to play past (Start, Resume, or Continue watching). */
  cleared: number;
  /** A guide card is open: the viewer is reading. */
  reading: boolean;
  /** A run request from this session is still in flight. */
  inFlight: boolean;
}

export type WatchDecision =
  | { type: 'run' }
  | { type: 'wait'; reason: 'in-flight' | 'running' | 'hold' | 'reading' }
  | { type: 'stop'; reason: 'finished' | 'limit' | 'error' | 'step' };

export function decideNext(input: WatchInput): WatchDecision {
  if (input.inFlight) return { type: 'wait', reason: 'in-flight' };
  if (input.status === 'running') return { type: 'wait', reason: 'running' };
  if (input.kind === 'once') return input.fired ? { type: 'stop', reason: 'step' } : { type: 'run' };
  if (input.status === 'error') return { type: 'stop', reason: 'error' };
  // A phase that resolved during the session is held for reading, even the final one, so its
  // walkthrough opens before the session reports the end of the game.
  if (input.guided && input.turns > input.cleared) return { type: 'wait', reason: 'hold' };
  if (input.finished || input.status === 'complete') return { type: 'stop', reason: 'finished' };
  if (input.turns >= input.maxPhases) return { type: 'stop', reason: 'limit' };
  if (input.reading) return { type: 'wait', reason: 'reading' };
  return { type: 'run' };
}

/** Plain words for a stopped request, shown in the banner for the match it belongs to. */
export function noticeText(kind: 'request' | 'connection' | 'pause', detail: string) {
  switch (kind) {
    case 'request':
      return `The next phase could not be requested: ${detail} Nothing further was sent. Press Resume game to try again.`;
    case 'connection':
      return `Lost contact with the server while a phase was playing (${detail}). Automatic play stopped and the game was asked to pause.`;
    case 'pause':
      return `The pause could not reach the server (${detail}). Press Pause game again.`;
  }
}
