import { NATIONS, PROFILES, phaseKind, phaseName } from './domain';
import { provinceName, describeOrder, outcomeText } from './story';
import { POWERS, type Board, type Intervention, type Match, type Power, type Turn } from './types';

/**
 * Pure readings of ONE viewed moment, shared by the country details, the branch dialog, and the
 * comparison page. Moment `index` is the board at the start of phase `index` (see the moment rule in
 * src/conversations.ts):
 * - the board, memories, trust scores, and instructions come from checkpoint `index`;
 * - orders, results, and promise checks come only from turns before `index` (the last resolved phase
 *   is `turns[index - 1]`);
 * - nothing here reads `turns[index]` or a later checkpoint.
 */

export function clampMoment(match: Match, index: number) {
  return Math.max(0, Math.min(index, match.checkpoints.length - 1));
}

/** "Spring 1901" for a phase or board name. */
export function seasonOf(phase: string) {
  return phaseName(phase);
}

export interface MomentLabel {
  index: number;
  /** Board name of the phase on screen, such as "S1901M". */
  phase: string;
  season: string;
  /** The phase that resolved just before this moment, when there is one. */
  resolved?: { turn: number; phase: string; season: string };
}

export function momentLabel(match: Match, index: number): MomentLabel {
  const i = clampMoment(match, index);
  const phase = match.checkpoints[i].state.board.name;
  const prev = i > 0 ? match.turns[i - 1] : undefined;
  return {
    index: i,
    phase,
    season: seasonOf(phase),
    resolved: prev ? { turn: i - 1, phase: prev.phase, season: seasonOf(prev.phase) } : undefined,
  };
}

/** The checkpoint in plain words: "the start of Spring 1901, before the orders were sealed". */
export function checkpointPhrase(phase: string) {
  if (phase === 'COMPLETED') return 'the final position';
  const kind = phaseKind(phase);
  const before =
    kind === 'Retreats'
      ? 'before any retreat was ordered'
      : kind === 'Adjustments'
        ? 'before builds and disbands were ordered'
        : 'before the orders were sealed';
  return `the start of ${seasonOf(phase)}${kind === 'Movement' ? '' : ` (${kind.toLowerCase()})`}, ${before}`;
}

export interface CountryAtMoment {
  centers: number;
  units: number;
  /** Center change across the last resolved phase; undefined at the opening. */
  change?: number;
  startCenters: number;
  startUnits: number;
  /** Observer-written instruction in force at this moment (checkpoint configs), if any. */
  instruction?: string;
  profile: string;
  model: string;
}

/** One country at moment `index`: counts from that checkpoint, compared with the opening and the previous moment. */
export function countryAt(match: Match, index: number, power: Power): CountryAtMoment {
  const i = clampMoment(match, index);
  const cp = match.checkpoints[i];
  const start = match.checkpoints[0].state.board;
  const prev = i > 0 ? match.checkpoints[i - 1].state.board : undefined;
  const config = cp.configs[power];
  return {
    centers: cp.state.board.centers[power].length,
    units: cp.state.board.units[power].length,
    change: prev ? cp.state.board.centers[power].length - prev.centers[power].length : undefined,
    startCenters: start.centers[power].length,
    startUnits: start.units[power].length,
    instruction: config?.instructions?.trim() || undefined,
    profile: config?.profile ?? 'strategist',
    model: config?.model ?? '',
  };
}

export interface ResolvedOrder {
  exact: string;
  plain: string;
  succeeded: boolean;
  /** Engine outcome in plain words: "Succeeded", "Bounced: …". */
  outcome: string;
}

function unitOf(order: string) {
  return order.trim().split(/\s+/).slice(0, 2).join(' ');
}

function readOrder(turn: Turn, order: string): ResolvedOrder {
  const tokens = (turn.results[unitOf(order)] ?? []).filter(Boolean);
  return { exact: order, plain: describeOrder(order).summary, succeeded: tokens.length === 0, outcome: outcomeText(tokens) };
}

/** Orders `power` submitted in the last phase resolved before moment `index`. Empty at the opening. */
export function resolvedOrdersAt(match: Match, index: number, power: Power): ResolvedOrder[] {
  const turn = index > 0 ? match.turns[clampMoment(match, index) - 1] : undefined;
  return turn ? turn.decisions[power].orders.map((o) => readOrder(turn, o)) : [];
}

export interface ResolvedPromise {
  to: Power[];
  promised: string;
  promisedPlain: string;
  actual: string;
  actualPlain: string;
  kept: boolean;
  /** What the engine did with the order actually submitted for that unit. */
  outcome?: string;
}

/** Promises `power` made in the last resolved phase, measured against its revealed orders. */
export function resolvedPromisesAt(match: Match, index: number, power: Power): ResolvedPromise[] {
  const turn = index > 0 ? match.turns[clampMoment(match, index) - 1] : undefined;
  if (!turn) return [];
  return turn.promises
    .filter((p) => p.from === power)
    .map((p) => {
      const issued = p.actual !== 'No order issued';
      return {
        to: p.to,
        promised: p.promised,
        promisedPlain: describeOrder(p.promised).summary,
        actual: p.actual,
        actualPlain: issued ? describeOrder(p.actual).summary : 'No order was issued for that unit',
        kept: p.kept,
        outcome: issued ? readOrder(turn, p.actual).outcome : undefined,
      };
    });
}

/** Promises of the phase on screen: visible as words, sealed as actions until the phase resolves. */
export function sealedPromisesAt(match: Match, index: number, power: Power) {
  const i = clampMoment(match, index);
  const messages = i < match.turns.length ? match.turns[i].messages : i === match.turns.length ? (match.pending?.messages ?? []) : [];
  return messages
    .filter((m) => m.from === power && m.promise)
    .map((m) => ({ id: m.id, to: m.to, promised: m.promise!, promisedPlain: describeOrder(m.promise!).summary }));
}

export interface TrustReading {
  other: Power;
  score: number;
  /** "Britain's stated trust in France". */
  label: string;
}

/** The scores `power` itself reported at moment `index`. An assessment by one side, never an alliance. */
export function trustAt(match: Match, index: number, power: Power): TrustReading[] {
  const cp = match.checkpoints[clampMoment(match, index)];
  return POWERS.filter((p) => p !== power).map((other) => ({
    other,
    score: cp.relations[power]?.[other] ?? 0,
    label: `${NATIONS[power].name}’s stated trust in ${NATIONS[other].name}`,
  }));
}

/** Pairs whose reported trust in each other is at least `threshold` on both sides at moment `index`. */
export function mutualTrustAt(match: Match, index: number, threshold = 30) {
  const cp = match.checkpoints[clampMoment(match, index)];
  const pairs: { a: Power; b: Power; score: number }[] = [];
  for (let x = 0; x < POWERS.length; x++)
    for (let y = x + 1; y < POWERS.length; y++) {
      const a = POWERS[x];
      const b = POWERS[y];
      const score = Math.min(cp.relations[a]?.[b] ?? 0, cp.relations[b]?.[a] ?? 0);
      if (score >= threshold) pairs.push({ a, b, score });
    }
  return pairs;
}

/** The one change an alternate timeline made, in ordinary words. */
export function describeIntervention(i: Intervention): string {
  const who = NATIONS[i.power].name;
  if (i.order) return `${who}’s order is replaced: ${describeOrder(i.order).summary}.`;
  if (i.message)
    return `${who} sends an extra message to ${(i.to ?? []).map((p) => NATIONS[p].name).join(', ') || 'another country'}: “${i.message}”`;
  if (i.profile) return `${who} plays as a ${PROFILES[i.profile].name.toLowerCase()} from this moment.`;
  return `A change for ${who} (details were not recorded).`;
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** A viewer-facing question for a free-form change, stored with the alternate timeline. */
export function questionFor(i: Intervention): string {
  const who = NATIONS[i.power].name;
  if (i.order) return `What if ${who} had ordered: ${lowerFirst(describeOrder(i.order).summary)}?`;
  if (i.message) return `What if ${who} had sent ${(i.to ?? []).map((p) => NATIONS[p].name).join(', ') || 'another country'} one more message?`;
  if (i.profile) return `What if ${who} had played as a ${PROFILES[i.profile].name.toLowerCase()}?`;
  return `What if ${who} had decided differently?`;
}

/** The intervention an alternate timeline made. Older records keep it only on `match.intervention` until it is applied. */
export function interventionOf(match: Match): Intervention | undefined {
  return match.parent?.intervention ?? match.intervention;
}

// ---------- Comparing an alternate timeline with its original ----------

export interface CenterDifference {
  code: string;
  name: string;
  original?: Power;
  branch?: Power;
}

/** Supply centers held by a different country (or nobody) in two boards. */
export function centerDifferences(original: Board, branch: Board): CenterDifference[] {
  const owner = (b: Board, code: string) => POWERS.find((p) => b.centers[p].includes(code));
  const codes = new Set(POWERS.flatMap((p) => [...original.centers[p], ...branch.centers[p]]));
  return [...codes]
    .sort()
    .map((code) => ({ code, name: provinceName(code), original: owner(original, code), branch: owner(branch, code) }))
    .filter((d) => d.original !== d.branch);
}

export interface OrderDifference {
  power: Power;
  /** Orders only the original submitted. */
  original: ResolvedOrder[];
  /** Orders only the alternate timeline submitted. */
  branch: ResolvedOrder[];
}

export interface FirstDivergence {
  turn: number;
  phase: string;
  season: string;
  original: { title: string; recap: string };
  branch: { title: string; recap: string };
  orders: OrderDifference[];
  centers: CenterDifference[];
}

export interface BranchComparison {
  at: number;
  /** The board name both timelines start from. */
  from: string;
  /** Phases both timelines share, oldest first. */
  shared: { turn: number; phase: string; season: string; title: string }[];
  /**
   * The first phase played from the checkpoint, compared side by side. Present only when both
   * timelines have resolved it AND the viewed moment is after it (moment rule).
   */
  first?: FirstDivergence;
  /** Why `first` is missing, in plain words. */
  firstMissing?: string;
}

/** Shared past and the first diverging phase, as visible at alternate-timeline moment `index`. */
export function compareTimelines(branch: Match, original: Match, index: number): BranchComparison {
  const at = Math.min(branch.parent?.at ?? 0, branch.checkpoints.length - 1);
  const from = branch.checkpoints[at].state.board.name;
  const shared = branch.turns.slice(0, at).map((t, turn) => ({ turn, phase: t.phase, season: seasonOf(t.phase), title: t.title }));
  const result: BranchComparison = { at, from, shared };
  const b = branch.turns[at];
  const o = original.turns[at];
  if (!b) {
    result.firstMissing = 'This alternate timeline has not played its first phase yet.';
    return result;
  }
  if (index <= at) {
    result.firstMissing = `The first phase of the alternate timeline resolves after this moment. Move to moment ${at + 1} to compare it.`;
    return result;
  }
  if (!o) {
    result.firstMissing = `The original record stops at this checkpoint, so it has no ${seasonOf(b.phase)} to compare.`;
    return result;
  }
  const orders: OrderDifference[] = [];
  for (const power of POWERS) {
    const mine = b.decisions[power].orders;
    const theirs = o.decisions[power].orders;
    const onlyOriginal = theirs.filter((x) => !mine.includes(x));
    const onlyBranch = mine.filter((x) => !theirs.includes(x));
    if (onlyOriginal.length || onlyBranch.length)
      orders.push({ power, original: onlyOriginal.map((x) => readOrder(o, x)), branch: onlyBranch.map((x) => readOrder(b, x)) });
  }
  const afterB = branch.checkpoints[at + 1]?.state.board;
  const afterO = original.checkpoints[at + 1]?.state.board;
  result.first = {
    turn: at,
    phase: b.phase,
    season: seasonOf(b.phase),
    original: { title: o.title, recap: o.recap },
    branch: { title: b.title, recap: b.recap },
    orders,
    centers: afterB && afterO ? centerDifferences(afterO, afterB) : [],
  };
  return result;
}

/**
 * The original checkpoint that shows the same game phase as alternate moment `index`. Timelines can
 * drift apart in phase order (a retreat phase happens in one but not the other), so the checkpoint
 * is matched by phase name; failing that, the nearest index is returned with `same: false`.
 */
export function matchingCheckpoint(branch: Match, original: Match, index: number): { index: number; same: boolean } {
  const name = branch.checkpoints[clampMoment(branch, index)].state.board.name;
  const at = branch.parent?.at ?? 0;
  const found = original.checkpoints.findIndex((c, i) => i >= Math.min(at, index) && c.state.board.name === name);
  if (found >= 0) return { index: found, same: true };
  return { index: Math.min(index, original.checkpoints.length - 1), same: false };
}

/** Ownership in plain words for one center: the country's short name, or "nobody". */
export function ownerWord(p: Power | undefined) {
  return p ? NATIONS[p].name : 'nobody';
}
