import { NATIONS, powerMap } from '../src/domain.js';
import { POWERS, type Match, type Power, type Decision, type Dispatch } from '../src/types.js';
// Deliberately authored teaching scenario. These are never described as model outputs.
const openings: Record<string, Partial<Record<Power, string[]>>> = {
  S1901M: {
    ENGLAND: ['F EDI - NWG', 'F LON - NTH', 'A LVP - YOR'],
    FRANCE: ['F BRE - ENG', 'A PAR - BUR', 'A MAR - SPA'],
    GERMANY: ['F KIE - DEN', 'A BER - KIE', 'A MUN - RUH'],
    ITALY: ['F NAP - ION', 'A ROM - APU', 'A VEN H'],
    AUSTRIA: ['A BUD - SER', 'A VIE - GAL', 'F TRI - ALB'],
    RUSSIA: ['A WAR - GAL', 'A MOS - UKR', 'F SEV - BLA', 'F STP/SC - BOT'],
    TURKEY: ['F ANK - BLA', 'A CON - BUL', 'A SMY - CON'],
  },
  F1901M: {
    ENGLAND: ['F NWG - NWY', 'F NTH - ENG', 'A YOR - LON'],
    FRANCE: ['F ENG - BEL', 'A BUR S F ENG - BEL', 'A SPA - POR'],
    GERMANY: ['F DEN H', 'A KIE - HOL', 'A RUH - MUN'],
    ITALY: ['F ION - TUN', 'A APU - VEN', 'A VEN - TYR'],
    AUSTRIA: ['A SER H', 'A VIE - BUD', 'F ALB - GRE'],
    RUSSIA: ['A WAR - GAL', 'A UKR - RUM', 'F SEV H', 'F BOT - SWE'],
    TURKEY: ['F ANK - BLA', 'A BUL H', 'A CON - SMY'],
  },
};
function hash(text: string) {
  return [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
}
export function sampleDecision(match: Match, power: Power): Decision {
  const cp = match.checkpoints.at(-1)!;
  const { board, legal } = cp.state;
  const groups = legal[power];
  const script = openings[board.name]?.[power] || [];
  const orders: string[] = [];
  const used = new Set<string>();
  const count = board.builds[power].count;
  const adjustment = board.name.endsWith('A');
  for (const [loc, options] of Object.entries(groups)) {
    if (!options.length || used.has(loc.slice(0, 3))) continue;
    if (adjustment && orders.length >= Math.abs(count)) break;
    const preferred = script.find((o) => options.includes(o));
    const scored = [...options]
      .map((order) => {
        let score = hash(order + board.name + cp.configs[power].profile) % 100;
        if (order.includes(' - ') && !order.includes(' S ') && !order.includes(' C ')) {
          score += 90;
          const dest = order.split(' - ')[1].slice(0, 3);
          if (
            Object.values(board.centers).flat().includes(dest) &&
            !board.centers[power].includes(dest)
          )
            score += 200;
          if (
            [
              'BEL',
              'HOL',
              'DEN',
              'NWY',
              'SWE',
              'SPA',
              'POR',
              'TUN',
              'SER',
              'RUM',
              'BUL',
              'GRE',
            ].includes(dest) &&
            !board.centers[power].includes(dest)
          )
            score += 200;
          if (board.units[power].some((u) => u.split(' ')[1].slice(0, 3) === dest)) score -= 300;
        }
        if (order.endsWith(' B')) score += 100;
        if (order.includes(' R ')) score += 200;
        return { order, score };
      })
      .sort((a, b) => b.score - a.score);
    orders.push(preferred || scored[0].order);
    used.add(loc.slice(0, 3));
  }
  const betrayal = power === 'FRANCE' && board.name === 'S1901M';
  return {
    orders,
    explanation: betrayal
      ? 'The Channel offers leverage over Britain and a route to Belgium. France breaks its promised Atlantic move to secure that position, at the cost of British trust.'
      : board.name === 'S1901M'
        ? `${NATIONS[power].name} opens toward nearby neutral centers while testing whether its neighbors will honor their assurances.`
        : `${NATIONS[power].name} responds to the visible board, prioritizing accessible supply centers and legal repositioning. This continuation uses a deterministic teaching policy, not an AI model.`,
    memory: betrayal
      ? 'We promised Britain an Atlantic move but entered the Channel. Expect suspicion and defensive British orders.'
      : `After ${board.name}, remember the public moves and the commitments exchanged with our neighbors.`,
    relationships: powerMap((other) =>
      other === power
        ? 0
        : power === 'ENGLAND' && other === 'FRANCE' && match.turns.length > 0
          ? -65
          : 15,
    ),
  };
}
export function sampleMessages(match: Match, power: Power, round: number): Omit<Dispatch, 'id'>[] {
  const phase = match.checkpoints.at(-1)!.state.board.name;
  if (!phase.endsWith('M')) return [];
  if (phase === 'S1901M') {
    const scripts: Partial<Record<Power, Omit<Dispatch, 'id'>[]>> =
      round === 0
        ? {
            FRANCE: [
              {
                from: power,
                to: ['ENGLAND'],
                round,
                kind: 'proposal',
                text: 'A quiet Channel benefits us both. My Brest fleet will sail into the Atlantic. Shall we leave the Channel empty?',
                promise: 'F BRE - MAO',
              },
            ],
            ENGLAND: [
              {
                from: power,
                to: ['FRANCE'],
                round,
                kind: 'reply',
                text: 'My fleet sails north. You have my word. A peaceful Channel lets us both look elsewhere.',
                promise: 'F LON - NTH',
              },
            ],
            GERMANY: [
              {
                from: power,
                to: ['AUSTRIA', 'ITALY'],
                round,
                kind: 'alliance',
                text: 'Three neighbors, one understanding: let us keep our shared borders quiet while we establish ourselves.',
              },
            ],
            AUSTRIA: [
              {
                from: power,
                to: ['RUSSIA'],
                round,
                kind: 'proposal',
                text: 'Galicia makes us both nervous. I propose that neither of us should remain there. Can we settle this without a lasting conflict?',
              },
            ],
            RUSSIA: [
              {
                from: power,
                to: ['TURKEY'],
                round,
                kind: 'proposal',
                text: 'The Black Sea is a door into both our homes. A mutual bounce may be safer than taking each other on trust.',
              },
            ],
            TURKEY: [
              {
                from: power,
                to: ['RUSSIA'],
                round,
                kind: 'reply',
                text: 'Agreed. A bounce establishes the boundary. We can discuss the Balkans once the sea is settled.',
                promise: 'F ANK - BLA',
              },
            ],
            ITALY: [
              {
                from: power,
                to: ['AUSTRIA', 'GERMANY'],
                round,
                kind: 'reply',
                text: 'I can keep Venice still this spring. There is room enough to begin without turning on one another.',
                promise: 'A VEN H',
              },
            ],
          }
        : {
            FRANCE: [
              {
                from: power,
                to: ['GERMANY'],
                round,
                kind: 'proposal',
                text: 'Belgium would make a useful buffer. If you look east, I will have less reason to press your border.',
              },
            ],
            ENGLAND: [
              {
                from: power,
                to: ['FRANCE'],
                round,
                kind: 'reply',
                text: 'Then the Channel remains our line of trust. I will remember this understanding.',
              },
            ],
          };
    return scripts[power] || [];
  }
  if (phase === 'F1901M' && power === 'ENGLAND' && round === 0)
    return [
      {
        from: power,
        to: ['FRANCE'],
        round,
        kind: 'threat',
        text: 'You promised the Atlantic. Your fleet is in the Channel. My next orders will account for what you did, not what you said.',
      },
    ];
  if (phase === 'F1901M' && power === 'FRANCE' && round === 1)
    return [
      {
        from: power,
        to: ['ENGLAND'],
        round,
        kind: 'reply',
        text: 'The fleet is heading to Belgium, not London. I understand that reassurance is now more expensive.',
      },
    ];
  if (round > 0) return [];
  const other = POWERS[(POWERS.indexOf(power) + 1) % POWERS.length];
  return [
    {
      from: power,
      to: [other],
      round,
      kind: 'proposal',
      text: `${NATIONS[other].name}, the balance has shifted. We should discuss our next moves before either of us opens another front.`,
    },
  ];
}
