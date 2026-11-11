import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, CornerDownRight, LockKeyhole, MapPin, MessagesSquare, Users } from 'lucide-react';
import { NATIONS, phaseName } from '../domain';
import {
  conversationsAt,
  orderForFollow,
  participantNames,
  placeLabel,
  type Commitment,
  type Conversation,
  type ThreadMessage,
} from '../conversations';
import { POWERS, type Match, type Power } from '../types';
import { Crest } from './Shared';
import '../conversations.css';

/**
 * Conversation views. Everything shown is derived by `conversationsAt(match, index)`, so it obeys
 * the moment rule: talks up to the phase on screen, outcomes only for phases already resolved.
 * Status words come only from the record (a sender's stated response, a promise check); an
 * inferred reply link says it is inferred.
 */

const KIND_LABEL = { proposal: 'Proposal', reply: 'Reply', threat: 'Warning', alliance: 'Alliance offer' } as const;
const RESPONSE_LABEL = { accept: 'Accepts', counter: 'Counteroffer', decline: 'Declines' } as const;
const STANDING_LABEL = {
  unanswered: 'No answer',
  accepted: 'Accepted',
  countered: 'Countered',
  declined: 'Declined',
  answered: 'Answered',
  mixed: 'Mixed answers',
} as const;

function roundLabel(m: ThreadMessage) {
  const r = m.message.round;
  return r < 0 ? `${m.season} · observer’s message` : `${m.season} · round ${r + 1}`;
}

function nameList(powers: Power[]) {
  const n = powers.map((p) => NATIONS[p].name);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
}

function Crests({ powers }: { powers: Power[] }) {
  return (
    <span className="cv-crests" aria-hidden="true">
      {powers.map((p) => (
        <Crest key={p} power={p} small />
      ))}
    </span>
  );
}

function PlaceChips({ places, onLocate, limit = 4 }: { places: string[]; onLocate: (code: string) => void; limit?: number }) {
  if (!places.length) return null;
  return (
    <ul className="cv-places" aria-label="Places on the map">
      {places.slice(0, limit).map((code) => (
        <li key={code}>
          <button type="button" className="cv-chip place" onClick={() => onLocate(code)} aria-label={`Show ${placeLabel(code)} on the map`}>
            <MapPin size={13} aria-hidden="true" />
            {placeLabel(code)}
          </button>
        </li>
      ))}
    </ul>
  );
}

const STATUS_TEXT: Record<Commitment['status'], string> = {
  sealed: 'Sealed · orders not revealed yet',
  kept: 'Kept',
  broken: 'Broken',
};

/** A promised order in plain words, its status, and once revealed what was ordered and how it resolved. */
function CommitmentBlock({ k, onOpenOutcome }: { k: Commitment; onOpenOutcome?: () => void }) {
  return (
    <div className={`cv-commitment ${k.status}`}>
      <div className="cv-commitment-head">
        <span className="cv-commitment-label">Promised order</span>
        <span className={`cv-status ${k.status}`}>{STATUS_TEXT[k.status]}</span>
      </div>
      <p className="cv-commitment-plain">{k.plain}.</p>
      {k.supersededBy && <p className="cv-note">Superseded: later in this phase, {NATIONS[k.from].name} promised a different order for the same unit.</p>}
      {k.status === 'broken' && k.actualPlain && (
        <p className="cv-commitment-actual">
          <b>Ordered instead:</b> {k.actualPlain}.{k.resultText && ` ${k.result === 'succeeded' ? 'It succeeded.' : `It failed: ${k.resultText.toLowerCase()}.`}`}
        </p>
      )}
      {k.status === 'kept' && k.resultText && (
        <p className={`cv-commitment-actual ${k.result}`}>
          <b>Result:</b> {k.result === 'succeeded' ? 'the order succeeded.' : `the order was submitted as promised but failed. ${k.resultText}.`}
        </p>
      )}
      {k.status === 'sealed' && <p className="cv-note">A promise is not an order. The real orders are revealed together when the phase resolves.</p>}
      <details className="cv-exact">
        <summary>Exact order</summary>
        <code>{k.order}</code>
        {k.actual && k.actual !== k.order && (
          <>
            <span> submitted </span>
            <code>{k.actual}</code>
          </>
        )}
      </details>
      {onOpenOutcome && k.status !== 'sealed' && (
        <button type="button" className="cv-link" onClick={onOpenOutcome}>
          See the board after {phaseName(k.phase)}
        </button>
      )}
    </div>
  );
}

function MessageItem({
  m,
  conversation,
  compact,
  highlighted,
  onJump,
  onOpenMoment,
}: {
  m: ThreadMessage;
  conversation: Conversation;
  compact: boolean;
  highlighted: boolean;
  onJump: (id: string) => void;
  onOpenMoment?: (index: number) => void;
}) {
  const { message } = m;
  const target = m.replyTo ? conversation.messages.find((x) => x.message.id === m.replyTo!.id) : undefined;
  const [open, setOpen] = useState(!compact);
  return (
    <li id={`cv-msg-${message.id}`} className={`cv-message ${message.kind} ${highlighted ? 'highlight' : ''}`} tabIndex={-1}>
      <div className="cv-message-head">
        <Crest power={message.from} small />
        <span className="cv-from" style={{ color: NATIONS[message.from].color }}>
          {NATIONS[message.from].name}
        </span>
        <span className="cv-to">to {nameList(message.to)}</span>
        <span className="cv-chips">
          <span className={`cv-chip kind ${message.kind}`}>{KIND_LABEL[message.kind]}</span>
          {message.response && m.replyTo?.source === 'recorded' && <span className={`cv-chip response ${message.response}`}>{RESPONSE_LABEL[message.response]}</span>}
        </span>
      </div>
      {m.replyTo && (
        <p className={`cv-reply-link ${m.replyTo.source}`}>
          <CornerDownRight size={13} aria-hidden="true" />
          {m.replyTo.source === 'recorded' ? 'In reply to ' : 'Probably answering '}
          {target ? (
            <button type="button" className="cv-link" onClick={() => onJump(target.message.id)}>
              {NATIONS[target.message.from].name}’s {KIND_LABEL[target.message.kind].toLowerCase()} ({target.season})
            </button>
          ) : (
            <span>
              {m.replyTo.from ? `${NATIONS[m.replyTo.from].name}’s message` : 'an earlier message'}
              {m.replyTo.conversationId ? ` in ${nameList(m.replyTo.conversationId.split('+') as Power[])}’s talks` : ''}
            </span>
          )}
          {m.replyTo.source === 'inferred' && <span className="cv-inferred"> · inferred from the order of messages, not recorded</span>}
        </p>
      )}
      <p className="cv-summary">{m.summary}.</p>
      {compact && !open ? (
        <button type="button" className="cv-link cv-read" onClick={() => setOpen(true)} aria-expanded={false}>
          Read the original message
        </button>
      ) : (
        <blockquote className="cv-original">
          <span className="cv-original-label">
            <LockKeyhole size={12} aria-hidden="true" /> Original message
          </span>
          “{message.text}”
        </blockquote>
      )}
      {m.commitment && (
        <CommitmentBlock k={m.commitment} onOpenOutcome={onOpenMoment ? () => onOpenMoment(m.commitment!.turn + 1) : undefined} />
      )}
      {m.standing && m.standing !== 'answered' && (
        <p className={`cv-standing ${m.standing}`}>
          {m.standing === 'unanswered'
            ? `No recorded answer from ${nameList(message.to)} at this moment.`
            : `${STANDING_LABEL[m.standing]} by ${nameList(m.answers.filter((a) => a.source === 'recorded' && a.response).map((a) => a.from))}, in their own reply.`}
        </p>
      )}
    </li>
  );
}

/** One conversation: participants, subject, places, messages by phase and round, commitments, open questions. */
export function ConversationThread({
  conversation,
  compact = false,
  match,
  index,
  onLocate,
  highlightMessageId,
  onOpenMoment,
}: {
  conversation: Conversation;
  compact?: boolean;
  match: Match;
  index: number;
  onLocate: (code: string) => void;
  highlightMessageId?: string;
  /** Optional: open a recorded moment (used to show the board after a commitment resolved). */
  onOpenMoment?: (index: number) => void;
}) {
  const [flash, setFlash] = useState<string | undefined>(highlightMessageId);
  const root = useRef<HTMLElement>(null);
  useEffect(() => setFlash(highlightMessageId), [highlightMessageId]);
  useEffect(() => {
    if (!highlightMessageId) return;
    const el = root.current?.querySelector<HTMLElement>(`#cv-msg-${CSS.escape(highlightMessageId)}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightMessageId]);
  const jump = (id: string) => {
    const el = root.current?.querySelector<HTMLElement>(`#cv-msg-${CSS.escape(id)}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
    setFlash(id);
  };
  const pending = index === match.turns.length;
  const groups: { key: string; label: string; turn: number; items: ThreadMessage[] }[] = [];
  for (const m of conversation.messages) {
    const key = `${m.turn}:${m.message.round}`;
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(m);
    else groups.push({ key, label: roundLabel(m), turn: m.turn, items: [m] });
  }
  return (
    <article ref={root} className={`cv-thread ${compact ? 'compact' : ''}`} aria-label={`Conversation: ${participantNames(conversation)}`}>
      <header className="cv-thread-head">
        <Crests powers={conversation.participants} />
        <div>
          <h3 className="cv-subject">{conversation.subject}</h3>
          <p className="cv-participants">
            {conversation.group ? (
              <>
                <Users size={13} aria-hidden="true" /> Group of {conversation.participants.length}: {participantNames(conversation)}
              </>
            ) : (
              <>Between {participantNames(conversation)}</>
            )}
          </p>
        </div>
      </header>
      <PlaceChips places={conversation.places} onLocate={onLocate} limit={compact ? 3 : 6} />
      {conversation.mutual.length > 0 && (
        <p className="cv-mutual">
          Both sides made commitments in {conversation.mutual.map((x) => phaseName(x.phase)).join(' and ')}. Each promise is checked separately against its sealed order.
        </p>
      )}
      <ol className="cv-messages">
        {groups.map((g) => (
          <li key={g.key} className="cv-round">
            <h4 className="cv-separator">
              <span>{g.label}</span>
              {g.turn === match.turns.length && pending && <em>in progress</em>}
            </h4>
            <ol>
              {g.items.map((m) => (
                <MessageItem
                  key={m.message.id}
                  m={m}
                  conversation={conversation}
                  compact={compact}
                  highlighted={flash === m.message.id}
                  onJump={jump}
                  onOpenMoment={onOpenMoment}
                />
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {conversation.open.length > 0 && (
        <section className="cv-open" aria-label="Still open">
          <h4>Still open</h4>
          <ul>
            {conversation.open.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function ThreadRow({
  c,
  active,
  fresh,
  onOpen,
  onLocate,
}: {
  c: Conversation;
  active?: boolean;
  fresh?: boolean;
  onOpen: (id: string) => void;
  onLocate: (code: string) => void;
}) {
  const last = c.messages.at(-1);
  const kept = c.commitments.filter((k) => k.status === 'kept').length;
  const broken = c.commitments.filter((k) => k.status === 'broken').length;
  const sealed = c.commitments.filter((k) => k.status === 'sealed').length;
  return (
    <li className={`cv-row ${active ? 'active' : ''} ${c.group ? 'group' : 'pair'}`}>
      <button type="button" className="cv-row-main" onClick={() => onOpen(c.id)} aria-current={active ? 'true' : undefined}>
        <Crests powers={c.participants} />
        <span className="cv-row-text">
          <span className="cv-row-title">
            {participantNames(c)}
            {c.group && <span className="cv-chip tag">Group</span>}
            {fresh && <span className="cv-chip new">New</span>}
          </span>
          <span className="cv-row-subject">{c.subject}</span>
          {last && <span className="cv-row-last">{last.summary}</span>}
          <span className="cv-row-meta">
            {c.messages.length} {c.messages.length === 1 ? 'message' : 'messages'}
            {sealed > 0 && ` · ${sealed} sealed`}
            {kept > 0 && ` · ${kept} kept`}
            {broken > 0 && ` · ${broken} broken`}
            {c.open.length > 0 && ` · ${c.open.length} open`}
          </span>
        </span>
      </button>
      {c.places[0] && (
        <button type="button" className="cv-chip place cv-row-place" onClick={() => onLocate(c.places[0])} aria-label={`Show ${placeLabel(c.places[0])} on the map`}>
          <MapPin size={13} aria-hidden="true" />
          {placeLabel(c.places[0])}
        </button>
      )}
    </li>
  );
}

/** Compact list of threads; with `follow`, that country's threads first and the rest under "Elsewhere". */
export function ThreadList({
  conversations,
  follow,
  match,
  index,
  onOpen,
  onLocate,
  activeId,
  fresh,
}: {
  conversations: Conversation[];
  follow?: Power;
  match: Match;
  index: number;
  onOpen: (id: string) => void;
  onLocate: (code: string) => void;
  /** Optional: the open thread, marked as current. */
  activeId?: string;
  /** Optional: threads with messages the reader has not opened yet. */
  fresh?: Set<string>;
}) {
  void match;
  void index;
  const { mine, elsewhere } = orderForFollow(conversations, follow);
  if (!conversations.length)
    return <p className="cv-empty">No private messages are visible at this moment.</p>;
  const rows = (cs: Conversation[]) => (
    <ul className="cv-list">
      {cs.map((c) => (
        <ThreadRow key={c.id} c={c} active={c.id === activeId} fresh={fresh?.has(c.id)} onOpen={onOpen} onLocate={onLocate} />
      ))}
    </ul>
  );
  if (!follow) return rows(mine);
  return (
    <div className="cv-lists">
      <h4 className="cv-list-head">{NATIONS[follow].name}’s talks</h4>
      {mine.length ? rows(mine) : <p className="cv-empty">{NATIONS[follow].name} has no visible conversations at this moment.</p>}
      {elsewhere.length > 0 && (
        <details className="cv-elsewhere" open>
          <summary>
            Elsewhere <span className="cv-count">{elsewhere.length}</span>
          </summary>
          {rows(elsewhere)}
        </details>
      )}
    </div>
  );
}

function momentLine(match: Match, index: number) {
  const phase = match.checkpoints[index]?.state.board.name ?? match.checkpoints.at(-1)!.state.board.name;
  if (index === match.turns.length && match.pending) return `Talks in progress · ${phaseName(phase)}`;
  if (index >= match.turns.length) return `At the latest moment · ${phaseName(phase)}`;
  return `As of ${phaseName(phase)} · later talks and outcomes stay hidden`;
}

/** Full tab: thread list (filter by country, followed country first) and the selected thread. */
export function ConversationsPage({
  match,
  index,
  follow,
  initialThread,
  onLocate,
  onOpenMoment,
}: {
  match: Match;
  index: number;
  follow?: Power;
  initialThread?: string;
  onLocate: (code: string) => void;
  onOpenMoment: (index: number) => void;
}) {
  const all = useMemo(() => conversationsAt(match, index), [match, index]);
  const [filter, setFilter] = useState<Power | 'ALL'>('ALL');
  const shown = filter === 'ALL' ? all : all.filter((c) => c.participants.includes(filter));
  const fallback = orderForFollow(shown, follow).mine[0] ?? shown[0];
  const [selected, setSelected] = useState<string | undefined>(initialThread);
  const [narrowOpen, setNarrowOpen] = useState(Boolean(initialThread));
  useEffect(() => {
    if (initialThread) {
      setSelected(initialThread);
      setNarrowOpen(true);
    }
  }, [initialThread]);
  const current = shown.find((c) => c.id === selected) ?? fallback;

  // Keep the reader's place: count what each thread had when the reader last saw it. New messages
  // never move the page; they show a "new messages" button and a "New" mark in the list.
  const seenCounts = useRef(new Map<string, number>());
  const [, force] = useState(0);
  const pane = useRef<HTMLDivElement>(null);
  const fresh = new Set(all.filter((c) => seenCounts.current.has(c.id) && c.messages.length > seenCounts.current.get(c.id)!).map((c) => c.id));
  const unseenHere = current ? current.messages.length - (seenCounts.current.get(current.id) ?? current.messages.length) : 0;
  useLayoutEffect(() => {
    for (const c of all) if (!seenCounts.current.has(c.id)) seenCounts.current.set(c.id, c.messages.length);
  });
  const markRead = () => {
    if (!current) return;
    seenCounts.current.set(current.id, current.messages.length);
    force((n) => n + 1);
  };
  const open = (id: string) => {
    setSelected(id);
    setNarrowOpen(true);
    const c = all.find((x) => x.id === id);
    if (c) seenCounts.current.set(id, c.messages.length);
    force((n) => n + 1);
    pane.current?.scrollTo({ top: 0 });
  };
  // The newest message counts as read once the reader has scrolled it into view themselves.
  const newestId = current?.messages.at(-1)?.message.id;
  useEffect(() => {
    if (!unseenHere || !newestId || typeof IntersectionObserver === 'undefined') return;
    const el = document.getElementById(`cv-msg-${newestId}`);
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) markRead();
    });
    io.observe(el);
    return () => io.disconnect();
  });
  const showNewest = () => {
    const last = current?.messages.at(-1);
    markRead();
    if (last) document.getElementById(`cv-msg-${last.message.id}`)?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <section className={`cv-page ${narrowOpen ? 'reading' : ''}`} aria-labelledby="cv-title">
      <header className="cv-page-head">
        <span className="cv-eyebrow">
          <MessagesSquare size={14} aria-hidden="true" /> Conversations
        </span>
        <h1 id="cv-title">Who is talking to whom</h1>
        <p className="cv-moment">{momentLine(match, index)}</p>
      </header>
      <div className="cv-layout">
        <nav className="cv-side" aria-label="Conversations">
          <div className="cv-filter" role="group" aria-label="Show conversations with">
            <button type="button" className={`cv-chip filter ${filter === 'ALL' ? 'on' : ''}`} aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>
              All
            </button>
            {POWERS.map((p) => (
              <button
                key={p}
                type="button"
                className={`cv-chip filter ${filter === p ? 'on' : ''}`}
                aria-pressed={filter === p}
                onClick={() => setFilter(p)}
                style={{ ['--nation' as string]: NATIONS[p].color }}
              >
                {NATIONS[p].name}
              </button>
            ))}
          </div>
          <ThreadList conversations={shown} follow={follow} match={match} index={index} onOpen={open} onLocate={onLocate} activeId={current?.id} fresh={fresh} />
        </nav>
        <div className="cv-pane" ref={pane}>
          <button type="button" className="cv-back" onClick={() => setNarrowOpen(false)}>
            <ArrowLeft size={16} aria-hidden="true" /> All conversations
          </button>
          {current ? (
            <ConversationThread conversation={current} match={match} index={index} onLocate={onLocate} onOpenMoment={onOpenMoment} />
          ) : (
            <p className="cv-empty">No private messages are visible at this moment. Talks appear here as countries send them.</p>
          )}
          {unseenHere > 0 && (
            <button type="button" className="cv-new" onClick={showNewest}>
              <ArrowDown size={15} aria-hidden="true" /> {unseenHere} new {unseenHere === 1 ? 'message' : 'messages'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
