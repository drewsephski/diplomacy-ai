import { useState } from 'react';
import { ArrowRight, Eye } from 'lucide-react';
import '../whatif.css';
import { NATIONS, phaseKind, phaseName } from '../domain';
import {
  checkpointPhrase,
  compareTimelines,
  describeIntervention,
  interventionOf,
  matchingCheckpoint,
  momentLabel,
  ownerWord,
  seasonOf,
} from '../moment';
import { POWERS, type Match, type Power } from '../types';
import { EuropeMap } from './Map';
import { Crest } from './Shared';

export function Chronicle({
  match,
  index,
  onSeek,
}: {
  match: Match;
  index: number;
  onSeek: (i: number) => void;
}) {
  const [spoilers, setSpoilers] = useState(false);
  const start = match.checkpoints[0].state.board;
  const units = POWERS.reduce((n, p) => n + start.units[p].length, 0);
  const later = match.turns.filter((_, t) => t >= index).length;
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
      {later > 0 && (
        <div className="chronicle-spoilers">
          <p className="muted small-copy">
            You are at moment {index}. {later === 1 ? 'One later phase is' : `${later} later phases are`} listed without their
            outcome, so nothing ahead of you is given away.
          </p>
          <button className="text-button" aria-pressed={spoilers} onClick={() => setSpoilers((s) => !s)}>
            <Eye size={13} /> {spoilers ? 'Hide later outcomes' : 'Show later outcomes'}
          </button>
        </div>
      )}
      <div className="chronicle-list">
        <button
          className={`chronicle-entry ${index === 0 ? 'selected' : ''}`}
          onClick={() => onSeek(0)}
        >
          <span className="chronicle-time">
            <i />
            {phaseName(start.name)}
            <small>Opening position</small>
          </span>
          <div>
            <h2>The opening gambit.</h2>
            <p>
              {units} units. 34 supply centers. Seven powers begin with an uncertain future.
            </p>
          </div>
          <ArrowRight size={20} />
        </button>
        {match.turns.map((t, i) => {
          const known = i < index || spoilers;
          return (
            <button
              className={`chronicle-entry ${index === i + 1 ? 'selected' : ''} ${known ? '' : 'later'}`}
              onClick={() => onSeek(i + 1)}
              key={t.phase}
              aria-label={known ? undefined : `After ${phaseName(t.phase)} · ${phaseKind(t.phase).toLowerCase()}: later in the record, outcome hidden`}
            >
              <span className="chronicle-time">
                <i />
                {phaseName(t.phase)}
                <small>{phaseKind(t.phase)}</small>
              </span>
              <div>
                {known ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <h2>Later in the record</h2>
                    <p>Select to jump to the moment after this phase resolved.</p>
                  </>
                )}
              </div>
              <ArrowRight size={20} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function powerList(ps: Power[]) {
  return ps.map((p) => NATIONS[p].name).join(', ');
}

/**
 * The alternate timeline beside its original, readable without knowing the rules: the question
 * that started it, the one change, the shared past, the first phase played differently (orders,
 * outcomes, centers), and the standings at the viewed moment. Alternate-timeline facts follow the
 * moment rule for `index`; the original is matched to the same game phase when it reached it.
 */
export function Comparison({
  match,
  parent,
  index,
  onOpenOriginal,
}: {
  match: Match;
  parent: Match;
  index: number;
  /** Opens the original record at moment `at`. Optional: the buttons are hidden without it. */
  onOpenOriginal?: (id: string, at: number) => void;
}) {
  const at = momentLabel(match, index);
  const cp = match.checkpoints[at.index];
  const view = compareTimelines(match, parent, at.index);
  const matched = matchingCheckpoint(match, parent, at.index);
  const original = parent.checkpoints[matched.index];
  const change = interventionOf(match);
  const question = match.parent?.question;
  const differ = POWERS.filter((p) => original.state.board.centers[p].length !== cp.state.board.centers[p].length);
  return (
    <section className="content-page comparison">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TWO POSSIBLE FUTURES</span>
          <h1>A different decision. A different Europe.</h1>
          <p>{question ?? `An alternate timeline of “${parent.name}”.`}</p>
        </div>
      </div>

      <div className="whatif-summary">
        <div className="whatif-change">
          <span className="eyebrow">THE ONE CHANGE</span>
          <p>{change ? describeIntervention(change) : 'This alternate timeline was made before changes were recorded, so the change itself is not available.'}</p>
          <small>Made from {checkpointPhrase(view.from)}. Everything before that is shared.</small>
        </div>
        {onOpenOriginal && (
          <div className="whatif-actions">
            <button className="button" onClick={() => onOpenOriginal(parent.id, view.at)}>
              Open the original at the branch moment <ArrowRight size={14} />
            </button>
            {matched.same && matched.index !== view.at && (
              <button className="text-button" onClick={() => onOpenOriginal(parent.id, matched.index)}>
                Open the original at {seasonOf(original.state.board.name)}
              </button>
            )}
          </div>
        )}
      </div>

      <section className="comparison-block" aria-labelledby="cmp-shared">
        <h2 id="cmp-shared">The shared past</h2>
        {view.shared.length ? (
          <>
            <p className="muted">
              Both timelines played the same {view.shared.length === 1 ? 'phase' : `${view.shared.length} phases`} before the
              change:
            </p>
            <ol className="shared-past">
              {view.shared.map((s) => (
                <li key={s.turn}>
                  <b>{s.season}</b> {s.title}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="muted">They share only the opening position. The change was made before the first orders.</p>
        )}
      </section>

      <section className="comparison-block" aria-labelledby="cmp-first">
        <h2 id="cmp-first">{view.first ? `Where they split: ${view.first.season}` : 'Where they split'}</h2>
        {view.first ? (
          <>
            <div className="side-by-side">
              <article>
                <span className="eyebrow">ORIGINAL RECORD</span>
                <h3>{view.first.original.title || view.first.season}</h3>
                <p>{view.first.original.recap}</p>
              </article>
              <article className="alternate">
                <span className="eyebrow">ALTERNATE TIMELINE</span>
                <h3>{view.first.branch.title || view.first.season}</h3>
                <p>{view.first.branch.recap}</p>
              </article>
            </div>
            <h3 className="cmp-sub">Orders that differ</h3>
            {view.first.orders.length ? (
              <ul className="order-diffs">
                {view.first.orders.map((d) => (
                  <li key={d.power}>
                    <span className="order-diff-who">
                      <Crest power={d.power} small /> {NATIONS[d.power].name}
                    </span>
                    <div className="side-by-side compact">
                      <div>
                        <span className="eyebrow">ORIGINAL</span>
                        {d.original.length ? (
                          d.original.map((o) => (
                            <p key={o.exact}>
                              {o.plain} <span className={o.succeeded ? 'positive' : 'negative'}>· {o.outcome}</span>
                              <code className="exact-order">{o.exact}</code>
                            </p>
                          ))
                        ) : (
                          <p className="muted">No other order</p>
                        )}
                      </div>
                      <div>
                        <span className="eyebrow">ALTERNATE</span>
                        {d.branch.length ? (
                          d.branch.map((o) => (
                            <p key={o.exact}>
                              {o.plain} <span className={o.succeeded ? 'positive' : 'negative'}>· {o.outcome}</span>
                              <code className="exact-order">{o.exact}</code>
                            </p>
                          ))
                        ) : (
                          <p className="muted">No other order</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Every country submitted the same orders. Any difference comes from the change itself.</p>
            )}
            <h3 className="cmp-sub">Supply centers held differently afterwards</h3>
            {view.first.centers.length ? (
              <ul className="center-diffs">
                {view.first.centers.map((c) => (
                  <li key={c.code}>
                    <b>{c.name}</b>: {ownerWord(c.original)} in the original, {ownerWord(c.branch)} in the alternate timeline
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">The same countries hold the same supply centers after this phase.</p>
            )}
          </>
        ) : (
          <p className="muted">{view.firstMissing}</p>
        )}
      </section>

      <section className="comparison-block" aria-labelledby="cmp-now">
        <h2 id="cmp-now">Standings at moment {at.index}: {at.season}</h2>
        {!matched.same && (
          <p className="info-note">
            The original never reached {at.season} by the same path (the timelines played different phases), so it is shown at
            its nearest moment, {seasonOf(original.state.board.name)}. This is not a same-phase comparison.
          </p>
        )}
        <p className="muted small-copy">
          {differ.length
            ? `Center counts differ for ${powerList(differ)}.`
            : 'Every country holds the same number of supply centers in both timelines at this point.'}
        </p>
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
                <strong className={b === a ? '' : b > a ? 'positive' : 'negative'}>
                  {b === a ? 'same' : `${b > a ? '+' : ''}${b - a}`}
                </strong>
              </div>
            );
          })}
        </div>
      </section>

      <div className="comparison-maps">
        <div>
          <h3>
            Original{' '}
            <small>
              {phaseName(original.state.board.name)} · moment {matched.index}
            </small>
          </h3>
          <EuropeMap board={original.state.board} compact />
        </div>
        <div>
          <h3>
            This alternate timeline{' '}
            <small>
              {phaseName(cp.state.board.name)} · moment {at.index}
            </small>
          </h3>
          <EuropeMap board={cp.state.board} compact />
        </div>
      </div>
    </section>
  );
}
