import { NATIONS, PROFILES } from '../src/domain.js';
import { describeOrder, SUPPLY_CENTERS } from '../src/story.js';
import { POWERS, type Match, type Power, type Dispatch, type Turn } from '../src/types.js';

export function visibleMessages(messages: Dispatch[], power: Power) {
  return messages.filter((m) => m.from === power || m.to.includes(power));
}

/** How many resolved phases of private correspondence an agent sees again. */
const PRIVATE_HISTORY_TURNS = 8;

/**
 * Where each country stands in 1901, read from the map only: who it borders and what is within
 * reach. It shapes a recognizable negotiating posture without scripting a choice or naming any
 * later event. The model still decides whether to cooperate, deceive, or defect.
 */
export const POSITION_NOTES: Record<Power, string> = {
  ENGLAND:
    'An island: your home centers can be reached only by sea, so fleets are your walls. You can afford patience; before committing, ask for concrete naval guarantees about which seas stay empty.',
  FRANCE:
    'The western corner, with land borders to Germany and Italy and Britain across the Channel. Iberia and Belgium are nearby neutrals. Settling one border lets you use your units on another.',
  GERMANY:
    'The center of the board, touching five powers. Many neighbors means many partners and many threats; offer specific border arrangements (which province each side leaves empty) and track who honors them.',
  ITALY:
    'A peninsula with short land borders and long coasts. Tunis is the nearby neutral center; beyond it you must choose a direction. Neighbors watch Venice, Piedmont, and Tyrolia for your intentions.',
  AUSTRIA:
    'Landlocked at the crossroads, with one port (Trieste) and several neighbors able to reach your home centers at once. You need at least one dependable neighbor; ask for specific empty buffer provinces and test them.',
  RUSSIA:
    'The largest starting force, split between a northern front (Scandinavia) and a southern one (the Black Sea and the Balkans). Quieting one front lets you act on the other.',
  TURKEY:
    'A corner position around the straits; few units can reach your home centers, mostly through the Black Sea and Bulgaria or Armenia. The status of the Black Sea and the Balkans is what you can trade.',
};

/** Messages one country can see this call: recent resolved phases, then the phase in progress. */
function visibleCorrespondence(match: Match, power: Power) {
  const out: { message: Dispatch; phase: string; current: boolean }[] = [];
  for (const t of match.turns.slice(-PRIVATE_HISTORY_TURNS))
    for (const message of visibleMessages(t.messages, power)) out.push({ message, phase: t.phase, current: false });
  const phase = match.checkpoints.at(-1)!.state.board.name;
  for (const message of visibleMessages(match.pending?.messages ?? [], power)) out.push({ message, phase, current: true });
  return out;
}

/**
 * Short references ("m1", "m2", …) for the messages one country can see, in the order the
 * observation lists them. The negotiation schema constrains `replyTo` to these references, so a
 * country can only answer a message it was party to. The server maps a reference back to the id.
 */
export function messageRefs(match: Match, power: Power): { ref: string; id: string }[] {
  return visibleCorrespondence(match, power).map(({ message }, i) => ({ ref: `m${i + 1}`, id: message.id }));
}

/** Supply centers a country's units can move into this phase, by the engine's own legal moves. */
function moveTargets(legal: Record<string, string[]>) {
  const targets = new Set<string>();
  for (const orders of Object.values(legal))
    for (const order of orders) {
      const r = describeOrder(order);
      if (r.kind === 'move' && r.target) targets.add(r.target);
    }
  return targets;
}

function resultOf(turn: Turn, order: string): 'succeeded' | 'failed' | undefined {
  const unit = describeOrder(order).unit;
  if (!(unit in turn.results)) return undefined;
  return (turn.results[unit] ?? []).filter(Boolean).length ? 'failed' : 'succeeded';
}

/**
 * Allowlist projection. Never hand a Match or Checkpoint object to a provider.
 *
 * What one country sees: the public board and public history (resolved orders and results), its
 * own legal orders, memory, trust scores, guidance, and past explanations, and only the private
 * messages it sent or received. A reply link is shown only when the answered message is also one
 * this country can see. Sealed decisions of the phase in progress are never included, and nothing
 * here reads another country's memory, relationships, explanations, or instructions.
 */
export function agentView(match: Match, power: Power) {
  const checkpoint = match.checkpoints.at(-1)!;
  const config = checkpoint.configs[power];
  const { board, legal } = checkpoint.state;
  const correspondence = visibleCorrespondence(match, power);
  const refOf = new Map(correspondence.map(({ message }, i) => [message.id, `m${i + 1}`]));
  const project = ({ message: m, phase }: { message: Dispatch; phase: string }) => ({
    ref: refOf.get(m.id)!,
    phase,
    round: m.round,
    from: m.from,
    to: m.to,
    kind: m.kind,
    text: m.text,
    ...(m.replyTo && refOf.has(m.replyTo) ? { replyTo: refOf.get(m.replyTo) } : {}),
    ...(m.response && m.replyTo && refOf.has(m.replyTo) ? { response: m.response } : {}),
    ...(m.request ? { request: m.request } : {}),
    ...(m.provinces?.length ? { provinces: m.provinces } : {}),
    ...(m.promise ? { promise: m.promise } : {}),
  });
  const current = correspondence.filter((c) => c.current);
  const answered = new Set(current.filter((c) => c.message.from === power && c.message.replyTo).map((c) => c.message.replyTo!));
  const own = new Set(board.centers[power]);
  const reach = moveTargets(legal[power]);
  const threats = POWERS.filter((p) => p !== power).map((p) => ({ p, targets: moveTargets(legal[p]) }));
  return {
    power,
    phase: board.name,
    /** Which talk round this is, so a country knows when the last chance to answer comes. */
    round: match.pending && board.name.endsWith('M') ? { current: match.pending.round + 1, of: match.limits.diplomacyRounds } : undefined,
    board,
    objective: NATIONS[power].objective,
    position: POSITION_NOTES[power],
    /** Read from the engine's legal moves this phase. Facts about the board, not predictions. */
    reach: {
      centersYouCanEnter: SUPPLY_CENTERS.filter((c) => reach.has(c) && !own.has(c)),
      yourCentersOthersCanEnter: board.centers[power]
        .map((c) => ({ center: c, by: threats.filter((t) => t.targets.has(c)).map((t) => t.p) }))
        .filter((x) => x.by.length),
    },
    /** Guidance is strategy preference only. The shared briefing is the same for every country; `yourInstructions` is this country's alone. */
    guidance: {
      sharedBriefing: match.briefing ?? '',
      yourInstructions: config.instructions ?? '',
    },
    profile: PROFILES[config.profile].description,
    historicalContext: config.profile === 'historical' ? NATIONS[power].historical : undefined,
    memory: checkpoint.memories[power].slice(-24),
    relationships: checkpoint.relations[power],
    legalOrders: legal[power],
    /** Promises this country made or received, checked against the sealed orders after each reveal. */
    commitments: match.turns
      .flatMap((t) =>
        t.promises
          .filter((p) => p.from === power || p.to.includes(power))
          .map((p) => ({
            phase: t.phase,
            from: p.from,
            to: p.to,
            promised: p.promised,
            submitted: p.actual,
            kept: p.kept,
            result: p.actual === 'No order issued' ? undefined : resultOf(t, p.actual),
          })),
      )
      .slice(-12),
    /** Messages addressed to you in this phase that you have not answered yet. */
    openProposals: current
      .filter((c) => c.message.from !== power && c.message.kind !== 'reply' && !answered.has(c.message.id))
      .map((c) => ({ ref: refOf.get(c.message.id)!, from: c.message.from, ...(c.message.request ? { request: c.message.request } : {}) })),
    /** Your own public explanations from recent phases, so you can stay consistent or explain a change. */
    yourPastExplanations: match.turns.slice(-4).map((t) => ({ phase: t.phase, explanation: t.decisions[power]?.explanation ?? '' })),
    publicHistory: match.turns
      .slice(-6)
      .map((t) => ({
        phase: t.phase,
        orders: Object.fromEntries(Object.entries(t.decisions).map(([p, d]) => [p, d.orders])),
        results: t.results,
      })),
    privateHistory: correspondence.filter((c) => !c.current).map(project),
    currentDiplomacy: current.map(project),
  };
}

/** Spectators may read all diplomacy, but sealed orders stay sealed until resolution. */
export function spectatorView(match: Match) {
  const { pending, ...rest } = match;
  return {
    ...rest,
    pending: pending
      ? {
          round: pending.round,
          messages: pending.messages,
          negotiated: pending.negotiated,
          decisions: {},
          sealedCount: Object.keys(pending.decisions).length,
        }
      : undefined,
  };
}
