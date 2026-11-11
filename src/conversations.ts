import { NATIONS, phaseName } from './domain';
import { baseProvince, describeOrder, outcomeText } from './story';
import { POWERS, type Dispatch, type Match, type Power } from './types';

/**
 * CONTRACT (shared by the Watch stage, the guide, and the Conversations page).
 *
 * Conversations are derived, read-only views of the recorded dispatches. A conversation is the set
 * of messages exchanged among one exact group of participants (sender ∪ recipients). Group
 * conversations keep their real participants; a bilateral thread never absorbs a group message.
 *
 * Visibility at moment `index` (the board at the start of phase `index`):
 * - Talks of every phase up to and including the phase on screen are visible: turns[0..index]
 *   messages, plus `match.pending.messages` when `index === match.turns.length`.
 * - Orders and outcomes are visible only for phases that resolved before the moment: turn < index.
 *   A commitment made in the phase on screen is `sealed`.
 * Nothing here reads a later turn or checkpoint.
 *
 * Status words are only those the record supports: `response` is the sender's stated answer,
 * `kept`/`broken` come from the promise check, and a reply link is `recorded` only when the
 * message carries `replyTo`; otherwise it is `inferred` and must be labelled so.
 */

export type ReplyLink = { id: string; source: 'recorded' | 'inferred' };

/** sealed: that phase's orders are not revealed at the viewed moment. */
export type CommitmentStatus = 'sealed' | 'kept' | 'broken';

export interface Commitment {
  messageId: string;
  from: Power;
  to: Power[];
  phase: string;
  turn: number;
  /** Exact promised order. */
  order: string;
  /** Plain language: "Fleet Brest moves to Mid-Atlantic Ocean". */
  plain: string;
  status: CommitmentStatus;
  /** Submitted order for that unit, once revealed. */
  actual?: string;
  actualPlain?: string;
  /** Engine result of the promised unit's submitted order, once revealed. */
  result?: 'succeeded' | 'failed';
  resultText?: string;
}

export interface ThreadMessage {
  message: Dispatch;
  phase: string;
  /** Index in match.turns of the phase the message belongs to (=== turns.length for a pending phase). */
  turn: number;
  /** "Spring 1901". */
  season: string;
  /** One plain line derived from the record: what is offered, asked, or warned. */
  summary: string;
  /** Base province codes the message concerns (structured, promise, or named in the text). */
  places: string[];
  replyTo?: ReplyLink;
  commitment?: Commitment;
}

export interface Conversation {
  /** Stable id: participants in canonical order joined with "+". */
  id: string;
  participants: Power[];
  group: boolean;
  /** Short plain subject, such as "The English Channel". */
  subject: string;
  places: string[];
  messages: ThreadMessage[];
  commitments: Commitment[];
  firstTurn: number;
  lastTurn: number;
  /** Plain unresolved points the record supports, such as "Britain has not answered yet." */
  open: string[];
}

export function conversationId(participants: Power[]) {
  return POWERS.filter((p) => participants.includes(p)).join('+');
}

export function participantsOf(m: Dispatch): Power[] {
  return POWERS.filter((p) => p === m.from || m.to.includes(p));
}

/** Messages visible at moment `index`, tagged with the turn they belong to. */
export function visibleTalks(match: Match, index: number): { message: Dispatch; turn: number; phase: string }[] {
  const out: { message: Dispatch; turn: number; phase: string }[] = [];
  const last = Math.min(index, match.turns.length - 1);
  for (let t = 0; t <= last; t++) for (const message of match.turns[t].messages) out.push({ message, turn: t, phase: match.turns[t].phase });
  if (index === match.turns.length && match.pending) {
    const phase = match.checkpoints.at(-1)!.state.board.name;
    for (const message of match.pending.messages) out.push({ message, turn: match.turns.length, phase });
  }
  return out;
}

const PLACE_WORDS: [RegExp, string][] = [
  [/\bchannel\b/i, 'ENG'],
  [/\batlantic\b/i, 'MAO'],
  [/\bblack sea\b/i, 'BLA'],
  [/\bnorth sea\b/i, 'NTH'],
  [/\bbelgium\b/i, 'BEL'],
  [/\bholland\b/i, 'HOL'],
  [/\bgalicia\b/i, 'GAL'],
  [/\bvenice\b/i, 'VEN'],
  [/\btyrol/i, 'TYR'],
  [/\bbalkans?\b/i, 'SER'],
  [/\bburgundy\b/i, 'BUR'],
  [/\bmunich\b/i, 'MUN'],
  [/\bdenmark\b/i, 'DEN'],
  [/\bsweden\b/i, 'SWE'],
  [/\bnorway\b/i, 'NWY'],
  [/\brumania\b/i, 'RUM'],
  [/\bbulgaria\b/i, 'BUL'],
  [/\bgreece\b/i, 'GRE'],
  [/\bserbia\b/i, 'SER'],
  [/\btunis\b/i, 'TUN'],
  [/\bspain\b/i, 'SPA'],
  [/\bportugal\b/i, 'POR'],
  [/\blondon\b/i, 'LON'],
  [/\bbrest\b/i, 'BRE'],
];

/** Places a message concerns: structured provinces, then the promised order, then names in the text. */
export function messagePlaces(m: Dispatch): string[] {
  const found = new Set<string>(m.provinces?.map(baseProvince) ?? []);
  if (m.promise) {
    const r = describeOrder(m.promise);
    found.add(r.origin);
    if (r.target) found.add(r.target);
  }
  for (const [re, code] of PLACE_WORDS) if (re.test(m.text)) found.add(code);
  return [...found].filter(Boolean);
}

function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const KIND_VERB: Record<Dispatch['kind'], string> = {
  proposal: 'proposes',
  reply: 'replies',
  threat: 'warns',
  alliance: 'offers an alliance',
};

/** One plain line, derived from structured fields only. Never a paraphrase of intent. */
export function summarize(m: Dispatch): string {
  const who = NATIONS[m.from].name;
  const parts: string[] = [];
  if (m.response === 'accept') parts.push(`${who} accepts`);
  else if (m.response === 'decline') parts.push(`${who} declines`);
  else if (m.response === 'counter') parts.push(`${who} makes a counteroffer`);
  else parts.push(`${who} ${KIND_VERB[m.kind]}`);
  if (m.promise) parts.push(`promises: ${lower(describeOrder(m.promise).summary)}`);
  if (m.request) parts.push(`asks: ${lower(m.request)}`);
  return parts.join(' · ');
}

function commitmentFor(match: Match, index: number, m: Dispatch, turn: number, phase: string): Commitment | undefined {
  if (!m.promise) return undefined;
  const base: Commitment = {
    messageId: m.id,
    from: m.from,
    to: m.to,
    phase,
    turn,
    order: m.promise,
    plain: describeOrder(m.promise).summary,
    status: 'sealed',
  };
  if (turn >= index || !match.turns[turn]) return base;
  const t = match.turns[turn];
  const check =
    t.promises.find((p) => p.messageId === m.id) ?? t.promises.find((p) => !p.messageId && p.from === m.from && p.promised === m.promise);
  if (!check) return base;
  const unit = describeOrder(m.promise).unit;
  const tokens = (t.results[unit] ?? []).filter(Boolean);
  const failed = check.kept ? tokens.length > 0 : undefined;
  return {
    ...base,
    status: check.kept ? 'kept' : 'broken',
    actual: check.actual,
    actualPlain: check.actual === 'No order issued' ? 'No order issued' : describeOrder(check.actual).summary,
    result: failed === undefined ? undefined : failed ? 'failed' : 'succeeded',
    resultText: failed === undefined ? undefined : outcomeText(tokens),
  };
}

/** Every conversation visible at moment `index`, most recently active first. */
export function conversationsAt(match: Match, index: number): Conversation[] {
  const talks = visibleTalks(match, index);
  const byId = new Map<string, Conversation>();
  const seen = new Map<string, Dispatch>();
  for (const { message, turn, phase } of talks) {
    const participants = participantsOf(message);
    const id = conversationId(participants);
    let c = byId.get(id);
    if (!c) {
      c = { id, participants, group: participants.length > 2, subject: '', places: [], messages: [], commitments: [], firstTurn: turn, lastTurn: turn, open: [] };
      byId.set(id, c);
    }
    let replyTo: ReplyLink | undefined;
    if (message.replyTo && seen.has(message.replyTo)) replyTo = { id: message.replyTo, source: 'recorded' };
    else if (message.kind === 'reply') {
      const prior = [...c.messages].reverse().find((x) => x.message.from !== message.from);
      if (prior) replyTo = { id: prior.message.id, source: 'inferred' };
    }
    const commitment = commitmentFor(match, index, message, turn, phase);
    const places = messagePlaces(message);
    c.messages.push({ message, phase, turn, season: phaseName(phase), summary: summarize(message), places, replyTo, commitment });
    if (commitment) c.commitments.push(commitment);
    for (const p of places) if (!c.places.includes(p)) c.places.push(p);
    c.lastTurn = turn;
    seen.set(message.id, message);
  }
  for (const c of byId.values()) {
    c.subject = c.places.length ? c.places.slice(0, 2).map((p) => p).join(' · ') : c.group ? 'Group talks' : 'Private talks';
    const last = c.messages.at(-1);
    if (last && (last.message.kind === 'proposal' || last.message.kind === 'alliance') && !c.group)
      c.open.push(`${c.participants.filter((p) => p !== last.message.from).map((p) => NATIONS[p].name).join(', ')} has not answered yet.`);
  }
  return [...byId.values()].sort((a, b) => b.lastTurn - a.lastTurn);
}

/** Conversations as they stood in one phase: only that phase's messages, read at moment `index`. */
export function conversationsInPhase(match: Match, turn: number, index = turn): Conversation[] {
  return conversationsAt(match, Math.max(index, turn))
    .map((c) => ({ ...c, messages: c.messages.filter((m) => m.turn === turn), commitments: c.commitments.filter((k) => k.turn === turn) }))
    .filter((c) => c.messages.length > 0);
}
