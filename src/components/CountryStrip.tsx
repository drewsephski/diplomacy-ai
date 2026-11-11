import { NATIONS } from '../domain';
import { POWERS, type Match, type Power } from '../types';

/**
 * Seven compact chips: each country's supply centers at the moment on screen, and the change across
 * the phase that resolved just before it. Tapping a chip follows that country. It replaces the tall
 * seven-row list, so a phone never has to scroll past every country to reach the story.
 */
export function CountryStrip({
  match,
  index,
  follow,
  onFollow,
}: {
  match: Match;
  index: number;
  follow: Power;
  onFollow: (p: Power) => void;
}) {
  const cp = match.checkpoints[index];
  const before = index > 0 ? match.checkpoints[index - 1] : undefined;
  return (
    <div className="country-strip" role="group" aria-label="Follow a country. Supply centers at this moment">
      {POWERS.map((p) => {
        const count = cp.state.board.centers[p].length;
        const change = before ? count - before.state.board.centers[p].length : 0;
        const label = `${NATIONS[p].name}: ${count} supply ${count === 1 ? 'center' : 'centers'}${
          change ? `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} since the last phase` : ''
        }${follow === p ? ', followed' : ''}`;
        return (
          <button
            key={p}
            className={`country-chip ${follow === p ? 'followed' : ''} ${count === 0 ? 'out' : ''}`}
            aria-pressed={follow === p}
            aria-label={label}
            onClick={() => onFollow(p)}
            style={{ '--nation-color': NATIONS[p].color } as React.CSSProperties}
          >
            <span className="chip-name">{NATIONS[p].initials}</span>
            <span className="chip-count">{count}</span>
            <span className={`chip-change ${change > 0 ? 'positive' : change < 0 ? 'negative' : ''}`} aria-hidden="true">
              {change > 0 ? `+${change}` : change < 0 ? change : '·'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
