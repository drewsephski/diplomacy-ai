import { ArrowRight } from 'lucide-react';
import { NATIONS, phaseName } from '../domain';
import { conversationsAt, type Commitment } from '../conversations';
import type { HistoryNote } from '../history-notes';
import { POWERS, type Match, type Power } from '../types';
import { Crest } from './Shared';

const STATUS: Record<Commitment['status'], string> = {
  sealed: 'Sealed · orders not revealed yet',
  kept: 'Kept',
  broken: 'Broken',
};

/**
 * The followed country at the moment on screen. Everything follows the moment rule: centers and
 * units from checkpoint `index`, talks of phases up to `index`, commitment outcomes only for phases
 * that resolved before it. "Kept" and "broken" compare the promised order with the submitted one;
 * whether the move then succeeded is a separate fact, shown beside it.
 */
export function FollowCard({
  match,
  index,
  power,
  historyNote,
  onDossier,
  onFollow,
}: {
  match: Match;
  index: number;
  power: Power;
  /** A short, sourced note about the real country, always labelled as real history. */
  historyNote: HistoryNote;
  onDossier: () => void;
  onFollow: (p: Power) => void;
}) {
  const nation = NATIONS[power];
  const cp = match.checkpoints[index];
  const centers = cp.state.board.centers[power].length;
  const units = cp.state.board.units[power].length;
  const change = index > 0 ? centers - match.checkpoints[index - 1].state.board.centers[power].length : undefined;
  const conversations = conversationsAt(match, index).filter((c) => c.participants.includes(power));
  // Talks of the phase on screen first; if it has none yet, the most recent phase with talks.
  const phaseTurn = Math.min(index, match.turns.length);
  const current = conversations.filter((c) => c.messages.some((m) => m.turn === phaseTurn));
  const recentTurn = current.length ? phaseTurn : Math.max(-1, ...conversations.map((c) => c.lastTurn));
  const talking = POWERS.filter(
    (p) => p !== power && conversations.some((c) => c.participants.includes(p) && c.messages.some((m) => m.turn === recentTurn)),
  );
  const commitments = conversations
    .flatMap((c) => c.commitments)
    .filter((k) => (k.from === power || k.to.includes(power)) && (k.turn === phaseTurn || k.turn === index - 1));
  const unique = commitments.filter((k, i) => commitments.findIndex((x) => x.messageId === k.messageId) === i);
  const phaseOf = (turn: number) =>
    phaseName(turn < match.turns.length ? match.turns[turn].phase : match.checkpoints.at(-1)!.state.board.name);
  return (
    <section className="follow-card" aria-labelledby="follow-title" style={{ '--nation-color': nation.color } as React.CSSProperties}>
      <div className="follow-head">
        <Crest power={power} />
        <div>
          <span className="follow-kicker">Following</span>
          <h2 id="follow-title">{nation.formal}</h2>
        </div>
      </div>
      <p className="follow-goal">
        <b>Wants</b> {nation.objective}
      </p>
      <dl className="follow-stats">
        <div>
          <dt>Supply centers</dt>
          <dd>
            {centers}
            <small>of 18 to win</small>
          </dd>
        </div>
        <div>
          <dt>Last phase</dt>
          <dd className={change ? (change > 0 ? 'positive' : 'negative') : ''}>
            {change === undefined ? '—' : change > 0 ? `+${change}` : change}
            <small>{change === undefined ? 'opening' : 'centers'}</small>
          </dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>
            {units}
            <small>on the map</small>
          </dd>
        </div>
      </dl>
      <div className="follow-block">
        <h3>{recentTurn >= 0 ? `Talking with · ${phaseOf(recentTurn)}` : 'Talking with'}</h3>
        {talking.length ? (
          <ul className="follow-talking">
            {talking.map((p) => (
              <li key={p}>
                <button className="text-button" onClick={() => onFollow(p)} aria-label={`Follow ${NATIONS[p].name}`}>
                  <Crest power={p} small />
                  {NATIONS[p].name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="follow-empty">No private talks recorded yet at this moment.</p>
        )}
      </div>
      <div className="follow-block">
        <h3>Promises involving {nation.name}</h3>
        {unique.length ? (
          <ul className="follow-commitments">
            {unique.map((k) => (
              <li key={k.messageId} className={k.status}>
                <span className={`commit-status ${k.status}`}>{STATUS[k.status]}</span>
                <p>
                  {k.from === power ? `${nation.name} promised ${k.to.map((p) => NATIONS[p].name).join(', ')}` : `${NATIONS[k.from].name} promised ${nation.name}`}
                  : {k.plain}.
                </p>
                {k.status !== 'sealed' && k.actualPlain && (
                  <small>
                    Ordered: {k.actualPlain}
                    {k.resultText ? ` · ${k.resultText}` : ''} · {phaseOf(k.turn)}
                  </small>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="follow-empty">No explicit promise of an order in this phase or the last.</p>
        )}
      </div>
      <aside className="history-note" aria-label="Real history, not this game">
        <span>
          {historyNote.label}
          {historyNote.date ? ` · ${historyNote.date}` : ''} · not this game
        </span>
        <b>{historyNote.title}</b>
        <p>{historyNote.text}</p>
        <small>
          {historyNote.url ? (
            <a href={historyNote.url} target="_blank" rel="noreferrer">
              {historyNote.source}
            </a>
          ) : (
            historyNote.source
          )}
        </small>
      </aside>
      <button className="button dossier-button" onClick={onDossier}>
        Country details
        <ArrowRight size={15} />
      </button>
    </section>
  );
}
