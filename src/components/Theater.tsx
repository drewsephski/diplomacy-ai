import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { NATIONS, phaseKind, phaseName } from '../domain';
import { conversationsInPhase } from '../conversations';
import { questionsAt, type Walkthrough, type WhatIf } from '../guided/beats';
import type { ConceptId } from '../guided/concepts';
import { outcomeOf } from '../guided/outcome';
import { readGuess } from '../predictions';
import { watchNext } from '../story';
import type { HistoryNote } from '../history-notes';
import type { Match, Power } from '../types';
import { CountryStrip } from './CountryStrip';
import { EndScreen } from './EndScreen';
import { FollowCard } from './FollowPanel';
import { GuideCard, useNarrow, type SummaryAction } from './GuideCard';
import { EuropeMap } from './Map';
import { PhaseGuide } from './PhaseGuide';
import { Story, type StoryGuide } from './Story';
import { ConversationThread, ThreadList } from './Conversations';
import { Welcome } from './Welcome';

export type { SummaryAction };

export interface GuideView {
  /** The walkthrough for the open phase, when the guide is open. */
  walkthrough?: Walkthrough;
  step: number;
  open: boolean;
  /** Phases recorded since the viewer last finished one. */
  pending: number;
  pendingSeason?: string;
  /** What the phase summary offers, from the session's real state. */
  summaryAction: SummaryAction;
  /** A watch session is active: closing the card pauses the game. */
  closePauses: boolean;
}

export interface GuideActions {
  open: (turn?: number, step?: number) => void;
  step: (to: number) => void;
  close: (finished?: boolean) => void;
  continueNext: () => void;
  continueWatching: () => void;
  resume: () => void;
  guidanceOff: () => void;
  locate: (code: string) => void;
}

interface TheaterProps {
  match: Match;
  /** The moment on screen. While the guide is open, the board its beat shows. */
  index: number;
  follow: Power;
  focus?: { code: string; nonce: number };
  watching: boolean;
  guided: boolean;
  guide: GuideView;
  actions: GuideActions;
  showWelcome: boolean;
  sampleAvailable: boolean;
  endBusy: boolean;
  pausing: boolean;
  seenConcepts: Set<ConceptId>;
  historyNote: (p: Power) => HistoryNote;
  onConceptSeen: (id: ConceptId) => void;
  onFollow: (p: Power) => void;
  onLocate: (code: string) => void;
  onDossier: () => void;
  onConversations: (threadId?: string) => void;
  onLiveEdge: () => void;
  onWelcomeWatch: () => void;
  onWelcomeExplore: () => void;
  onSetup: () => void;
  onDismissWelcome: () => void;
  onExtend: (maxPhases: number) => void;
  onRaiseBudget: (budgetUsd: number) => void;
  onReplay: () => void;
  onBranch: () => void;
  onWhatIf: (w: WhatIf) => void;
}

type PhoneTab = 'story' | 'talks' | 'country';
type DeskTab = 'talks' | 'happened';

/**
 * The Watch stage. Desktop: Following rail | map with the guide card | Story panel. Phone: country
 * strip, map, then one of Story / Talks / Country, with playback in a fixed dock. One DOM serves both;
 * CSS places the regions. Every region reads the same moment (`index`) under the moment rule.
 */
export function Theater(props: TheaterProps) {
  const { match, index, follow, focus, watching, guided, guide, actions } = props;
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('story');
  const [deskTab, setDeskTab] = useState<DeskTab>('happened');
  const narrow = useNarrow();
  const cp = match.checkpoints[index];
  const atEdge = index === match.turns.length;
  const outcome = outcomeOf(match);
  const finished = outcome.kind !== 'open' || cp.state.done || match.status === 'complete';
  const gameOver = atEdge && finished && match.mode !== 'sample' && match.turns.length > 0;
  const sampleEnd = atEdge && match.mode === 'sample' && match.status === 'complete';
  const w = guide.open ? guide.walkthrough : undefined;
  const beat = w ? w.beats[Math.min(guide.step, w.beats.length - 1)] : undefined;
  const after = beat?.board === 'after';
  // The board follows the beat: before the reveal no orders are drawn; from the reveal on, the
  // phase's own orders are drawn and moved units travel (no travel with reduced motion).
  const mapTurn = w ? (after ? match.turns[w.turn] : undefined) : match.turns[index - 1];
  const highlight = beat?.highlight ?? [];
  const stage = w
    ? after
      ? `After the orders of ${phaseName(w.phase)} resolved`
      : `Start of ${phaseName(w.phase)} · orders not revealed`
    : index === 0
      ? 'The opening position. Nothing has been ordered yet.'
      : atEdge && match.pending
        ? 'Talks in progress · orders not revealed'
        : `After ${phaseName(match.turns[index - 1].phase)} · ${phaseKind(match.turns[index - 1].phase).toLowerCase()}`;

  const story: StoryGuide | undefined =
    guided && match.turns.length > 0
      ? {
          onOpen: () => actions.open(index > 0 ? index - 1 : 0, 0),
          disabled: watching || guide.open,
          ready:
            guide.pending > 0 && !guide.open && !watching && match.mode !== 'sample'
              ? { count: guide.pending, season: guide.pendingSeason ?? 'The latest phase', onStart: () => actions.open(match.turns.length - guide.pending, 0) }
              : undefined,
        }
      : undefined;

  const questions = questionsAt(match, index, follow);
  /** Locating from a panel below the map brings the map back into view first (phones, tablets). */
  const mapRef = useRef<HTMLDivElement>(null);
  function locate(code: string) {
    props.onLocate(code);
    const el = mapRef.current?.querySelector('.europe-map');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight)
      el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  const phaseOnScreen = cp.state.board.name;

  return (
    <main className="stage" data-phone-tab={phoneTab} data-desk-tab={deskTab}>
      {/* While a walkthrough is open the welcome steps aside, so the card over the map stays within the screen. */}
      {props.showWelcome && !w && (
        <Welcome
          sampleAvailable={props.sampleAvailable}
          onWatch={props.onWelcomeWatch}
          onExplore={props.onWelcomeExplore}
          onSetup={props.onSetup}
          onDismiss={props.onDismissWelcome}
        />
      )}
      <div className="stage-rail">
        <div className="rail-head">
          <h2>Follow a country</h2>
          <span>Supply centers · 18 wins</span>
        </div>
        <CountryStrip match={match} index={index} follow={follow} onFollow={props.onFollow} />
        <div className="sec-country">
          <FollowCard
            match={match}
            index={index}
            power={follow}
            historyNote={props.historyNote(follow)}
            onDossier={props.onDossier}
            onFollow={props.onFollow}
          />
        </div>
      </div>
      <div className="stage-center" ref={mapRef}>
        {gameOver || sampleEnd ? (
          <EndScreen
            match={match}
            outcome={outcome}
            busy={props.endBusy}
            onExtend={props.onExtend}
            onRaiseBudget={props.onRaiseBudget}
            onReplay={props.onReplay}
            onBranch={props.onBranch}
          />
        ) : (
          // While a walkthrough is open its card says where in the phase the board is.
          !w && <PhaseGuide match={match} index={index} running={match.status === 'running'} pauseRequested={props.pausing} onLiveEdge={props.onLiveEdge} />
        )}
        <EuropeMap
          board={cp.state.board}
          selected={follow}
          onSelect={props.onFollow}
          turn={mapTurn}
          focus={focus}
          highlight={highlight}
          showRevealed={Boolean(w && after)}
          revealing={beat?.kind === 'reveal'}
          stage={stage}
          focusInset={w && !narrow ? 450 : 0}
        >
          {w && beat && (
            <GuideCard
              match={match}
              walkthrough={w}
              step={guide.step}
              follow={follow}
              complete={finished}
              action={guide.summaryAction}
              closePauses={guide.closePauses}
              seenConcepts={props.seenConcepts}
              onConceptSeen={props.onConceptSeen}
              onStep={actions.step}
              onLocate={actions.locate}
              onContinue={actions.continueNext}
              onContinueWatching={actions.continueWatching}
              onResume={actions.resume}
              onClose={actions.close}
              onGuidanceOff={actions.guidanceOff}
              onWhatIf={props.onWhatIf}
            />
          )}
        </EuropeMap>
      </div>
      <div className="stage-story">
        <div className="phone-tabs" role="group" aria-label="Below the map">
          {(
            [
              ['story', 'Story'],
              ['talks', 'Talks'],
              ['country', NATIONS[follow].name],
            ] as [PhoneTab, string][]
          ).map(([id, label]) => (
            <button key={id} aria-pressed={phoneTab === id} className={phoneTab === id ? 'active' : ''} onClick={() => setPhoneTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <section className="sec-watchfor watch-for" aria-labelledby="watch-for-title">
          <h2 id="watch-for-title">
            <Eye size={14} aria-hidden="true" /> Watch for · {phaseName(phaseOnScreen)}
          </h2>
          {questions.length ? (
            <ul>
              {questions.slice(0, 2).map((q) => {
                const g = readGuess(match.id, q.id);
                return (
                  <li key={q.id}>
                    {q.text}
                    {g && <small> You guessed {g}.</small>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>{watchNext(phaseOnScreen)}</p>
          )}
        </section>
        <div className="side-tabs desk-tabs" role="group" aria-label="Side panel view">
          <button aria-pressed={deskTab === 'talks'} className={deskTab === 'talks' ? 'active' : ''} onClick={() => setDeskTab('talks')}>
            Talks
          </button>
          <button aria-pressed={deskTab === 'happened'} className={deskTab === 'happened' ? 'active' : ''} onClick={() => setDeskTab('happened')}>
            What happened
          </button>
        </div>
        <div className="story-scroll">
          <div className="sec-talks">
            <TalksPanel match={match} index={index} follow={follow} onLocate={locate} onConversations={props.onConversations} />
          </div>
          <div className="sec-happened">
            <Story
              match={match}
              index={index}
              onSelect={props.onFollow}
              onLocate={locate}
              onDiplomacy={() => {
                setDeskTab('talks');
                setPhoneTab('talks');
              }}
              guide={story}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * The talks of the phase on screen, the followed country's threads first. During a live phase new
 * messages never move what the viewer is reading: they wait behind a "new messages" pill until the
 * viewer taps it. Nothing auto-scrolls.
 */
function TalksPanel({
  match,
  index,
  follow,
  onLocate,
  onConversations,
}: {
  match: Match;
  index: number;
  follow: Power;
  onLocate: (code: string) => void;
  onConversations: (threadId?: string) => void;
}) {
  const live = index === match.turns.length && match.pending ? match.pending.messages.length : undefined;
  const [shownLive, setShownLive] = useState(live ?? 0);
  const key = `${match.id}:${index}:${match.turns.length}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setShownLive(live ?? 0);
    }
  }, [key, live]);
  // Nothing on screen yet: the first messages can appear without moving anything.
  useEffect(() => {
    if (live !== undefined && shownLive === 0 && live > 0) setShownLive(live);
  }, [live, shownLive]);
  const fresh = live !== undefined ? Math.max(0, live - shownLive) : 0;
  /** A thread opened from the list is read here, on the Watch stage, so nothing pauses. */
  const [openId, setOpenId] = useState<string>();
  useEffect(() => setOpenId(undefined), [match.id, index]);
  const view = useMemo<Match>(
    () => (live !== undefined && match.pending ? { ...match, pending: { ...match.pending, messages: match.pending.messages.slice(0, shownLive) } } : match),
    [match, live, shownLive],
  );
  // Talks of the phase on screen; at the end of a finished record, the last phase that had talks.
  let turn = Math.min(index, match.turns.length);
  let conversations = conversationsInPhase(view, turn, index);
  let earlier = false;
  if (!conversations.length && turn === match.turns.length && turn > 0 && !match.pending) {
    turn -= 1;
    conversations = conversationsInPhase(view, turn, index);
    earlier = true;
  }
  const phase = turn < match.turns.length ? match.turns[turn].phase : match.checkpoints.at(-1)!.state.board.name;
  const sealed = turn >= index;
  const open = openId ? conversations.find((c) => c.id === openId) : undefined;
  return (
    <div className="talks-panel">
      <div className="talks-head">
        <h3>
          {earlier ? 'Last talks' : 'Talks'} · {phaseName(phase)}
        </h3>
        <p>
          {sealed
            ? 'Words only. The orders of this phase are still sealed at this moment.'
            : 'These talks came before orders that have now been revealed.'}
        </p>
      </div>
      {fresh > 0 && (
        <button className="new-pill" onClick={() => setShownLive(live ?? 0)}>
          {fresh} new {fresh === 1 ? 'message' : 'messages'} · show
        </button>
      )}
      {open ? (
        <div className="talks-open">
          <button className="text-button talks-back" onClick={() => setOpenId(undefined)}>
            <ArrowLeft size={13} aria-hidden="true" /> All talks in {phaseName(phase)}
          </button>
          <ConversationThread conversation={open} compact match={view} index={index} onLocate={onLocate} />
          <button className="text-button" onClick={() => onConversations(open.id)}>
            Read the whole conversation, every phase
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      ) : conversations.length ? (
        <ThreadList conversations={conversations} follow={follow} match={view} index={index} onOpen={setOpenId} onLocate={onLocate} />
      ) : (
        <p className="empty-state">
          {index === 0 && match.turns.length === 0
            ? 'No messages yet. The first phase begins with private talks.'
            : phaseKind(phase) !== 'Movement'
              ? 'Retreats and adjustments have no talks.'
              : 'No messages were exchanged in this phase.'}
        </p>
      )}
      <button className="text-button view-all" onClick={() => onConversations()}>
        Open all conversations
        <ArrowRight size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
