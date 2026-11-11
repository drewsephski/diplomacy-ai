import { useState } from 'react';
import { Check, ChevronUp, Download, GitBranch, LoaderCircle, Pause, Play, SkipForward } from 'lucide-react';
import { phaseKind, phaseName } from '../domain';
import type { Match } from '../types';
import type { WatchPhase } from '../watch/useWatch';
import { Select } from './ui/Select';

interface PlaybackProps {
  match: Match;
  /** The moment on screen (while a guide is open, the board its beat shows). */
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
 * The playback bar: one primary control and one secondary step.
 *
 * - While a game is playing, the primary control pauses it. "Pausing…" lasts until the server is idle.
 * - At the latest phase of an unfinished game of your own, it starts or resumes the watch session.
 * - Everywhere else (the sample, any earlier moment, a finished game) it is a free recorded replay:
 *   guided popups with Guided view on, a timer with it off. A replay never sends a run request.
 * - Looking at the past of an unfinished game, "Resume at latest" is a separate, labelled control.
 *
 * On a phone it is a fixed dock at the bottom of the screen (safe-area aware): the moment, the step,
 * and the primary control are always in reach; the timeline and branching open above it on demand.
 * While the guide's bottom sheet is open, the sheet takes the dock's place.
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
  const [more, setMore] = useState(false);
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
  const where =
    index === 0
      ? 'Before the first phase'
      : atEdge
        ? match.pending
          ? 'Latest · phase in progress'
          : finished
            ? 'Final position'
            : 'Latest · next phase not played yet'
        : `Moment ${index} of ${match.turns.length} · recorded`;
  const paceNote = replay ? 'Recorded phases · no model calls' : live ? 'Live AI countries · each call is billed' : 'Local sandbox · no cost';

  return (
    <footer className={`playback ${more ? 'more' : ''}`} aria-label="Playback">
      <div className="recap">
        <span className="recap-where">{where}</span>
        <h2>
          {phaseName(phase)}
          {phase !== 'COMPLETED' && <span> · {phaseKind(phase)}</span>}
        </h2>
        <p>
          {turn
            ? `Last phase: ${phaseName(turn.phase)} ${phaseKind(turn.phase).toLowerCase()}${turn.title ? ` · ${turn.title}` : ''}`
            : 'No phase has been played yet. Countries talk before they order.'}
        </p>
      </div>
      <div className="playback-controls">
        <button className={`play-button ${controlling ? 'live' : ''}`} onClick={onPrimary} aria-label={primaryAria} disabled={primaryDisabled}>
          {primaryIcon === 'spin' ? (
            <LoaderCircle size={18} className="spin" aria-hidden="true" />
          ) : primaryIcon === 'pause' ? (
            <Pause size={17} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={17} fill="currentColor" aria-hidden="true" />
          )}
          <span>{primaryLabel}</span>
        </button>
        <button className="step-button" aria-label={stepAria} disabled={stepDisabled} onClick={onStep}>
          <SkipForward size={17} aria-hidden="true" />
          <span>{stepLabel}</span>
        </button>
        <button className="dock-more" aria-expanded={more} aria-controls="playback-more" aria-label="Timeline and more playback options" onClick={() => setMore((m) => !m)}>
          <ChevronUp size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="playback-more" id="playback-more">
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
        <div className="playback-extras">
          {showResumeLatest && (
            <button
              className="step-button resume-latest"
              onClick={onResumeLatest}
              disabled={busy}
              aria-label={live ? 'Resume at latest: go to the latest phase and keep playing (billed model calls)' : 'Resume at latest: go to the latest phase and keep playing (free sandbox)'}
            >
              <SkipForward size={16} aria-hidden="true" />
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
          <button className="button branch-button" disabled={cp.state.done || controlling || busy} onClick={onBranch}>
            <GitBranch size={15} aria-hidden="true" />
            Try a different decision
          </button>
          <span className="saved-note">
            <Check size={12} aria-hidden="true" /> Saved on this device
            <button
              className="icon-button"
              aria-label="Export complete replay"
              disabled={controlling || busy}
              onClick={() => {
                window.location.href = `/api/matches/${match.id}/export`;
              }}
            >
              <Download size={15} aria-hidden="true" />
            </button>
          </span>
          <small className="pace-note">{paceNote}</small>
        </div>
      </div>
    </footer>
  );
}
