import { ArrowRight } from 'lucide-react';
import { NATIONS, phaseKind, phaseName } from '../domain';
import { buildStory, describeOrder, outcomeText, provinceName, type Moment } from '../story';
import { POWERS, type Match, type Power } from '../types';
import { Empty } from './Shared';

const TONE_NOTE: Record<Moment['tone'], string> = {
  broken: 'Words and actions diverged',
  'kept-failed': 'Commitment kept, board result failed',
  gain: 'Territory and influence changed',
  loss: 'Territory and influence changed',
  standoff: 'Contested province, no change',
  invasion: 'Move into an occupied province',
  quiet: '',
};

export interface StoryGuide {
  /** Opens the walkthrough of the phase this panel describes. */
  onOpen: () => void;
  /** Phases recorded since the viewer last finished one, with a start action. */
  ready?: { count: number; season: string; onStart: () => void };
  disabled?: boolean;
}

export function Story({
  match,
  index,
  onSelect,
  onLocate,
  onDiplomacy,
  guide,
}: {
  match: Match;
  index: number;
  onSelect: (p: Power) => void;
  onLocate: (code: string) => void;
  onDiplomacy: () => void;
  guide?: StoryGuide;
}) {
  if (index === 0)
    return (
      <Empty>
        <b>Nothing has happened yet.</b>
        <br />
        Press Play or Play next phase to see what the first phase changes.
      </Empty>
    );
  const turnIndex = index - 1;
  const turn = match.turns[turnIndex];
  const story = buildStory(match, turnIndex);
  if (!turn || !story) return <Empty>This phase has not resolved in the record.</Empty>;
  const chips = [
    story.counts.broken && `${story.counts.broken} broken`,
    story.counts.kept && `${story.counts.kept} kept`,
    story.counts.gained && `${story.counts.gained} gained`,
    story.counts.lost && `${story.counts.lost} lost`,
    story.counts.standoffs && `${story.counts.standoffs} bounced`,
  ].filter(Boolean) as string[];
  const orders = POWERS.flatMap((p) => turn.decisions[p].orders.map((order) => ({ p, order })));
  return (
    <div className="story">
      {guide?.ready && (
        <div className="guide-ready" role="status">
          <span>
            <b>{guide.ready.season}</b> is ready to walk through · {guide.ready.count} new{' '}
            {guide.ready.count === 1 ? 'phase' : 'phases'}
          </span>
          <button className="button" onClick={guide.ready.onStart}>
            Start the guide
          </button>
        </div>
      )}
      <div className="story-head">
        <span className="eyebrow">
          LAST PHASE · {phaseName(story.phase).toUpperCase()} {phaseKind(story.phase).toUpperCase()}
        </span>
        {guide && (
          <button className="text-button guide-launch" onClick={guide.onOpen} disabled={guide.disabled}>
            Walk through this phase with a guide
          </button>
        )}
        <h3>{story.title || 'The phase resolved.'}</h3>
        {chips.length > 0 && (
          <ul className="story-chips" aria-label="Summary counts">
            {chips.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </div>
      <ol className="moments">
        {story.moments.map((m) => (
          <li key={m.id} className={`moment ${m.tone}`}>
            <span className="moment-label">
              {m.label}
              {TONE_NOTE[m.tone] && <small> · {TONE_NOTE[m.tone]}</small>}
            </span>
            <h4>{m.headline}</h4>
            <p>{m.detail}</p>
            {m.compare && (
              <div className="moment-compare">
                <span>
                  Promised
                  <code>{m.compare.promised}</code>
                </span>
                <ArrowRight size={14} aria-hidden="true" />
                <span>
                  Submitted
                  <code>{m.compare.actual}</code>
                </span>
              </div>
            )}
            {m.exact && !m.compare && <code className="moment-exact">{m.exact}</code>}
            <div className="moment-actions">
              {m.power && (
                <button className="text-button" onClick={() => onSelect(m.power!)}>
                  Show {NATIONS[m.power].name}
                </button>
              )}
              {m.province && (
                <button className="text-button" onClick={() => onLocate(m.province!)}>
                  Find {provinceName(m.province)} on map
                </button>
              )}
              {(m.tone === 'broken' || m.tone === 'kept-failed') && (
                <button className="text-button" onClick={onDiplomacy}>
                  Read the messages
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="story-recap">
        <span className="eyebrow">PHASE SUMMARY</span>
        <p>{story.recap}</p>
      </div>
      <details className="all-orders">
        <summary>All {orders.length} orders, in plain words (exact text beside each)</summary>
        <ul>
          {orders.map(({ p, order }) => {
            const reading = describeOrder(order);
            return (
              <li key={`${p}-${order}`}>
                <span style={{ color: NATIONS[p].color }}>{NATIONS[p].name}</span>
                <span>{reading.summary}</span>
                <code>{reading.exact}</code>
                <small>{outcomeText(turn.results[reading.unit])}</small>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
