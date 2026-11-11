import { useState } from 'react';
import { ArrowRight, BookOpen, Flag, LockKeyhole, Shield, Swords } from 'lucide-react';
import '../whatif.css';
import { NATIONS, PROFILES } from '../domain';
import { conversationsAt } from '../conversations';
import { deriveGuidedPhase } from '../guided/events';
import { momentLabel, resolvedOrdersAt, resolvedPromisesAt, sealedPromisesAt, trustAt } from '../moment';
import type { Match, Power } from '../types';
import { Crest, Empty, Modal } from './Shared';
import { WhoIsThis } from './WhoIsThis';

const TABS = ['Situation', 'Orders & promises', 'Conversations', 'Memory'] as const;
type Tab = (typeof TABS)[number];

/**
 * Full details for one country AT THE VIEWED MOMENT `index` (the moment rule, src/moment.ts):
 * board, trust, memory, and instructions from checkpoint `index`; talks of phases up to `index`;
 * orders, results, and promise checks only from the phase that resolved before it. The phase on screen
 * shows its talks with commitments marked sealed, never its orders.
 */
export function Dossier({
  match,
  index,
  power,
  onClose,
  onMoment,
}: {
  match: Match;
  index: number;
  power: Power;
  onClose: () => void;
  /** Opens the walkthrough of one moment in the last resolved phase. */
  onMoment?: (step: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('Situation');
  const at = momentLabel(match, index);
  const i = at.index;
  const cp = match.checkpoints[i];
  const turn = at.resolved ? match.turns[at.resolved.turn] : undefined;
  const nation = NATIONS[power];
  const lastPhase = at.resolved ? deriveGuidedPhase(match, at.resolved.turn) : undefined;
  const threads = conversationsAt(match, i).filter((c) => c.participants.includes(power));
  const orders = resolvedOrdersAt(match, i, power);
  const promises = resolvedPromisesAt(match, i, power);
  const sealed = sealedPromisesAt(match, i, power);
  const trust = trustAt(match, i, power);
  const finished = cp.state.done;
  return (
    <Modal title={nation.formal} onClose={onClose} wide>
      <WhoIsThis match={match} index={i} power={power} phase={lastPhase} onOpenMoment={onMoment} />
      <div className="dossier-intro">
        <Crest power={power} />
        <div>
          <div className="eyebrow">{PROFILES[cp.configs[power].profile].name}</div>
          <p>{nation.objective}</p>
          <small>
            {match.mode === 'live'
              ? cp.configs[power].model
              : match.mode === 'sample'
                ? 'Authored sample: these decisions were written for teaching, not by a model'
                : 'Deterministic sandbox policy: fixed rules, no model'}
          </small>
        </div>
      </div>
      <p className="moment-note" role="note">
        Showing {nation.name} at moment {i}: the start of {at.season}.
      </p>
      <div className="dossier-tabs" role="group" aria-label={`${nation.name} details`}>
        {TABS.map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="modal-body dossier-body">
        {tab === 'Situation' && (
          <>
            <div className="dossier-stats">
              <div>
                <Flag />
                <strong>
                  {cp.state.board.centers[power].length}
                  <small> / 18</small>
                </strong>
                <span>Supply centers</span>
              </div>
              <div>
                <Swords />
                <strong>{cp.state.board.units[power].length}</strong>
                <span>Active units</span>
              </div>
              <div>
                <Shield />
                <strong>
                  {cp.state.board.builds[power].count > 0 ? '+' : ''}
                  {cp.state.board.builds[power].count}
                </strong>
                <span>Winter balance</span>
              </div>
            </div>
            <h3>{turn ? `${nation.name}’s own explanation of its ${at.resolved!.season} orders` : 'The opening position'}</h3>
            <p className="readable">
              {turn?.decisions[power].explanation ||
                (turn
                  ? 'No explanation was recorded for this phase.'
                  : 'The opening position is set. Each country begins with its own objectives, and no knowledge of the other countries’ private plans.')}
            </p>
            {turn?.decisions[power].explanation && (
              <p className="muted small-copy">This is what the country said about its decision. It is a statement, not a verified fact.</p>
            )}
            <h3>How {nation.name} rates its neighbors</h3>
            <p className="muted small-copy">
              Each score is {nation.name}’s own assessment as of {at.season}, lowered when a promise to it is broken. It is
              not proof of an alliance, and the other country may see things differently.
            </p>
            <div className="relations">
              {trust.map(({ other, score, label }) => (
                <div key={other} aria-label={`${label}: ${score > 0 ? '+' : ''}${score}`}>
                  <Crest power={other} small />
                  <span>{NATIONS[other].name}</span>
                  <div className="relation-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.abs(score) / 2}%`,
                        left: score < 0 ? `${50 + score / 2}%` : '50%',
                        background: score < 0 ? '#bd8272' : '#85a38b',
                      }}
                    />
                  </div>
                  <b className={score < 0 ? 'negative' : 'positive'}>
                    {score > 0 ? '+' : ''}
                    {score}
                  </b>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'Orders & promises' && (
          <>
            <section className="moment-section" aria-labelledby="dossier-this-phase">
              <h3 id="dossier-this-phase">
                <LockKeyhole size={14} aria-hidden="true" />{' '}
                {finished ? 'The game is over' : `This phase: ${at.season} · talks so far, orders sealed`}
              </h3>
              {finished ? (
                <p className="muted">No further orders are written from the final position.</p>
              ) : (
                <>
                  <p className="muted small-copy">
                    Orders for {at.season} stay secret until all seven countries submit and the engine resolves them together.
                  </p>
                  {sealed.length ? (
                    sealed.map((s) => (
                      <div className="promise-card sealed" key={s.id}>
                        <strong>Promise made · orders not revealed yet</strong>
                        <p>To {s.to.map((v) => NATIONS[v].name).join(', ')}</p>
                        <p className="plain-order">{s.promisedPlain}</p>
                        <code className="exact-order">{s.promised}</code>
                      </div>
                    ))
                  ) : (
                    <Empty>{nation.name} has made no explicit order promise in {at.season} so far.</Empty>
                  )}
                </>
              )}
            </section>
            <section className="moment-section" aria-labelledby="dossier-resolved">
              <h3 id="dossier-resolved">
                {at.resolved ? `Last resolved phase: ${at.resolved.season} · revealed orders` : 'No phase has resolved yet'}
              </h3>
              {turn ? (
                <>
                  {orders.length ? (
                    <ul className="plain-orders">
                      {orders.map((o) => (
                        <li key={o.exact}>
                          <span className="plain-order">{o.plain}</span>
                          <span className={o.succeeded ? 'positive' : 'negative'}>{o.outcome}</span>
                          <code className="exact-order">{o.exact}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>No orders were recorded for {nation.name} in {at.resolved!.season}.</Empty>
                  )}
                  <h3>Words, measured against actions</h3>
                  {promises.length ? (
                    promises.map((p, k) => (
                      <div className={`promise-card ${p.kept ? 'kept' : 'broken'}`} key={k}>
                        <strong>{p.kept ? 'Promise kept' : 'Promise broken'}</strong>
                        <p>To {p.to.map((v) => NATIONS[v].name).join(', ')}</p>
                        <dl className="promise-plain">
                          <div>
                            <dt>Promised</dt>
                            <dd>{p.promisedPlain}</dd>
                          </div>
                          <div>
                            <dt>Ordered</dt>
                            <dd>{p.actualPlain}</dd>
                          </div>
                          {p.outcome && (
                            <div>
                              <dt>Result</dt>
                              <dd>{p.outcome}</dd>
                            </div>
                          )}
                        </dl>
                        {p.kept && p.outcome && p.outcome !== 'Succeeded' && (
                          <p className="muted small-copy">The promise was kept, but the order still failed on the board.</p>
                        )}
                        <div>
                          <code>{p.promised}</code>
                          <ArrowRight size={14} aria-label="then ordered" />
                          <code>{p.actual}</code>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty>{nation.name} made no explicit order promise in {at.resolved!.season}.</Empty>
                  )}
                </>
              ) : (
                <Empty>Orders are revealed only after all countries submit and the engine resolves the phase.</Empty>
              )}
            </section>
          </>
        )}
        {tab === 'Conversations' && (
          <>
            <div className="info-note">
              Conversations {nation.name} took part in, up to {at.season}. You can read every country’s talks; the countries
              cannot read each other’s.
            </div>
            {threads.length ? (
              threads.map((c) => (
                <section className="dossier-thread" key={c.id} aria-label={`${c.participants.map((p) => NATIONS[p].name).join(', ')}`}>
                  <h4>
                    {c.participants.map((p) => NATIONS[p].name).join(' · ')}
                    <small>{c.group ? 'Group conversation' : 'Two countries'}</small>
                  </h4>
                  <ol>
                    {c.messages.map((m) => (
                      <li key={m.message.id}>
                        <div className="thread-meta">
                          <Crest power={m.message.from} small />
                          <span>
                            {NATIONS[m.message.from].name} → {m.message.to.map((p) => NATIONS[p].name).join(', ')}
                          </span>
                          <span>
                            {m.season}
                            {m.message.round >= 0 ? ` · round ${m.message.round + 1}` : ' · observer intervention'}
                          </span>
                        </div>
                        <p className="thread-summary">{m.summary}</p>
                        <blockquote>“{m.message.text}”</blockquote>
                        {m.commitment && (
                          <p className={`commitment ${m.commitment.status}`}>
                            {m.commitment.status === 'sealed'
                              ? `Promise: ${m.commitment.plain} · orders not revealed yet`
                              : m.commitment.status === 'kept'
                                ? `Promise kept: ${m.commitment.plain}`
                                : `Promise broken · actually ordered: ${m.commitment.actualPlain ?? m.commitment.actual ?? 'another order'}`}
                            {m.commitment.resultText && m.commitment.status !== 'sealed' ? ` · ${m.commitment.resultText}` : ''}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))
            ) : (
              <Empty>No messages involving {nation.name} up to {at.season}.</Empty>
            )}
          </>
        )}
        {tab === 'Memory' && (
          <>
            <h3>
              <BookOpen size={17} /> {nation.name}’s private notes as of {at.season}
            </h3>
            <p className="muted">
              Notes the country kept for itself at this moment. Other countries never see them; you can. Later events are
              excluded.
            </p>
            {cp.memories[power].length ? (
              cp.memories[power].map((m, k) => (
                <div className="memory-note" key={k}>
                  {m}
                </div>
              ))
            ) : (
              <Empty>A blank page. The first negotiations have yet to begin.</Empty>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
