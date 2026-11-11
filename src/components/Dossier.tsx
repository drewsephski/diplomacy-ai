import { useState } from 'react';
import { ArrowRight, BookOpen, Flag, Shield, Swords } from 'lucide-react';
import { NATIONS, PROFILES, phaseName } from '../domain';
import { POWERS, type Match, type Power } from '../types';
import { Crest, DispatchCard, Empty, Modal } from './Shared';
import { WhoIsThis } from './WhoIsThis';
import { deriveGuidedPhase } from '../guided/events';
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
  /** Opens the walkthrough of one moment in the last phase. */
  onMoment?: (step: number) => void;
}) {
  const [tab, setTab] = useState('Situation');
  const cp = match.checkpoints[index];
  const turn = match.turns[index - 1];
  const nation = NATIONS[power];
  const lastPhase = index > 0 ? deriveGuidedPhase(match, index - 1) : undefined;
  const messages = match.turns
    .slice(0, index)
    .flatMap((t) => t.messages)
    .filter((m) => m.from === power || m.to.includes(power));
  return (
    <Modal title={nation.formal} onClose={onClose} wide>
      <WhoIsThis match={match} power={power} phase={lastPhase} onOpenMoment={onMoment} />
      <div className="dossier-intro">
        <Crest power={power} />
        <div>
          <div className="eyebrow">{PROFILES[cp.configs[power].profile].name}</div>
          <p>{nation.objective}</p>
          <small>
            {match.mode === 'live'
              ? cp.configs[power].model
              : 'Scripted sample / deterministic sandbox policy'}
          </small>
        </div>
      </div>
      <div className="dossier-tabs">
        {['Situation', 'Orders & promises', 'Diplomacy', 'Memory'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
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
            <h3>The current calculus</h3>
            <p className="readable">
              {turn?.decisions[power].explanation ||
                'The opening position is set. Each country begins with its own objectives, and no knowledge of the other countries’ private plans.'}
            </p>
            <h3>How {nation.name} sees its neighbors</h3>
            <p className="muted small-copy">
              Agent-reported trust, adjusted when a promise to this country is broken. These are
              beliefs, not verified alliances.
            </p>
            <div className="relations">
              {POWERS.filter((p) => p !== power).map((p) => {
                const score = cp.relations[power][p] || 0;
                return (
                  <div key={p}>
                    <Crest power={p} small />
                    <span>{NATIONS[p].name}</span>
                    <div className="relation-track">
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
                );
              })}
            </div>
          </>
        )}
        {tab === 'Orders & promises' && (
          <>
            <h3>
              {turn ? `${phaseName(turn.phase)} · revealed orders` : 'Secret orders are not revealed yet'}
            </h3>
            {turn ? (
              <>
                <div className="orders-list">
                  {turn.decisions[power].orders.map((o) => (
                    <div key={o}>
                      <code>{o}</code>
                      <span>
                        {turn.results[o.split(' ').slice(0, 2).join(' ')]?.join(', ') || 'Resolved'}
                      </span>
                    </div>
                  ))}
                </div>
                <h3>Words, measured against actions</h3>
                {turn.promises.filter((p) => p.from === power).length ? (
                  turn.promises
                    .filter((p) => p.from === power)
                    .map((p, i) => (
                      <div className={`promise-card ${p.kept ? 'kept' : 'broken'}`} key={i}>
                        <strong>{p.kept ? 'Promise kept' : 'Promise broken'}</strong>
                        <p>To {p.to.map((v) => NATIONS[v].name).join(', ')}</p>
                        <div>
                          <code>{p.promised}</code>
                          <ArrowRight size={14} />
                          <code>{p.actual}</code>
                        </div>
                      </div>
                    ))
                ) : (
                  <Empty>
                    No explicit order commitments were made by this power in this phase.
                  </Empty>
                )}
              </>
            ) : (
              <Empty>
                Secret orders are revealed only after all countries submit and the engine
                adjudicates.
              </Empty>
            )}
          </>
        )}
        {tab === 'Diplomacy' && (
          <>
            <div className="info-note">
              This page shows only the messages {nation.name} participated in. You can inspect
              every country; agents cannot.
            </div>
            {messages.length ? (
              messages.map((m) => <DispatchCard key={m.id} message={m} expanded />)
            ) : (
              <Empty>No messages from this moment.</Empty>
            )}
          </>
        )}
        {tab === 'Memory' && (
          <>
            <h3>
              <BookOpen size={17} /> What this country remembers
            </h3>
            <p className="muted">
              Private notes this country kept at this moment. Later events are excluded.
            </p>
            {cp.memories[power].length ? (
              cp.memories[power].map((m, i) => (
                <div className="memory-note" key={i}>
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
