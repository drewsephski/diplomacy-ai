import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { NATIONS, modelLabel, phaseName } from '../domain';
import type { GuidedPhase } from '../guided/events';
import { outcomeOf } from '../guided/outcome';
import { POWERS, type Match, type Power } from '../types';
import { EndScreen } from './EndScreen';
import { EuropeMap } from './Map';
import { Orientation } from './Orientation';
import { PhaseGuide, WatchNext } from './PhaseGuide';
import { Story, type StoryGuide } from './Story';
import { Crest, DispatchCard, Empty } from './Shared';
import { GuideCard, type GuideCardProps } from './GuideCard';

export interface GuideView {
  /** The walkthrough for the open phase, when the guide is open. */
  phase?: GuidedPhase;
  step: number;
  open: boolean;
  /** Phases recorded since the viewer last finished one. */
  pending: number;
  pendingSeason?: string;
}

export interface GuideActions {
  open: (turn?: number, step?: number) => void;
  step: (to: number) => void;
  close: (finished?: boolean) => void;
  continueNext: () => void;
  runNext: () => void;
  guidanceOff: () => void;
  locate: (code: string) => void;
}

interface TheaterProps {
  match: Match;
  index: number;
  selected: Power;
  focus?: { code: string; nonce: number };
  watching: boolean;
  guided: boolean;
  guide: GuideView;
  actions: GuideActions;
  showOrientation: boolean;
  sampleAvailable: boolean;
  endBusy: boolean;
  onSelect: (p: Power) => void;
  onLocate: (code: string) => void;
  onDossier: () => void;
  onDiplomacy: () => void;
  onLiveEdge: () => void;
  onSample: () => void;
  onSetup: () => void;
  onSandbox: () => void;
  onDismissOrientation: () => void;
  onExtend: (maxPhases: number) => void;
  onRaiseBudget: (budgetUsd: number) => void;
  onReplay: () => void;
  onBranch: () => void;
}

export function Theater(props: TheaterProps) {
  const { match, index, selected, focus, watching, guided, guide, actions } = props;
  const [side, setSide] = useState<'story' | 'dispatches'>('story');
  const cp = match.checkpoints[index];
  const before = match.checkpoints[Math.max(0, index - 1)];
  const turn = match.turns[index - 1];
  const nation = NATIONS[selected];
  const atEdge = index === match.turns.length;
  const dispatches = atEdge && match.pending ? match.pending.messages : turn?.messages || [];
  const leader = POWERS.reduce((a, b) => (cp.state.board.centers[b].length > cp.state.board.centers[a].length ? b : a));
  const outcome = outcomeOf(match);
  const finished = outcome.kind !== 'open' || cp.state.done || match.status === 'complete';
  const gameOver = atEdge && finished && match.mode !== 'sample' && match.turns.length > 0;
  const highlight = guide.open && guide.phase ? guide.phase.events[guide.step]?.highlight ?? [] : [];
  const sampleEnd = atEdge && match.mode === 'sample' && match.status === 'complete';

  const story: StoryGuide | undefined = guided && index > 0
    ? {
        onOpen: () => actions.open(index - 1, 0),
        disabled: watching,
        ready:
          guide.pending > 0 && !guide.open && match.mode !== 'sample'
            ? { count: guide.pending, season: guide.pendingSeason ?? 'The latest phase', onStart: () => actions.open(match.turns.length - guide.pending, 0) }
            : undefined,
      }
    : guided && index === 0
      ? { onOpen: () => actions.open(0, 0), disabled: watching }
      : undefined;

  const cardProps: GuideCardProps | undefined =
    guide.open && guide.phase
      ? {
          phase: guide.phase,
          step: guide.step,
          mode: match.mode,
          complete: finished,
          hasNext: guide.phase.turn + 1 < match.turns.length,
          canRunNext: atEdge && match.mode !== 'sample' && !watching && !finished && match.turns.length > 0 && guide.phase.turn + 1 === match.turns.length,
          nextLabel: guide.phase.turn + 1 < match.turns.length ? phaseName(match.turns[guide.phase.turn + 1].phase) : undefined,
          onStep: actions.step,
          onLocate: actions.locate,
          onContinue: actions.continueNext,
          onRunNext: actions.runNext,
          onClose: actions.close,
          onGuidanceOff: actions.guidanceOff,
        }
      : undefined;

  return (
    <main className="theater">
      <div className="theater-top">
        {props.showOrientation && (
          <Orientation
            sampleAvailable={props.sampleAvailable}
            onSetup={props.onSetup}
            onSample={props.onSample}
            onSandbox={props.onSandbox}
            onDismiss={props.onDismissOrientation}
          />
        )}
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
          <PhaseGuide match={match} index={index} running={match.status === 'running'} pauseRequested={false} onLiveEdge={props.onLiveEdge} />
        )}
      </div>
      <aside className="powers-panel" aria-label="The seven countries">
        <div className="panel-heading">
          <h2>The seven countries</h2>
          <span>Supply centers</span>
        </div>
        <p className="panel-note">Count now. Change is across the last phase. 18 wins.</p>
        <div className="power-list">
          {POWERS.map((p) => {
            const count = cp.state.board.centers[p].length;
            const old = before.state.board.centers[p].length;
            return (
              <button
                key={p}
                className={`power-row ${selected === p ? 'selected' : ''}`}
                aria-pressed={selected === p}
                onClick={() => props.onSelect(p)}
                style={{ '--nation-color': NATIONS[p].color } as React.CSSProperties}
              >
                <Crest power={p} />
                <div className="power-detail">
                  <div>
                    <strong>
                      {NATIONS[p].name}
                      {p === leader && count > 0 && <small className="leader-tag">leader</small>}
                    </strong>
                    <span>
                      {count} / 18
                      {count !== old && (
                        <small className={count > old ? 'positive' : 'negative'}>
                          {count > old ? '+' : ''}
                          {count - old}
                        </small>
                      )}
                    </span>
                  </div>
                  <span>
                    {cp.state.board.units[p].length} units ·{' '}
                    {match.mode === 'live' ? modelLabel(cp.configs[p].model) : match.mode === 'sample' ? 'recorded play' : 'local policy'}
                  </span>
                  <div className="power-track" aria-hidden="true">
                    <i style={{ width: `${(count / 18) * 100}%`, background: NATIONS[p].color }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {match.briefing && (
          <details className="briefing-note">
            <summary>Shared briefing, read by all seven</summary>
            <p>{match.briefing}</p>
          </details>
        )}
        <div className="victory-note">
          <FlagIcon />
          <span>
            <b>18 of 34 centers wins</b>
            <small>
              Each center supports one unit.
              <br />
              Promises are never guaranteed.
            </small>
          </span>
        </div>
      </aside>
      <EuropeMap board={cp.state.board} selected={selected} onSelect={props.onSelect} turn={turn} focus={focus} highlight={highlight}>
        {cardProps && <GuideCard {...cardProps} phase={guide.phase!} />}
      </EuropeMap>
      <aside className="dispatch-panel" aria-label="Story and messages">
        <div className="side-tabs" role="group" aria-label="Side panel view">
          <button aria-pressed={side === 'story'} className={side === 'story' ? 'active' : ''} onClick={() => setSide('story')}>
            What happened
          </button>
          <button aria-pressed={side === 'dispatches'} className={side === 'dispatches' ? 'active' : ''} onClick={() => setSide('dispatches')}>
            Messages
            <span className="dispatch-count">{dispatches.length}</span>
          </button>
        </div>
        <div className="dispatch-scroll">
          {side === 'story' ? (
            <Story match={match} index={index} onSelect={props.onSelect} onLocate={props.onLocate} onDiplomacy={() => setSide('dispatches')} guide={story} />
          ) : dispatches.length ? (
            <>
              <p className="panel-note">
                {atEdge && match.pending
                  ? 'In progress. Secret orders stay hidden until every country has submitted.'
                  : 'Private messages from the last phase. Open Messages in the top bar for the full record.'}
              </p>
              {dispatches.slice(0, 3).map((m) => (
                <DispatchCard key={m.id} message={m} />
              ))}
              {dispatches.length > 3 && (
                <button className="text-button view-all" onClick={props.onDiplomacy}>
                  Read all {dispatches.length} messages
                  <ArrowRight size={13} />
                </button>
              )}
            </>
          ) : (
            <Empty>
              {index === 0
                ? 'No messages yet. The first phase begins with private talks.'
                : atEdge
                  ? 'No messages for the next phase yet.'
                  : 'No messages were exchanged in the last phase.'}
            </Empty>
          )}
          <WatchNext phase={cp.state.board.name} />
        </div>
        <div className="country-preview">
          <Crest power={selected} />
          <div className="country-preview-title">
            <span>COUNTRY</span>
            <h2>{nation.formal}</h2>
          </div>
          <button className="button dossier-button" onClick={props.onDossier}>
            Country details
            <ArrowRight size={15} />
          </button>
        </div>
      </aside>
    </main>
  );
}

function FlagIcon() {
  return (
    <svg width="19" height="24" viewBox="0 0 19 24" fill="none" aria-hidden="true">
      <path d="M3 22V2M3 3H16L13 8L16 13H3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
