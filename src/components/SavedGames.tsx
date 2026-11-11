import { useState } from 'react';
import '../history.css';
import { ArrowRight, GitBranch, Play, RotateCcw, Trash2 } from 'lucide-react';

import { describeResult, modeName } from '../history';
import type { MatchSummary } from '../types';
import { Modal } from './Shared';

/**
 * The History tab: every game this device has saved, as a list. Opening a row only loads its record.
 * Nothing is played or billed from this list; the Resume control in Watch is the only way to continue.
 * The recorded sample is listed apart, because it is a teaching replay and not one of the viewer's games.
 */
export function SavedGames({
  games,
  currentId,
  busy,
  onOpen,
  onStart,
  onOpenSample,
  onDelete,
}: {
  games: MatchSummary[];
  currentId?: string;
  busy: boolean;
  onOpen: (id: string, at?: number) => void;
  onStart: () => void;
  onOpenSample: () => void;
  onDelete: (game: MatchSummary) => Promise<void>;
}) {
  // The newest edition of the authored sample is the one offered to newcomers; older editions stay
  // listed (alternate timelines may compare against them) and are labelled as earlier editions.
  const samples = games.filter((g) => g.mode === 'sample');
  const newest = Math.max(0, ...samples.map((g) => g.sampleVersion ?? 1));
  const sample = samples.find((g) => (g.sampleVersion ?? 1) === newest) ?? samples[0];
  const earlier = samples.filter((g) => g !== sample);
  const mine = games.filter((g) => g.mode !== 'sample');
  const [confirming, setConfirming] = useState<MatchSummary>();

  return (
    <section className="saved-games" aria-labelledby="saved-games-title">
      <header className="saved-games-head">
        <div>
          <span className="eyebrow">YOUR GAMES ON THIS DEVICE</span>
          <h1 id="saved-games-title">History</h1>
        </div>
        <button className="button primary" onClick={onStart}>
          <Play size={14} fill="currentColor" /> Start game
        </button>
      </header>
      <p className="modal-lede">
        Every game you started here is saved. Opening a game only loads its record: it never plays a phase or spends money.
        Press Resume in Watch to continue a paused game.
      </p>

      {mine.length === 0 ? (
        <div className="saved-empty">
          <img className="saved-emblem" src="/brand/seven-powers-mark-256.png?v=2" alt="" width={44} height={44} />
          <h2>No games yet</h2>
          <p>Start a game to watch it play out phase by phase. Its record will appear here, so you can return to it later.</p>
          <div className="saved-empty-actions">
            <button className="button primary" onClick={onStart}>
              <Play size={14} fill="currentColor" /> Start game
            </button>
          </div>
        </div>
      ) : (
        <ol className="saved-list" aria-label="Your saved games">
          {mine.map((g) => {
            const r = describeResult(g);
            const current = g.id === currentId;
            return (
              <li key={g.id} className={`saved-row ${current ? 'current' : ''}`} aria-current={current ? 'true' : undefined}>
                <div className="saved-main">
                  <div className="saved-title">
                    <strong>{g.name}</strong>
                    {current && <span className="saved-badge">Open now</span>}
                  </div>
                  <div className="saved-meta">
                    <span>{modeName(g.mode)}</span>
                    <span>Started {new Date(g.createdAt).toLocaleDateString()}</span>
                    <span>
                      {g.phases} of {g.phaseLimit} phases
                    </span>
                    {g.mode === 'live' && <span>{g.calls} model calls · ${g.costUsd.toFixed(3)}</span>}
                  </div>
                  <p className={`saved-result tone-${r.tone}`}>{r.title}</p>
                  {g.parent && (
                    <>
                      {g.parent.question && <p className="saved-question">{g.parent.question}</p>}
                      <p className="saved-lineage">
                        <GitBranch size={12} aria-hidden="true" />
                        {g.parentMissing
                          ? `Alternate timeline from moment ${g.parent.at}. Its original game was deleted, so the side-by-side comparison is unavailable.`
                          : `Alternate timeline from “${g.parent.name}” at moment ${g.parent.at}`}
                      </p>
                    </>
                  )}
                </div>
                <div className="saved-actions">
                  <button className="button" onClick={() => onOpen(g.id)} disabled={busy} aria-label={`Open ${g.name}`}>
                    Open <ArrowRight size={14} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => onOpen(g.id, 0)}
                    disabled={busy || g.phases === 0}
                    aria-label={`Replay ${g.name} from the start`}
                  >
                    <RotateCcw size={13} /> From the start
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => setConfirming(g)}
                    disabled={busy || g.status === 'running'}
                    aria-label={`Delete ${g.name}`}
                    title={g.status === 'running' ? 'Pause the game before deleting it' : 'Delete this saved game'}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {sample && (
        <div className="saved-sample">
          <span className="eyebrow">RECORDED SAMPLE · NOT COUNTED AS YOUR GAME</span>
          <div>
            <strong>{sample.name}</strong>
            <p>
              A teaching replay of a recorded game, checked by the rules engine: {sample.phases} recorded phases. It makes no
              model calls and cannot be deleted.
            </p>
          </div>
          <button className="button" onClick={onOpenSample} disabled={busy} aria-label="Open the recorded sample">
            Open sample <ArrowRight size={14} />
          </button>
        </div>
      )}

      {earlier.length > 0 && (
        <details className="saved-earlier">
          <summary>
            {earlier.length === 1 ? 'An earlier edition of the sample' : `${earlier.length} earlier editions of the sample`}
          </summary>
          <p className="muted small-copy">
            Kept so alternate timelines made from them can still be compared. The current sample above is the one to watch.
          </p>
          <ul>
            {earlier.map((g) => (
              <li key={g.id}>
                <span>
                  <strong>{g.name.replace(/ · earlier edition.*$/, '')}</strong> · earlier edition {g.sampleVersion ?? 1} ·{' '}
                  {g.phases} recorded phases
                </span>
                <button className="text-button" onClick={() => onOpen(g.id)} disabled={busy} aria-label={`Open ${g.name}`}>
                  Open <ArrowRight size={13} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {confirming && (
        <Modal title="Delete this saved game?" onClose={() => setConfirming(undefined)}>
          <div className="modal-body">
            <p>
              <strong>{confirming.name}</strong> and its {confirming.phases} recorded phases will be removed from this device.
              This cannot be undone.
            </p>
            {confirming.parent && (
              <p className="muted small-copy">
                Its original game stays saved. Only this alternate timeline is removed.
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button className="button ghost" onClick={() => setConfirming(undefined)} data-autofocus>
              Keep game
            </button>
            <button
              className="button danger-solid"
              onClick={async () => {
                const target = confirming;
                setConfirming(undefined);
                await onDelete(target);
              }}
            >
              <Trash2 size={14} /> Delete permanently
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
