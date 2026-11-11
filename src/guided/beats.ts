import { NATIONS, phaseKind, phaseName } from '../domain';
import { conversationsInPhase, type Conversation } from '../conversations';
import { describeOrder } from '../story';
import type { Intervention, Match, Power } from '../types';
import type { ConceptId } from './concepts';
import { deriveGuidedPhase, type GuidedEvent } from './events';

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

/**
 * Minimal implementation; the narrative owner replaces it with stakes, questions, answers,
 * continuity across turns, and what-if suggestions. Signature and semantics are the contract.
 */
export function deriveWalkthrough(match: Match, turn: number, opts: WalkthroughOptions = {}): Walkthrough | undefined {
  const phase = deriveGuidedPhase(match, turn);
  const t = match.turns[turn];
  if (!phase || !t) return undefined;
  const season = `${phaseName(t.phase)} · ${phaseKind(t.phase).toLowerCase()}`;
  const beats: Beat[] = [];
  const conversations = conversationsInPhase(match, turn, turn);
  if (conversations.length && !opts.brief)
    beats.push({
      id: `${turn}-talks`,
      kind: 'talks',
      board: 'before',
      label: 'Private talks',
      headline: `${t.messages.length} private messages before the orders`,
      body: 'Read what each country said before anyone wrote orders.',
      powers: [...new Set(conversations.flatMap((c) => c.participants))],
      highlight: [...new Set(conversations.flatMap((c) => c.places))],
      concept: 'promise-vs-order',
      conversations,
      exact: [],
    });
  beats.push({
    id: `${turn}-sealed`,
    kind: 'sealed',
    board: 'before',
    label: 'Sealed orders',
    headline: 'Seven countries write their orders in secret',
    body: 'No one sees another country’s orders. They are all revealed and resolved together.',
    powers: [],
    highlight: [],
    concept: 'simultaneous',
    exact: [],
  });
  const revealAt = beats.length;
  beats.push({
    id: `${turn}-reveal`,
    kind: 'reveal',
    board: 'after',
    label: 'The reveal',
    headline: phase.events.length ? `${phase.events.length} things to look at` : 'Nothing was contested',
    body: `${phase.orderCount} orders resolved at the same moment.`,
    powers: [],
    highlight: [],
    exact: [],
  });
  for (const e of phase.events)
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
      concept: e.kind === 'kept-promise-failed' ? 'kept-but-failed' : e.kind === 'standoff' ? 'bounce' : undefined,
    });
  const whatIfs = whatIfsFor(match, turn);
  beats.push({
    id: `${turn}-next`,
    kind: 'next',
    board: 'after',
    label: 'Phase summary',
    headline: t.title || `${season} is complete`,
    body: t.recap,
    powers: [],
    highlight: [],
    whatIf: whatIfs[0],
    exact: [],
  });
  return {
    turn,
    phase: t.phase,
    season,
    title: t.title,
    beats,
    revealAt,
    questions: [],
    quiet: phase.events.length === 0 && t.messages.length === 0,
    overflow: phase.overflow,
    routine: phase.routine,
    whatIfs,
  };
}

/** Questions for the phase on screen at moment `index` (live or recorded), never answered. */
export function questionsAt(match: Match, index: number): Question[] {
  void match;
  void index;
  return [];
}

/** Supported "What if?" experiments for a resolved phase: one legal order change at checkpoint `turn`. */
export function whatIfsFor(match: Match, turn: number): WhatIf[] {
  const t = match.turns[turn];
  const cp = match.checkpoints[turn];
  if (!t || !cp || cp.state.done) return [];
  return t.promises
    .filter((p) => !p.kept && Object.values(cp.state.legal[p.from] ?? {}).flat().includes(p.promised))
    .map((p) => ({
      id: `${turn}-keep-${p.from}-${p.promised}`,
      question: `What if ${NATIONS[p.from].name} had kept its promise?`,
      change: `${describeOrder(p.promised).summary}, as promised.`,
      original: p.actual === 'No order issued' ? 'No order was issued for that unit.' : `${describeOrder(p.actual).summary}.`,
      at: turn,
      intervention: { power: p.from, order: p.promised },
      caveat: {
        sandbox: 'The free sandbox replays simple, fixed rules. The other countries will not react to the change strategically.',
        live: 'AI countries continue from this moment and can react to what happens. Each phase makes billed model calls.',
      },
    }));
}
