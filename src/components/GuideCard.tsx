import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, X } from 'lucide-react';
import { NATIONS } from '../domain';
import type { GuidedPhase } from '../guided/events';
import { termMeaning, splitTerms, type Term } from '../guided/glossary';
import type { Match } from '../types';
import { Crest } from './Shared';

export interface GuideCardProps {
  phase: GuidedPhase;
  step: number;
  mode: Match['mode'];
  complete: boolean;
  /** The record has a later resolved phase to walk through. */
  hasNext: boolean;
  /** Live or sandbox at the edge, with nothing running: the next phase can be run. */
  canRunNext: boolean;
  nextLabel?: string;
  onStep: (to: number) => void;
  onLocate: (code: string) => void;
  onContinue: () => void;
  onRunNext: () => void;
  onClose: (finished: boolean) => void;
  onGuidanceOff: () => void;
}

/**
 * The guided walkthrough card. It is a non-modal dialog: the map and the rest of the page stay
 * reachable, Escape closes it, and focus returns to whatever opened it. One card at a time.
 */
export function GuideCard({
  phase,
  step,
  mode,
  complete,
  hasNext,
  canRunNext,
  nextLabel,
  onStep,
  onLocate,
  onContinue,
  onRunNext,
  onClose,
  onGuidanceOff,
}: GuideCardProps) {
  const headingId = useId();
  const bodyId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [term, setTerm] = useState<Term>();
  const total = phase.events.length;
  const event = step < total ? phase.events[step] : undefined;
  const summary = !event;

  // Focus the card once when it opens for a phase, so keyboard and screen-reader users arrive at it.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [phase.turn]);

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

  return (
    <section
      className={`guide-card ${collapsed ? 'collapsed' : ''} ${summary ? 'summary' : ''}`}
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
          <button type="button" className="icon-button" aria-label="Close the guide" onClick={() => onClose(false)}>
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
            <p className="guide-next">
              {hasNext
                ? `Next: ${nextLabel ?? 'the following phase'}, from the recorded history.`
                : mode === 'sample'
                  ? 'This is the end of the recorded sample.'
                  : complete
                    ? 'The match is complete.'
                    : 'Nothing runs until you choose. Agent calls are billed and shown in the status bar.'}
            </p>
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
              {hasNext ? (
                <button type="button" className="button" onClick={onContinue}>
                  Continue <ArrowRight size={15} />
                </button>
              ) : canRunNext ? (
                <button
                  type="button"
                  className="button"
                  onClick={onRunNext}
                  aria-label={mode === 'live' ? 'Run next phase with live agents (billed model calls)' : 'Run next sandbox phase'}
                >
                  {mode === 'live' ? 'Run next phase · billed' : 'Run next sandbox phase'} <ArrowRight size={15} />
                </button>
              ) : null}
            </div>
          )}
          <div className="guide-secondary">
            {event && total > 1 && (
              <button type="button" className="text-button" onClick={() => onStep(total)}>
                Skip to phase summary
              </button>
            )}
            <button type="button" className="text-button" onClick={() => onClose(false)}>
              Close guide
            </button>
            <button type="button" className="text-button" onClick={onGuidanceOff}>
              Turn guidance off
            </button>
          </div>
        </footer>
      )}
    </section>
  );
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
