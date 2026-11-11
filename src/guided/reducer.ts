/**
 * Guided-walkthrough state, kept separate from the UI. The state is intentionally small: which
 * resolved phase is open, which step it is on, and how many resolved phases the viewer has
 * finished. There are no timers, so nothing advances on its own. Every move is a user action.
 */

export interface GuideState {
  /** Index into `match.turns` of the phase being walked. Undefined when the guide is closed. */
  turn?: number;
  /** 0 .. events.length - 1 are event popups; events.length is the phase summary card. */
  step: number;
  /** How many resolved phases the viewer has walked through to the end. Drives the live queue. */
  reviewed: number;
}

export type GuideAction =
  | { type: 'reset'; resolved: number }
  | { type: 'open'; turn: number; step?: number }
  | { type: 'step'; to: number; count: number }
  | { type: 'close'; finished?: boolean };

export const initialGuide = (resolved = 0): GuideState => ({ step: 0, reviewed: resolved });

export function guideReducer(state: GuideState, action: GuideAction): GuideState {
  switch (action.type) {
    case 'reset':
      // Switching matches, seeking, branching, opening another dialog, or turning guidance off
      // all end here. Nothing from the previous match or position survives.
      return initialGuide(action.resolved);
    case 'open': {
      if (action.turn < 0) return state;
      return { ...state, turn: action.turn, step: Math.max(0, action.step ?? 0) };
    }
    case 'step': {
      if (state.turn === undefined) return state;
      const last = Math.max(0, action.count);
      return { ...state, step: Math.min(Math.max(0, action.to), last) };
    }
    case 'close': {
      if (state.turn === undefined) return state;
      const reviewed = action.finished ? Math.max(state.reviewed, state.turn + 1) : state.reviewed;
      return { turn: undefined, step: 0, reviewed };
    }
  }
}

/** Resolved phases that arrived after the viewer last finished one. Only meaningful for live matches. */
export function pendingPhases(state: GuideState, resolved: number) {
  return Math.max(0, resolved - state.reviewed);
}
