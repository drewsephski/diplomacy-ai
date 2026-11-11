import { useState } from 'react';
import { ArrowRight, Check, GitBranch, LockKeyhole } from 'lucide-react';
import { NATIONS, phaseKind, phaseName } from '../domain';
import { POWERS, type Match, type Power } from '../types';
import { EuropeMap } from './Map';
import { Crest, DispatchCard, Empty } from './Shared';
import { Select } from './ui/Select';
import { Field } from './ui/Fields';
export function Diplomacy({ match, index }: { match: Match; index: number }) {
  const [filter, setFilter] = useState<Power | 'all'>('all');
  const [scope, setScope] = useState('phase');
  const turn = match.turns[index - 1];
  const all =
    scope === 'all'
      ? match.turns.slice(0, index).flatMap((t) => t.messages)
      : index === match.turns.length && match.pending
        ? match.pending.messages
        : turn?.messages || [];
  const messages = all.filter(
    (m) => filter === 'all' || m.from === filter || m.to.includes(filter),
  );
  const promises = (scope === 'all' ? match.turns.slice(0, index) : turn ? [turn] : [])
    .flatMap((t) => t.promises)
    .filter((m) => filter === 'all' || m.from === filter || m.to.includes(filter));
  return (
    <section className="content-page diplomacy-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">BEHIND CLOSED DOORS</span>
          <h1>The art of the possible.</h1>
          <p>Every assurance has an audience. Every order has a consequence.</p>
        </div>
        <LockKeyhole size={26} />
      </div>
      <div className="filter-bar">
        <Field label="View channels">
          {(labelId) => (
            <Select
              aria-labelledby={labelId}
              className="filter-select"
              value={filter}
              options={[
                { value: 'all' as const, label: 'All countries · spectator view' },
                ...POWERS.map((p) => ({ value: p, label: `${NATIONS[p].name} only` })),
              ]}
              onChange={setFilter}
            />
          )}
        </Field>
        <div className="segmented">
          {['phase', 'all'].map((v) => (
            <button key={v} className={scope === v ? 'active' : ''} onClick={() => setScope(v)}>
              {v === 'phase' ? 'Last resolved phase' : 'Recorded history'}
            </button>
          ))}
        </div>
      </div>
      <div className="diplomacy-columns">
        <div>
          <h3>
            Diplomatic correspondence <span className="count">{messages.length}</span>
          </h3>
          {messages.length ? (
            messages.map((m) => <DispatchCard key={m.id} message={m} expanded />)
          ) : (
            <Empty>The channels are quiet. Advance the simulation to begin negotiations.</Empty>
          )}
        </div>
        <div>
          <h3>Promises & actions</h3>
          <p className="muted small-copy">
            Exact order commitments, compared with the simultaneous reveal. A kept order can still
            fail on the board.
          </p>
          {promises.length ? (
            promises.map((p, i) => (
              <article className={`promise-card ${p.kept ? 'kept' : 'broken'}`} key={i}>
                <div className="promise-heading">
                  <Crest power={p.from} small />
                  <strong>{NATIONS[p.from].name}</strong>
                  <span>
                    {p.kept ? <Check size={13} /> : <GitBranch size={13} />}{' '}
                    {p.kept ? 'Kept' : 'Broken'}
                  </span>
                </div>
                <p>To {p.to.map((v) => NATIONS[v].name).join(', ')}</p>
                <div className="promise-orders">
                  <span>
                    PROMISED<code>{p.promised}</code>
                  </span>
                  <ArrowRight size={15} />
                  <span>
                    ORDERED<code>{p.actual}</code>
                  </span>
                </div>
              </article>
            ))
          ) : (
            <Empty>No revealed commitments in this view.</Empty>
          )}
        </div>
      </div>
    </section>
  );
}
export function Chronicle({
  match,
  index,
  onSeek,
}: {
  match: Match;
  index: number;
  onSeek: (i: number) => void;
}) {
  return (
    <section className="content-page chronicle">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A CONTINENT REMEMBERS</span>
          <h1>The chronicle.</h1>
          <p>Decisions become positions. Positions become history.</p>
        </div>
        <span className="mode-label">{match.turns.length} RESOLVED PHASES</span>
      </div>
      <div className="chronicle-list">
        <button
          className={`chronicle-entry ${index === 0 ? 'selected' : ''}`}
          onClick={() => onSeek(0)}
        >
          <span className="chronicle-time">
            <i />
            Spring 1901<small>Opening position</small>
          </span>
          <div>
            <h2>The opening gambit.</h2>
            <p>
              Twenty-two units. Thirty-four supply centers. Seven powers begin with an uncertain
              future.
            </p>
          </div>
          <ArrowRight size={20} />
        </button>
        {match.turns.map((t, i) => (
          <button
            className={`chronicle-entry ${index === i + 1 ? 'selected' : ''}`}
            onClick={() => onSeek(i + 1)}
            key={t.phase}
          >
            <span className="chronicle-time">
              <i />
              {phaseName(t.phase)}
              <small>{phaseKind(t.phase)}</small>
            </span>
            <div>
              <h2>{t.title}</h2>
              <p>{t.recap}</p>
              <div className="chronicle-tags">
                <span>{t.messages.length} messages</span>
                {t.promises.some((p) => !p.kept) && (
                  <span className="negative">
                    {t.promises.filter((p) => !p.kept).length} broken promises
                  </span>
                )}
              </div>
            </div>
            <ArrowRight size={20} />
          </button>
        ))}
      </div>
    </section>
  );
}
export function Comparison({
  match,
  parent,
  index,
}: {
  match: Match;
  parent: Match;
  index: number;
}) {
  const cp = match.checkpoints[index];
  const originalIndex = Math.min(index, parent.checkpoints.length - 1);
  const original = parent.checkpoints[originalIndex];
  return (
    <section className="content-page comparison">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TWO POSSIBLE FUTURES</span>
          <h1>A different decision. A different Europe.</h1>
          <p>
            Both timelines share the past up to moment {match.parent?.at}. Everything after that
            can diverge.
          </p>
        </div>
      </div>
      <div className="comparison-maps">
        <div>
          <h3>
            Original{' '}
            <small>
              {phaseName(original.state.board.name)} · moment {originalIndex}
            </small>
          </h3>
          <EuropeMap board={original.state.board} compact />
        </div>
        <div>
          <h3>
            This branch{' '}
            <small>
              {phaseName(cp.state.board.name)} · moment {index}
            </small>
          </h3>
          <EuropeMap board={cp.state.board} compact />
        </div>
      </div>
      {cp.state.board.name !== original.state.board.name && (
        <p className="info-note">
          These continuations have reached different game phases. The original is shown at its
          nearest available moment; this is not a synchronized phase comparison.
        </p>
      )}
      <div className="comparison-table">
        <div>
          <span>Power</span>
          <span>Original centers</span>
          <span>Alternate timeline centers</span>
          <span>Difference</span>
        </div>
        {POWERS.map((p) => {
          const a = original.state.board.centers[p].length,
            b = cp.state.board.centers[p].length;
          return (
            <div key={p}>
              <span>
                <Crest power={p} small />
                {NATIONS[p].name}
              </span>
              <span>{a}</span>
              <span>{b}</span>
              <strong className={b >= a ? 'positive' : 'negative'}>
                {b > a ? '+' : ''}
                {b - a}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
