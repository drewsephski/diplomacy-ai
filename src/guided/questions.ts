import { NATIONS } from '../domain';
import { conversationsInPhase, type Conversation } from '../conversations';
import { baseProvince, describeOrder, placePhrase, plainOrder, provinceName, SUPPLY_CENTERS } from '../story';
import { POWERS, type Board, type Match, type Power } from '../types';
import type { Question } from './beats';

/**
 * Questions worth watching before a phase resolves, and their answers afterwards.
 *
 * Before the reveal a question reads only the board at the start of the phase (checkpoint `turn`),
 * the engine's legal orders at that checkpoint (who can reach what), and the talks of that phase
 * visible at the viewed moment. It never reads that phase's orders, results, or promise checks,
 * nor anything later. `answerQuestion` is the only function that reads the outcome, and only for a
 * phase that has resolved (checkpoint `turn + 1`).
 */

type Legal = Record<string, string[]>;

function locOf(unit: string) {
  return baseProvince(unit.replace('*', '').split(' ')[1] ?? '');
}

/** Powers whose units can legally move into each province this phase, with the units. */
export function reachMap(legal: Record<Power, Legal>) {
  const reach = new Map<string, { power: Power; unit: string }[]>();
  for (const p of POWERS)
    for (const orders of Object.values(legal[p] ?? {}))
      for (const order of orders) {
        const r = describeOrder(order);
        if (r.kind !== 'move' || !r.target || order.trim().endsWith(' VIA')) continue;
        const list = reach.get(r.target) ?? [];
        if (!list.some((x) => x.unit === r.unit)) list.push({ power: p, unit: r.unit });
        reach.set(r.target, list);
      }
  return reach;
}

export function occupantOf(board: Board, province: string): Power | undefined {
  return POWERS.find((p) => board.units[p].some((u) => locOf(u) === province));
}

function ownerOf(board: Board, province: string): Power | undefined {
  return POWERS.find((p) => board.centers[p].includes(province));
}

function list(powers: Power[]) {
  const n = powers.map((p) => NATIONS[p].name);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
}

function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const isCenter = (p: string) => (SUPPLY_CENTERS as readonly string[]).includes(p);

function noun(unit: string) {
  return unit.startsWith('F') ? 'fleet' : 'army';
}

/** "Will France send its fleet from Brest into the Mid-Atlantic Ocean, as it told Britain?" */
export function promiseQuestion(board: Board, from: Power, to: Power[], order: string) {
  const r = describeOrder(order);
  const who = NATIONS[from].name;
  const told = `as it told ${list(to)}`;
  const t = order.trim().split(/\s+/);
  if (r.kind === 'move' && r.target) return `Will ${who} send its ${noun(r.unit)} from ${placePhrase(r.origin)} into ${placePhrase(r.target)}, ${told}?`;
  if (r.kind === 'hold') return `Will ${who} keep its ${noun(r.unit)} in ${placePhrase(r.origin)}, ${told}?`;
  if (r.kind === 'support') {
    const supported = `${t[3] ?? ''} ${t[4] ?? ''}`;
    const owner = POWERS.find((p) => board.units[p].some((u) => u.replace('*', '') === supported));
    const whose = owner && owner !== from ? `${NATIONS[owner].name}’s` : 'its';
    const dash = t.indexOf('-', 4);
    const into = dash > 0 && t[dash + 1] ? ` into ${placePhrase(t[dash + 1])}` : ' in place';
    return `Will ${who}’s ${noun(r.unit)} in ${placePhrase(r.origin)} support ${whose} ${noun(supported)}${into}, ${told}?`;
  }
  return `Will ${who} order “${lower(plainOrder(order))}”, ${told}?`;
}

/** Talks of phase `turn` that are visible at moment `index` (the moment rule). */
function talksOf(match: Match, turn: number, index: number): Conversation[] {
  if (index < turn) return [];
  return conversationsInPhase(match, turn, index);
}

/**
 * One or two questions for phase `turn`, read at moment `index` (index >= turn). Ordered by what a
 * viewer can follow: an explicit commitment first, then a contested province or an exposed home
 * center. A followed country's situation comes first among equals. Never answered here.
 */
export function questionsFor(match: Match, turn: number, index: number, follow?: Power): Question[] {
  const cp = match.checkpoints[turn];
  if (!cp || cp.state.done) return [];
  const board = cp.state.board;
  if (!board.name.endsWith('M')) return [];
  const conversations = talksOf(match, turn, index);
  const mentioned = new Set(conversations.flatMap((c) => c.places));
  const followBonus = (powers: Power[]) => (follow && powers.includes(follow) ? 50 : 0);
  const out: (Question & { score: number })[] = [];

  // 1. Will an explicit commitment hold? Mutual commitments and promises to someone previously
  //    let down weigh more, because the record makes them easy to follow.
  // A province that is a conversation's subject, especially one with commitments, leads.
  const subjects = new Map<string, number>();
  for (const c of conversations) if (c.places[0]) subjects.set(c.places[0], Math.max(subjects.get(c.places[0]) ?? 0, c.commitments.length ? 25 : 15));
  let order = 0;
  const brokenBefore = new Set(match.turns.slice(0, turn).flatMap((t) => t.promises.filter((p) => !p.kept).map((p) => p.from)));
  for (const c of conversations)
    for (const k of c.commitments) {
      if (k.supersededBy) continue;
      const r = describeOrder(k.order);
      const score =
        60 + (c.mutual.length ? 15 : 0) + (brokenBefore.has(k.from) ? 20 : 0) + (r.kind === 'move' ? 10 : 0) + followBonus([k.from, ...k.to]) + (k.from === follow ? 5 : 0) - order++ * 0.01;
      out.push({
        id: `${turn}-promise-${k.messageId}`,
        kind: 'promise',
        text: promiseQuestion(board, k.from, k.to, k.order),
        powers: [k.from, ...k.to],
        provinces: [r.origin, ...(r.target ? [r.target] : [])],
        messageId: k.messageId,
        score,
      });
    }

  // 2. A province two or more countries can enter this phase. Supply centers matter most, more so
  //    in autumn when ownership changes; places named in the talks come first.
  const reach = reachMap(cp.state.legal);
  for (const [province, units] of reach) {
    const powers = [...new Set(units.map((u) => u.power))];
    const holder = occupantOf(board, province);
    const contenders = POWERS.filter((p) => powers.includes(p) || p === holder);
    if (contenders.length < 2) continue;
    const center = isCenter(province);
    const owner = ownerOf(board, province);
    if (!center && !mentioned.has(province)) continue;
    const score =
      (center ? 30 : 0) + (center && !owner ? 15 : 0) + (board.name.startsWith('F') && center ? 10 : 0) + (mentioned.has(province) ? 25 : 0) + (subjects.get(province) ?? 0) + followBonus(contenders) - (holder ? 5 : 0);
    const who = list(contenders);
    out.push({
      id: `${turn}-contest-${province}`,
      kind: 'contest',
      text: holder
        ? `${NATIONS[holder].name} holds ${placePhrase(province)}, and ${list(powers.filter((p) => p !== holder))} can reach it. Will anyone else get in?`
        : `${who} can ${contenders.length === 2 ? 'both' : 'all'} reach ${placePhrase(province)}${center ? ', a supply center' : ''}. Will anyone get in?`,
      powers: contenders,
      provinces: [province],
      score,
    });
  }

  // 3. An exposed home center: empty of its owner's units, with a foreign unit able to enter.
  for (const p of POWERS) {
    for (const home of board.homes[p] ?? []) {
      if (!board.centers[p].includes(home) || occupantOf(board, home)) continue;
      const threats = (reach.get(home) ?? []).filter((u) => u.power !== p);
      if (!threats.length) continue;
      const by = [...new Set(threats.map((t) => t.power))];
      const score = 35 + (board.name.startsWith('F') ? 15 : 0) + (mentioned.has(home) ? 15 : 0) + followBonus([p, ...by]);
      out.push({
        id: `${turn}-border-${home}`,
        kind: 'border',
        text: `${provinceName(home)} is empty, and ${list(by)} can move into it. Will ${NATIONS[p].name} keep foreign units out?`,
        powers: [p, ...by],
        provinces: [home],
        score,
      });
    }
  }

  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const promise = out.find((q) => q.kind === 'promise');
  const promiseProvinces = new Set(promise?.provinces ?? []);
  // The second question is about a different place, so the two never ask the same thing twice.
  const other = out.find((q) => q.kind !== 'promise' && !q.provinces.some((p) => promiseProvinces.has(p)));
  return [promise, other]
    .filter((q): q is Question & { score: number } => Boolean(q))
    .slice(0, 2)
    .map((q) => {
      const copy: Question & { score?: number } = { ...q };
      delete copy.score;
      return copy;
    });
}

/**
 * The answer to a question about phase `turn`, read from that phase's resolution (checkpoint
 * `turn + 1`, the promise checks, and the results). Undefined when the phase has not resolved.
 */
export function answerQuestion(match: Match, turn: number, q: Question): Question['answer'] {
  const t = match.turns[turn];
  const before = match.checkpoints[turn];
  const after = match.checkpoints[turn + 1];
  if (!t || !before || !after) return undefined;
  if (q.kind === 'promise') {
    const message = t.messages.find((m) => m.id === q.messageId);
    const check = t.promises.find((p) => p.messageId === q.messageId) ?? t.promises.find((p) => !p.messageId && message && p.from === message.from && p.promised === message.promise);
    if (!check) return undefined;
    const unit = describeOrder(check.promised).unit;
    const tokens = (t.results[unit] ?? []).filter(Boolean);
    const who = NATIONS[check.from].name;
    if (check.kept)
      return tokens.length
        ? { outcome: 'mixed', text: `Yes, the order matched the promise, but it failed: ${lower(plainOrder(check.promised))} was blocked.` }
        : { outcome: 'yes', text: `Yes. ${who} submitted exactly the promised order, and it succeeded.` };
    return {
      outcome: 'no',
      text:
        check.actual === 'No order issued'
          ? `No. ${who} issued no order for that unit.`
          : `No. ${who} ordered something else: ${lower(plainOrder(check.actual))}.`,
    };
  }
  const province = q.provinces[0];
  const was = occupantOf(before.state.board, province);
  const now = occupantOf(after.state.board, province);
  if (q.kind === 'contest') {
    const tried = POWERS.filter((p) =>
      t.decisions[p].orders.some((o) => {
        const r = describeOrder(o);
        return r.kind === 'move' && r.target === province;
      }),
    );
    if (now && now !== was) return { outcome: 'yes', text: `Yes. ${NATIONS[now].name} moved into ${placePhrase(province)}.` };
    if (tried.length)
      return {
        outcome: 'no',
        text: was
          ? `No. ${list(tried)} tried, and ${NATIONS[was].name} kept ${placePhrase(province)}.`
          : `No. ${list(tried)} ${tried.length > 1 ? 'all tried, and the moves bounced' : 'tried, and the move failed'}, so ${placePhrase(province)} stayed empty.`,
      };
    return { outcome: 'no', text: `No. Nobody ordered a move into ${placePhrase(province)}${was ? `; ${NATIONS[was].name} stayed` : ''}.` };
  }
  // border
  const owner = q.powers[0];
  if (now && now !== owner) return { outcome: 'no', text: `No. ${NATIONS[now].name} moved into ${provinceName(province)}.` };
  return now === owner
    ? { outcome: 'yes', text: `Yes. ${NATIONS[owner].name} moved a unit back into ${provinceName(province)}.` }
    : { outcome: 'yes', text: `Yes. No foreign unit entered ${provinceName(province)}.` };
}
