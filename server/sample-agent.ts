import data from '../src/map-data.json' with { type: 'json' };
import { NATIONS, powerMap } from '../src/domain.js';
import { baseProvince, describeOrder, SUPPLY_CENTERS } from '../src/story.js';
import { POWERS, type Board, type Decision, type Dispatch, type Match, type Power } from '../src/types.js';

/**
 * The authored teaching sample and the deterministic sandbox policy.
 *
 * Everything here is deliberately authored or rule-based and is never described as model output.
 * Every phase is still adjudicated by the real engine. Two rules keep it honest:
 * - Authored dialogue is state-aware. Each line has a guard on the board and the record, so a
 *   branch (the sandbox reuses these scripts) never contains a message its own board contradicts:
 *   Britain only says "your fleet is in the Channel" when a French fleet is there.
 * - Authored orders are used only when they are legal for that unit at that moment; otherwise the
 *   deterministic policy chooses. Promises in authored lines are included only when legal.
 *
 * The continuation policy is simple and fixed. It does not read messages and is not a strong
 * player; it avoids obviously wasted moves (two own units into one place, attacking a held
 * province without support) so later phases show varied, readable outcomes rather than mass bounces.
 */

/** Edition of the authored sample. Raise it when the authored record changes; see ensureSample. */
export const SAMPLE_VERSION = 2;
export const SAMPLE_NAME = 'The fragile peace';
/** Phases recorded in the sample (movement, retreats, and adjustments all count). */
export const SAMPLE_PHASES = 11;

const coords = data.coords as Record<string, { x: number; y: number }>;

// ---------------------------------------------------------------------------------------------
// Authored orders. A line is used only if it is one of that unit's legal orders at that moment.

const AUTHORED_ORDERS: Record<string, Partial<Record<Power, string[]>>> = {
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
    ITALY: ['F ION - TUN', 'A APU H', 'A VEN H'],
    AUSTRIA: ['A SER H', 'A VIE H', 'F ALB - GRE'],
    RUSSIA: ['A WAR H', 'A UKR - RUM', 'F SEV H', 'F BOT - SWE'],
    TURKEY: ['F ANK H', 'A BUL H', 'A CON H'],
  },
  W1901A: {
    ENGLAND: ['F EDI B'],
    FRANCE: ['F BRE B', 'A PAR B'],
    GERMANY: ['A BER B', 'F KIE B'],
    ITALY: ['A NAP B'],
    AUSTRIA: ['A BUD B', 'F TRI B'],
    RUSSIA: ['A MOS B', 'F STP/NC B'],
    TURKEY: ['F SMY B'],
  },
  S1902M: {
    ENGLAND: ['F ENG - BEL', 'F EDI - NTH', 'F NWY H', 'A LON H'],
    FRANCE: ['F BEL H', 'A BUR H', 'A POR - SPA', 'F BRE H', 'A PAR H'],
    GERMANY: ['A HOL S F ENG - BEL', 'F DEN H', 'A MUN H', 'A BER - SIL', 'F KIE - HEL'],
    ITALY: ['F TUN H', 'A APU H', 'A VEN H', 'A NAP H'],
    AUSTRIA: ['A SER H', 'A VIE - GAL', 'F GRE H', 'A BUD S A VIE - GAL', 'F TRI H'],
    RUSSIA: ['A WAR - UKR', 'A RUM H', 'F SEV H', 'F SWE H', 'A MOS H', 'F STP/NC - BAR'],
    TURKEY: ['F ANK H', 'A BUL H', 'A CON H', 'F SMY - AEG'],
  },
  F1902M: {
    ENGLAND: ['F BEL H', 'F NTH - ENG', 'F NWY H', 'A LON H'],
    FRANCE: ['A SPA H', 'A BUR H', 'F BRE - MAO', 'A PAR H'],
    GERMANY: ['A HOL H', 'F DEN H', 'A MUN H', 'A SIL H', 'F HEL H'],
    ITALY: ['F TUN H', 'A APU H', 'A VEN H', 'A NAP H'],
    AUSTRIA: ['A GAL H', 'A SER H', 'F GRE H', 'A BUD H', 'F TRI H'],
    RUSSIA: ['A UKR S A RUM', 'A RUM H', 'F SEV S A RUM', 'F SWE H', 'A MOS - WAR', 'F BAR H'],
    TURKEY: ['A BUL - RUM', 'F ANK H', 'A CON H', 'F AEG H'],
  },
  // A quiet spring: every country consolidates, and two short notes are exchanged.
  S1903M: {
    ENGLAND: ['A EDI - YOR', 'F BEL H', 'F ENG H', 'A LON H', 'F NWY H'],
    FRANCE: ['F MAO - BRE', 'A BUR H', 'A PAR H', 'F PIC H', 'A SPA H'],
    GERMANY: ['F DEN H', 'F HEL H', 'A HOL H', 'A MUN H', 'A SIL H'],
    ITALY: ['A APU H', 'A NAP H', 'F TUN H', 'A VEN H'],
    AUSTRIA: ['A BUD H', 'A GAL H', 'F GRE H', 'A SER H', 'F TRI H'],
    RUSSIA: ['F BAR H', 'A WAR H', 'A RUM H', 'F SEV H', 'F SWE H', 'A UKR H'],
    TURKEY: ['F AEG H', 'F ANK H', 'A BUL H', 'A CON H'],
  },
};

// ---------------------------------------------------------------------------------------------
// Reading the board and the record.

type Draft = Omit<Dispatch, 'id'>;

interface Ctx {
  match: Match;
  power: Power;
  round: number;
  phase: string;
  board: Board;
  legal: Match['checkpoints'][number]['state']['legal'];
}

function locOf(unit: string) {
  return baseProvince(unit.replace('*', '').split(' ')[1] ?? '');
}

/** The unit `power` has in a province ("F ENG"), if any. */
function unitIn(board: Board, power: Power, province: string) {
  return board.units[power].find((u) => locOf(u) === province)?.replace('*', '');
}

function isLegal(c: Ctx, power: Power, order: string) {
  return Object.values(c.legal[power] ?? {}).some((options) => options.includes(order));
}

/** A message this phase (pending) or in a recorded phase that matches, newest first. */
function findMessage(
  c: Ctx,
  where: { from: Power; to?: Power; phase?: string; promise?: string; kind?: Dispatch['kind'] },
): Dispatch | undefined {
  const pools: { phase: string; messages: Dispatch[] }[] = [
    { phase: c.phase, messages: c.match.pending?.messages ?? [] },
    ...[...c.match.turns].reverse().map((t) => ({ phase: t.phase, messages: t.messages })),
  ];
  for (const pool of pools) {
    if (where.phase && pool.phase !== where.phase) continue;
    const hit = [...pool.messages]
      .reverse()
      .find(
        (m) =>
          m.from === where.from &&
          (!where.to || m.to.includes(where.to)) &&
          (!where.promise || m.promise === where.promise) &&
          (!where.kind || m.kind === where.kind),
      );
    if (hit) return hit;
  }
  return undefined;
}

/** The recorded check of a promise in an earlier phase. */
function promiseCheck(c: Ctx, phase: string, from: Power, promised: string) {
  return c.match.turns.find((t) => t.phase === phase)?.promises.find((p) => p.from === from && p.promised === promised);
}

// ---------------------------------------------------------------------------------------------
// Authored dialogue. Each line runs only when its guard holds on the current board and record.

interface Line {
  phase: string;
  round: number;
  from: Power;
  /** Returns the message, or undefined when the board or the record does not support it. */
  make: (c: Ctx) => Omit<Draft, 'from' | 'round'> | undefined;
}

const LINES: Line[] = [
  // Spring 1901 · round 1 ------------------------------------------------------------------------
  {
    phase: 'S1901M',
    round: 0,
    from: 'FRANCE',
    make: (c) =>
      unitIn(c.board, 'FRANCE', 'BRE') === 'F BRE' && unitIn(c.board, 'ENGLAND', 'LON') === 'F LON'
        ? {
            to: ['ENGLAND'],
            kind: 'proposal',
            text: 'A quiet Channel benefits us both. My fleet in Brest will sail west into the Atlantic. Will you keep your London fleet out of the Channel?',
            promise: 'F BRE - MAO',
            request: 'Keep the London fleet out of the English Channel',
            provinces: ['ENG', 'BRE', 'MAO', 'LON'],
          }
        : undefined,
  },
  {
    phase: 'S1901M',
    round: 0,
    from: 'FRANCE',
    make: (c) =>
      unitIn(c.board, 'FRANCE', 'PAR') && unitIn(c.board, 'GERMANY', 'MUN')
        ? {
            to: ['GERMANY'],
            kind: 'proposal',
            text: 'Belgium would make a useful buffer between us. Leave it to me, and my army will not press Munich from Burgundy.',
            request: 'Leave Belgium to France',
            provinces: ['BEL', 'BUR', 'MUN'],
          }
        : undefined,
  },
  {
    phase: 'S1901M',
    round: 0,
    from: 'GERMANY',
    make: (c) =>
      unitIn(c.board, 'GERMANY', 'MUN') === 'A MUN'
        ? {
            to: ['AUSTRIA', 'ITALY'],
            kind: 'alliance',
            text: 'Three neighbors, one understanding: let us keep our shared borders quiet while we establish ourselves. My army in Munich goes west to the Ruhr, away from Tyrolia and Bohemia.',
            promise: 'A MUN - RUH',
            request: 'Keep Tyrolia and Bohemia empty this spring',
            provinces: ['TYR', 'BOH', 'MUN', 'RUH'],
          }
        : undefined,
  },
  {
    phase: 'S1901M',
    round: 0,
    from: 'AUSTRIA',
    make: (c) =>
      unitIn(c.board, 'AUSTRIA', 'VIE') && unitIn(c.board, 'RUSSIA', 'WAR')
        ? {
            to: ['RUSSIA'],
            kind: 'proposal',
            text: 'Galicia makes us both nervous. I propose that neither of us enters it this spring. Can we settle our border without a lasting conflict?',
            request: 'Keep the Warsaw army out of Galicia',
            provinces: ['GAL', 'VIE', 'WAR'],
          }
        : undefined,
  },
  {
    phase: 'S1901M',
    round: 0,
    from: 'RUSSIA',
    make: (c) =>
      unitIn(c.board, 'RUSSIA', 'SEV') === 'F SEV' && unitIn(c.board, 'TURKEY', 'ANK') === 'F ANK'
        ? {
            to: ['TURKEY'],
            kind: 'proposal',
            text: 'The Black Sea is a door into both our homes. If we both order our fleets into it, the moves bounce and neither of us holds it. Safer than taking each other on trust.',
            promise: 'F SEV - BLA',
            request: 'Order the Ankara fleet into the Black Sea so the moves bounce',
            provinces: ['BLA', 'SEV', 'ANK'],
          }
        : undefined,
  },
  // Spring 1901 · round 2 ------------------------------------------------------------------------
  {
    phase: 'S1901M',
    round: 1,
    from: 'ENGLAND',
    make: (c) => {
      const offer = findMessage(c, { from: 'FRANCE', to: 'ENGLAND', phase: 'S1901M', promise: 'F BRE - MAO' });
      return offer && unitIn(c.board, 'ENGLAND', 'LON') === 'F LON'
        ? {
            to: ['FRANCE'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'accept',
            text: 'Agreed. My London fleet sails north to the North Sea, and the Channel stays empty. A peaceful Channel lets us both look elsewhere.',
            promise: 'F LON - NTH',
            provinces: ['ENG', 'NTH', 'LON'],
          }
        : undefined;
    },
  },
  {
    phase: 'S1901M',
    round: 1,
    from: 'GERMANY',
    make: (c) => {
      const offer = findMessage(c, { from: 'FRANCE', to: 'GERMANY', phase: 'S1901M' });
      return offer
        ? {
            to: ['FRANCE'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'counter',
            text: 'Belgium for you only if Holland is mine, and your army in Burgundy stays out of Munich and the Ruhr this year.',
            request: 'Agree that Holland is German; keep the Burgundy army out of Munich and the Ruhr',
            provinces: ['BEL', 'HOL', 'BUR', 'MUN', 'RUH'],
          }
        : undefined;
    },
  },
  {
    phase: 'S1901M',
    round: 1,
    from: 'ITALY',
    make: (c) => {
      const offer = findMessage(c, { from: 'GERMANY', to: 'ITALY', phase: 'S1901M', kind: 'alliance' });
      return offer && unitIn(c.board, 'ITALY', 'VEN') === 'A VEN'
        ? {
            to: ['GERMANY', 'AUSTRIA'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'accept',
            text: 'I can keep my army in Venice still this spring. There is room enough for all three of us to begin without turning on one another.',
            promise: 'A VEN H',
            provinces: ['VEN', 'TYR'],
          }
        : undefined;
    },
  },
  {
    phase: 'S1901M',
    round: 1,
    from: 'TURKEY',
    make: (c) => {
      const offer = findMessage(c, { from: 'RUSSIA', to: 'TURKEY', phase: 'S1901M', promise: 'F SEV - BLA' });
      return offer && unitIn(c.board, 'TURKEY', 'ANK') === 'F ANK'
        ? {
            to: ['RUSSIA'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'accept',
            text: 'Agreed. A bounce marks the boundary. My Ankara fleet will order into the Black Sea, and we can discuss the Balkans once the sea is settled.',
            promise: 'F ANK - BLA',
            provinces: ['BLA', 'ANK', 'SEV'],
          }
        : undefined;
    },
  },
  // Autumn 1901 ----------------------------------------------------------------------------------
  {
    phase: 'F1901M',
    round: 0,
    from: 'ENGLAND',
    make: (c) => {
      const broken = promiseCheck(c, 'S1901M', 'FRANCE', 'F BRE - MAO');
      const offer = findMessage(c, { from: 'FRANCE', to: 'ENGLAND', phase: 'S1901M', promise: 'F BRE - MAO' });
      if (!broken || !offer) return undefined;
      if (!broken.kept && unitIn(c.board, 'FRANCE', 'ENG'))
        return {
          to: ['FRANCE'],
          kind: 'threat',
          replyTo: offer.id,
          text: 'You promised the Atlantic. Your fleet is in the Channel. My next orders will account for what you did, not what you said.',
          request: 'Take your fleet out of the English Channel',
          provinces: ['ENG', 'LON', 'MAO'],
        };
      if (broken.kept)
        return {
          to: ['FRANCE'],
          kind: 'reply',
          replyTo: offer.id,
          text: 'You kept your word on the Channel, and I kept mine. My fleets look north this autumn.',
          provinces: ['ENG', 'NTH', 'NWY'],
        };
      return undefined;
    },
  },
  {
    phase: 'F1901M',
    round: 0,
    from: 'TURKEY',
    make: (c) => {
      const sea = promiseCheck(c, 'S1901M', 'TURKEY', 'F ANK - BLA');
      return sea?.kept && unitIn(c.board, 'TURKEY', 'ANK') === 'F ANK' && unitIn(c.board, 'RUSSIA', 'SEV') === 'F SEV'
        ? {
            to: ['RUSSIA'],
            kind: 'proposal',
            text: 'The sea stayed empty, as we agreed. This autumn I keep my fleet in Ankara if your Sevastopol fleet stays in port too.',
            promise: 'F ANK H',
            request: 'Keep the Sevastopol fleet in port',
            provinces: ['BLA', 'ANK', 'SEV'],
          }
        : undefined;
    },
  },
  {
    phase: 'F1901M',
    round: 1,
    from: 'FRANCE',
    make: (c) => {
      const threat = findMessage(c, { from: 'ENGLAND', to: 'FRANCE', phase: 'F1901M', kind: 'threat' });
      return threat && unitIn(c.board, 'FRANCE', 'ENG') === 'F ENG'
        ? {
            to: ['ENGLAND'],
            kind: 'reply',
            replyTo: threat.id,
            response: 'accept',
            text: 'The fleet leaves the Channel for Belgium, not for London. I understand that reassurance is more expensive now.',
            promise: 'F ENG - BEL',
            provinces: ['ENG', 'BEL', 'LON'],
          }
        : undefined;
    },
  },
  {
    phase: 'F1901M',
    round: 1,
    from: 'RUSSIA',
    make: (c) => {
      const offer = findMessage(c, { from: 'TURKEY', to: 'RUSSIA', phase: 'F1901M', promise: 'F ANK H' });
      return offer && unitIn(c.board, 'RUSSIA', 'SEV') === 'F SEV'
        ? {
            to: ['TURKEY'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'accept',
            text: 'Agreed. My fleet stays in Sevastopol. Rumania is where my army is going.',
            promise: 'F SEV H',
            provinces: ['SEV', 'BLA', 'RUM'],
          }
        : undefined;
    },
  },
  // Spring 1902 ----------------------------------------------------------------------------------
  {
    phase: 'S1902M',
    round: 0,
    from: 'ENGLAND',
    make: (c) => {
      const brokenBefore = c.match.turns.some((t) => t.promises.some((p) => p.from === 'FRANCE' && p.to.includes('ENGLAND') && !p.kept));
      const french = unitIn(c.board, 'FRANCE', 'BEL');
      return brokenBefore && french && isLegal(c, 'GERMANY', 'A HOL S F ENG - BEL') && isLegal(c, 'ENGLAND', 'F ENG - BEL')
        ? {
            to: ['GERMANY'],
            kind: 'proposal',
            text: 'France broke its word on the Channel and now sits in Belgium. If your army in Holland supports my fleet from the Channel into Belgium, Belgium is mine and Holland, Denmark, and Helgoland stay yours.',
            promise: 'F ENG - BEL',
            request: 'Support the Channel fleet into Belgium from Holland',
            provinces: ['BEL', 'ENG', 'HOL'],
          }
        : undefined;
    },
  },
  {
    phase: 'S1902M',
    round: 0,
    from: 'FRANCE',
    make: (c) =>
      unitIn(c.board, 'FRANCE', 'BEL') && unitIn(c.board, 'FRANCE', 'BRE') === 'F BRE' && unitIn(c.board, 'ENGLAND', 'ENG')
        ? {
            to: ['ENGLAND'],
            kind: 'proposal',
            text: 'Let us close the Channel quarrel. Belgium stays French, and my fleet in Brest stays in port.',
            promise: 'F BRE H',
            request: 'Keep your fleets out of Belgium and Brest',
            provinces: ['BEL', 'BRE', 'ENG'],
          }
        : undefined,
  },
  {
    phase: 'S1902M',
    round: 0,
    from: 'RUSSIA',
    make: (c) =>
      unitIn(c.board, 'RUSSIA', 'SEV') === 'F SEV' && unitIn(c.board, 'RUSSIA', 'RUM')
        ? {
            to: ['TURKEY'],
            kind: 'proposal',
            text: 'Our Black Sea arrangement has held twice. Let it stay empty again this spring: my fleet stays in Sevastopol.',
            promise: 'F SEV H',
            request: 'Keep the Ankara fleet out of the Black Sea',
            provinces: ['BLA', 'SEV', 'ANK'],
          }
        : undefined,
  },
  {
    phase: 'S1902M',
    round: 0,
    from: 'TURKEY',
    make: (c) => {
      const offer = findMessage(c, { from: 'RUSSIA', to: 'TURKEY', phase: 'S1902M' });
      return offer && unitIn(c.board, 'RUSSIA', 'RUM') && unitIn(c.board, 'TURKEY', 'BUL')
        ? {
            to: ['RUSSIA'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'counter',
            text: 'The sea can stay empty, but your army in Rumania sits on my Bulgarian border. Pull it back to Ukraine and I will hold Bulgaria still.',
            request: 'Move the Rumania army back to Ukraine',
            provinces: ['RUM', 'BUL', 'UKR', 'BLA'],
          }
        : undefined;
    },
  },
  {
    phase: 'S1902M',
    round: 1,
    from: 'ENGLAND',
    make: (c) => {
      const offer = findMessage(c, { from: 'FRANCE', to: 'ENGLAND', phase: 'S1902M', promise: 'F BRE H' });
      const broken = promiseCheck(c, 'S1901M', 'FRANCE', 'F BRE - MAO');
      return offer && broken && !broken.kept
        ? {
            to: ['FRANCE'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'decline',
            text: 'No. Last spring your promise about Brest’s fleet was worth nothing. I will judge Belgium by orders, not offers.',
            provinces: ['BEL', 'BRE'],
          }
        : undefined;
    },
  },
  {
    phase: 'S1902M',
    round: 1,
    from: 'GERMANY',
    make: (c) => {
      const offer = findMessage(c, { from: 'ENGLAND', to: 'GERMANY', phase: 'S1902M', promise: 'F ENG - BEL' });
      return offer && isLegal(c, 'GERMANY', 'A HOL S F ENG - BEL')
        ? {
            to: ['ENGLAND'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'accept',
            text: 'Agreed. My army in Holland supports your fleet into Belgium. Keep your fleets out of Helgoland and Denmark in return.',
            promise: 'A HOL S F ENG - BEL',
            request: 'Keep British fleets out of Helgoland and Denmark',
            provinces: ['BEL', 'HOL', 'HEL', 'DEN'],
          }
        : undefined;
    },
  },
  // Autumn 1902 ----------------------------------------------------------------------------------
  {
    phase: 'F1902M',
    round: 0,
    from: 'ENGLAND',
    make: (c) =>
      unitIn(c.board, 'ENGLAND', 'BEL') && unitIn(c.board, 'GERMANY', 'HOL')
        ? {
            to: ['GERMANY'],
            kind: 'proposal',
            text: 'Belgium is taken, as we agreed. My fleet holds it this autumn; Holland and Denmark remain yours.',
            promise: `${unitIn(c.board, 'ENGLAND', 'BEL')} H`,
            provinces: ['BEL', 'HOL', 'DEN'],
          }
        : undefined,
  },
  {
    phase: 'F1902M',
    round: 0,
    from: 'TURKEY',
    make: (c) =>
      unitIn(c.board, 'TURKEY', 'BUL') && unitIn(c.board, 'RUSSIA', 'RUM') && isLegal(c, 'TURKEY', 'A BUL - RUM')
        ? {
            to: ['RUSSIA'],
            kind: 'threat',
            text: 'Your army is still in Rumania. If it stays there, I will treat it as a threat to Bulgaria.',
            request: 'Leave Rumania',
            provinces: ['RUM', 'BUL'],
          }
        : undefined,
  },
  // Spring 1903: a quiet exchange --------------------------------------------------------------
  {
    phase: 'S1903M',
    round: 0,
    from: 'AUSTRIA',
    make: (c) =>
      unitIn(c.board, 'ITALY', 'VEN') && unitIn(c.board, 'AUSTRIA', 'TRI')
        ? {
            to: ['ITALY'],
            kind: 'proposal',
            text: 'Our border has been quiet for two years. Let us keep Venice, Tyrolia, and Trieste exactly as they are this spring.',
            request: 'Keep the Venice army where it is',
            provinces: ['VEN', 'TYR', 'TRI'],
          }
        : undefined,
  },
  {
    phase: 'S1903M',
    round: 1,
    from: 'ITALY',
    make: (c) => {
      const offer = findMessage(c, { from: 'AUSTRIA', to: 'ITALY', phase: 'S1903M' });
      return offer
        ? {
            to: ['AUSTRIA'],
            kind: 'reply',
            replyTo: offer.id,
            response: 'accept',
            text: 'Agreed. Nothing moves on our border this spring.',
            provinces: ['VEN', 'TRI'],
          }
        : undefined;
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Generic, state-aware talks for phases without authored lines (later sample phases and sandbox).

/**
 * At most one short message per country per phase, in the first round only, and only for a
 * concrete situation on the board: one of its own planned moves heads next to a neighbor's home
 * center. The message states that planned order as a promise, so it is true by construction. The
 * policy never reads messages, so they change nothing; they make the record honest to read.
 */
function genericMessages(c: Ctx): Draft[] {
  if (c.round > 0) return [];
  const turnNo = c.match.turns.length;
  // Countries take turns speaking, so a phase never fills with seven identical notes.
  if ((POWERS.indexOf(c.power) + turnNo) % 3 !== 0) return [];
  const orders = planOrders(c.match, c.power);
  for (const order of orders) {
    const r = describeOrder(order);
    if (r.kind !== 'move' || !r.target) continue;
    const neighbor = POWERS.find(
      (p) =>
        p !== c.power &&
        c.board.units[p].length &&
        !c.board.centers[p].includes(r.target!) &&
        c.board.homes[p].some((h) => h !== r.target && near(h, r.target!)),
    );
    if (!neighbor) continue;
    return [
      {
        from: c.power,
        to: [neighbor],
        round: c.round,
        kind: 'proposal',
        text: `My ${r.unit.startsWith('F') ? 'fleet' : 'army'} is moving to ${provinceIn(r.target)}. It is not aimed at your home centers; keep yours where they are and our border stays calm.`,
        promise: order,
        request: 'Keep your units at home this season',
        provinces: [r.target, r.origin],
      },
    ];
  }
  return [];
}

function provinceIn(code: string) {
  return describeOrder(`A ${code} H`).summary.replace(/^Army /, '').replace(/ holds its position$/, '');
}

function near(a: string, b: string) {
  const p = coords[a];
  const q = coords[b];
  return Boolean(p && q && Math.hypot(p.x - q.x, p.y - q.y) < 170);
}

export function sampleMessages(match: Match, power: Power, round: number): Draft[] {
  const cp = match.checkpoints.at(-1)!;
  const phase = cp.state.board.name;
  if (!phase.endsWith('M')) return [];
  const c: Ctx = { match, power, round, phase, board: cp.state.board, legal: cp.state.legal };
  const authoredPhase = LINES.some((l) => l.phase === phase);
  const out: Draft[] = [];
  for (const line of LINES) {
    if (line.phase !== phase || line.round !== round || line.from !== power) continue;
    const m = line.make(c);
    if (!m) continue;
    // A promise must be legal now; otherwise the line's words would not hold on this board.
    if (m.promise && !isLegal(c, power, m.promise)) continue;
    out.push({ ...m, from: power, round });
  }
  if (!authoredPhase) out.push(...genericMessages(c));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Deterministic order policy.

function hash(text: string) {
  return [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
}

function distance(a: string, b: string) {
  const p = coords[a] ?? coords[baseProvince(a)];
  const q = coords[b] ?? coords[baseProvince(b)];
  return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 9999;
}

/** Share of fleets each country aims for when it builds. Geography only. */
const FLEET_SHARE: Record<Power, number> = {
  ENGLAND: 0.75,
  FRANCE: 0.4,
  GERMANY: 0.3,
  ITALY: 0.45,
  AUSTRIA: 0.2,
  RUSSIA: 0.35,
  TURKEY: 0.4,
};

interface Option {
  loc: string;
  order: string;
  score: number;
  /** Own unit whose support this move needs, and the support order it would give. */
  needs?: { loc: string; order: string };
}

/**
 * Orders for one country, from the board and legal orders only. Deterministic: the same position
 * and profile always give the same orders. Authored orders for the phase are preferred when legal.
 */
export function planOrders(match: Match, power: Power): string[] {
  const cp = match.checkpoints.at(-1)!;
  const { board, legal } = cp.state;
  const groups = legal[power] ?? {};
  const phase = board.name;
  const profile = cp.configs[power].profile;
  const authored = AUTHORED_ORDERS[phase]?.[power] ?? [];
  if (phase.endsWith('A')) return adjustments(board, power, groups, authored);
  if (phase.endsWith('R')) return retreats(board, power, groups);

  const autumn = phase.startsWith('F');
  const own = new Set(board.centers[power]);
  const unitAt = new Map<string, Power>();
  for (const p of POWERS) for (const u of board.units[p]) unitAt.set(locOf(u), p);
  const reachBy = new Map<string, Set<Power>>();
  for (const p of POWERS) {
    if (p === power) continue;
    for (const options of Object.values(legal[p] ?? {}))
      for (const o of options) {
        const r = describeOrder(o);
        if (r.kind === 'move' && r.target) (reachBy.get(r.target) ?? reachBy.set(r.target, new Set()).get(r.target)!).add(p);
      }
  }
  const unowned = SUPPLY_CENTERS.filter((c) => !own.has(c));
  // Public record of the last phase: a move that just bounced is not simply repeated.
  const last = match.turns.at(-1);
  const bouncedLast = new Set(
    (last ? last.decisions[power].orders : []).filter((o) => (last!.results[describeOrder(o).unit] ?? []).includes('bounce')),
  );
  const nearestGoal = (loc: string) => Math.min(...unowned.map((c) => distance(loc, c)));

  const chosen = new Map<string, string>();
  for (const [loc, options] of Object.entries(groups)) {
    const pick = authored.find((o) => options.includes(o));
    if (pick) chosen.set(loc, pick);
  }

  const options: Option[] = [];
  for (const [loc, orders] of Object.entries(groups)) {
    if (chosen.has(loc) || !orders.length) continue;
    const unit = orders[0].split(' ').slice(0, 2).join(' ');
    const here = locOf(unit);
    for (const order of orders) {
      const r = describeOrder(order);
      const jitter = hash(order + phase + profile) % 17;
      if (r.kind === 'hold') {
        let score = 20 + jitter;
        if (SUPPLY_CENTERS.includes(here as (typeof SUPPLY_CENTERS)[number]) && !own.has(here) && autumn) score += 160;
        if (own.has(here) && reachBy.has(here)) score += 55;
        options.push({ loc, order, score });
        continue;
      }
      if (r.kind !== 'move' || !r.target || order.endsWith(' VIA')) continue;
      const t = r.target;
      const holder = unitAt.get(t);
      if (holder === power) continue;
      const contest = reachBy.get(t)?.size ?? 0;
      const center = SUPPLY_CENTERS.includes(t as (typeof SUPPLY_CENTERS)[number]);
      let score = jitter + Math.max(-40, Math.min(40, (nearestGoal(here) - nearestGoal(t)) * 0.3));
      if (center && !own.has(t)) score += autumn ? 130 : 95;
      if (center && own.has(t) && !holder && contest) score += autumn ? 110 : 40;
      score -= contest * 22;
      if (bouncedLast.has(order)) score -= 70;
      if (SUPPLY_CENTERS.includes(here as (typeof SUPPLY_CENTERS)[number]) && !own.has(here) && autumn) score -= 120;
      if (holder) {
        // A held province falls only to a supported attack. Look for one of our own units to back it.
        const support = Object.entries(groups).find(
          ([l, os]) => l !== loc && !chosen.has(l) && os.includes(`${os[0].split(' ').slice(0, 2).join(' ')} S ${unit} - ${order.split(' - ')[1]}`),
        );
        if (!support || !center) continue;
        const supporter = support[1][0].split(' ').slice(0, 2).join(' ');
        options.push({ loc, order, score: score + 40, needs: { loc: support[0], order: `${supporter} S ${unit} - ${order.split(' - ')[1]}` } });
        continue;
      }
      options.push({ loc, order, score });
    }
  }
  options.sort((a, b) => b.score - a.score || a.order.localeCompare(b.order));
  const targets = new Set([...chosen.values()].map((o) => describeOrder(o).target).filter(Boolean));
  for (const o of options) {
    if (chosen.has(o.loc)) continue;
    const target = describeOrder(o.order).target;
    if (target && targets.has(target)) continue;
    if (o.needs && chosen.has(o.needs.loc)) continue;
    chosen.set(o.loc, o.order);
    if (target) targets.add(target);
    if (o.needs) chosen.set(o.needs.loc, o.needs.order);
  }
  // A unit moving into a province one of our units is leaving is fine; one we keep is not.
  for (const [loc, order] of chosen) {
    const target = describeOrder(order).target;
    if (!target || describeOrder(order).kind !== 'move') continue;
    const stayer = [...chosen.entries()].find(([l, o]) => l !== loc && locOf(o.split(' ').slice(0, 2).join(' ')) === target && describeOrder(o).kind !== 'move');
    if (stayer) chosen.set(loc, `${order.split(' ').slice(0, 2).join(' ')} H`);
  }
  return Object.keys(groups)
    .filter((loc) => groups[loc].length)
    .map((loc) => chosen.get(loc) ?? groups[loc].find((o) => o.endsWith(' H')) ?? groups[loc][0]);
}

function retreats(board: Board, power: Power, groups: Record<string, string[]>) {
  const used = new Set<string>();
  const own = new Set(board.centers[power]);
  return Object.entries(groups)
    .filter(([, options]) => options.length)
    .map(([, options]) => {
      const moves = options
        .filter((o) => o.includes(' R '))
        .map((o) => ({ o, t: baseProvince(o.split(' R ')[1]) }))
        .filter(({ t }) => !used.has(t))
        .sort((a, b) => Number(own.has(b.t)) - Number(own.has(a.t)) || a.o.localeCompare(b.o));
      const pick = moves[0];
      if (pick) {
        used.add(pick.t);
        return pick.o;
      }
      return options.find((o) => o.endsWith(' D')) ?? options[0];
    });
}

function adjustments(board: Board, power: Power, groups: Record<string, string[]>, authored: string[]) {
  const count = board.builds[power].count;
  if (!count) return [];
  const options = Object.values(groups).flat();
  if (count > 0) {
    const orders: string[] = [];
    let fleets = board.units[power].filter((u) => u.startsWith('F')).length;
    let total = board.units[power].length;
    const used = new Set<string>();
    for (const o of authored) {
      if (orders.length >= count) break;
      if (options.includes(o) && !used.has(describeOrder(o).origin)) {
        orders.push(o);
        used.add(describeOrder(o).origin);
        total++;
        if (o.startsWith('F')) fleets++;
      }
    }
    for (const [loc, opts] of Object.entries(groups)) {
      if (orders.length >= count) break;
      if (used.has(baseProvince(loc)) || !opts.some((o) => o.endsWith(' B'))) continue;
      const wantFleet = fleets / Math.max(1, total) < FLEET_SHARE[power];
      const pick = opts.find((o) => o.endsWith(' B') && o.startsWith(wantFleet ? 'F' : 'A')) ?? opts.find((o) => o.endsWith(' B'))!;
      orders.push(pick);
      used.add(baseProvince(loc));
      total++;
      if (pick.startsWith('F')) fleets++;
    }
    return orders;
  }
  // Disbands: the units farthest from any center the country owns go first.
  const own = board.centers[power];
  const disbands = options
    .filter((o) => o.endsWith(' D'))
    .sort((a, b) => {
      const da = Math.min(...own.map((c) => distance(describeOrder(a).origin, c)));
      const db = Math.min(...own.map((c) => distance(describeOrder(b).origin, c)));
      return db - da || a.localeCompare(b);
    });
  return disbands.slice(0, -count);
}

// ---------------------------------------------------------------------------------------------
// Decisions: orders plus a short public explanation, memory, and trust read from the record.

/** Trust read only from recorded promise checks toward this country. */
function trustFrom(match: Match, power: Power) {
  return powerMap((other) => {
    if (other === power) return 0;
    let trust = 15;
    for (const t of match.turns)
      for (const p of t.promises)
        if (p.from === other && p.to.includes(power)) trust += p.kept ? 10 : -50;
    return Math.max(-100, Math.min(100, trust));
  });
}

function explain(match: Match, power: Power, orders: string[]) {
  const phase = match.checkpoints.at(-1)!.state.board.name;
  const who = NATIONS[power].name;
  if (power === 'FRANCE' && phase === 'S1901M' && orders.includes('F BRE - ENG'))
    return 'The Channel offers leverage over Britain and a route to Belgium. France breaks its promised Atlantic move to take that position, at the cost of British trust.';
  if (power === 'ENGLAND' && orders.includes('F ENG - BEL'))
    return 'Britain answers the broken Channel promise with force: with German support, its fleet attacks the French fleet in Belgium.';
  if (power === 'GERMANY' && orders.includes('A HOL S F ENG - BEL'))
    return 'Germany backs Britain into Belgium, trading support for a quiet North Sea border.';
  const moves = orders.map(describeOrder).filter((r) => r.kind === 'move' || r.kind === 'build' || r.kind === 'retreat');
  const lead = moves.slice(0, 2).map((r) => r.summary.charAt(0).toLowerCase() + r.summary.slice(1));
  const body = lead.length ? `${who}: ${lead.join('; ')}.` : `${who} holds its positions.`;
  return `${body} Chosen by the fixed teaching policy, not an AI model.`;
}

export function sampleDecision(match: Match, power: Power): Decision {
  const phase = match.checkpoints.at(-1)!.state.board.name;
  const orders = planOrders(match, power);
  const betrayal = power === 'FRANCE' && phase === 'S1901M' && orders.includes('F BRE - ENG');
  return {
    orders,
    explanation: explain(match, power, orders),
    memory: betrayal
      ? 'We promised Britain an Atlantic move but entered the Channel. Expect suspicion and defensive British orders.'
      : `After ${phase}, remember the public moves and the commitments exchanged with our neighbors.`,
    relationships: trustFrom(match, power),
  };
}
