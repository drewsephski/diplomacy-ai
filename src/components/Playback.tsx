import { Check, Download, GitBranch, LoaderCircle, Pause, Play, SkipForward } from 'lucide-react';
import { phaseKind, phaseName } from '../domain';
import type { Match } from '../types';
import type { WatchPhase } from '../watch/useWatch';
import { Select } from './ui/Select';

interface PlaybackProps {
  match: Match;
  index: number;
  /** Guided view on: recorded replay plays through popups instead of a timer. */
  guided: boolean;
  /** The free recorded-replay timer is running. */
  expertPlaying: boolean;
  speed: number;
  busy: boolean;
  /** The watch session for this match, as the session reports it. */
  session: WatchPhase;
  /** The server reports a phase in progress for this match. */
  running: boolean;
  /** A guide card is open. */
  guideOpen: boolean;
  onPrimary: () => void;
  onStep: () => void;
  onResumeLatest: () => void;
  onSeek: (i: number) => void;
  onBranch: () => void;
  onSpeed: (s: number) => void;
}

/**
 * The footer has one primary control and one secondary step.
 *
 * - While a game is playing, the primary control pauses it. "Pausing…" lasts until the server is idle.
 * - At the latest phase of an unfinished game of your own, it starts or resumes the watch session.
 * - Everywhere else (the sample, any earlier moment, a finished game) it is a free recorded replay:
 *   guided popups with Guided view on, a timer with it off. A replay never sends a run request.
 * - Looking at the past of an unfinished game, "Resume at latest" is a separate, labelled control.
 */
export function Playback({
  match,
  index,
  guided,
  expertPlaying,
  speed,
  busy,
  session,
  running,
  guideOpen,
  onPrimary,
  onStep,
  onResumeLatest,
  onSeek,
  onBranch,
  onSpeed,
}: PlaybackProps) {
  const cp = match.checkpoints[index];
  const turn = match.turns[index - 1];
  const atEdge = index === match.turns.length;
  const finished = match.status === 'complete' || match.checkpoints.at(-1)!.state.done;
  const phase = cp.state.board.name;
  const sample = match.mode === 'sample';
  const live = match.mode === 'live';
  const controlling = session !== 'idle' || running;
  const liveEdge = !sample && atEdge && !finished;
  const replay = !controlling && !liveEdge;
  const hasRecord = match.turns.length > 0;

  let primaryLabel: string;
  let primaryAria: string;
  let primaryDisabled = busy;
  let primaryIcon: 'play' | 'pause' | 'spin' = 'play';
  if (session === 'pausing') {
    primaryLabel = 'Pausing…';
    primaryAria = 'Pausing. The current model call finishes, then nothing new is requested';
    primaryDisabled = true;
    primaryIcon = 'spin';
  } else if (controlling) {
    primaryLabel = 'Pause game';
    primaryAria = 'Pause game. Nothing new is requested, and a phase in progress stops after its current model call.';
    primaryDisabled = false;
    primaryIcon = 'pause';
  } else if (liveEdge) {
    if (!hasRecord) {
      primaryLabel = live ? 'Play first phase' : 'Play first phase (free)';
      primaryAria = live ? 'Play first phase. AI countries play until you pause (billed model calls)' : 'Play first phase (free). The sandbox plays until you pause';
    } else {
      primaryLabel = 'Resume game';
      primaryAria = live
        ? 'Resume game from the latest phase until you pause (billed model calls)'
        : 'Resume game from the latest phase until you pause (free sandbox)';
    }
  } else if (guideOpen) {
    primaryLabel = 'Close guide';
    primaryAria = 'Close the guide. Nothing is playing';
  } else if (guided) {
    primaryLabel = atEdge ? 'Replay with a guide' : 'Watch with a guide';
    primaryAria = atEdge
      ? 'Walk through the recorded phases from the start, with a guide (no model calls)'
      : 'Walk through the recorded phase with a guide (no model calls)';
    primaryDisabled = busy || !hasRecord;
  } else if (expertPlaying) {
    primaryLabel = 'Pause replay';
    primaryAria = 'Pause the replay';
    primaryIcon = 'pause';
  } else if (!atEdge) {
    primaryLabel = 'Play replay';
    primaryAria = 'Play recorded phases (no model calls)';
  } else {
    primaryLabel = 'Replay from start';
    primaryAria = 'Replay recorded phases from the opening (no model calls)';
    primaryDisabled = busy || !hasRecord;
  }

  let stepLabel = 'Next moment';
  let stepAria = 'Show the next recorded moment';
  const stepDisabled = busy || controlling || (atEdge && !liveEdge);
  if (liveEdge && !controlling) {
    stepLabel = live ? 'Play next phase' : 'Play next phase (free)';
    stepAria = live
      ? 'Play next phase: one phase with AI countries (billed model calls), then stop'
      : 'Play next phase (free): one sandbox phase, then stop';
  } else if (!sample && atEdge && finished) {
    stepLabel = 'No more phases';
    stepAria = 'The game is over: no further phases to play';
  }

  const showResumeLatest = replay && !sample && !finished && !atEdge;

  return (
    <footer className="playback-panel">
      <div className="recap">
        <span className="eyebrow">
          {index === 0
            ? 'BEFORE THE FIRST PHASE'
            : atEdge
              ? match.pending
                ? 'LATEST · PHASE IN PROGRESS'
                : finished
                  ? 'FINAL POSITION'
                  : 'LATEST · NEXT PHASE NOT PLAYED YET'
              : `MOMENT ${index} OF ${match.turns.length} · RECORDED`}
        </span>
        <h2>
          {phaseName(phase)} · {phaseKind(phase)}
        </h2>
        <p>
          {turn
            ? `Last phase: ${phaseName(turn.phase)} ${phaseKind(turn.phase).toLowerCase()}${turn.title ? ` · ${turn.title}` : ''}`
            : 'No phase has been played yet. Countries talk before they order.'}
        </p>
      </div>
      <div className="playback-controls">
        <button className="play-button" onClick={onPrimary} aria-label={primaryAria} title={primaryAria} disabled={primaryDisabled}>
          {primaryIcon === 'spin' ? (
            <LoaderCircle size={18} className="spin" />
          ) : primaryIcon === 'pause' ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
          <span>{primaryLabel}</span>
        </button>
        <button className="step-button" aria-label={stepAria} title={stepAria} disabled={stepDisabled} onClick={onStep}>
          <SkipForward size={17} />
          <span>{stepLabel}</span>
        </button>
        {showResumeLatest && (
          <button
            className="step-button resume-latest"
            onClick={onResumeLatest}
            disabled={busy}
            aria-label={live ? 'Resume at latest: go to the latest phase and keep playing (billed model calls)' : 'Resume at latest: go to the latest phase and keep playing (free sandbox)'}
          >
            <SkipForward size={17} />
            <span>{live ? 'Resume at latest · billed' : 'Resume at latest (free)'}</span>
          </button>
        )}
        {replay && !guided && hasRecord && (
          <Select
            aria-label="Replay speed"
            className="speed-select"
            value={speed}
            options={[0.5, 1, 2, 4].map((s) => ({ value: s, label: `${s}×` }))}
            onChange={onSpeed}
          />
        )}
        <small className="pace-note">
          {replay
            ? 'Recorded phases · no model calls'
            : live
              ? 'Phases play one at a time · AI calls are billed'
              : 'Local policies · no cost'}
        </small>
      </div>
      <div className="timeline">
        <div className="timeline-track">
          <span style={{ width: `${(index / Math.max(match.turns.length, 1)) * 100}%` }} />
          {match.checkpoints.map((c, i) => (
            <button
              key={i}
              className={`${i <= index ? 'past' : ''} ${i === index ? 'current' : ''}`}
              style={{ left: `${(i / Math.max(match.turns.length, 1)) * 100}%` }}
              onClick={() => onSeek(i)}
              aria-label={`Seek moment ${i}: before ${phaseName(c.state.board.name)}`}
              title={`Moment ${i} · before ${phaseName(c.state.board.name)} · ${phaseKind(c.state.board.name)}`}
            />
          ))}
        </div>
        <div className="timeline-labels">
          <span>
            Start
            <small>Before {phaseName(match.checkpoints[0].state.board.name)}</small>
          </span>
          <span>
            Moment {index} of {match.turns.length}
            <small>
              {atEdge ? 'Latest' : 'Earlier in the record'} · {phaseName(phase)}
            </small>
          </span>
        </div>
      </div>
      <div className="branch-actions">
        <button className="button" disabled={cp.state.done || controlling || busy} onClick={onBranch}>
          <GitBranch size={16} />
          Try a different decision
        </button>
        <div>
          <Check size={12} />
          <span>Saved on this device</span>
          <button
            className="icon-button"
            title="Download the recorded game as JSON"
            aria-label="Export complete replay"
            disabled={controlling || busy}
            onClick={() => {
              window.location.href = `/api/matches/${match.id}/export`;
            }}
          >
            <Download size={14} />
          </button>
        </div>
      </div>
    </footer>
  );
}
