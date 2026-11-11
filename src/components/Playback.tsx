import { Check, Download, GitBranch, LoaderCircle, Pause, Play, SkipForward } from 'lucide-react';
import { phaseKind, phaseName } from '../domain';
import type { Match } from '../types';
import { Select } from './ui/Select';

interface PlaybackProps {
  match: Match;
  index: number;
  /** Guided walkthrough on: the sample plays through popups instead of a timer. */
  guided: boolean;
  /** Expert sample replay timer is running. */
  expertPlaying: boolean;
  speed: number;
  busy: boolean;
  pauseRequested: boolean;
  /** The watch session is playing: the game advances on its own, one phase at a time. */
  watching: boolean;
  onPrimary: () => void;
  onStep: () => void;
  onSeek: (i: number) => void;
  onBranch: () => void;
  onSpeed: (s: number) => void;
}

/**
 * The footer has one primary control and one secondary step. For the recorded sample, the primary
 * control replays recorded phases. For live and sandbox games it starts, pauses, or resumes the
 * watch session. Any control that can spend money says so in its name.
 */
export function Playback({
  match,
  index,
  guided,
  expertPlaying,
  speed,
  busy,
  pauseRequested,
  watching,
  onPrimary,
  onStep,
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

  let primaryLabel: string;
  let primaryAria: string;
  let primaryDisabled = busy;
  if (sample) {
    if (guided) {
      primaryLabel = atEdge ? 'Replay with a guide' : 'Watch with a guide';
      primaryAria = atEdge
        ? 'Walk through the recorded phases from the start, with a guide (no model calls)'
        : 'Walk through the recorded phase with a guide (no model calls)';
    } else if (expertPlaying) {
      primaryLabel = 'Pause replay';
      primaryAria = 'Pause the replay';
    } else if (!atEdge) {
      primaryLabel = 'Play replay';
      primaryAria = 'Play recorded phases (no model calls)';
    } else {
      primaryLabel = 'Replay from start';
      primaryAria = 'Replay recorded phases from the opening (no model calls)';
    }
  } else if (pauseRequested) {
    primaryLabel = 'Pausing…';
    primaryAria = 'Pausing. The current phase finishes its model calls first';
    primaryDisabled = true;
  } else if (watching || match.status === 'running') {
    primaryLabel = 'Pause game';
    primaryAria = 'Pause game. The phase in progress finishes its current model calls, and nothing new is requested.';
  } else if (finished) {
    primaryLabel = 'Game over';
    primaryAria = 'Game over. See the result in the panel above.';
    primaryDisabled = true;
  } else if (turn === undefined && atEdge) {
    primaryLabel = live ? 'Play first phase' : 'Play first phase (free)';
    primaryAria = live ? 'Play first phase. AI countries play until you pause' : 'Play first phase (free). The sandbox plays until you pause';
  } else {
    primaryLabel = 'Resume game';
    primaryAria = atEdge
      ? 'Resume game from the latest phase until you pause'
      : 'Resume game: jump to the latest phase and keep playing';
  }

  let stepLabel = 'Next moment';
  let stepAria = 'Show the next recorded moment';
  let stepDisabled = busy || watching || pauseRequested;
  if (!sample) {
    if (atEdge && finished) {
      stepLabel = 'No more phases';
      stepAria = 'The game is over: no further phases to play';
      stepDisabled = true;
    } else if (atEdge) {
      stepLabel = live ? 'Play next phase' : 'Play next phase (free)';
      stepAria = live
        ? 'Play next phase: one phase with AI countries (billed model calls), then stop'
        : 'Play next phase (free): one sandbox phase, then stop';
    }
  } else if (atEdge) {
    stepDisabled = true;
  }

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
          {pauseRequested ? (
            <LoaderCircle size={18} className="spin" />
          ) : watching || expertPlaying ? (
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
        {sample && !guided && (
          <Select
            aria-label="Replay speed"
            className="speed-select"
            value={speed}
            options={[0.5, 1, 2, 4].map((s) => ({ value: s, label: `${s}×` }))}
            onChange={onSpeed}
          />
        )}
        <small className="pace-note">
          {sample
            ? 'Recorded sample · no model calls'
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
        <button className="button" disabled={cp.state.done || watching || busy} onClick={onBranch}>
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
            disabled={watching || busy}
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
