import { NATIONS } from '../domain';
import type { GuidedPhase } from '../guided/events';
import type { Match, Power } from '../types';

/**
 * "Who is this?" for one country: its stated objective, where it started, where it stands now,
 * any instruction the observer wrote for it, and links to its moments in the last phase.
 * Everything shown is recorded state or the country's published objective.
 */
export function WhoIsThis({
  match,
  power,
  phase,
  onOpenMoment,
}: {
  match: Match;
  power: Power;
  /** The walkthrough of the last finished phase, when there is one. */
  phase?: GuidedPhase;
  onOpenMoment?: (step: number) => void;
}) {
  const start = match.checkpoints[0].state.board;
  const now = match.checkpoints.at(-1)!.state.board;
  const moments = phase?.events.map((e, i) => ({ e, i })).filter(({ e }) => e.powers.includes(power)) ?? [];
  const instruction = match.checkpoints[0].configs[power]?.instructions;
  return (
    <section className="who-is-panel" aria-labelledby={`who-${power}`}>
      <h3 id={`who-${power}`}>Who is this?</h3>
      <p>
        <b>Objective:</b> {NATIONS[power].objective}
      </p>
      <p>
        <b>At the start:</b> {start.centers[power].length} supply centers, {start.units[power].length} units.{' '}
        <b>Now:</b> {now.centers[power].length} centers, {now.units[power].length} units.
      </p>
      {instruction ? (
        <p>
          <b>Your instruction for this country:</b> “{instruction}”. It guides strategy only and cannot change the rules.
        </p>
      ) : (
        <p className="muted">No instruction was written for this country. It plays from the rules and its own interests.</p>
      )}
      {onOpenMoment && (
        <>
          <h4 className="guide-subhead">Moments in the last phase</h4>
          {moments.length > 0 ? (
            <ul className="who-is-moments" aria-label={`Moments for ${NATIONS[power].name}`}>
              {moments.map(({ e, i }) => (
                <li key={e.id}>
                  <button className="text-button" onClick={() => onOpenMoment(i)}>
                    {e.headline}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No separate moments for this country in the last phase.</p>
          )}
        </>
      )}
    </section>
  );
}
