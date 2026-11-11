import { NATIONS, phaseKind, phaseName } from '../domain';
import { conversationsAt, conversationsInPhase, type Conversation } from '../conversations';
import { describeOrder, placePhrase, plainOrder, provinceName } from '../story';
import { POWERS, type Intervention, type Match, type Power } from '../types';
import type { ConceptId } from './concepts';
import { deriveGuidedPhase, type GuidedEvent } from './events';
import { answerQuestion, occupantOf, questionsFor, reachMap } from './questions';

/**
 * CONTRACT: the guided walkthrough of ONE recorded phase, as a sequence of beats with a clear
 * before/after split around the reveal of the sealed orders.
 *
 *   stakes → talks → question(s) → sealed → reveal → event … → next
 *
 * - Beats with `board: 'before'` describe the start of the phase (checkpoint `turn`). They may use
 *   that phase's talks, never its orders or results. The UI shows checkpoint `turn` for them.
 * - From `revealAt` on, beats use `board: 'after'` (checkpoint `turn + 1`) and may use the orders,
 *   results, and promise checks of this phase. Nothing reads a later turn or checkpoint.
 * - Quiet phases stay short: no stakes/question beats when the record gives nothing to ask.
 * - The last beat is always `next` (the phase summary): answers to the questions, what remains
 *   uncertain, and any supported "What if?" experiments.
 */

export type BeatKind = 'stakes' | 'talks' | 'question' | 'sealed' | 'reveal' | 'event' | 'next';

export interface Question {
  id: string;
  kind: 'promise' | 'contest' | 'border';
  /** "Will France send its fleet into the Atlantic, as it told Britain?" */
  text: string;
  powers: Power[];
  provinces: string[];
  /** For promise questions: the message that made the commitment. */
  messageId?: string;
  /** Filled only on the after side of the reveal. */
  answer?: { outcome: 'yes' | 'no' | 'mixed'; text: string };
}

export interface WhatIf {
  id: string;
  /** "What if France had kept its promise?" */
  question: string;
  /** Plain description of the change: "France's fleet in Brest moves to the Mid-Atlantic Ocean instead of the English Channel." */
  change: string;
  /** What the original record shows instead. */
  original: string;
  /** Checkpoint to branch from: the start of the phase where the decision was made. */
  at: number;
  /** A single, engine-legal intervention at that checkpoint. */
  intervention: Intervention;
  /** Honest notes about what each continuation mode can and cannot show. */
  caveat: { sandbox: string; live: string };
  /** Additive: continuation modes that support this experiment. */
  modes?: ('sandbox' | 'live')[];
}

export interface Beat {
  id: string;
  kind: BeatKind;
  board: 'before' | 'after';
  /** Short category label above the headline. */
  label: string;
  headline: string;
  /** Plain account of what the record shows. */
  body: string;
  /** Rule-based or strategic implication, never a claim about hidden intent. */
  matters?: string;
  powers: Power[];
  focus?: string;
  highlight: string[];
  /** A teaching note this beat makes relevant (shown once, skippable). */
  concept?: ConceptId;
  /** Additive: every teaching note this beat makes relevant, in order; `concept` is the first. */
  concepts?: ConceptId[];
  conversations?: Conversation[];
  question?: Question;
  event?: GuidedEvent;
  whatIf?: WhatIf;
  quote?: { from: Power; text: string };
  compare?: { promised: string; actual: string };
  exact: string[];
}

export interface Walkthrough {
  turn: number;
  phase: string;
  /** "Spring 1901 · movement". */
  season: string;
  title: string;
  beats: Beat[];
  /** Index in `beats` of the reveal beat; beats before it use the board before the phase. */
  revealAt: number;
  questions: Question[];
  quiet: boolean;
  overflow: string[];
  routine: number;
  whatIfs: WhatIf[];
}

export interface WalkthroughOptions {
  /** A followed country: beats involving it come first among equals, and its stakes lead. */
  follow?: Power;
  /** The viewer watched the talks live: begin at the sealed beat. */
  brief?: boolean;
}

const names = (powers: Power[]) => {
  const n = powers.map((p) => NATIONS[p].name);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
};
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const unique = <T,>(xs: T[]) => [...new Set(xs)];

/** Event kinds that make a phase worth more than a short summary. */
const CONSEQUENTIAL = new Set<GuidedEvent['kind']>([
  'broken-promise',
  'kept-promise-failed',
  'center-gained',
  'center-lost',
  'dislodged',
  'standoff',
  'supported-attack',
  'attack-occupied',
]);

/** How much a conversation matters for the beats: commitments, mutual ones, length, the followed country. */
function weight(c: Conversation, follow?: Power) {
  return c.commitments.length * 3 + c.mutual.length * 4 + c.messages.length + (follow && c.participants.includes(follow) ? 20 : 0);
}

/**
 * What earlier, already resolved phases say about these countries: the latest broken promise,
 * or kept promise, between them. Reads only turns before `turn`.
 */
function continuity(match: Match, turn: number, powers: Power[]): string | undefined {
  for (let t = turn - 1; t >= 0; t--) {
    const record = match.turns[t];
    const between = record.promises.filter((p) => powers.includes(p.from) && p.to.some((x) => powers.includes(x) && x !== p.from));
    const broken = between.find((p) => !p.kept);
    if (broken)
      return `Earlier, in ${phaseName(record.phase)}, ${NATIONS[broken.from].name} broke a promise to ${names(broken.to.filter((x) => powers.includes(x)))}: it had said “${lower(plainOrder(broken.promised))}” and ordered “${lower(plainOrder(broken.actual))}”.`;
    const kept = between.find((p) => p.kept);
    if (kept) return `Earlier, in ${phaseName(record.phase)}, ${NATIONS[kept.from].name} kept its promise to ${names(kept.to.filter((x) => powers.includes(x)))}.`;
  }
  return undefined;
}

/** "What each side wants" in one line, from its own stated request, else its national objective. */
function wants(c: Conversation, p: Power) {
  const asked = [...c.messages].reverse().find((m) => m.message.from === p && m.message.request)?.message.request;
  return asked ? `${NATIONS[p].name} asks: ${lower(asked)}.` : `${NATIONS[p].name}: ${NATIONS[p].objective}`;
}

/** The stakes of one conversation from the board before the phase and the legal orders at it. */
function stakesBeat(match: Match, turn: number, c: Conversation, first: boolean, follow?: Power): Beat {
  const cp = match.checkpoints[turn];
  const place = c.places[0];
  const reach = place ? (reachMap(cp.state.legal).get(place) ?? []) : [];
  const reaching = reach.filter((r) => c.participants.includes(r.power)).sort((a, b) => Number(b.power === follow) - Number(a.power === follow));
  const holder = place ? occupantOf(cp.state.board, place) : undefined;
  const sides = [...c.participants].sort((a, b) => Number(b === follow) - Number(a === follow)).slice(0, 3);
  const border = place
    ? reaching.length
      ? `${reaching
          .slice(0, 3)
          .map((r) => `${NATIONS[r.power].name}’s ${r.unit.startsWith('F') ? 'fleet' : 'army'} in ${placePhrase(describeOrder(`${r.unit} H`).origin)}`)
          .join(' and ')} can move into ${placePhrase(place)} this phase.${holder ? ` ${NATIONS[holder].name} holds it now.` : ''}`
      : `${names(sides)} are talking about ${placePhrase(place)}.`
    : `${names(sides)} are talking privately.`;
  const earlier = continuity(match, turn, c.participants);
  return {
    id: `${turn}-stakes-${c.id}`,
    kind: 'stakes',
    board: 'before',
    label: first && turn === 0 ? 'What is at stake' : 'At stake',
    headline: place ? `${names(sides)} · ${provinceName(place)}` : names(sides),
    body: [border, ...sides.map((p) => wants(c, p))].join(' '),
    matters: earlier ?? (place ? `Whoever controls ${placePhrase(place)} shapes what each side can do next.` : undefined),
    powers: sides,
    focus: place,
    highlight: c.places.slice(0, 4),
    ...(first && turn === 0 ? { concept: 'observer' as const, concepts: ['observer', 'goal', 'centers'] as ConceptId[] } : {}),
    conversations: [c],
    exact: [],
  };
}

function talksBeat(turn: number, cs: Conversation[], label: string, id: string, concept?: ConceptId): Beat {
  const messages = cs.reduce((n, c) => n + c.messages.length, 0);
  const promises = cs.reduce((n, c) => n + c.commitments.length, 0);
  const lead = cs[0];
  const headline =
    cs.length === 1
      ? `${names(lead.participants)}${lead.group ? ' (group)' : ''}: ${messages} ${messages === 1 ? 'message' : 'messages'}`
      : `${cs.length} more conversations, ${messages} messages`;
  const promised = promises ? ` ${promises} ${promises === 1 ? 'message names' : 'messages name'} an exact order.` : '';
  const mutual = cs.flatMap((c) => c.mutual.filter((m) => m.turn === turn).map(() => names(c.participants)));
  return {
    id,
    kind: 'talks',
    board: 'before',
    label,
    headline,
    body: `${cs.length === 1 ? lead.messages.map((m) => m.summary).slice(-3).join('. ') + '.' : cs.map((c) => `${names(c.participants)}: ${c.subject}`).join('. ') + '.'}${promised}`,
    matters: mutual.length
      ? `Both sides made commitments (${unique(mutual).join('; ')}). Whether the sealed orders match is revealed together.`
      : promises
        ? 'A promise made by one side alone is not an agreement.'
        : 'Words are not orders. The orders are written separately, in secret.',
    powers: unique(cs.flatMap((c) => c.participants)),
    focus: lead.places[0],
    highlight: unique(cs.flatMap((c) => c.places)).slice(0, 6),
    ...(concept ? { concept, concepts: [concept] } : {}),
    conversations: cs,
    quote: lead.messages.find((m) => m.message.promise) ? { from: lead.messages.find((m) => m.message.promise)!.message.from, text: lead.messages.find((m) => m.message.promise)!.message.text } : undefined,
    exact: [],
  };
}

function eventConcept(e: GuidedEvent): ConceptId | undefined {
  if (e.kind === 'kept-promise-failed') return 'kept-but-failed';
  if (e.kind === 'standoff') return 'bounce';
  if (e.kind === 'supported-attack') return 'support';
  return undefined;
}

/** Whether a question is about this event, so the answer is shown with it instead of on its own. */
function questionFits(q: Question, e: GuidedEvent, match: Match, turn: number) {
  if (q.kind === 'promise') {
    const m = match.turns[turn].messages.find((x) => x.id === q.messageId);
    return Boolean(m && e.compare && e.compare.promised === m.promise && e.powers[0] === m.from);
  }
  return e.focus === q.provinces[0] || e.highlight.includes(q.provinces[0]);
}

/**
 * The walkthrough of one resolved phase. Before the reveal it reads the board at the start of the
 * phase, its legal orders, and its talks; from the reveal on, that phase's resolution. Earlier
 * turns are read only for continuity ("Earlier, France broke a promise to Britain").
 */
export function deriveWalkthrough(match: Match, turn: number, opts: WalkthroughOptions = {}): Walkthrough | undefined {
  const phase = deriveGuidedPhase(match, turn);
  const t = match.turns[turn];
  if (!phase || !t) return undefined;
  const { follow, brief } = opts;
  const season = `${phaseName(t.phase)} · ${phaseKind(t.phase).toLowerCase()}`;
  const conversations = conversationsInPhase(match, turn, turn).sort((a, b) => weight(b, follow) - weight(a, follow));
  const asked = questionsFor(match, turn, turn, follow);
  const questions = asked.map((q) => ({ ...q, answer: answerQuestion(match, turn, q) }));
  const consequential = phase.events.filter((e) => CONSEQUENTIAL.has(e.kind));
  const quiet = consequential.length === 0 && t.promises.length === 0;
  const beats: Beat[] = [];

  if (!brief && !quiet) {
    const lead = conversations[0];
    if (lead) beats.push(stakesBeat(match, turn, lead, true, follow));
    if (lead) beats.push(talksBeat(turn, [lead], 'Private talks', `${turn}-talks-${lead.id}`, lead.commitments.length ? 'promise-vs-order' : undefined));
    const rest = conversations.slice(1);
    if (rest.length) beats.push(talksBeat(turn, rest, 'Elsewhere', `${turn}-talks-elsewhere`, lead?.commitments.length ? undefined : rest.some((c) => c.commitments.length) ? 'promise-vs-order' : undefined));
    // One question beat keeps the walk short; any second question stays in the Watch for panel and the summary.
    for (const q of asked.slice(0, 1))
      beats.push({
        id: `${turn}-question-${q.id}`,
        kind: 'question',
        board: 'before',
        label: 'Watch for',
        headline: q.text,
        body: q.kind === 'promise' ? 'The promise is in the talks. The order is sealed. They are revealed together.' : 'Several countries can move here this phase. Moves into the same place by equal forces bounce.',
        powers: q.powers,
        focus: q.provinces[0],
        highlight: q.provinces,
        question: q,
        exact: [],
      });
  } else if (!brief && quiet && conversations.length) {
    // A quiet phase: one talks beat stands in for the sealed beat, so it stays at three beats.
    beats.push(talksBeat(turn, conversations, 'Private talks', `${turn}-talks`));
  }

  if (!(quiet && beats.length)) beats.push({
    id: `${turn}-sealed`,
    kind: 'sealed',
    board: 'before',
    label: 'Sealed orders',
    headline: phaseKind(t.phase) === 'Movement' ? 'Seven countries write their orders in secret' : `${phaseKind(t.phase)}: orders are sealed`,
    body: 'No one sees another country’s orders. They are all revealed and resolved together.',
    powers: [],
    highlight: [],
    concept: 'simultaneous',
    concepts: ['simultaneous'],
    exact: [],
  });
  const revealAt = beats.length;

  // Plain-language orders first: the followed country's (or the lead conversation's) orders.
  const shown = follow ? [follow] : (conversations[0]?.participants.slice(0, 2) ?? []);
  const shownOrders = shown.flatMap((p) => t.decisions[p].orders.map((o) => ({ p, o })));
  // The talks summary event repeats the talks beats; it stays only when those were skipped (brief).
  const events = [...phase.events].filter((e) => e.kind !== 'talks' || brief).sort((a, b) => a.priority - b.priority || Number(Boolean(follow && b.powers.includes(follow))) - Number(Boolean(follow && a.powers.includes(follow))));
  const shownEvents = events.filter((e) => e.kind !== 'talks');
  beats.push({
    id: `${turn}-reveal`,
    kind: 'reveal',
    board: 'after',
    label: 'The reveal',
    headline: quiet ? (shownEvents.length ? shownEvents[0].headline : 'Nothing was contested') : 'The orders are revealed',
    body:
      (shownOrders.length ? shownOrders.map(({ p, o }) => `${NATIONS[p].name}: ${lower(plainOrder(o))}.`).slice(0, 5).join(' ') + ' ' : '') +
      `${phase.orderCount} ${phase.orderCount === 1 ? 'order' : 'orders'} resolved at the same moment.`,
    matters: quiet && shownEvents.length ? shownEvents[0].happened : undefined,
    powers: shown,
    focus: events[0]?.focus,
    highlight: unique(events.flatMap((e) => e.highlight)).slice(0, 6),
    exact: shownOrders.map(({ o }) => o).slice(0, 5),
  });

  const placed = new Set<string>();
  if (!quiet)
    for (const e of events) {
      const q = questions.find((x) => !placed.has(x.id) && x.answer && questionFits(x, e, match, turn));
      if (q) placed.add(q.id);
      const concept = eventConcept(e);
      beats.push({
        id: e.id,
        kind: 'event',
        board: 'after',
        label: e.label,
        headline: e.headline,
        body: e.happened,
        matters: e.matters,
        powers: e.powers,
        focus: e.focus,
        highlight: e.highlight,
        event: e,
        quote: e.quote,
        compare: e.compare,
        exact: e.exact,
        ...(q ? { question: q } : {}),
        ...(concept ? { concept, concepts: [concept] } : {}),
      });
    }
  // Answers with no matching event are given on the summary beat (The answers), not as extra beats.
  const whatIfs = whatIfsFor(match, turn);
  const changes = POWERS.map((p) => ({
    p,
    d: match.checkpoints[turn + 1].state.board.centers[p].length - match.checkpoints[turn].state.board.centers[p].length,
  })).filter((x) => x.d);
  const after = conversationsAt(match, turn + 1).filter((c) => c.lastTurn === turn);
  const uncertain = after.flatMap((c) => c.open).slice(0, 2);
  const told = (consequential.length ? consequential : shownEvents).slice(0, 3).map((e) => e.headline);
  const centerNews = changes.length && !consequential.some((e) => e.kind === 'center-gained' || e.kind === 'center-lost')
    ? [`${changes.map(({ p, d }) => `${NATIONS[p].name} ${d > 0 ? 'gained' : 'lost'} ${Math.abs(d)} supply ${Math.abs(d) === 1 ? 'center' : 'centers'}`).join('; ')}`]
    : [];
  beats.push({
    id: `${turn}-next`,
    kind: 'next',
    board: 'after',
    label: 'Phase summary',
    headline: t.title || `${season} is complete`,
    body: told.length || centerNews.length
      ? [...told, ...centerNews].join('. ') + '.'
      : 'A quiet phase: no promise was tested, nothing was contested, and no supply center changed hands.',
    matters: uncertain.length ? uncertain.join(' ') : undefined,
    powers: [],
    highlight: [],
    whatIf: whatIfs[0],
    ...(whatIfs.length ? { concept: 'what-if' as const, concepts: ['what-if'] as ConceptId[] } : {}),
    exact: [],
  });
  return {
    turn,
    phase: t.phase,
    season,
    title: t.title,
    beats,
    revealAt,
    questions,
    quiet,
    overflow: phase.overflow,
    routine: phase.routine,
    whatIfs,
  };
}

/** Questions for the phase on screen at moment `index` (live or recorded), never answered. */
export function questionsAt(match: Match, index: number, follow?: Power): Question[] {
  if (index < 0 || index >= match.checkpoints.length) return [];
  return questionsFor(match, index, index, follow);
}

const CAVEAT = {
  sandbox:
    'The free sandbox continues with simple, fixed rules: the other countries will not react to the change strategically, and messages do not change their orders.',
  live: 'AI countries continue from this moment and can react to what happens. Each phase makes billed model calls.',
};

/** Supported "What if?" experiments for a resolved phase: one legal order change at checkpoint `turn`. */
export function whatIfsFor(match: Match, turn: number): WhatIf[] {
  const t = match.turns[turn];
  const cp = match.checkpoints[turn];
  if (!t || !cp || cp.state.done) return [];
  const legal = (p: Power, order: string) => Object.values(cp.state.legal[p] ?? {}).some((os) => os.includes(order));
  const out: WhatIf[] = [];
  const add = (w: Omit<WhatIf, 'at' | 'caveat' | 'modes'>) => {
    if (!legal(w.intervention.power, w.intervention.order!) || out.some((x) => x.id === w.id)) return;
    out.push({ ...w, at: turn, caveat: CAVEAT, modes: ['sandbox', 'live'] });
  };
  const holdOf = (order: string) => `${describeOrder(order).unit} H`;

  // 1. A broken promise: keep it.
  for (const p of t.promises.filter((x) => !x.kept))
    add({
      id: `${turn}-keep-${p.from}-${p.promised}`,
      question: `What if ${NATIONS[p.from].name} had kept its promise?`,
      change: `${plainOrder(p.promised)}, as promised to ${names(p.to)}.`,
      original: p.actual === 'No order issued' ? 'No order was issued for that unit.' : `${plainOrder(p.actual)}.`,
      intervention: { power: p.from, order: p.promised },
    });

  // 2. A kept promise whose move failed: the country that blocked it holds instead.
  for (const p of t.promises.filter((x) => x.kept)) {
    const r = describeOrder(p.promised);
    if (r.kind !== 'move' || !r.target || !(t.results[r.unit] ?? []).filter(Boolean).length) continue;
    for (const other of POWERS.filter((x) => x !== p.from))
      for (const o of t.decisions[other].orders) {
        const b = describeOrder(o);
        if (b.kind !== 'move' || b.target !== r.target) continue;
        add({
          id: `${turn}-unblock-${other}-${o}`,
          question: `What if ${NATIONS[other].name} had not moved into ${provinceName(r.target)}?`,
          change: `${plainOrder(holdOf(o))} instead, so ${NATIONS[p.from].name}’s promised move is not blocked by it.`,
          original: `${plainOrder(o)}, and both moves bounced.`,
          intervention: { power: other, order: holdOf(o) },
        });
      }
  }

  // 3. A supported attack that succeeded: the supporter holds instead.
  const before = cp.state.board;
  for (const p of POWERS)
    for (const o of t.decisions[p].orders) {
      const r = describeOrder(o);
      if (r.kind !== 'support' || !r.target) continue;
      const supported = o.split(' S ')[1]?.split(' - ')[0];
      const mover = POWERS.find((x) => t.decisions[x].orders.some((m) => m.startsWith(`${supported} - `) && describeOrder(m).target === r.target));
      const moved = mover && t.decisions[mover].orders.find((m) => m.startsWith(`${supported} - `));
      if (!mover || !moved || (t.results[supported ?? ''] ?? []).filter(Boolean).length) continue;
      const defender = occupantOf(before, r.target);
      if (!defender || defender === mover) continue;
      add({
        id: `${turn}-nosupport-${p}-${o}`,
        question: `What if ${NATIONS[p].name} had not supported ${p === mover ? 'its own' : `${NATIONS[mover].name}’s`} attack on ${provinceName(r.target)}?`,
        change: `${plainOrder(holdOf(o))} instead of supporting the attack.`,
        original: `${plainOrder(o)}, and the attack succeeded.`,
        intervention: { power: p, order: holdOf(o) },
      });
    }

  // 4. A standoff with no promise involved: one side stays home.
  for (const p of POWERS)
    for (const o of t.decisions[p].orders) {
      const r = describeOrder(o);
      if (r.kind !== 'move' || !r.target || !(t.results[r.unit] ?? []).includes('bounce')) continue;
      if (t.promises.some((x) => x.promised === o)) continue;
      add({
        id: `${turn}-stay-${p}-${o}`,
        question: `What if ${NATIONS[p].name} had not tried to enter ${provinceName(r.target)}?`,
        change: `${plainOrder(holdOf(o))} instead.`,
        original: `${plainOrder(o)}, and the move bounced.`,
        intervention: { power: p, order: holdOf(o) },
      });
    }
  // One experiment of each kind first (keep a promise, unblock, withdraw support, stay home), then the rest.
  const kind = (w: WhatIf) => w.id.split('-')[1];
  const firsts = out.filter((w, i) => out.findIndex((x) => kind(x) === kind(w)) === i);
  return [...firsts, ...out.filter((w) => !firsts.includes(w))].slice(0, 3);
}
