import data from '../map-data.json';
import { NATIONS, phaseKind, phaseName } from '../domain';
import { baseProvince, describeOrder, plainOrder, provinceName, type OrderReading } from '../story';
import { POWERS, type Board, type Match, type Power } from '../types';

/**
 * Pure derivation of the guided walkthrough for ONE resolved phase.
 *
 * Every event is built from recorded facts only: the adjudicated results, the submitted orders,
 * the promise checks, the dispatches, and the two adjacent checkpoints. Nothing here reads a later
 * checkpoint or turn, infers hidden intent, or invents a treaty. Where the record cannot show a
 * cause, the copy says so.
 */

const coords = data.coords as Record<string, { x: number; y: number }>;
const centerPositions = data.centers as Record<string, { x: number; y: number }>;

export type GuidedKind =
  | 'broken-promise'
  | 'kept-promise-failed'
  | 'kept-promise'
  | 'center-gained'
  | 'center-lost'
  | 'dislodged'
  | 'standoff'
  | 'supported-attack'
  | 'attack-occupied'
  | 'convoy'
  | 'retreat'
  | 'adjustment'
  | 'talks';

export interface GuidedEvent {
  id: string;
  kind: GuidedKind;
  /** Short category shown above the headline, such as "Broken promise". */
  label: string;
  headline: string;
  /** Plain account of what the record shows. */
  happened: string;
  /** Rule-based or strategic implication. Never a claim about hidden intent. */
  matters: string;
  /** Countries involved; the first is the main actor. */
  powers: Power[];
  /** Base province to zoom to on the map. */
  focus?: string;
  /** Base provinces to highlight on the map. */
  highlight: string[];
  /** Exact engine order text, shown as optional detail. */
  exact: string[];
  /** The exact dispatch text, when the event is about something a country said. */
  quote?: { from: Power; text: string };
  /** The promised order and the submitted order, for promise events. */
  compare?: { promised: string; actual: string };
  priority: number;
}

export interface GuidedPhase {
  turn: number;
  phase: string;
  /** "Spring 1901 · movement". */
  season: string;
  title: string;
  /** Events shown as popups, in order. Never more than MAX_POPUPS. */
  events: GuidedEvent[];
  /** Headlines of events that were grouped out of the popups to keep the walk short. */
  overflow: string[];
  /** Routine holds and uncontested moves. Summarized, never shown as individual popups. */
  routine: number;
  orderCount: number;
}

export const MAX_POPUPS = 6;

const LOSING = new Set(['bounce', 'dislodged', 'void', 'disrupted', 'no convoy', 'cut']);

const FAILURE_WORDS: Record<string, string> = {
  bounce: 'it was blocked and bounced, so no unit entered',
  'no convoy': 'no fleet carried it across the water, so it stayed where it was',
  disrupted: 'the convoy route was broken',
  void: 'the order was illegal when it was checked',
  dislodged: 'a stronger attack pushed the unit out',
  cut: 'its support was cut',
  disband: 'it could not retreat and was disbanded',
};

const KIND_LABEL: Record<GuidedKind, string> = {
  'broken-promise': 'Broken promise',
  'kept-promise': 'Promise kept',
  'kept-promise-failed': 'Promise kept, order failed',
  'center-gained': 'Supply center gained',
  'center-lost': 'Supply center lost',
  dislodged: 'Unit dislodged',
  standoff: 'Standoff',
  'supported-attack': 'Supported attack',
  'attack-occupied': 'Move into an occupied province',
  convoy: 'Convoy',
  retreat: 'Retreat',
  adjustment: 'Winter adjustments',
  talks: 'Private talks',
};

const PRIORITY: Record<GuidedKind, number> = {
  'broken-promise': 1,
  'center-gained': 2,
  'center-lost': 2,
  dislodged: 3,
  'kept-promise-failed': 4,
  standoff: 5,
  'supported-attack': 6,
  'attack-occupied': 6,
  convoy: 7,
  retreat: 7,
  adjustment: 8,
  'kept-promise': 9,
  talks: 10,
};

const SEA_WORDS = /\b(Sea|Ocean|Channel|Gulf|Bight|Skagerrak|Mediterranean)\b/;

/** Eight compass words from map geometry, for "send its fleet west" style description. */
export function compassBetween(from: string, to: string): string | undefined {
  const a = position(from);
  const b = position(to);
  if (!a || !b) return undefined;
  const dx = b.x - a.x;
  const dy = a.y - b.y; // The map's y axis grows downward, so north is positive.
  if (Math.hypot(dx, dy) < 20) return undefined;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const names = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
  return names[Math.round(((angle + 360) % 360) / 45) % 8];
}

function position(code: string) {
  const base = baseProvince(code);
  return coords[code] ?? coords[base] ?? centerPositions[base];
}

/** A place in a sentence: "Brest", "the English Channel". Titles use the bare name. */
export function placeIn(code: string) {
  const name = provinceName(code);
  return SEA_WORDS.test(name) ? `the ${name}` : name;
}

interface Act {
  p: Power;
  order: string;
  r: OrderReading;
  tokens: string[];
}

function unitNoun(unit: string) {
  return unit.startsWith('F') ? 'fleet' : 'army';
}

/** "an army" or "a fleet". */
function unitA(unit: string) {
  return unitNoun(unit) === 'army' ? 'an army' : 'a fleet';
}

/** Failure text in plain words. Empty tokens mean the order succeeded. */
function failureReason(tokens: string[]) {
  const reasons = tokens.filter((t) => LOSING.has(t));
  return reasons.length ? (FAILURE_WORDS[reasons[0]] ?? reasons[0]) : '';
}

/** A factual sentence for one submitted move, stating success only when the record shows it. */
function moveSentence(p: Power, unit: string, from: string, to: string, tokens: string[]) {
  const who = NATIONS[p].name;
  const noun = unitNoun(unit);
  if (!tokens.length) return `${who} sent its ${noun} from ${placeIn(from)} into ${placeIn(to)}.`;
  return `${who} tried to send its ${noun} from ${placeIn(from)} into ${placeIn(to)}, but ${failureReason(tokens) || 'the move did not succeed'}.`;
}

/** An order as a plain verb phrase, used after "had promised to": "send its fleet west from Brest into the Mid-Atlantic Ocean". */
function orderPhrase(order: string): string {
  const reading = describeOrder(order);
  if (reading.kind === 'move' && reading.target) {
    const direction = compassBetween(reading.origin, reading.target);
    return `send its ${unitNoun(reading.unit)}${direction ? ` ${direction}` : ''} from ${placeIn(reading.origin)} into ${placeIn(reading.target)}`;
  }
  if (reading.kind === 'hold') return `hold its ${unitNoun(reading.unit)} in ${placeIn(reading.origin)}`;
  if (reading.kind === 'support') {
    // "support the fleet in the English Channel into Belgium with its army in Holland"
    const plain = plainOrder(order);
    const supporting = plain.replace(/^The (army|fleet|unit) in .+? supports /, '');
    return `support ${supporting} with its ${unitNoun(reading.unit)} in ${placeIn(reading.origin)}`;
  }
  const plain = plainOrder(order);
  return plain.charAt(0).toLowerCase() + plain.slice(1);
}

function supportParts(order: string) {
  const t = order.trim().split(/\s+/);
  const dash = t.indexOf('-', 4);
  return {
    supported: `${t[3] ?? ''} ${t[4] ?? ''}`.trim(),
    target: dash > 0 && t[dash + 1] ? baseProvince(t[dash + 1]) : undefined,
  };
}

function occupant(board: Board, base: string): Power | undefined {
  return POWERS.find((p) =>
    board.units[p].some((u) => baseProvince(u.replace('*', '').split(' ')[1] ?? '') === base),
  );
}

function ownerOfUnit(board: Board, unit: string): Power | undefined {
  const key = unit.replace('*', '');
  return POWERS.find((p) => board.units[p].some((u) => u.replace('*', '') === key));
}

function seasonLabel(phase: string) {
  return `${phaseName(phase)} · ${phaseKind(phase).toLowerCase()}`;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/**
 * Builds the walkthrough for `match.turns[turnIndex]`. The board before is checkpoint `turnIndex`,
 * the board after is checkpoint `turnIndex + 1`, and nothing further is read.
 */
export function deriveGuidedPhase(match: Match, turnIndex: number): GuidedPhase | undefined {
  const turn = match.turns[turnIndex];
  const before = match.checkpoints[turnIndex];
  const after = match.checkpoints[turnIndex + 1];
  if (!turn || !before || !after) return undefined;
  const board = before.state.board;
  const phase = turn.phase;
  const tokensOf = (unit: string) => (turn.results[unit] ?? []).filter(Boolean);
  const acts: Act[] = POWERS.flatMap((p) =>
    turn.decisions[p].orders.map((order) => {
      const r = describeOrder(order);
      return { p, order, r, tokens: tokensOf(r.unit) };
    }),
  );
  const events: GuidedEvent[] = [];
  const used = new Set<string>();
  const add = (
    e: Omit<GuidedEvent, 'id' | 'label' | 'priority'>,
    key: string,
  ) => {
    events.push({
      ...e,
      id: `${turnIndex}-${e.kind}-${key}`,
      label: KIND_LABEL[e.kind],
      priority: PRIORITY[e.kind],
    });
  };

  // 1. Promises: the record checks each promise against the submitted order.
  const keptClean: { promise: (typeof turn.promises)[number]; reading: OrderReading; quote?: { from: Power; text: string } }[] = [];
  for (const promise of turn.promises) {
    const quoteMessage = turn.messages.find((m) => m.from === promise.from && m.promise === promise.promised);
    const quote = quoteMessage ? { from: promise.from, text: quoteMessage.text } : undefined;
    const reading = describeOrder(promise.promised);
    const recipients = promise.to.map((p) => NATIONS[p].name).join(' and ');
    const focusHighlight = [reading.origin, ...(reading.target ? [reading.target] : [])];
    used.add(reading.unit);
    if (!promise.kept) {
      const submitted = describeOrder(promise.actual);
      const submittedOutcome = promise.actual === 'No order issued' ? [] : tokensOf(submitted.unit);
      const submittedSentence =
        promise.actual === 'No order issued'
          ? 'It submitted no order for that unit.'
          : submitted.kind === 'move' && submitted.target
            ? `The submitted order was different. ${moveSentence(promise.from, submitted.unit, submitted.origin, submitted.target, submittedOutcome)}`
            : `The submitted order was different: ${NATIONS[promise.from].name} chose to ${submitted.summary.charAt(0).toLowerCase()}${submitted.summary.slice(1)}.`;
      add(
        {
          kind: 'broken-promise',
          headline: `${NATIONS[promise.from].name} broke its promise to ${recipients}`,
          happened: `${NATIONS[promise.from].name} had promised ${recipients} to ${orderPhrase(promise.promised)}. ${submittedSentence}`,
          matters: `The promise was checked against the sealed order, and the two differ. The record cannot show whether ${recipients} planned around the promised move.`,
          powers: [promise.from, ...promise.to.filter((p) => p !== promise.from)],
          focus: reading.origin,
          highlight: [...focusHighlight, ...(submitted.kind === 'move' && submitted.target ? [submitted.target] : [])],
          exact: promise.actual === 'No order issued' ? [promise.promised] : [promise.promised, promise.actual],
          quote,
          compare: { promised: promise.promised, actual: promise.actual },
        },
        `${promise.from}-${promise.promised}`,
      );
      continue;
    }
    const outcome = tokensOf(reading.unit);
    if (outcome.some((t) => LOSING.has(t))) {
      add(
        {
          kind: 'kept-promise-failed',
          headline: `${NATIONS[promise.from].name} kept its word, but the order failed`,
          happened: `${NATIONS[promise.from].name} told ${recipients} it would ${orderPhrase(promise.promised)}. The order was submitted exactly as promised, and ${failureReason(outcome) || 'it did not succeed'}.`,
          matters: 'A kept promise is about the order, not the result. The board result is shown separately.',
          powers: [promise.from, ...promise.to.filter((p) => p !== promise.from)],
          focus: reading.origin,
          highlight: focusHighlight,
          exact: [promise.promised],
          quote,
          compare: { promised: promise.promised, actual: promise.actual },
        },
        `${promise.from}-${promise.promised}`,
      );
    } else {
      keptClean.push({ promise, reading, quote });
    }
  }
  // Successful kept promises are grouped into one event so a phase never opens with a stack of them.
  if (keptClean.length === 1) {
    const { promise, reading, quote } = keptClean[0];
    add(
      {
        kind: 'kept-promise',
        headline: `${NATIONS[promise.from].name} kept its promise to ${promise.to.map((p) => NATIONS[p].name).join(' and ')}`,
        happened: `${NATIONS[promise.from].name} had promised to ${orderPhrase(promise.promised)}, and the submitted order matched it exactly.`,
        matters: 'A promise counts as kept only when the submitted order matches it exactly. Its result is shown in the events for that unit.',
        powers: [promise.from, ...promise.to.filter((p) => p !== promise.from)],
        focus: reading.origin,
        highlight: [reading.origin, ...(reading.target ? [reading.target] : [])],
        exact: [promise.promised],
        quote,
        compare: { promised: promise.promised, actual: promise.actual },
      },
      'single',
    );
  } else if (keptClean.length > 1) {
    const first = keptClean[0];
    add(
      {
        kind: 'kept-promise',
        headline: `${keptClean.length} promises were kept exactly as written`,
        happened: keptClean
          .map(({ promise }) => `${NATIONS[promise.from].name} told ${promise.to.map((p) => NATIONS[p].name).join(' and ')} it would ${orderPhrase(promise.promised)}, and it did.`)
          .join(' '),
        matters: 'A promise counts as kept only when the submitted order matches it exactly. Its result is shown in the events for that unit.',
        powers: [...new Set(keptClean.flatMap(({ promise }) => [promise.from, ...promise.to]))],
        focus: first.reading.origin,
        highlight: keptClean.flatMap(({ reading }) => [reading.origin, ...(reading.target ? [reading.target] : [])]),
        exact: keptClean.map(({ promise }) => promise.promised),
        quote: first.quote,
      },
      'group',
    );
  }

  // 2. Supply centers that changed hands, grouped per country so each country gets one popup.
  for (const p of POWERS) {
    const gained = after.state.board.centers[p].filter((c) => !before.state.board.centers[p].includes(c));
    const lost = before.state.board.centers[p].filter((c) => !after.state.board.centers[p].includes(c));
    const count = after.state.board.centers[p].length;
    if (gained.length) {
      const sources = gained.map((loc) => {
        const from = POWERS.find((q) => before.state.board.centers[q].includes(loc));
        return `${provinceName(loc)} (${from ? `held by ${NATIONS[from].name}` : 'neutral'} before this phase)`;
      });
      add(
        {
          kind: 'center-gained',
          headline:
            gained.length === 1
              ? `${NATIONS[p].name} now holds ${provinceName(gained[0])}`
              : `${NATIONS[p].name} gained ${gained.length} supply centers`,
          happened: `${NATIONS[p].name} took ${sources.join('; ')}.`,
          matters: `Each supply center supports one unit and counts toward the 18 needed to win. ${NATIONS[p].name} now has ${count} of 18.`,
          powers: [p, ...POWERS.filter((q) => q !== p && gained.some((loc) => before.state.board.centers[q].includes(loc)))],
          focus: gained[0],
          highlight: gained,
          exact: [],
        },
        `${p}-gained`,
      );
    }
    if (lost.length) {
      const holders = lost.map((loc) => {
        const to = POWERS.find((q) => after.state.board.centers[q].includes(loc));
        return `${provinceName(loc)}${to ? `, now held by ${NATIONS[to].name}` : ', now neutral'}`;
      });
      add(
        {
          kind: 'center-lost',
          headline: lost.length === 1 ? `${NATIONS[p].name} lost ${provinceName(lost[0])}` : `${NATIONS[p].name} lost ${lost.length} supply centers`,
          happened: `${holders.join('; ')}.`,
          matters: `${NATIONS[p].name} now has ${count} of 18 supply centers.`,
          powers: [p, ...POWERS.filter((q) => q !== p && lost.some((loc) => after.state.board.centers[q].includes(loc)))],
          focus: lost[0],
          highlight: lost,
          exact: [],
        },
        `${p}-lost`,
      );
    }
  }

  // 3. Dislodged units: the unit is pushed out and must retreat or disband next.
  for (const [unit, results] of Object.entries(turn.results)) {
    if (!results.includes('dislodged')) continue;
    const owner = ownerOfUnit(board, unit);
    if (!owner) continue;
    const loc = baseProvince(unit.split(' ')[1] ?? '');
    used.add(unit);
    add(
      {
        kind: 'dislodged',
        headline: `${NATIONS[owner].name}'s ${unitNoun(unit)} in ${provinceName(loc)} was pushed out`,
        happened: `A stronger attack dislodged ${unitA(unit)} that ${NATIONS[owner].name} had in ${placeIn(loc)}.`,
        matters: 'A dislodged unit must retreat to an empty neighboring province in the next retreat step, or disband.',
        powers: [owner],
        focus: loc,
        highlight: [loc],
        exact: [],
      },
      unit,
    );
  }

  // 4. Attacks that bounced. Two or fewer are shown one by one; more are grouped into one standoff popup.
  const bounced = acts.filter((a) => a.r.kind === 'move' && a.r.target && a.tokens.includes('bounce'));
  const targets = [...new Set(bounced.map((a) => a.r.target!))];
  for (const a of bounced) used.add(a.r.unit);
  const standoffLine = (target: string) => {
    const movers = bounced.filter((a) => a.r.target === target);
    const defender = occupant(board, target);
    const who = [...new Set(movers.map((a) => NATIONS[a.p].name))].join(' and ');
    return {
      parties: [...new Set([...movers.map((a) => a.p), ...(defender ? [defender] : [])])],
      sentence: `${who} tried to enter ${placeIn(target)}; ${movers.length > 1 ? 'the moves' : 'the move'} bounced.${defender ? ` ${NATIONS[defender].name} held the province.` : ''}`,
      movers,
    };
  };
  if (targets.length && targets.length <= 2) {
    for (const target of targets) {
      const { parties, movers } = standoffLine(target);
      add(
        {
          kind: 'standoff',
          headline:
            movers.length > 1
              ? `Standoff over ${provinceName(target)}`
              : `${NATIONS[movers[0].p].name}'s attack on ${provinceName(target)} bounced`,
          happened: movers
            .map((a) => moveSentence(a.p, a.r.unit, a.r.origin, target, a.tokens))
            .join(' ')
            .concat(occupant(board, target) ? ` ${NATIONS[occupant(board, target)!].name} held the province.` : ''),
          matters: 'A bounced move leaves every unit where it was, so no supply center changed hands here.',
          powers: parties,
          focus: target,
          highlight: [target, ...movers.map((a) => a.r.origin)],
          exact: movers.map((a) => a.order),
        },
        target,
      );
    }
  } else if (targets.length > 2) {
    const lines = targets.map((t) => standoffLine(t));
    add(
      {
        kind: 'standoff',
        headline: `${targets.length} attacks bounced`,
        happened: `${bounced.length} moves bounced, so no unit entered: ${targets.map((t) => provinceName(t)).join(', ')}.`,
        matters: 'A bounced move leaves every unit where it was, so no supply center changed hands in these provinces.',
        powers: [...new Set(lines.flatMap((l) => l.parties))],
        focus: targets[0],
        highlight: [...targets, ...bounced.map((a) => a.r.origin)],
        exact: bounced.map((a) => a.order),
      },
      'group',
    );
  }

  // 5. Successful moves into occupied provinces, with or without supporting units.
  const supports = acts.filter((a) => a.r.kind === 'support');
  for (const a of acts) {
    if (a.r.kind !== 'move' || !a.r.target || a.tokens.length) continue;
    if (a.order.trim().endsWith(' VIA')) continue;
    const held = occupant(board, a.r.target);
    if (!held || held === a.p) continue;
    const supporters = supports.filter((s) => {
      const parts = supportParts(s.order);
      return parts.supported === a.r.unit && parts.target === a.r.target;
    });
    used.add(a.r.unit);
    for (const s of supporters) used.add(s.r.unit);
    const isSupported = supporters.length > 0;
    add(
      {
        kind: isSupported ? 'supported-attack' : 'attack-occupied',
        headline: isSupported
          ? `${NATIONS[a.p].name}'s supported attack entered ${provinceName(a.r.target)}`
          : `${NATIONS[a.p].name} moved into ${provinceName(a.r.target)}`,
        happened: [
          moveSentence(a.p, a.r.unit, a.r.origin, a.r.target, []),
          ...supporters.map(
            (s) => `${NATIONS[s.p].name}'s ${unitNoun(s.r.unit)} in ${placeIn(s.r.origin)} backed that move.`,
          ),
        ].join(' '),
        matters: `${NATIONS[held].name} held ${provinceName(a.r.target)} when the phase began. The move succeeded, so that unit had to move away or be dislodged.`,
        powers: [a.p, held],
        focus: a.r.target,
        highlight: [a.r.target, a.r.origin],
        exact: [a.order, ...supporters.map((s) => s.order)],
      },
      `${a.r.unit}-${a.r.target}`,
    );
  }

  // 6. Convoys: armies that were meant to cross water by fleet. Grouped into one event.
  const convoys = acts.filter((a) => a.r.kind === 'move' && a.order.trim().endsWith(' VIA') && !a.tokens.includes('bounce'));
  if (convoys.length) {
    for (const c of convoys) used.add(c.r.unit);
    const failed = convoys.filter((c) => c.tokens.some((t) => LOSING.has(t)));
    add(
      {
        kind: 'convoy',
        headline: failed.length
          ? `${failed.length} of ${convoys.length} convoyed ${plural(convoys.length, 'move', 'moves')} failed`
          : `${convoys.length} convoyed ${plural(convoys.length, 'move', 'moves')} succeeded`,
        happened: convoys
          .map((c) => {
            const dest = placeIn(c.r.target!);
            if (c.tokens.length)
              return `${NATIONS[c.p].name}'s army in ${placeIn(c.r.origin)} was meant to cross to ${dest}, but ${failureReason(c.tokens) || 'the convoy failed'}.`;
            return `${NATIONS[c.p].name}'s army in ${placeIn(c.r.origin)} crossed the water to ${dest}.`;
          })
          .join(' '),
        matters: 'An army crosses water only when a fleet holds a convoy order for the whole route. A failed convoy leaves the army in place.',
        powers: [...new Set(convoys.map((c) => c.p))],
        focus: convoys[0].r.target,
        highlight: convoys.flatMap((c) => [c.r.origin, c.r.target!]),
        exact: convoys.map((c) => c.order),
      },
      'all',
    );
  }

  // 7. Retreats: units that had to fall back after being dislodged.
  const retreats = acts.filter((a) => a.r.kind === 'retreat' || a.r.kind === 'disband');
  if (retreats.length && phaseKind(phase) === 'Retreats') {
    for (const r of retreats) used.add(r.r.unit);
    add(
      {
        kind: 'retreat',
        headline: `${retreats.length} dislodged ${plural(retreats.length, 'unit', 'units')} fell back`,
        happened: retreats
          .map((r) => {
            if (r.r.kind === 'disband') return `${NATIONS[r.p].name} disbanded ${unitA(r.r.unit)} in ${placeIn(r.r.origin)}.`;
            const target = placeIn(r.r.target ?? '');
            return r.tokens.length
              ? `${NATIONS[r.p].name}'s ${unitNoun(r.r.unit)} in ${placeIn(r.r.origin)} tried to retreat to ${target}, but ${failureReason(r.tokens) || 'the retreat failed'}.`
              : `${NATIONS[r.p].name}'s ${unitNoun(r.r.unit)} retreated from ${placeIn(r.r.origin)} to ${target}.`;
          })
          .join(' '),
        matters: 'Two retreats into the same province both fail. Only empty provinces are safe retreat targets.',
        powers: [...new Set(retreats.map((r) => r.p))],
        focus: retreats[0].r.origin,
        highlight: retreats.flatMap((r) => [r.r.origin, ...(r.r.target ? [r.r.target] : [])]),
        exact: retreats.map((r) => r.order),
      },
      'all',
    );
  }

  // 8. Winter adjustments: builds and disbands, in one popup for the whole adjustment step.
  const adjustments = acts.filter((a) => a.r.kind === 'build' || a.r.kind === 'disband');
  if (adjustments.length && phaseKind(phase) === 'Adjustments') {
    for (const a of adjustments) used.add(a.r.unit);
    const builds = adjustments.filter((a) => a.r.kind === 'build').length;
    const disbands = adjustments.length - builds;
    add(
      {
        kind: 'adjustment',
        headline: `Winter adjustments: ${builds} ${plural(builds, 'build', 'builds')}, ${disbands} ${plural(disbands, 'disband', 'disbands')}`,
        happened: adjustments
          .map((a) =>
            a.r.kind === 'build'
              ? `${NATIONS[a.p].name} built ${unitA(a.r.unit)} in ${placeIn(a.r.origin)}.`
              : `${NATIONS[a.p].name} disbanded ${unitA(a.r.unit)} in ${placeIn(a.r.origin)}.`,
          )
          .join(' '),
        matters: 'Each country counts its supply centers against its units. Builds need an empty home center it owns; extra units must disband.',
        powers: [...new Set(adjustments.map((a) => a.p))],
        focus: adjustments[0].r.origin,
        highlight: adjustments.map((a) => a.r.origin),
        exact: adjustments.map((a) => a.order),
      },
      'all',
    );
  }

  // 9. Private talks: one summary event that never claims an agreement.
  if (turn.messages.length) {
    const count = (kind: string) => turn.messages.filter((m) => m.kind === kind).length;
    const proposals = count('proposal');
    const replies = count('reply');
    const threats = count('threat');
    const withOrders = turn.messages.filter((m) => m.promise).length;
    const sample = turn.messages.find((m) => m.promise) ?? turn.messages[0];
    add(
      {
        kind: 'talks',
        headline: `${turn.messages.length} private ${plural(turn.messages.length, 'message', 'messages')} before the orders were sealed`,
        happened: `${proposals} ${plural(proposals, 'proposal', 'proposals')}, ${replies} ${plural(replies, 'reply', 'replies')}${threats ? `, ${threats} ${plural(threats, 'threat', 'threats')}` : ''}. ${withOrders} named a specific order. A proposal is an offer, not an agreement, unless the orders below match it.`,
        matters: 'Words are not orders. What each unit actually did is in the results shown with each event.',
        powers: [sample.from, ...sample.to.slice(0, 1)],
        highlight: [],
        exact: [],
        quote: { from: sample.from, text: sample.text },
      },
      'all',
    );
  }

  // Routine holds and uncontested moves: counted, never popped up.
  const routine = acts.filter((a) => (a.r.kind === 'hold' || a.r.kind === 'move') && a.tokens.length === 0 && !used.has(a.r.unit)).length;

  const sorted = [...events].sort((a, b) => a.priority - b.priority);
  return {
    turn: turnIndex,
    phase,
    season: seasonLabel(phase),
    title: turn.title,
    events: sorted.slice(0, MAX_POPUPS),
    overflow: sorted.slice(MAX_POPUPS).map((e) => e.headline),
    routine,
    orderCount: acts.length,
  };
}

/** The walkthrough moments that involve one country, for the "Who is this?" panel. */
export function eventsInvolving(phase: GuidedPhase | undefined, power: Power) {
  return phase?.events.filter((e) => e.powers.includes(power)) ?? [];
}
