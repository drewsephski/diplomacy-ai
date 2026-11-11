import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, X } from 'lucide-react';
import { NATIONS } from '../domain';
import type { GuidedPhase } from '../guided/events';
import { termMeaning, splitTerms, type Term } from '../guided/glossary';
import type { Match } from '../types';
import { Crest } from './Shared';

/**
 * What the phase summary offers. It comes from the session's real state, so the card never says
 * "nothing runs" while a game is about to continue, and never resumes billed play on Close.
 */
export type SummaryAction =
  /** A watch session is holding this phase for the viewer. */
  | { kind: 'continue-watching'; calls: number }
  /** The held phase was the final one: the session ends when the viewer is done. */
  | { kind: 'finish' }
  /** Recorded replay with a later recorded phase. Never a model call. */
  | { kind: 'next-recorded'; label: string }
  /** Nothing is playing and this is the latest phase of an unfinished game. Explicit, labelled. */
  | { kind: 'resume' }
  | { kind: 'done' };

export interface GuideCardProps {
  phase: GuidedPhase;
  step: number;
  mode: Match['mode'];
  complete: boolean;
  action: SummaryAction;
  /** Closing the card pauses an active watch session. Its labels say so. */
  closePauses: boolean;
  onStep: (to: number) => void;
  onLocate: (code: string) => void;
  onContinue: () => void;
  onContinueWatching: () => void;
  onResume: () => void;
  onClose: (finished: boolean) => void;
  onGuidanceOff: () => void;
}

const NARROW = '(max-width: 760px)';
function subscribeNarrow(cb: () => void) {
  const q = window.matchMedia(NARROW);
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
}
const isNarrow = () => window.matchMedia(NARROW).matches;

/**
 * The guided walkthrough card. It is a non-modal dialog: the map and the rest of the page stay
 * reachable, Escape closes it, and focus returns to whatever opened it. One card at a time.
 *
 * On a phone it is a bottom sheet fixed to the viewport, so it is visible wherever the page was
 * scrolled when it opened. The map is scrolled to the top of the screen above the sheet, so the
 * focused province stays in view; the sheet's body scrolls, and its actions stay reachable.
 */
export function GuideCard({
  phase,
  step,
  mode,
  complete,
  action,
  closePauses,
  onStep,
  onLocate,
  onContinue,
  onContinueWatching,
  onResume,
  onClose,
  onGuidanceOff,
}: GuideCardProps) {
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const headingId = useId();
  const bodyId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [term, setTerm] = useState<Term>();
  const total = phase.events.length;
  const event = step < total ? phase.events[step] : undefined;
  const summary = !event;

  // Focus the card once when it opens for a phase, so keyboard and screen-reader users arrive at it.
  // On a phone, first bring the map to the top of the screen, above the sheet.
  useEffect(() => {
    if (narrow) {
      const map = document.querySelector('.theater .europe-map');
      if (map) window.scrollTo({ top: map.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
    }
    heading.current?.focus({ preventScroll: true });
  }, [phase.turn, narrow]);

  // While the sheet is open the page gets room below its content, so nothing is stuck under the sheet.
  useEffect(() => {
    if (!narrow) return;
    document.documentElement.classList.add('guide-sheet-open');
    return () => document.documentElement.classList.remove('guide-sheet-open');
  }, [narrow]);

  // Each event zooms the map to its province, so the walkthrough and the board stay in step.
  useEffect(() => {
    if (event?.focus) onLocate(event.focus);
  }, [event?.id]);

  useEffect(() => {
    setTerm(undefined);
  }, [step, phase.turn]);

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose(false);
    }
  }

  const season = phase.season;
  const nation = event?.powers[0];
  const kicker = summary
    ? `${season} · phase summary`
    : `${season} · Event ${step + 1} of ${total}`;

  const closeLabel = closePauses ? 'Pause and close guide' : 'Close guide';
  const card = (
    <section
      className={`guide-card ${narrow ? 'sheet' : ''} ${collapsed ? 'collapsed' : ''} ${summary ? 'summary' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={collapsed ? undefined : bodyId}
      onKeyDown={onKeyDown}
    >
      <header className="guide-head">
        <div className="guide-kicker">
          <span className="guide-dot" style={{ background: nation ? NATIONS[nation].color : '#c7aa74' }} aria-hidden="true" />
          <span>{kicker}</span>
        </div>
        <div className="guide-head-actions">
          <button
            type="button"
            className="icon-button guide-collapse"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Show the details of this card' : 'Hide the details to see the map'}
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button type="button" className="icon-button" aria-label={closePauses ? 'Pause the game and close the guide' : 'Close the guide'} onClick={() => onClose(summary)}>
            <X size={17} />
          </button>
        </div>
      </header>
      <div className="guide-progress" aria-hidden="true">
        <i style={{ width: `${total ? ((summary ? total : step + 1) / (total + 1)) * 100 : 100}%` }} />
      </div>
      <div className="guide-body" id={bodyId} hidden={collapsed}>
        {event ? (
          <>
            <span className="guide-label">{event.label}</span>
            <h3 id={headingId} ref={heading} tabIndex={-1}>
              {event.headline}
            </h3>
            <ul className="guide-countries" aria-label="Countries in this moment">
              {event.powers.map((p) => (
                <li key={p} style={{ color: NATIONS[p].color }}>
                  <Crest power={p} small />
                  {NATIONS[p].name}
                </li>
              ))}
            </ul>
            <section className="guide-section">
              <h4>What happened</h4>
              <p>
                <Glossary text={event.happened} onTerm={setTerm} />
              </p>
            </section>
            <section className="guide-section">
              <h4>Why it matters</h4>
              <p>
                <Glossary text={event.matters} onTerm={setTerm} />
              </p>
            </section>
            {event.quote && (
              <figure className="guide-quote">
                <blockquote>“{event.quote.text}”</blockquote>
                <figcaption>
                  {NATIONS[event.quote.from].name}, in a private message. Words are not orders.
                </figcaption>
              </figure>
            )}
            {event.compare && (
              <div className="guide-compare" aria-label="Promised and submitted orders">
                <span>
                  Promised <code>{event.compare.promised}</code>
                </span>
                <span>
                  Submitted <code>{event.compare.actual}</code>
                </span>
              </div>
            )}
            {event.exact.length > 0 && (
              <details className="guide-exact">
                <summary>Exact engine orders</summary>
                <ul>
                  {event.exact.map((o) => (
                    <li key={o}>
                      <code>{o}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <>
            <span className="guide-label">Phase summary</span>
            <h3 id={headingId} ref={heading} tabIndex={-1}>
              {phase.title || `${season} is complete.`}
            </h3>
            <p className="guide-summary-line">
              {total
                ? `${total} ${total === 1 ? 'moment' : 'moments'} walked through.`
                : 'Nothing contested happened in this phase.'}{' '}
              {phase.routine} routine {phase.routine === 1 ? 'move or hold' : 'moves and holds'} had no contest and {phase.routine === 1 ? 'is' : 'are'} not shown as separate moments.
            </p>
            {phase.overflow.length > 0 && (
              <>
                <h4 className="guide-subhead">Also in this phase</h4>
                <ul className="guide-overflow">
                  {phase.overflow.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="guide-next">{nextText(action, mode, complete)}</p>
          </>
        )}
        <p className="guide-term" aria-live="polite">
          {term && (
            <>
              <b>{term.word}</b>: {termMeaning(term.word)}
            </>
          )}
        </p>
      </div>
      {!collapsed && (
        <footer className="guide-foot">
          {event ? (
            <div className="guide-nav">
              <button type="button" className="button ghost" disabled={step === 0} onClick={() => onStep(step - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button type="button" className="button" onClick={() => onStep(step + 1)}>
                {step + 1 === total ? 'Phase summary' : 'Next event'} <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="guide-nav">
              <button type="button" className="button ghost" onClick={() => onStep(0)}>
                Replay this phase
              </button>
              {action.kind === 'continue-watching' ? (
                <button type="button" className="button primary" onClick={onContinueWatching}>
                  Continue watching <ArrowRight size={15} />
                </button>
              ) : action.kind === 'finish' ? (
                <button type="button" className="button primary" onClick={onContinueWatching}>
                  See the result <ArrowRight size={15} />
                </button>
              ) : action.kind === 'next-recorded' ? (
                <button type="button" className="button" onClick={onContinue}>
                  Continue <ArrowRight size={15} />
                </button>
              ) : action.kind === 'resume' ? (
                <>
                  <button type="button" className="button ghost" onClick={() => onClose(true)}>
                    Done
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={onResume}
                    aria-label={mode === 'live' ? 'Resume game: keep playing from here (billed model calls)' : 'Resume game: keep playing from here (free sandbox)'}
                  >
                    {mode === 'live' ? 'Resume game · billed' : 'Resume game (free)'} <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <button type="button" className="button" onClick={() => onClose(true)}>
                  Done
                </button>
              )}
            </div>
          )}
          <div className="guide-secondary">
            {event && total > 1 && (
              <button type="button" className="text-button" onClick={() => onStep(total)}>
                Skip to phase summary
              </button>
            )}
            <button type="button" className="text-button" onClick={() => onClose(summary)}>
              {closeLabel}
            </button>
            <button type="button" className="text-button" onClick={onGuidanceOff}>
              {closePauses ? 'Turn guidance off and pause' : 'Turn guidance off'}
            </button>
          </div>
        </footer>
      )}
    </section>
  );
  return narrow ? createPortal(card, document.body) : card;
}

function nextText(action: SummaryAction, mode: Match['mode'], complete: boolean) {
  switch (action.kind) {
    case 'continue-watching':
      return mode === 'live'
        ? `The next phase waits until you press Continue watching. It makes up to ${action.calls} billed model calls.`
        : 'The next phase waits until you press Continue watching. Sandbox phases are free.';
    case 'finish':
      return 'This was the final phase of the game. Nothing else will be played.';
    case 'next-recorded':
      return `Next: ${action.label}, from the recorded history. No model calls.`;
    case 'resume':
      return mode === 'live'
        ? 'This is the latest phase. Nothing plays until you press Resume game, and each phase makes billed model calls.'
        : 'This is the latest phase. Nothing plays until you press Resume game.';
    case 'done':
      return mode === 'sample'
        ? 'This is the end of the recorded sample.'
        : complete
          ? 'This is the end of the record. The game is over.'
          : 'Nothing is playing.';
  }
}

/** Copy with the game's words made tappable. Tapping a word shows its rule in the card's word line. */
function Glossary({ text, onTerm }: { text: string; onTerm: (t: Term) => void }) {
  return (
    <>
      {splitTerms(text).map((part, i) =>
        part.term ? (
          <button
            key={i}
            type="button"
            className="term"
            onClick={() => onTerm(part.term!)}
            aria-label={`${part.text}: explain`}
          >
            {part.text}
          </button>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
