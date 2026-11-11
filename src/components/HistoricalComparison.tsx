import { ExternalLink, Scale } from 'lucide-react';
import { NATIONS } from '../domain';
import { POWERS, type Checkpoint, type Match, type Power } from '../types';
const contexts = [
  {
    title: 'Alliances were choices, not a script.',
    date: '1901–1907',
    body: 'Britain’s agreements with Japan, France, and Russia developed through separate negotiations. A Franco-British understanding in this simulation is a strategic choice, not evidence that an Entente must emerge.',
    source: 'UK Government · Lord Lansdowne',
    url: 'https://www.gov.uk/government/history/past-foreign-secretaries/henry-petty-fitzmaurice',
  },
  {
    title: 'An alliance did not guarantee entry into war.',
    date: '1914–1915',
    body: 'Italy belonged to the Triple Alliance but stayed neutral in 1914 and entered the war against Austria-Hungary in 1915. A coalition’s membership is less informative than the actions its members take.',
    source: 'National WWI Museum · Italy enters the war',
    url: 'https://www.theworldwar.org/learn/about-wwi/italy-enters-world-war-i',
  },
  {
    title: 'The Ottoman alignment was not inevitable.',
    date: '1914',
    body: 'The Ottoman Empire was not part of the Central Powers at the beginning of August 1914. Its later entry illustrates why this observatory leaves future alignments open rather than encoding the eventual wartime blocs.',
    source: 'Canadian War Museum · Origins and early phases',
    url: 'https://www.warmuseum.ca/firstworldwar/history/going-to-war/origins-and-early-phases/',
  },
];
export function HistoricalComparison({ match, index }: { match: Match; index: number }) {
  const cp = match.checkpoints[index];
  const pairs: { a: Power; b: Power; score: number }[] = [];
  for (let a = 0; a < POWERS.length; a++)
    for (let b = a + 1; b < POWERS.length; b++) {
      const pa = POWERS[a],
        pb = POWERS[b];
      pairs.push({
        a: pa,
        b: pb,
        score: Math.min(cp.relations[pa][pb] || 0, cp.relations[pb][pa] || 0),
      });
    }
  const friendly = pairs.filter((p) => p.score >= 30);
  const broken = match.turns
    .slice(0, index)
    .flatMap((t) => t.promises)
    .filter((p) => !p.kept);
  const conflicts = match.turns.slice(0, index).flatMap((turn, i) =>
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
          <h3>In this timeline</h3>
          <div className="observation">
            <span>RECIPROCAL TRUST</span>
            <h2>
              {friendly.length
                ? `${friendly.length} emerging ${friendly.length === 1 ? 'partnership' : 'partnerships'}`
                : 'No settled coalition'}
            </h2>
            <p>
              {friendly.length
                ? friendly.map((p) => `${NATIONS[p.a].name} + ${NATIONS[p.b].name}`).join('; ')
                : 'No pair currently reports mutual trust of +30 or higher. Diplomatic overtures alone are not a durable alliance.'}
            </p>
            <small>Based on both countries’ reported trust at this moment.</small>
          </div>
          <div className="observation">
            <span>COMMITMENTS TESTED</span>
            <h2>
              {broken.length} broken {broken.length === 1 ? 'promise' : 'promises'}
            </h2>
            <p>
              {broken.length
                ? `${[...new Set(broken.map((p) => NATIONS[p.from].name))].join(', ')} issued orders that contradicted explicit commitments. Compare the negotiation with the reveal to understand the cost.`
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
          <h3>In the historical record</h3>
          {contexts.map((c) => (
            <article className="history-context" key={c.title}>
              <span>{c.date}</span>
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
  const cps = match.checkpoints.slice(0, index + 1);
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
          1901
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
