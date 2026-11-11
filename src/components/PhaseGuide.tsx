import { Check, CircleDashed, LoaderCircle, Minus } from 'lucide-react';
import { phaseKind, phaseName, talkRounds } from '../domain';
import { watchNext } from '../story';
import { POWERS, type Match } from '../types';

type StepState = 'done' | 'active' | 'pending' | 'skipped';

function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children: React.ReactNode }) {
  const icon =
    state === 'done' ? (
      <Check size={13} />
    ) : state === 'active' ? (
      <LoaderCircle size={13} className="spin" />
    ) : state === 'skipped' ? (
      <Minus size={13} />
    ) : (
      <CircleDashed size={13} />
    );
  return (
    <li className={`phase-step ${state}`} data-state={state}>
      <span className="phase-step-mark" aria-hidden="true">
        {icon}
        {n}
      </span>
      <div>
        <strong>
          {title}
          <span className="visually-hidden">
            {state === 'done'
              ? ' (complete)'
              : state === 'active'
                ? ' (in progress)'
                : state === 'skipped'
                  ? ' (not used in this phase)'
                  : ' (waiting)'}
          </span>
        </strong>
        <span>{children}</span>
      </div>
    </li>
  );
}

/**
 * The "Happening now" strip. Every line is derived from recorded state: negotiation counts,
 * the sealed-order count from the spectator projection, and the checkpoint being viewed. It
 * never reveals sealed orders and never shows progress for a checkpoint in the past.
 */
export function PhaseGuide({
  match,
  index,
  running,
  pauseRequested,
  onLiveEdge,
}: {
  match: Match;
  index: number;
  running: boolean;
  pauseRequested: boolean;
  onLiveEdge: () => void;
}) {
  const atEdge = index === match.turns.length;
  const cp = match.checkpoints[index];
  const phase = cp.state.board.name;
  const kind = phaseKind(phase).toLowerCase();
  // Completion describes the live edge only; a finished match still has recorded history to view.
  const complete = atEdge && (match.status === 'complete' || cp.state.done || phase === 'COMPLETED');
  const activePowers = POWERS.filter((p) => cp.state.board.units[p].length > 0);
  const rounds = talkRounds(phase, match.limits.diplomacyRounds);
  const talkTotal = rounds * activePowers.length;
  const pending = atEdge && !complete ? match.pending : undefined;

  if (complete) {
    return (
      <section className="phase-guide complete" aria-label="Match status">
        <div className="phase-guide-title">
          <span className="eyebrow">FINAL POSITION</span>
          <strong>Match complete</strong>
        </div>
        <p>
          {match.turns.length} phases played. Replay them, download the record, or try a different decision from any earlier moment.
        </p>
      </section>
    );
  }

  if (!atEdge) {
    return (
      <section className="phase-guide history" aria-label="Match status">
        <div className="phase-guide-title">
          <span className="eyebrow">EARLIER IN THE RECORD</span>
          <strong>
            Before {phaseName(phase)} · {kind}
          </strong>
        </div>
        <p>Its talks can be read here. Its orders stay sealed, as they were at the time.</p>
        <button className="text-button" onClick={onLiveEdge}>
          Jump to the latest phase
        </button>
      </section>
    );
  }

  if (!pending) {
    return (
      <section className="phase-guide next" aria-label="Match status">
        <div className="phase-guide-title">
          <span className="eyebrow">NEXT PHASE</span>
          <strong>
            {phaseName(phase)} · {kind}
          </strong>
        </div>
        <ol className="phase-steps">
          <Step n={1} title="The countries talk" state={talkTotal ? 'pending' : 'skipped'}>
            {talkTotal
              ? `${rounds} ${rounds === 1 ? 'round' : 'rounds'} among ${activePowers.length} active countries`
              : 'Retreats and adjustments skip talks'}
          </Step>
          <Step n={2} title="They seal orders" state="pending">
            Each country writes its orders in secret
          </Step>
          <Step n={3} title="All resolve at once" state="pending">
            The rules engine resolves every order together
          </Step>
        </ol>
        <p className="phase-guide-note">
          {match.mode === 'live'
            ? 'You watch; the AI countries decide. Nothing is played until you press Play, and every AI call is billed.'
            : match.mode === 'sandbox'
              ? 'You watch; simple local policies decide, with no model calls. Nothing plays until you press Play.'
              : 'The recorded sample has no next phase.'}
        </p>
      </section>
    );
  }

  const negotiated = pending.negotiated.length;
  const sealed = pending.sealedCount ?? Object.keys(pending.decisions).length;
  const talksDone = talkTotal === 0 || negotiated >= talkTotal;
  const allSealed = sealed >= activePowers.length;
  const talkState: StepState = talkTotal === 0 ? 'skipped' : talksDone ? 'done' : 'active';
  const sealState: StepState = allSealed ? 'done' : talksDone ? 'active' : 'pending';
  const resolveState: StepState = allSealed ? 'active' : 'pending';
  return (
    <section className="phase-guide live" aria-label="Happening now">
      <div className="phase-guide-title">
        <span className="eyebrow">HAPPENING NOW · {phaseName(phase).toUpperCase()}</span>
        <strong aria-live="polite">
          {pauseRequested
            ? 'Pausing after the current model call'
            : running
              ? 'The countries are playing this phase · you are watching'
              : 'Paused mid-phase · press Resume game to continue'}
        </strong>
      </div>
      <ol className="phase-steps">
        <Step n={1} title="The countries talk" state={talkState}>
          {talkTotal === 0
            ? 'Not used in this phase type'
            : talksDone
              ? `${pending.messages.length} messages exchanged`
              : `Round ${Math.min(pending.round + 1, rounds)} of ${rounds} · ${negotiated} of ${talkTotal} conversations`}
        </Step>
        <Step n={2} title="They seal orders" state={sealState}>
          {`${sealed} of ${activePowers.length} sealed · contents stay secret until the phase resolves`}
        </Step>
        <Step n={3} title="All resolve at once" state={resolveState}>
          {allSealed ? 'All orders are being resolved together' : 'Waits for every country to seal its orders'}
        </Step>
      </ol>
    </section>
  );
}

/** A one-line "what to watch" note for the phase on screen. Rules-based, never predictive. */
export function WatchNext({ phase }: { phase: string }) {
  return (
    <p className="watch-next">
      <b>Watch for:</b> {watchNext(phase)}
    </p>
  );
}
