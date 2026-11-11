import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Eye, GitBranch, LockKeyhole, X } from 'lucide-react';
import { NATIONS } from '../domain';
import type { Beat, Question, Walkthrough, WhatIf } from '../guided/beats';
import { CONCEPTS, type ConceptId } from '../guided/concepts';
import { termMeaning, splitTerms, type Term } from '../guided/glossary';
import { readGuess, writeGuess, type Guess } from '../predictions';
import { describeOrder, provinceName } from '../story';
import type { Match, Power } from '../types';
import { ConversationThread } from './Conversations';
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
  match: Match;
  walkthrough: Walkthrough;
  step: number;
  follow: Power;
  complete: boolean;
  action: SummaryAction;
  /** Closing the card pauses an active watch session. Its labels say so. */
  closePauses: boolean;
  seenConcepts: Set<ConceptId>;
  onConceptSeen: (id: ConceptId) => void;
  onStep: (to: number) => void;
  onLocate: (code: string) => void;
  onContinue: () => void;
  onContinueWatching: () => void;
  onResume: () => void;
  onClose: (finished: boolean) => void;
  onGuidanceOff: () => void;
  onWhatIf: (w: WhatIf) => void;
}

const NARROW = '(max-width: 760px)';
function subscribeNarrow(cb: () => void) {
  const q = window.matchMedia(NARROW);
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
}
const isNarrow = () => window.matchMedia(NARROW).matches;
export const useNarrow = () => useSyncExternalStore(subscribeNarrow, isNarrow, () => false);

/**
 * The guided walkthrough: one recorded phase as a sequence of beats, before and after the reveal of
 * the sealed orders. It is a non-modal dialog: the map and the rest of the page stay reachable,
 * Escape closes it, focus moves to its heading when it opens and returns to the opener on close.
 *
 * On a phone it is a bottom sheet fixed to the viewport. It takes the place of the playback dock
 * (its Back and Next are the playback actions), can collapse to a peek bar, and the map is scrolled
 * to the top of the screen above it so the province in focus stays visible.
 */
export function GuideCard({
  match,
  walkthrough,
  step,
  follow,
  complete,
  action,
  closePauses,
  seenConcepts,
  onConceptSeen,
  onStep,
  onLocate,
  onContinue,
  onContinueWatching,
  onResume,
  onClose,
  onGuidanceOff,
  onWhatIf,
}: GuideCardProps) {
  const narrow = useNarrow();
  const headingId = useId();
  const bodyId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [term, setTerm] = useState<Term>();
  const beats = walkthrough.beats;
  const last = beats.length - 1;
  const at = Math.min(step, last);
  const beat = beats[at];
  const summary = beat.kind === 'next';
  const after = beat.board === 'after';

  // Focus the card once when it opens for a phase, so keyboard and screen-reader users arrive at it.
  // On a phone, first bring the map to the top of the screen, above the sheet.
  useEffect(() => {
    if (narrow) {
      const map = document.querySelector('.stage .europe-map');
      if (map) window.scrollTo({ top: map.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
    }
    heading.current?.focus({ preventScroll: true });
  }, [walkthrough.turn, narrow]);

  // While the sheet is open it replaces the playback dock, and the page gets room below its content.
  useEffect(() => {
    if (!narrow) return;
    document.documentElement.classList.add('guide-sheet-open');
    return () => document.documentElement.classList.remove('guide-sheet-open');
  }, [narrow]);
  useEffect(() => {
    document.documentElement.classList.toggle('guide-sheet-peek', narrow && collapsed);
    return () => document.documentElement.classList.remove('guide-sheet-peek');
  }, [narrow, collapsed]);

  // Each beat zooms the map to its province, so the walkthrough and the board stay in step.
  useEffect(() => {
    if (beat.focus) onLocate(beat.focus);
  }, [beat.id]);

  useEffect(() => {
    setTerm(undefined);
  }, [step, walkthrough.turn]);

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose(false);
    }
  }

  const nation = beat.powers[0];
  const [seasonName, seasonKind] = walkthrough.season.split(' · ');
  const kicker = (
    <>
      {seasonName}
      {seasonKind && <span className="kicker-kind"> · {seasonKind}</span>}
      {summary ? ' · phase summary' : ` · ${at + 1} of ${last}`}
    </>
  );
  const nextLabel = beat.kind === 'sealed' ? 'Reveal the orders' : at + 1 === last ? 'Phase summary' : 'Next';
  const closeLabel = closePauses ? 'Pause and close guide' : 'Close guide';
  // A beat can make several ideas relevant (the first stakes beat: observer, goal, centers). Show the first unseen one.
  const conceptId = (beat.concepts ?? (beat.concept ? [beat.concept] : [])).find((c) => !seenConcepts.has(c));
  const concept = conceptId ? CONCEPTS[conceptId] : undefined;

  const card = (
    <section
      className={`guide-card ${narrow ? 'sheet' : ''} ${collapsed ? 'collapsed' : ''} ${summary ? 'summary' : ''} beat-${beat.kind} ${after ? 'after' : 'before'}`}
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
            {collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <button type="button" className="icon-button" aria-label={closePauses ? 'Pause the game and close the guide' : 'Close the guide'} onClick={() => onClose(summary)}>
            <X size={18} />
          </button>
        </div>
      </header>
      <Progress walkthrough={walkthrough} at={at} />
      {collapsed && (
        <button type="button" className="guide-peek" onClick={() => setCollapsed(false)}>
          <span>{beat.headline}</span>
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      )}
      <div className="guide-body" id={bodyId} hidden={collapsed}>
        <p className={`guide-board ${after ? 'after' : 'before'}`}>
          {after ? <Eye size={13} aria-hidden="true" /> : <LockKeyhole size={13} aria-hidden="true" />}
          {after
            ? `Board after ${walkthrough.season.split(' · ')[0]} resolved`
            : `Board at the start of ${walkthrough.season.split(' · ')[0]} · orders not revealed`}
        </p>
        <span className="guide-label">{beat.label}</span>
        <h3 id={headingId} ref={heading} tabIndex={-1}>
          {beat.headline}
        </h3>
        {beat.powers.length > 0 && beat.kind !== 'next' && beat.kind !== 'talks' && (
          <ul className="guide-countries" aria-label="Countries in this moment">
            {beat.powers.map((p) => (
              <li key={p} style={{ color: NATIONS[p].color }}>
                <Crest power={p} small />
                {NATIONS[p].name}
              </li>
            ))}
          </ul>
        )}
        {beat.kind === 'next' ? (
          <SummaryBody match={match} walkthrough={walkthrough} beat={beat} action={action} complete={complete} onWhatIf={onWhatIf} onTerm={setTerm} />
        ) : (
          <BeatBody match={match} turn={walkthrough.turn} beat={beat} follow={follow} onLocate={onLocate} onTerm={setTerm} />
        )}
        {concept && (
          <aside className="concept-note" aria-label={`About the rules: ${concept.title}`}>
            <b>{concept.title}</b>
            <p>{concept.text}</p>
            <button type="button" className="text-button" onClick={() => onConceptSeen(concept.id)}>
              Got it
            </button>
          </aside>
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
          {!summary ? (
            <div className="guide-nav">
              <button type="button" className="button ghost" disabled={at === 0} onClick={() => onStep(at - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button type="button" className={`button ${beat.kind === 'sealed' ? 'primary reveal-button' : ''}`} onClick={() => onStep(at + 1)}>
                {nextLabel} <ArrowRight size={15} />
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
                <button type="button" className="button primary" onClick={onContinue}>
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
                    aria-label={match.mode === 'live' ? 'Resume game: keep playing from here (billed model calls)' : 'Resume game: keep playing from here (free sandbox)'}
                  >
                    {match.mode === 'live' ? 'Resume game · billed' : 'Resume game (free)'} <ArrowRight size={15} />
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
            {!summary && at + 1 < last && (
              <button type="button" className="text-button" onClick={() => onStep(last)}>
                Skip to phase summary
              </button>
            )}
            <button type="button" className="text-button" onClick={() => onClose(summary)}>
              {closeLabel}
            </button>
            <button type="button" className="text-button guidance-off" onClick={onGuidanceOff}>
              {closePauses ? 'Turn guidance off and pause' : 'Turn guidance off'}
            </button>
          </div>
        </footer>
      )}
    </section>
  );
  return narrow ? createPortal(card, document.body) : card;
}

/** One segment per beat; the reveal splits "before the orders" from "after". */
function Progress({ walkthrough, at }: { walkthrough: Walkthrough; at: number }) {
  return (
    <ol className="guide-progress" aria-hidden="true">
      {walkthrough.beats.map((b, i) => (
        <li key={b.id} className={`${i <= at ? 'done' : ''} ${i === walkthrough.revealAt ? 'reveal' : ''} ${b.board}`} />
      ))}
    </ol>
  );
}

function BeatBody({
  match,
  turn,
  beat,
  follow,
  onLocate,
  onTerm,
}: {
  match: Match;
  turn: number;
  beat: Beat;
  follow: Power;
  onLocate: (code: string) => void;
  onTerm: (t: Term) => void;
}) {
  return (
    <>
      {beat.kind === 'question' && beat.question ? (
        <QuestionBody matchId={match.id} question={beat.question} headline={beat.headline} body={beat.body} onTerm={onTerm} />
      ) : (
        beat.body && (
          <p className="guide-lede">
            <Glossary text={beat.body} onTerm={onTerm} />
          </p>
        )
      )}
      {beat.kind === 'reveal' && (
        <p className="guide-simultaneous">
          Every order resolved together, in one moment. The next cards take that single resolution one piece at a time.
        </p>
      )}
      {beat.matters && (
        <section className="guide-section">
          <h4>Why it matters</h4>
          <p>
            <Glossary text={beat.matters} onTerm={onTerm} />
          </p>
        </section>
      )}
      {beat.quote && (
        <figure className="guide-quote">
          <blockquote>“{beat.quote.text}”</blockquote>
          <figcaption>{NATIONS[beat.quote.from].name}, in a private message. Words are not orders.</figcaption>
        </figure>
      )}
      {beat.compare && <Compare promised={beat.compare.promised} actual={beat.compare.actual} />}
      {beat.kind === 'talks' && beat.conversations && <BeatTalks match={match} index={beat.board === 'after' ? turn + 1 : turn} beat={beat} follow={follow} onLocate={onLocate} />}
      {beat.kind !== 'talks' && beat.highlight.length > 0 && (
        <div className="guide-places" aria-label="Places on the map">
          {beat.highlight.slice(0, 4).map((code) => (
            <button key={code} type="button" className="place-chip" onClick={() => onLocate(code)}>
              {provinceName(code)}
            </button>
          ))}
        </div>
      )}
      {beat.exact.length > 0 && (
        <details className="guide-exact">
          <summary>Exact engine orders</summary>
          <ul>
            {beat.exact.map((o) => (
              <li key={o}>
                <code>{o}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** Promised and submitted, plain words first; the exact orders sit underneath. */
function Compare({ promised, actual }: { promised: string; actual: string }) {
  const issued = actual !== 'No order issued';
  return (
    <div className="guide-compare" aria-label="Promised and submitted orders">
      <div>
        <span>Promised</span>
        <b>{describeOrder(promised).summary}</b>
        <code>{promised}</code>
      </div>
      <div>
        <span>Ordered</span>
        <b>{issued ? describeOrder(actual).summary : 'No order issued'}</b>
        {issued && <code>{actual}</code>}
      </div>
    </div>
  );
}

/** The phase's talks, read at the beat's own moment: commitments stay sealed before the reveal. */
function BeatTalks({ match, index, beat, follow, onLocate }: { match: Match; index: number; beat: Beat; follow: Power; onLocate: (code: string) => void }) {
  const all = beat.conversations ?? [];
  const ordered = [...all.filter((c) => c.participants.includes(follow)), ...all.filter((c) => !c.participants.includes(follow))];
  const shown = ordered.slice(0, 2);
  const rest = ordered.slice(2);
  return (
    <div className="guide-talks">
      {shown.map((c) => (
        <ConversationThread key={c.id} conversation={c} compact match={match} index={index} onLocate={onLocate} />
      ))}
      {rest.length > 0 && (
        <details className="guide-more-talks">
          <summary>
            {rest.length} more {rest.length === 1 ? 'conversation' : 'conversations'} elsewhere
          </summary>
          {rest.map((c) => (
            <ConversationThread key={c.id} conversation={c} compact match={match} index={index} onLocate={onLocate} />
          ))}
        </details>
      )}
    </div>
  );
}

/**
 * Before the reveal: the question and an optional local guess (Yes / No / Skip). After it: the
 * recorded answer, and the viewer's guess beside it. A guess never reaches the server or an agent.
 */
function QuestionBody({
  matchId,
  question,
  headline,
  body,
  onTerm,
}: {
  matchId: string;
  question: Question;
  headline: string;
  body: string;
  onTerm: (t: Term) => void;
}) {
  const [guess, setGuess] = useState<Guess | undefined>(() => readGuess(matchId, question.id));
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    setGuess(readGuess(matchId, question.id));
    setSkipped(false);
  }, [matchId, question.id]);
  function choose(g: Guess | undefined) {
    writeGuess(matchId, question.id, g);
    setGuess(g);
    setSkipped(!g);
  }
  const answer = question.answer;
  if (answer)
    return (
      <>
        {question.text !== headline && <p className="guide-question">{question.text}</p>}
        <p className="guide-answer">
          <span className={`answer-mark ${answer.outcome}`}>{answer.outcome === 'yes' ? 'Yes' : answer.outcome === 'no' ? 'No' : 'Partly'}</span>
          <span>
            <Glossary text={answer.text} onTerm={onTerm} />
          </span>
        </p>
        {body && body !== answer.text && (
          <p className="guide-lede">
            <Glossary text={body} onTerm={onTerm} />
          </p>
        )}
        {guess && <p className="guess-note">You guessed {guess}.</p>}
      </>
    );
  return (
    <>
      {question.text !== headline && <p className="guide-question">{question.text}</p>}
      {body && (
        <p className="guide-lede">
          <Glossary text={body} onTerm={onTerm} />
        </p>
      )}
      <div className="guess" role="group" aria-label="Your guess (optional)">
        <span>Your guess</span>
        <button type="button" aria-pressed={guess === 'yes'} onClick={() => choose('yes')}>
          Yes
        </button>
        <button type="button" aria-pressed={guess === 'no'} onClick={() => choose('no')}>
          No
        </button>
        <button type="button" className="skip" aria-pressed={skipped} onClick={() => choose(undefined)}>
          Skip
        </button>
      </div>
      <p className="guess-note">
        {guess ? `You guessed ${guess}. ` : ''}Guesses stay in this browser. The countries never see them.
      </p>
    </>
  );
}

function SummaryBody({
  match,
  walkthrough,
  beat,
  action,
  complete,
  onWhatIf,
  onTerm,
}: {
  match: Match;
  walkthrough: Walkthrough;
  beat: Beat;
  action: SummaryAction;
  complete: boolean;
  onWhatIf: (w: WhatIf) => void;
  onTerm: (t: Term) => void;
}) {
  const whatIf = beat.whatIf ?? walkthrough.whatIfs[0];
  const answered = walkthrough.questions.filter((q) => q.answer);
  const open = walkthrough.questions.filter((q) => !q.answer || q.answer.outcome === 'mixed');
  const events = walkthrough.beats.filter((b) => b.kind === 'event').length;
  return (
    <>
      {answered.length > 0 && (
        <section className="guide-section guide-answers">
          <h4>The answers</h4>
          <ul>
            {answered.map((q) => {
              const guess = readGuess(match.id, q.id);
              return (
                <li key={q.id}>
                  <span className={`answer-mark ${q.answer!.outcome}`}>{q.answer!.outcome === 'yes' ? 'Yes' : q.answer!.outcome === 'no' ? 'No' : 'Partly'}</span>
                  <div>
                    <b>{q.text}</b>
                    <p>{q.answer!.text}</p>
                    {guess && <small>You guessed {guess}.</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {beat.body && (
        <section className="guide-section">
          <h4>What changed</h4>
          <p>
            <Glossary text={beat.body} onTerm={onTerm} />
          </p>
        </section>
      )}
      {(beat.matters || open.length > 0) && (
        <section className="guide-section">
          <h4>Still uncertain</h4>
          {beat.matters && (
            <p>
              <Glossary text={beat.matters} onTerm={onTerm} />
            </p>
          )}
          {open.map((q) => (
            <p key={q.id}>{q.text}</p>
          ))}
        </section>
      )}
      <p className="guide-summary-line">
        {events ? `${events} ${events === 1 ? 'moment' : 'moments'} walked through.` : 'Nothing contested happened in this phase.'}{' '}
        {walkthrough.routine > 0 &&
          `${walkthrough.routine} routine ${walkthrough.routine === 1 ? 'move or hold' : 'moves and holds'} had no contest and ${walkthrough.routine === 1 ? 'is' : 'are'} not shown separately.`}
      </p>
      {walkthrough.overflow.length > 0 && (
        <>
          <h4 className="guide-subhead">Also in this phase</h4>
          <ul className="guide-overflow">
            {walkthrough.overflow.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </>
      )}
      {whatIf && (
        <aside className="what-if-cta" aria-label="Try a different decision">
          <span>What if?</span>
          <b>{whatIf.question}</b>
          <p>{whatIf.change}</p>
          <button type="button" className="button" onClick={() => onWhatIf(whatIf)}>
            <GitBranch size={15} /> Explore this alternate timeline
          </button>
          <small>The original record stays as it is. You choose how the new timeline continues before anything plays.</small>
        </aside>
      )}
      <p className="guide-next">{nextText(action, match.mode, complete)}</p>
    </>
  );
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
          <button key={i} type="button" className="term" onClick={() => onTerm(part.term!)} aria-label={`${part.text}: explain`}>
            {part.text}
          </button>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
