import { NATIONS, PROFILES } from '../src/domain.js';
import type { Match, Power, Dispatch } from '../src/types.js';
export function visibleMessages(messages: Dispatch[], power: Power) {
  return messages.filter((m) => m.from === power || m.to.includes(power));
}
/** Allowlist projection. Never hand a Match or Checkpoint object to a provider. */
export function agentView(match: Match, power: Power) {
  const checkpoint = match.checkpoints.at(-1)!;
  const config = checkpoint.configs[power];
  return {
    power,
    phase: checkpoint.state.board.name,
    board: checkpoint.state.board,
    objective: NATIONS[power].objective,
    /** Guidance is strategy preference only. The shared briefing is the same for every country; `yourInstructions` is this country's alone. */
    guidance: {
      sharedBriefing: match.briefing ?? '',
      yourInstructions: config.instructions ?? '',
    },
    profile: PROFILES[config.profile].description,
    historicalContext: config.profile === 'historical' ? NATIONS[power].historical : undefined,
    memory: checkpoint.memories[power],
    relationships: checkpoint.relations[power],
    legalOrders: checkpoint.state.legal[power],
    publicHistory: match.turns
      .slice(-6)
      .map((t) => ({
        phase: t.phase,
        orders: Object.fromEntries(Object.entries(t.decisions).map(([p, d]) => [p, d.orders])),
        results: t.results,
      })),
    privateHistory: match.turns
      .slice(-8)
      .flatMap((t) => visibleMessages(t.messages, power).map((m) => ({ ...m, phase: t.phase }))),
    currentDiplomacy: visibleMessages(match.pending?.messages || [], power),
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
