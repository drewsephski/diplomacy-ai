import { ExternalLink, Scale } from 'lucide-react';
import { NATIONS, phaseName } from '../domain';
import { clampMoment, momentLabel, mutualTrustAt } from '../moment';
import { contexts } from '../history-notes';
import { POWERS, type Checkpoint, type Match, type Power } from '../types';

/**
 * Real history (sourced, fixed) beside the simulated timeline at the viewed moment `index`. Every
 * simulated reading uses checkpoint `index` and turns before it only. Trust readings are what both
 * countries reported, an assessment, never proof of an alliance.
 */
export function HistoricalComparison({ match, index }: { match: Match; index: number }) {
  const at = momentLabel(match, index);
  const friendly = mutualTrustAt(match, at.index, 30);
  const broken = match.turns
    .slice(0, at.index)
    .flatMap((t) => t.promises)
    .filter((p) => !p.kept);
  const conflicts = match.turns.slice(0, at.index).flatMap((turn, i) =>
    POWERS.flatMap((attacker) =>
      turn.decisions[attacker].orders.flatMap((order) => {
        const parts = order.split(' ');
        if (parts[2] !== '-') return [];
        const defender = POWERS.find(
          (other) =>
            other !== attacker &&
            match.checkpoints[i].state.board.units[other].some(
              (unit) => unit.split(' ')[1].slice(0, 3) === parts[3].slice(0, 3),
            ),
        );
        return defender ? [`${NATIONS[attacker].name} → ${NATIONS[defender].name}`] : [];
      }),
    ),
  );
  return (
    <section className="history-page">
      <div className="editorial-heading">
        <span className="eyebrow">COMPARED WITH HISTORY</span>
        <h1>
          History offers context.
          <br />
          <em>It does not write the orders.</em>
        </h1>
        <p>Observe the patterns. Question the resemblance. Keep the difference in view.</p>
      </div>
      <div className="history-columns">
        <div>
          <h3>
            In this simulated timeline <small className="history-when">as of {at.season} · moment {at.index}</small>
          </h3>
          <div className="observation">
            <span>STATED TRUST</span>
            <h2>
              {friendly.length
                ? `${friendly.length} ${friendly.length === 1 ? 'pair reports' : 'pairs report'} trust in each other`
                : 'No pair reports strong trust in each other'}
            </h2>
            <p>
              {friendly.length
                ? `${friendly.map((p) => `${NATIONS[p.a].name} and ${NATIONS[p.b].name}`).join('; ')}: each rates the other at +30 or higher. That is what both countries say they believe, not a signed alliance; their orders are the test.`
                : 'No two countries both rate each other at +30 or higher. Friendly messages alone are not an alliance.'}
            </p>
            <small>Each country’s own assessment at this moment, as it reported it.</small>
          </div>
          <div className="observation">
            <span>COMMITMENTS TESTED</span>
            <h2>
              {broken.length} broken {broken.length === 1 ? 'promise' : 'promises'}
            </h2>
            <p>
              {broken.length
                ? `${[...new Set(broken.map((p) => NATIONS[p.from].name))].join(', ')} issued orders that contradicted explicit commitments. The record shows what was promised and ordered; it does not show why.`
                : 'No explicit order promise has been contradicted at this moment. Silence and vague assurances are not counted as promises.'}
            </p>
          </div>
          <div className="observation">
            <span>CONTESTED FRONTS</span>
            <h2>
              {conflicts.length} cross-power {conflicts.length === 1 ? 'attack' : 'attacks'}
            </h2>
            <p>
              {conflicts.length
                ? [...new Set(conflicts)].join('; ')
                : 'No move has yet targeted a province occupied by another power at the start of the phase.'}
            </p>
            <small>
              Attempted moves against occupied provinces, not declarations of war. Empty provinces
              contested by several powers are excluded.
            </small>
          </div>
          <CenterChart match={match} index={index} />
        </div>
        <div>
          <h3>
            Real history <small className="history-when">sourced, and not part of the simulation</small>
          </h3>
          {contexts.map((c) => (
            <article className="history-context" key={c.title}>
              <span>Real history · {c.date}</span>
              <h2>{c.title}</h2>
              <p>{c.body}</p>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.source}
                <ExternalLink size={12} />
              </a>
            </article>
          ))}
        </div>
      </div>
      <div className="history-caveat">
        <Scale size={25} />
        <div>
          <h3>A strategic experiment, not a historical forecast.</h3>
          <p>
            Diplomacy reduces nations to equally capable units and supply centers. It omits
            population, industrial capacity, colonies, domestic politics, logistics, and the human
            cost of war. The rules reward conquest; real governments face many other incentives.
            Model outputs reflect prompts and training, not historical leaders. Similar alliances
            cannot establish why the real war happened. Historical context appears only here; future
            events are excluded from agent profiles.
          </p>
        </div>
      </div>
    </section>
  );
}
export function CenterChart({ match, index }: { match: Match; index: number }) {
  const cps = match.checkpoints.slice(0, clampMoment(match, index) + 1);
  const max = Math.max(
    8,
    ...cps.flatMap((c) => POWERS.map((p) => c.state.board.centers[p].length)),
  );
  return (
    <div className="center-chart">
      <h3>The balance of power</h3>
      <svg
        viewBox="0 0 420 170"
        role="img"
        aria-label="Supply center ownership over completed phases"
      >
        {[0, Math.ceil(max / 2), max].map((v) => (
          <g key={v}>
            <line
              x1="24"
              y1={145 - (v / max) * 120}
              x2="410"
              y2={145 - (v / max) * 120}
              stroke="#ffffff12"
            />
            <text x="5" y={149 - (v / max) * 120} fill="#9b9e9d" fontSize="10">
              {v}
            </text>
          </g>
        ))}
        {POWERS.map((p) => (
          <polyline
            key={p}
            points={cps
              .map(
                (c, i) =>
                  `${25 + (i / Math.max(cps.length - 1, 1)) * 380},${145 - (c.state.board.centers[p].length / max) * 120}`,
              )
              .join(' ')}
            fill="none"
            stroke={NATIONS[p].color}
            strokeWidth="2"
          >
            <title>
              {NATIONS[p].name}: {cpCount(cps.at(-1)!, p)} centers
            </title>
          </polyline>
        ))}
        <text x="24" y="166" fill="#9b9e9d" fontSize="10">
          {phaseName(match.checkpoints[0].state.board.name)}
        </text>
        <text x="410" y="166" fill="#9b9e9d" fontSize="10" textAnchor="end">
          Moment {index}
        </text>
      </svg>
      <div className="chart-legend">
        {POWERS.map((p) => (
          <span key={p}>
            <i style={{ background: NATIONS[p].color }} />
            {NATIONS[p].name}
          </span>
        ))}
      </div>
    </div>
  );
}
function cpCount(cp: Checkpoint, p: Power) {
  return cp.state.board.centers[p].length;
}
