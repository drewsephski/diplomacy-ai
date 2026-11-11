import '../whatif.css';
import { NATIONS } from '../domain';
import type { GuidedPhase } from '../guided/events';
import { countryAt, momentLabel } from '../moment';
import type { Match, Power } from '../types';

/**
 * "Who is this?" for one country at the viewed moment `index`: its stated objective, where it
 * started, where it stands at this moment, the instruction the observer wrote for it (as in force at
 * this checkpoint), and links to its moments in the last resolved phase. Everything shown is recorded
 * state at checkpoint `index` or earlier, or the country's published objective. Nothing reads a later
 * checkpoint, so an earlier moment never shows a later position.
 */
export function WhoIsThis({
  match,
  index,
  power,
  phase,
  onOpenMoment,
}: {
  match: Match;
  /** The viewed moment (board at the start of phase `index`). */
  index: number;
  power: Power;
  /** The walkthrough of the phase that resolved just before this moment, when there is one. */
  phase?: GuidedPhase;
  onOpenMoment?: (step: number) => void;
}) {
  const at = momentLabel(match, index);
  const c = countryAt(match, index, power);
  const moments = phase?.events.map((e, i) => ({ e, i })).filter(({ e }) => e.powers.includes(power)) ?? [];
  const change = c.change === undefined || c.change === 0 ? '' : ` (${c.change > 0 ? '+' : ''}${c.change} in ${at.resolved?.season ?? 'the last phase'})`;
  return (
    <section className="who-is-panel" aria-labelledby={`who-${power}`}>
      <h3 id={`who-${power}`}>Who is this?</h3>
      <p>
        <b>What {NATIONS[power].name} wants:</b> {NATIONS[power].objective}
      </p>
      <p>
        <b>At the start:</b> {c.startCenters} supply centers, {c.startUnits} units.{' '}
        <b>At this moment ({at.season}):</b> {c.centers} centers{change}, {c.units} units.
      </p>
      {c.instruction ? (
        <p>
          <b>Your instruction for this country:</b> “{c.instruction}”. It guides strategy only and cannot change the rules.
        </p>
      ) : (
        <p className="muted">No instruction was written for this country. It plays from the rules and its own interests.</p>
      )}
      {onOpenMoment && at.resolved && (
        <>
          <h4 className="guide-subhead">Moments in {at.resolved.season}, the last resolved phase</h4>
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
            <p className="muted">No separate moments for this country in {at.resolved.season}.</p>
          )}
        </>
      )}
    </section>
  );
}
