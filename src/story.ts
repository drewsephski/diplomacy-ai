import { NATIONS, phaseKind } from './domain';
import { POWERS, type EngineState, type Match, type Power } from './types';

/**
 * Plain-language readings of recorded facts. Everything here derives from engine-adjudicated
 * checkpoints, submitted orders, and promise checks. Nothing infers intent or hidden plans.
 */

export const PROVINCES: Record<string, string> = {
  ADR: 'Adriatic Sea',
  AEG: 'Aegean Sea',
  ALB: 'Albania',
  ANK: 'Ankara',
  APU: 'Apulia',
  ARM: 'Armenia',
  BAL: 'Baltic Sea',
  BAR: 'Barents Sea',
  BEL: 'Belgium',
  BER: 'Berlin',
  BLA: 'Black Sea',
  BOH: 'Bohemia',
  BOT: 'Gulf of Bothnia',
  BRE: 'Brest',
  BUD: 'Budapest',
  BUL: 'Bulgaria',
  BUR: 'Burgundy',
  CLY: 'Clyde',
  CON: 'Constantinople',
  DEN: 'Denmark',
  EAS: 'Eastern Mediterranean',
  EDI: 'Edinburgh',
  ENG: 'English Channel',
  FIN: 'Finland',
  GAL: 'Galicia',
  GAS: 'Gascony',
  GOL: 'Gulf of Lyon',
  GRE: 'Greece',
  HEL: 'Helgoland Bight',
  HOL: 'Holland',
  ION: 'Ionian Sea',
  IRI: 'Irish Sea',
  KIE: 'Kiel',
  LON: 'London',
  LVN: 'Livonia',
  LVP: 'Liverpool',
  LYO: 'Gulf of Lyon',
  MAO: 'Mid-Atlantic Ocean',
  MAR: 'Marseilles',
  MOS: 'Moscow',
  MUN: 'Munich',
  NAF: 'North Africa',
  NAO: 'North Atlantic Ocean',
  NAP: 'Naples',
  NTH: 'North Sea',
  NWG: 'Norwegian Sea',
  NWY: 'Norway',
  PAR: 'Paris',
  PIC: 'Picardy',
  PIE: 'Piedmont',
  POR: 'Portugal',
  PRU: 'Prussia',
  ROM: 'Rome',
  RUH: 'Ruhr',
  RUM: 'Rumania',
  SAR: 'Sardinia',
  SER: 'Serbia',
  SEV: 'Sevastopol',
  SIL: 'Silesia',
  SKA: 'Skagerrak',
  SMY: 'Smyrna',
  SPA: 'Spain',
  STP: 'St. Petersburg',
  SWE: 'Sweden',
  SYR: 'Syria',
  TRI: 'Trieste',
  TUN: 'Tunis',
  TUS: 'Tuscany',
  TYR: 'Tyrolia',
  TYS: 'Tyrrhenian Sea',
  UKR: 'Ukraine',
  VEN: 'Venice',
  VIE: 'Vienna',
  WAL: 'Wales',
  WAR: 'Warsaw',
  WES: 'Western Mediterranean',
  YOR: 'Yorkshire',
};

/** The 34 supply centers of the standard map (base codes). */
export const SUPPLY_CENTERS = [
  'ANK', 'BEL', 'BER', 'BRE', 'BUD', 'BUL', 'CON', 'DEN', 'EDI', 'GRE', 'HOL', 'KIE',
  'LON', 'LVP', 'MAR', 'MOS', 'MUN', 'NAP', 'NWY', 'PAR', 'POR', 'ROM', 'RUM', 'SER',
  'SEV', 'SMY', 'SPA', 'STP', 'SWE', 'TRI', 'TUN', 'VEN', 'VIE', 'WAR',
] as const;

const COASTS: Record<string, string> = {
  NC: 'north coast',
  SC: 'south coast',
  EC: 'east coast',
};

/** "BUR" → "Burgundy"; "STP/SC" → "St. Petersburg (south coast)". Unknown codes stay as codes. */
export function provinceName(code: string) {
  const [base, coast] = code.split('/');
  const name = PROVINCES[base] ?? base;
  return coast ? `${name} (${COASTS[coast] ?? coast})` : name;
}

/** Base province of a location, without a coast suffix: "STP/SC" → "STP". */
export function baseProvince(code: string) {
  return code.split('/')[0];
}

const UNIT_WORDS: Record<string, string> = { A: 'Army', F: 'Fleet' };

/** "A PAR" → "Army Paris". Pass `lowerType` mid-sentence: "army Paris"; province names keep their capitals. */
function unitPhrase(unit: string, lowerType = false) {
  const [type, loc = ''] = unit.replace('*', '').split(' ');
  const word = UNIT_WORDS[type] ?? 'Unit';
  return `${lowerType ? word.toLowerCase() : word} ${provinceName(loc)}`;
}

export interface OrderReading {
  kind: 'hold' | 'move' | 'support' | 'convoy' | 'retreat' | 'build' | 'disband' | 'unknown';
  /** Unit that issues the order, such as "A PAR". */
  unit: string;
  /** Province where that unit starts (base code). */
  origin: string;
  /** Destination province for moves, retreats, and the target of supports or convoys. */
  target?: string;
  /** Plain-language action, such as "Army Paris moves to Burgundy". */
  summary: string;
  /** Exact order as submitted to the engine. */
  exact: string;
}

/** Translates one legal Diplomacy order into a readable action while keeping the exact text. */
export function describeOrder(order: string): OrderReading {
  const t = order.trim().split(/\s+/);
  const unit = `${t[0] ?? ''} ${t[1] ?? ''}`.trim();
  const origin = baseProvince(t[1] ?? '');
  const exact = order.trim();
  const base = { unit, origin, exact };
  const self = unitPhrase(unit);
  if (t[2] === 'H') return { ...base, kind: 'hold', summary: `${self} holds its position` };
  if (t[2] === 'B')
    return { ...base, kind: 'build', summary: `Build ${unitPhrase(unit, true).replace(' ', ' in ')}` };
  if (t[2] === 'D') return { ...base, kind: 'disband', summary: `${self} disbands` };
  if (t[2] === 'R' && t[3]) {
    const target = baseProvince(t[3]);
    return {
      ...base,
      kind: 'retreat',
      target,
      summary: `${self} retreats to ${provinceName(t[3])}`,
    };
  }
  if (t[2] === '-' && t[3]) {
    const target = baseProvince(t[3]);
    return { ...base, kind: 'move', target, summary: `${self} moves to ${provinceName(t[3])}` };
  }
  if (t[2] === 'S') {
    const dash = t.indexOf('-', 4);
    const supported = `${t[3] ?? ''} ${t[4] ?? ''}`;
    if (dash > 0 && t[dash + 1]) {
      const target = baseProvince(t[dash + 1]);
      return {
        ...base,
        kind: 'support',
        target,
        summary: `${self} supports ${unitPhrase(supported, true)} moving to ${provinceName(t[dash + 1])}`,
      };
    }
    return {
      ...base,
      kind: 'support',
      target: baseProvince(t[4] ?? ''),
      summary: `${self} supports ${unitPhrase(supported, true)} to hold`,
    };
  }
  if (t[2] === 'C' && t[3] && t[4]) {
    const dash = t.indexOf('-', 5);
    const carried = `${t[3]} ${t[4]}`;
    const target = dash > 0 && t[dash + 1] ? baseProvince(t[dash + 1]) : undefined;
    return {
      ...base,
      kind: 'convoy',
      target,
      summary: target
        ? `${self} convoys ${unitPhrase(carried, true)} to ${provinceName(t[dash + 1])}`
        : `${self} convoys ${unitPhrase(carried, true)}`,
    };
  }
  return { ...base, kind: 'unknown', summary: exact };
}

const SEA_NAME = /\b(Sea|Ocean|Channel|Gulf|Bight|Skagerrak|Mediterranean)\b/;

/** A province in a sentence: "Brest", "the English Channel". */
export function placePhrase(code: string) {
  const name = provinceName(code);
  return SEA_NAME.test(name) ? `the ${name}` : name;
}

/** "the fleet in Brest", "the army in the Ruhr"-style phrase for a unit. */
function unitIn(unit: string) {
  const [type, loc = ''] = unit.replace('*', '').split(' ');
  return `the ${type === 'F' ? 'fleet' : type === 'A' ? 'army' : 'unit'} in ${placePhrase(loc)}`;
}

/**
 * One order as a plain sentence, without notation: "The fleet in Brest moves to the Mid-Atlantic
 * Ocean", "The army in Holland supports the fleet in the English Channel into Belgium". The exact
 * engine text stays available separately; this is the reading shown first.
 */
export function plainOrder(order: string): string {
  if (order === 'No order issued') return 'No order was issued for that unit';
  const r = describeOrder(order);
  const t = order.trim().split(/\s+/);
  const self = unitIn(r.unit);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  switch (r.kind) {
    case 'hold':
      return cap(`${self} holds`);
    case 'move':
      return cap(`${self} moves to ${placePhrase(t[3] ?? r.target ?? '')}${order.trim().endsWith(' VIA') ? ' by convoy' : ''}`);
    case 'retreat':
      return cap(`${self} retreats to ${placePhrase(t[3] ?? r.target ?? '')}`);
    case 'support': {
      const supported = unitIn(`${t[3] ?? ''} ${t[4] ?? ''}`);
      const dash = t.indexOf('-', 4);
      return dash > 0 && t[dash + 1]
        ? cap(`${self} supports ${supported} into ${placePhrase(t[dash + 1])}`)
        : cap(`${self} supports ${supported} to hold`);
    }
    case 'convoy':
      return r.target ? cap(`${self} carries ${unitIn(`${t[3]} ${t[4]}`)} to ${placePhrase(r.target)}`) : cap(`${self} convoys ${unitIn(`${t[3]} ${t[4]}`)}`);
    case 'build':
      return `Build ${r.unit.startsWith('F') ? 'a fleet' : 'an army'} in ${placePhrase(t[1] ?? r.origin)}`;
    case 'disband':
      return cap(`${self} disbands`);
    default:
      return r.summary;
  }
}

/** Engine result tokens for a unit, rendered as plain outcomes. Empty means it succeeded. */
export function outcomeText(results: string[] | undefined): string {
  const tokens = (results ?? []).filter(Boolean);
  if (!tokens.length) return 'Succeeded';
  const words: Record<string, string> = {
    bounce: 'Bounced: no unit entered, and both sides stayed in place',
    dislodged: 'Dislodged by a stronger attack',
    'no convoy': 'Convoy failed: no fleet carried the army',
    cut: 'Support was cut by an attack',
    disrupted: 'Disrupted: a convoy route was broken',
    void: 'Void: the order was illegal at adjudication',
    disband: 'Disbanded',
  };
  return tokens.map((t) => words[t] ?? t).join('; ');
}

const LOSING = new Set(['bounce', 'dislodged', 'void', 'disrupted', 'no convoy', 'cut']);

export type MomentTone = 'broken' | 'kept-failed' | 'gain' | 'loss' | 'standoff' | 'invasion' | 'quiet';

export interface Moment {
  id: string;
  tone: MomentTone;
  /** Short category label: "Broken commitment", "Center gained", and so on. */
  label: string;
  headline: string;
  detail: string;
  /** Country this moment concerns, for a focused link. */
  power?: Power;
  /** Province to locate on the map. */
  province?: string;
  /** Exact order text shown in monospace, when the moment is about an order. */
  exact?: string;
  /** Exact promised order and the one actually submitted, for promise moments. */
  compare?: { promised: string; actual: string };
}

export interface Story {
  phase: string;
  title: string;
  recap: string;
  moments: Moment[];
  counts: { broken: number; kept: number; gained: number; lost: number; standoffs: number };
}

/** The power whose unit stood in `loc` when the phase began, if any. */
function occupantAt(state: EngineState, loc: string): Power | undefined {
  return POWERS.find((p) =>
    state.board.units[p].some((u) => baseProvince(u.replace('*', '').split(' ')[1] ?? '') === loc),
  );
}

function unitOwner(state: EngineState, unit: string): Power | undefined {
  const key = unit.replace('*', '');
  return POWERS.find((p) => state.board.units[p].some((u) => u.replace('*', '') === key));
}

function previousOwner(state: EngineState, loc: string): Power | undefined {
  return POWERS.find((p) => state.board.centers[p].includes(loc));
}

/**
 * Builds the story of one resolved phase. `turnIndex` is the position in `match.turns`, and the
 * before/after boards come from the adjacent checkpoints, so no future state is ever read.
 */
export function buildStory(match: Match, turnIndex: number): Story | undefined {
  const turn = match.turns[turnIndex];
  const before = match.checkpoints[turnIndex];
  const after = match.checkpoints[turnIndex + 1];
  if (!turn || !before || !after) return undefined;
  const moments: Moment[] = [];
  const counts = { broken: 0, kept: 0, gained: 0, lost: 0, standoffs: 0 };

  // 1. Commitments: broken promises first, then kept promises whose order still failed.
  for (const promise of turn.promises.filter((p) => !p.kept)) {
    counts.broken++;
    const promised = describeOrder(promise.promised);
    const issued = promise.actual === 'No order issued' ? undefined : describeOrder(promise.actual);
    moments.push({
      id: `broken-${promise.from}-${promise.promised}`,
      tone: 'broken',
      label: 'Broken commitment',
      headline: `${NATIONS[promise.from].name} promised: ${promised.summary}`,
      detail: issued
        ? `It submitted ${issued.summary.charAt(0).toLowerCase()}${issued.summary.slice(1)} instead. Promises are checked against the exact submitted order.`
        : 'It submitted no order for that unit, so the promise was not kept.',
      power: promise.from,
      province: promised.origin,
      compare: { promised: promise.promised, actual: promise.actual },
    });
  }
  for (const promise of turn.promises.filter((p) => p.kept)) {
    const results = turn.results[describeOrder(promise.promised).unit];
    if (results?.some((r) => LOSING.has(r))) {
      counts.kept++;
      const reading = describeOrder(promise.promised);
      moments.push({
        id: `kept-failed-${promise.from}-${promise.promised}`,
        tone: 'kept-failed',
        label: 'Order kept, outcome failed',
        headline: `${NATIONS[promise.from].name} kept its word and the order still failed`,
        detail: `${reading.summary}. ${outcomeText(results)}. The commitment matched the order; the board did not.`,
        power: promise.from,
        province: reading.origin,
        exact: promise.promised,
      });
    } else {
      counts.kept++;
    }
  }

  // 2. Supply centers that changed hands between the two adjacent checkpoints.
  for (const p of POWERS) {
    const gained = after.state.board.centers[p].filter((c) => !before.state.board.centers[p].includes(c));
    const lost = before.state.board.centers[p].filter((c) => !after.state.board.centers[p].includes(c));
    for (const loc of gained) {
      counts.gained++;
      const from = previousOwner(before.state, loc);
      moments.push({
        id: `gain-${p}-${loc}`,
        tone: 'gain',
        label: 'Supply center changed hands',
        headline: `${NATIONS[p].name} now holds ${provinceName(loc)}`,
        detail: from
          ? `It was held by ${NATIONS[from].name} at the start of this phase.`
          : 'It was neutral at the start of this phase.',
        power: p,
        province: loc,
      });
    }
    for (const loc of lost) {
      counts.lost++;
      const to = POWERS.find((q) => after.state.board.centers[q].includes(loc));
      moments.push({
        id: `loss-${p}-${loc}`,
        tone: 'loss',
        label: 'Supply center lost',
        headline: `${NATIONS[p].name} lost ${provinceName(loc)}`,
        detail: to ? `${NATIONS[to].name} now holds it.` : 'It is now neutral.',
        power: p,
        province: loc,
      });
    }
  }

  // 3. Movement outcomes: standoffs, dislodged units, and moves into occupied provinces.
  for (const p of POWERS) {
    for (const order of turn.decisions[p].orders) {
      const reading = describeOrder(order);
      const results = turn.results[reading.unit];
      if (reading.kind === 'move' && results?.includes('bounce')) {
        counts.standoffs++;
        const defender = reading.target ? occupantAt(before.state, reading.target) : undefined;
        moments.push({
          id: `standoff-${p}-${order}`,
          tone: 'standoff',
          label: 'Attempted invasion bounced',
          headline: `${NATIONS[p].name}: ${reading.summary}, and it bounced`,
          detail: defender
            ? `${NATIONS[defender].name} defended the province. Neither unit moved, so the attack failed.`
            : 'Two units contested the same province, and neither moved into it.',
          power: p,
          province: reading.target,
          exact: order,
        });
      } else if (reading.kind === 'move' && reading.target && !results?.length) {
        const target = occupantAt(before.state, reading.target);
        if (target && target !== p) {
          moments.push({
            id: `invasion-${p}-${order}`,
            tone: 'invasion',
            label: 'Successful move into occupied province',
            headline: `${NATIONS[p].name} moved into ${provinceName(reading.target)}`,
            detail: `The province was held by ${NATIONS[target].name} when the phase began. The move succeeded.`,
            power: p,
            province: reading.target,
            exact: order,
          });
        }
      }
    }
    for (const [unit, results] of Object.entries(turn.results)) {
      if (!results.includes('dislodged') || unitOwner(before.state, unit) !== p) continue;
      const loc = baseProvince(unit.split(' ')[1] ?? '');
      moments.push({
        id: `dislodged-${p}-${unit}`,
        tone: 'loss',
        label: 'Unit dislodged',
        headline: `${NATIONS[p].name}'s ${unitPhrase(unit, true)} was dislodged`,
        detail: 'It must retreat to an empty neighboring province next phase, or be disbanded.',
        power: p,
        province: loc,
      });
    }
  }

  // Priority order keeps the most consequential facts when the list is trimmed.
  const rank: Record<MomentTone, number> = {
    broken: 0,
    gain: 1,
    loss: 2,
    'kept-failed': 3,
    standoff: 4,
    invasion: 5,
    quiet: 6,
  };
  const ordered = moments.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 7);
  if (!ordered.length) {
    ordered.push({
      id: 'quiet',
      tone: 'quiet',
      label: 'Quiet phase',
      headline: 'No commitments broke and no supply center changed hands.',
      detail: 'Units held or moved without contest. Compare the orders below to see what was attempted.',
    });
  }

  return {
    phase: turn.phase,
    title: turn.title,
    recap: turn.recap,
    moments: ordered,
    counts,
  };
}

/** What a viewer should watch for in the phase that comes next, from the rules, not from guesses. */
export function watchNext(phase: string): string {
  const kind = phaseKind(phase);
  if (kind === 'Retreats')
    return 'Dislodged units must retreat to an empty neighboring province, or disband. Two retreats to the same province both fail.';
  if (kind === 'Adjustments')
    return 'Count each power’s supply centers against its units. Builds need an empty, owned home center; surplus units must disband.';
  return 'Watch supports and standoffs. A bounced attack leaves both units in place, while a supported attack can dislodge a defender.';
}

