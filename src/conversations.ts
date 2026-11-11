import { NATIONS, phaseName } from './domain';
import { baseProvince, describeOrder, outcomeText, placePhrase, plainOrder, PROVINCES, provinceName } from './story';
import { POWERS, type Dispatch, type Match, type Power, type PromiseCheck } from './types';

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
 * message carries `replyTo`; otherwise it is `inferred` and must be labelled so. Nothing is called
 * an agreement: an accepted proposal is "accepted" because the recipient said so, and "both sides
 * made commitments" only when each side recorded a promise in that conversation and phase.
 */

export type ReplyLink = {
  id: string;
  source: 'recorded' | 'inferred';
  /** Conversation the answered message belongs to, when it is not this one (additive). */
  conversationId?: string;
  /** Sender of the answered message (additive). */
  from?: Power;
};

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
  /** Plain language: "The fleet in Brest moves to the Mid-Atlantic Ocean". */
  plain: string;
  status: CommitmentStatus;
  /** Submitted order for that unit, once revealed. */
  actual?: string;
  actualPlain?: string;
  /** Engine result of the promised unit's submitted order, once revealed. */
  result?: 'succeeded' | 'failed';
  resultText?: string;
  /**
   * Additive: id of a later message in the same phase in which the same sender promised a
   * different order for the same unit. Only then is a commitment called superseded.
   */
  supersededBy?: string;
}

/** Additive: an answer a message received, as recorded (replyTo) or inferred (kind 'reply'). */
export interface Answer {
  id: string;
  from: Power;
  response?: Dispatch['response'];
  source: 'recorded' | 'inferred';
}

/**
 * Additive: where a proposal stands at the viewed moment, from recorded answers only. `answered`
 * means a reply exists without a stated response (or only an inferred one).
 */
export type Standing = 'unanswered' | 'accepted' | 'countered' | 'declined' | 'answered' | 'mixed';

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
  /** Additive: visible answers to this message, oldest first. */
  answers: Answer[];
  /** Additive: for proposals, threats, and messages with a request. */
  standing?: Standing;
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
  /** Additive: phases in which at least two participants each recorded a promise here. */
  mutual: { turn: number; phase: string; powers: Power[] }[];
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

// ---------------------------------------------------------------------------------------------
// Places named in a message.

/** Extra names people use for provinces. Full names come from PROVINCES. */
const ALIASES: [string, string][] = [
  ['Channel', 'ENG'],
  ['Mid-Atlantic', 'MAO'],
  ['Atlantic', 'MAO'],
  ['Bothnia', 'BOT'],
  ['Lyon', 'LYO'],
  ['Lyons', 'LYO'],
  ['Helgoland', 'HEL'],
  ['Heligoland', 'HEL'],
  ['St Petersburg', 'STP'],
  ['Petersburg', 'STP'],
  ['Tyrol', 'TYR'],
  ['Marseille', 'MAR'],
  ['Tyrrhenian', 'TYS'],
  ['Ionian', 'ION'],
  ['Aegean', 'AEG'],
  ['Adriatic', 'ADR'],
  ['Baltic', 'BAL'],
  ['Barents', 'BAR'],
  ['Norwegian Sea', 'NWG'],
  ['Irish Sea', 'IRI'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Longest names first, so "North Atlantic Ocean" wins over "Atlantic" and "Black Sea" is one place. */
const PLACE_PATTERNS: { re: RegExp; code: string }[] = [
  ...Object.entries(PROVINCES)
    .filter(([code]) => code !== 'GOL')
    .map(([code, name]) => [name, code] as [string, string]),
  ...ALIASES,
]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([name, code]) => ({ re: new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-])`, 'gi'), code }));

/** Base provinces named in free text, in order of appearance. Each span counts once. */
export function placesInText(text: string): string[] {
  const hits: { at: number; code: string }[] = [];
  const taken: [number, number][] = [];
  for (const { re, code } of PLACE_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const span: [number, number] = [m.index, m.index + m[0].length];
      if (taken.some(([a, b]) => span[0] < b && span[1] > a)) continue;
      taken.push(span);
      hits.push({ at: m.index, code });
    }
  }
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.code))];
}

function orderPlaces(order: string): string[] {
  const t = order.trim().split(/\s+/);
  const r = describeOrder(order);
  const out = [r.origin];
  if (r.kind === 'support' || r.kind === 'convoy') out.push(baseProvince(t[4] ?? ''));
  if (r.target) out.push(r.target);
  return out.filter(Boolean);
}

/** Places a message concerns: structured provinces, then the promised order, then names in the request and text. */
export function messagePlaces(m: Dispatch): string[] {
  const found = new Set<string>(m.provinces?.map(baseProvince) ?? []);
  if (m.promise) for (const p of orderPlaces(m.promise)) found.add(p);
  for (const p of placesInText(`${m.request ?? ''} ${m.text}`)) found.add(p);
  return [...found].filter((c) => Boolean(c) && c in PROVINCES);
}

// ---------------------------------------------------------------------------------------------
// Plain lines.

function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const KIND_VERB: Record<Dispatch['kind'], string> = {
  proposal: 'proposes',
  reply: 'replies',
  threat: 'warns',
  alliance: 'offers an alliance',
};

const KIND_NOUN: Record<Dispatch['kind'], string> = {
  proposal: 'proposal',
  reply: 'message',
  threat: 'warning',
  alliance: 'alliance offer',
};

/**
 * One plain line, derived from structured fields only. Never a paraphrase of intent. With the
 * answered message, a response names whose message it answers: "Britain accepts France’s proposal".
 */
export function summarize(m: Dispatch, answered?: Dispatch): string {
  const who = NATIONS[m.from].name;
  const whose = answered ? ` ${NATIONS[answered.from].name}’s ${answered.response === 'counter' ? 'counteroffer' : KIND_NOUN[answered.kind]}` : '';
  const parts: string[] = [];
  if (m.response === 'accept') parts.push(`${who} accepts${whose}`);
  else if (m.response === 'decline') parts.push(`${who} declines${whose}`);
  else if (m.response === 'counter') parts.push(`${who} makes a counteroffer`);
  else parts.push(`${who} ${KIND_VERB[m.kind]}`);
  if (m.promise) parts.push(`promises: ${lower(plainOrder(m.promise))}`);
  if (m.request) parts.push(`asks: ${lower(m.request)}`);
  return parts.join(' · ');
}

/** "The English Channel", "Belgium and Holland". */
export function subjectOf(places: string[]): string {
  const names = places.slice(0, 2).map((p) => placePhrase(p));
  const line = names.length === 2 ? `${names[0]} and ${names[1]}` : (names[0] ?? '');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function names(powers: Power[]) {
  const n = powers.map((p) => NATIONS[p].name);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
}

// ---------------------------------------------------------------------------------------------
// Commitments.

function checkFor(promises: PromiseCheck[], m: Dispatch) {
  return promises.find((p) => p.messageId === m.id) ?? promises.find((p) => !p.messageId && p.from === m.from && p.promised === m.promise);
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
    plain: plainOrder(m.promise),
    status: 'sealed',
  };
  if (turn >= index || !match.turns[turn]) return base;
  const t = match.turns[turn];
  const check = checkFor(t.promises, m);
  if (!check) return base;
  const unit = describeOrder(check.kept ? m.promise : check.actual).unit;
  const issued = check.actual !== 'No order issued';
  const tokens = (t.results[issued ? unit : describeOrder(m.promise).unit] ?? []).filter(Boolean);
  const known = issued && unit in t.results;
  return {
    ...base,
    status: check.kept ? 'kept' : 'broken',
    actual: check.actual,
    actualPlain: plainOrder(check.actual),
    // For a broken promise this is the result of the order actually submitted instead.
    result: known ? (tokens.length ? 'failed' : 'succeeded') : undefined,
    resultText: known ? outcomeText(tokens) : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Threads.

type Talk = { message: Dispatch; turn: number; phase: string };

const PROPOSING = new Set<Dispatch['kind']>(['proposal', 'alliance', 'threat']);

function standingOf(answers: Answer[]): Standing {
  if (!answers.length) return 'unanswered';
  const stated = answers.filter((a) => a.source === 'recorded' && a.response).map((a) => a.response!);
  if (!stated.length) return 'answered';
  const kinds = new Set(stated);
  if (kinds.size > 1) return 'mixed';
  return stated[0] === 'accept' ? 'accepted' : stated[0] === 'counter' ? 'countered' : 'declined';
}

/**
 * Builds threads from `shown` talks; `all` (every talk visible at the moment) is used to resolve
 * reply links into earlier phases and other conversations. Nothing outside `all` is read.
 */
function build(match: Match, index: number, shown: Talk[], all: Talk[]): Conversation[] {
  const byId = new Map(all.map((t) => [t.message.id, t]));
  const position = new Map(all.map((t, i) => [t.message.id, i]));
  // Reply links, recorded first; inference only for a 'reply' without one, and only within the
  // same conversation, the same or the previous phase, toward a message addressed to the sender.
  const links = new Map<string, ReplyLink>();
  for (let i = 0; i < all.length; i++) {
    const { message: m, turn } = all[i];
    const own = conversationId(participantsOf(m));
    if (m.replyTo && byId.has(m.replyTo) && position.get(m.replyTo)! < i) {
      const target = byId.get(m.replyTo)!.message;
      const cid = conversationId(participantsOf(target));
      links.set(m.id, { id: m.replyTo, source: 'recorded', from: target.from, ...(cid !== own ? { conversationId: cid } : {}) });
      continue;
    }
    if (m.replyTo || (m.kind !== 'reply' && !m.response)) continue;
    for (let j = i - 1; j >= 0; j--) {
      const prior = all[j];
      if (prior.turn < turn - 1) break;
      if (conversationId(participantsOf(prior.message)) !== own) continue;
      if (prior.message.from === m.from || !prior.message.to.includes(m.from)) continue;
      links.set(m.id, { id: prior.message.id, source: 'inferred', from: prior.message.from });
      break;
    }
  }
  const answersOf = new Map<string, Answer[]>();
  for (const { message: m } of all) {
    const link = links.get(m.id);
    if (!link) continue;
    const list = answersOf.get(link.id) ?? [];
    list.push({ id: m.id, from: m.from, response: link.source === 'recorded' ? m.response : undefined, source: link.source });
    answersOf.set(link.id, list);
  }

  const conversations = new Map<string, Conversation>();
  const counts = new Map<string, Map<string, number>>();
  for (const { message, turn, phase } of shown) {
    const participants = participantsOf(message);
    const id = conversationId(participants);
    let c = conversations.get(id);
    if (!c) {
      c = { id, participants, group: participants.length > 2, subject: '', places: [], messages: [], commitments: [], firstTurn: turn, lastTurn: turn, open: [], mutual: [] };
      conversations.set(id, c);
      counts.set(id, new Map());
    }
    const replyTo = links.get(message.id);
    const answered = replyTo?.source === 'recorded' ? byId.get(replyTo.id)?.message : undefined;
    const commitment = commitmentFor(match, index, message, turn, phase);
    const places = messagePlaces(message);
    const answers = answersOf.get(message.id) ?? [];
    const proposing = PROPOSING.has(message.kind) || Boolean(message.request);
    c.messages.push({
      message,
      phase,
      turn,
      season: phaseName(phase),
      summary: summarize(message, answered),
      places,
      replyTo,
      commitment,
      answers,
      standing: proposing ? standingOf(answers) : undefined,
    });
    if (commitment) c.commitments.push(commitment);
    const tally = counts.get(id)!;
    places.forEach((p, i) => tally.set(p, (tally.get(p) ?? 0) + (i === 0 ? 2 : 1)));
    for (const p of places) if (!c.places.includes(p)) c.places.push(p);
    c.lastTurn = turn;
  }

  for (const c of conversations.values()) {
    const tally = counts.get(c.id)!;
    c.places.sort((a, b) => (tally.get(b) ?? 0) - (tally.get(a) ?? 0));
    c.subject = c.places.length ? subjectOf(c.places) : c.group ? 'Group talks' : 'Private talks';
    // Superseded: the same sender later promised a different order for the same unit, same phase.
    for (const k of c.commitments) {
      const later = c.commitments.find(
        (x) => x.turn === k.turn && x.from === k.from && x.messageId !== k.messageId && x.order !== k.order &&
          describeOrder(x.order).unit === describeOrder(k.order).unit &&
          (position.get(x.messageId) ?? 0) > (position.get(k.messageId) ?? 0),
      );
      if (later) k.supersededBy = later.messageId;
    }
    for (const turn of [...new Set(c.commitments.map((k) => k.turn))]) {
      const powers = [...new Set(c.commitments.filter((k) => k.turn === turn).map((k) => k.from))];
      if (powers.length >= 2) c.mutual.push({ turn, phase: c.commitments.find((k) => k.turn === turn)!.phase, powers: POWERS.filter((p) => powers.includes(p)) });
    }
    c.open = openQuestions(c, index);
  }
  return [...conversations.values()].sort((a, b) => b.lastTurn - a.lastTurn || lastPosition(b, position) - lastPosition(a, position));
}

function lastPosition(c: Conversation, position: Map<string, number>) {
  return position.get(c.messages.at(-1)!.message.id) ?? 0;
}

/**
 * Unresolved points, only from the latest phase of the conversation: proposals and requests no
 * recipient has answered, and commitments still sealed. Wording distinguishes a phase still open
 * ("has not answered yet") from one whose orders are already sealed and resolved ("never answered").
 */
function openQuestions(c: Conversation, index: number): string[] {
  const out: string[] = [];
  const latest = c.messages.filter((m) => m.turn === c.lastTurn);
  const resolved = c.lastTurn < index;
  for (const m of latest) {
    const proposing = PROPOSING.has(m.message.kind) || Boolean(m.message.request) || m.message.response === 'counter';
    if (!proposing) continue;
    const silent = m.message.to.filter((p) => !m.answers.some((a) => a.from === p));
    if (!silent.length) continue;
    const what = m.message.response === 'counter' ? 'counteroffer' : m.message.request && m.message.kind === 'reply' ? 'request' : KIND_NOUN[m.message.kind];
    const focus = placesInText(m.message.request ?? '')[0] ?? m.places[0];
    const about = focus ? ` about ${placePhrase(focus)}` : '';
    const sender = NATIONS[m.message.from].name;
    out.push(
      resolved
        ? `${names(silent)} never answered ${sender}’s ${what}${about} before the orders were sealed.`
        : `${names(silent)} ${silent.length > 1 ? 'have' : 'has'} not answered ${sender}’s ${what}${about} yet.`,
    );
  }
  for (const k of c.commitments.filter((x) => x.status === 'sealed' && x.turn === c.lastTurn))
    out.push(`${NATIONS[k.from].name}’s promise to ${names(k.to)} is sealed: the orders are not revealed yet.`);
  return out;
}

/** Every conversation visible at moment `index`, most recently active first. */
export function conversationsAt(match: Match, index: number): Conversation[] {
  const all = visibleTalks(match, index);
  return build(match, index, all, all);
}

/** Conversations as they stood in one phase: only that phase's messages, read at moment `index`. */
export function conversationsInPhase(match: Match, turn: number, index = turn): Conversation[] {
  const at = Math.max(index, turn);
  const all = visibleTalks(match, at);
  return build(match, at, all.filter((t) => t.turn === turn), all);
}

/** Additive: the followed country's conversations first, then the rest, each keeping its order. */
export function orderForFollow(conversations: Conversation[], follow?: Power) {
  if (!follow) return { mine: conversations, elsewhere: [] as Conversation[] };
  return {
    mine: conversations.filter((c) => c.participants.includes(follow)),
    elsewhere: conversations.filter((c) => !c.participants.includes(follow)),
  };
}

/** Additive: "France and Britain", "Germany, Italy and Austria-Hungary". */
export function participantNames(c: Pick<Conversation, 'participants'>) {
  return names(c.participants);
}

/** Additive: a short label for a province code, for chips. */
export function placeLabel(code: string) {
  return provinceName(code);
}
