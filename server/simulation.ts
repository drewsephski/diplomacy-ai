import { randomUUID } from 'node:crypto';
import {
  cleanGuidance,
  DEFAULT_LIMITS,
  defaultConfigs,
  GUIDANCE_LIMITS,
  NATIONS,
  powerMap,
} from '../src/domain.js';
import {
  POWERS,
  type Match,
  type AgentConfig,
  type PowerMap,
  type Limits,
  type Intervention,
  type Power,
  type Dispatch,
  type Turn,
} from '../src/types.js';
import { engine } from './engine.js';
import { deleteMatchRecord, getMatch, listMatches, saveMatch } from './store.js';
import { askAgent, decisionSchemaFor, negotiationSchemaFor, ownLegalOrders } from './provider.js';
import { messageRefs, visibleMessages } from './privacy.js';
import { SAMPLE_NAME, SAMPLE_PHASES, SAMPLE_VERSION, sampleDecision, sampleMessages } from './sample-agent.js';
import { PROVINCES } from '../src/story.js';
export { DEFAULT_LIMITS };
export async function createMatch(
  name: string,
  mode: Match['mode'],
  configs: PowerMap<AgentConfig> = defaultConfigs(),
  limits = DEFAULT_LIMITS,
  briefing?: string,
): Promise<Match> {
  const state = await engine('inspect');
  // Guidance only reaches live agents. The deterministic sandbox never reads it, so it is not stored there.
  const liveOnly = mode === 'live';
  const storedConfigs = powerMap((p) => ({
    ...configs[p],
    instructions: liveOnly ? cleanGuidance(configs[p].instructions, GUIDANCE_LIMITS.country) : undefined,
  }));
  const match: Match = {
    id: randomUUID(),
    name,
    mode,
    createdAt: new Date().toISOString(),
    status: 'paused',
    briefing: liveOnly ? cleanGuidance(briefing, GUIDANCE_LIMITS.briefing) || undefined : undefined,
    checkpoints: [
      { state, configs: storedConfigs, memories: powerMap(() => []), relations: powerMap(() => ({})) },
    ],
    turns: [],
    usage: {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      actualUsd: 0,
      unpricedCalls: 0,
    },
    limits,
  };
  saveMatch(match);
  return match;
}
/**
 * Raises the phase limit or budget of a run that stopped at its limit. This continues the same
 * timeline; a finished game (someone reached 18 centers) cannot be extended.
 */
export function extendMatch(match: Match, maxPhases: number, budgetUsd?: number) {
  if (match.mode === 'sample') throw new Error('The sample is a fixed recording and cannot be extended.');
  const last = match.checkpoints.at(-1)!;
  if (last.state.done) throw new Error('This game has a winner. Start a new game or an alternate timeline to play on.');
  if (isActive(match.id)) throw new Error('Pause the game before extending it.');
  if (maxPhases <= match.turns.length) throw new Error('Choose a phase limit above the phases already played.');
  match.limits = {
    ...match.limits,
    maxPhases,
    budgetUsd: budgetUsd ?? match.limits.budgetUsd,
  };
  match.status = 'paused';
  match.error = undefined;
  saveMatch(match);
  return match;
}

export async function forkMatch(
  original: Match,
  at: number,
  intervention: Intervention,
  mode: 'live' | 'sandbox',
  limits?: Limits,
  question?: string,
): Promise<Match> {
  if (at < 0 || at >= original.checkpoints.length) throw new Error('Checkpoint does not exist.');
  const cp = structuredClone(original.checkpoints[at]);
  if (cp.state.done)
    throw new Error('This position is terminal. Branch from an earlier checkpoint.');
  if (intervention.order) {
    const allowed = Object.values(cp.state.legal[intervention.power]).flat();
    if (!allowed.includes(intervention.order))
      throw new Error('The intervention is not a legal order in this phase.');
  }
  if (
    intervention.message &&
    (!intervention.to?.length || intervention.to.includes(intervention.power))
  )
    throw new Error('A diplomatic intervention needs at least one other recipient.');
  if (intervention.profile) cp.configs[intervention.power].profile = intervention.profile;
  const fork: Match = {
    ...structuredClone(original),
    id: randomUUID(),
    name: `${original.name.replace(/ · Branch.*$/, '')} · Branch ${at + 1}`,
    createdAt: new Date().toISOString(),
    mode,
    status: 'paused',
    error: undefined,
    checkpoints: [...structuredClone(original.checkpoints.slice(0, at)), cp],
    turns: structuredClone(original.turns.slice(0, at)),
    usage: {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      actualUsd: 0,
      unpricedCalls: 0,
    },
    // The one change and the viewer's question are kept on the record, so the comparison can say
    // what this timeline changed after the intervention itself has been applied and cleared.
    parent: {
      id: original.id,
      name: original.name,
      at,
      intervention: structuredClone(intervention),
      ...(question?.trim() ? { question: question.trim().slice(0, 200) } : {}),
    },
    intervention,
    pending: undefined,
    limits: limits || {
      ...original.limits,
      maxPhases: Math.max(original.limits.maxPhases, at + 8),
    },
  };
  saveMatch(fork);
  return fork;
}
/**
 * Server-side backstop for every message before it is saved, whoever wrote it (live agent, authored
 * sample, or sandbox). The schema already constrains live output; this enforces the same rules:
 * - `replyTo` must name a message the sender sent or received (this phase or earlier). A link to
 *   another pair's private message is dropped, never stored. `response` needs a valid `replyTo`.
 * - `provinces` keeps only real base provinces, without duplicates, at most six.
 * - `request` is plain trimmed text, at most 200 characters; empty is dropped.
 */
export function sanitizeDispatch<T extends Omit<Dispatch, 'id'>>(match: Match, power: Power, m: T): T {
  const visible = new Set(
    [...match.turns.flatMap((t) => t.messages), ...(match.pending?.messages ?? [])]
      .filter((x) => visibleMessages([x], power).length)
      .map((x) => x.id),
  );
  const replyTo = m.replyTo && visible.has(m.replyTo) ? m.replyTo : undefined;
  const response = replyTo && m.response && ['accept', 'counter', 'decline'].includes(m.response) ? m.response : undefined;
  const provinces = [...new Set((m.provinces ?? []).map((c) => String(c).split('/')[0].toUpperCase()))]
    .filter((c) => c in PROVINCES && c !== 'GOL')
    .slice(0, 6);
  const request = typeof m.request === 'string' ? m.request.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const out = { ...m };
  delete out.replyTo;
  delete out.response;
  delete out.request;
  delete out.provinces;
  return {
    ...out,
    ...(replyTo ? { replyTo } : {}),
    ...(response ? { response } : {}),
    ...(request ? { request } : {}),
    ...(provinces.length ? { provinces } : {}),
  };
}
function checkPromises(messages: Dispatch[], orders: PowerMap<string[]>): Turn['promises'] {
  return messages
    .filter((m) => m.promise)
    .map((m) => {
      const promised = m.promise!;
      const unit = promised.split(' ').slice(0, 2).join(' ');
      const actual = orders[m.from].find((o) => o.startsWith(unit + ' ')) || 'No order issued';
      return { from: m.from, to: m.to, promised, actual, kept: promised === actual, messageId: m.id };
    });
}
export async function resolvePhase(match: Match) {
  const cp = match.checkpoints.at(-1)!;
  const pending = match.pending!;
  if (POWERS.some((p) => !pending.decisions[p]))
    throw new Error('All seven decisions must be sealed before adjudication.');
  const decisions = powerMap((p) => pending.decisions[p]!);
  const intervention = match.intervention;
  if (intervention?.order) {
    const decision = decisions[intervention.power];
    const unit = intervention.order.split(' ').slice(0, 2).join(' ');
    const existing = decision.orders.findIndex(
      (o) =>
        o.startsWith(unit + ' ') ||
        (cp.state.board.name.endsWith('A') &&
          o.split(' ')[1]?.slice(0, 3) === intervention.order!.split(' ')[1]?.slice(0, 3)),
    );
    if (existing >= 0) decision.orders[existing] = intervention.order;
    else if (
      cp.state.board.name.endsWith('A') &&
      decision.orders.length >= Math.abs(cp.state.board.builds[intervention.power].count)
    )
      decision.orders[0] = intervention.order;
    else decision.orders.push(intervention.order);
    decision.explanation = `Observer intervention: the submitted order was changed to ${intervention.order}. Original agent decision: ${decision.explanation}`;
    decision.memory += ` An observer changed the submitted order to ${intervention.order}; remember the actual outcome rather than the original plan.`;
  }
  const orders = powerMap((p) => decisions[p].orders);
  const state = await engine('resolve', cp.state, orders);
  const promises = checkPromises(pending.messages, orders);
  const broken = promises.filter((p) => !p.kept);
  const deltas = POWERS.map((p) => ({
    p,
    delta: state.board.centers[p].length - cp.state.board.centers[p].length,
  })).filter((d) => d.delta);
  const victors = state.outcome.slice(1).filter((p): p is Power => POWERS.includes(p as Power));
  const title = state.done
    ? victors.length === 1
      ? `${NATIONS[victors[0]].name} prevails.`
      : 'The powers reach a draw.'
    : broken.length
      ? 'The price of a promise.'
      : deltas.length
        ? 'A new balance of power.'
        : cp.state.board.name.endsWith('A')
          ? 'The winter reckoning.'
          : 'Every move sends a message.';
  const changes = deltas
    .map(
      ({ p, delta }) =>
        `${NATIONS[p].name} ${delta > 0 ? 'gains' : 'loses'} ${Math.abs(delta)} supply ${Math.abs(delta) === 1 ? 'center' : 'centers'}`,
    )
    .join('; ');
  const recap =
    (state.done
      ? `${victors.length === 1 ? `${NATIONS[victors[0]].name} controls the winning position.` : 'The adjudicator has ended the game in a draw.'} `
      : '') +
    [
      broken.length
        ? `${broken
            .map((p) => NATIONS[p.from].name)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(
              ' and ',
            )} issued orders that broke explicit commitments. Trust now has a visible cost.`
        : 'Orders are revealed together. Promises can now be measured against actions.',
      changes
        ? `${changes}. Control of centers determines the next winter’s military strength.`
        : 'Supply-center ownership is assessed after autumn. Positions have changed; the balance is still unfolding.',
    ].join(' ');
  const turn: Turn = {
    phase: cp.state.board.name,
    messages: pending.messages,
    decisions,
    promises,
    recap,
    title,
    results: state.resolution?.results || {},
  };
  const memories = structuredClone(cp.memories);
  const relations = structuredClone(cp.relations);
  for (const p of POWERS) {
    memories[p].push(`${turn.phase}: ${decisions[p].memory}`);
    // Persistent summaries of personal experience; unrelated private messages never enter memory.
    for (const promise of promises.filter((v) => v.from === p || v.to.includes(p))) {
      memories[p].push(
        `${turn.phase}: ${promise.from} promised ${promise.promised}; issued ${promise.actual}. ${promise.kept ? 'Kept' : 'Broken'}.`,
      );
    }
    relations[p] = { ...relations[p], ...decisions[p].relationships };
    for (const promise of broken.filter((v) => v.to.includes(p)))
      relations[p][promise.from] = Math.max(-100, (relations[p][promise.from] || 0) - 35);
  }
  match.turns.push(turn);
  match.checkpoints.push({ state, memories, relations, configs: structuredClone(cp.configs) });
  match.pending = undefined;
  match.intervention = undefined;
  if (state.done || match.turns.length >= match.limits.maxPhases) match.status = 'complete';
  saveMatch(match);
}
const active = new Map<string, { pause: boolean; promise: Promise<void> }>();
/**
 * Start tickets the viewer has already paused. A client sends a fresh ticket with every run request
 * and the same ticket with its pause. If the pause reaches the server first (the run request is still
 * in transit), the late run is refused instead of playing a whole phase after Pause. Bounded, in memory.
 */
const cancelledTickets = new Set<string>();
const TICKET_MEMORY = 500;
export function isActive(id: string) {
  return active.has(id);
}
export function pauseMatch(id: string, ticket?: string) {
  if (ticket) {
    cancelledTickets.add(ticket);
    if (cancelledTickets.size > TICKET_MEMORY) cancelledTickets.delete(cancelledTickets.values().next().value!);
  }
  const job = active.get(id);
  if (job) job.pause = true;
  else {
    const match = getMatch(id);
    // A stopped-by-error or complete game keeps its status; only an idle game is marked paused.
    if (match.status === 'running') {
      match.status = 'paused';
      saveMatch(match);
    }
  }
}
export function startMatch(id: string, single = false, ticket?: string): Promise<void> {
  if (ticket && cancelledTickets.has(ticket))
    throw Object.assign(new Error('This start was paused before it began. Nothing was played.'), { status: 409 });
  if (active.has(id)) throw new Error('This match is already running.');
  // Shared provider key: only one live job at a time, keeping billing and controls predictable.
  if (active.size) throw new Error('Pause the running match before starting another.');
  const match = getMatch(id);
  if (match.mode === 'sample')
    throw new Error('The sample is a replay. Branch into a sandbox or start a live match.');
  if (match.checkpoints.at(-1)!.state.done || match.turns.length >= match.limits.maxPhases)
    throw new Error(
      'Run limit reached or game complete. Branch from an earlier moment to continue.',
    );
  const job = { pause: false, promise: Promise.resolve() };
  active.set(id, job);
  match.status = 'running';
  match.error = undefined;
  saveMatch(match);
  job.promise = (async () => {
    try {
      do {
        if (!match.pending) {
          match.pending = { round: 0, messages: [], negotiated: [], decisions: {} };
          if (match.intervention?.message)
            match.pending.messages.push({
              id: randomUUID(),
              round: -1,
              from: match.intervention.power,
              to: match.intervention.to!,
              text: match.intervention.message,
              kind: 'proposal',
            });
        }
        const pending = match.pending;
        const cp = match.checkpoints.at(-1)!;
        const rounds = cp.state.board.name.endsWith('M') ? match.limits.diplomacyRounds : 0;
        for (let round = 0; round < rounds; round++) {
          pending.round = round;
          for (const power of POWERS) {
            if (job.pause) return;
            const key = `${round}:${power}`;
            if (pending.negotiated.includes(key) || !cp.state.board.units[power].length) continue;
            const legalOrders = ownLegalOrders(cp.state.legal, power);
            // Short references stand in for message ids on the wire; they map back here.
            const refs = messageRefs(match, power);
            const idOf = new Map(refs.map((r) => [r.ref, r.id]));
            const messages: Omit<Dispatch, 'id'>[] =
              match.mode === 'live'
                ? (
                    await askAgent(
                      match,
                      power,
                      'negotiate',
                      negotiationSchemaFor(power, legalOrders, refs.map((r) => r.ref)),
                    )
                  ).messages.map((m) => ({
                    to: m.to,
                    text: m.text,
                    kind: m.kind,
                    promise: m.promise || undefined,
                    replyTo: (m.replyTo && idOf.get(m.replyTo)) || undefined,
                    response: m.response || undefined,
                    request: m.request || undefined,
                    provinces: m.provinces,
                    from: power,
                    round,
                  }))
                : sampleMessages(match, power, round);
            for (const raw of messages) {
              const m = sanitizeDispatch(match, power, raw);
              if (m.to.includes(power)) throw new Error(`${power} attempted to message itself.`);
              // The schema already limits promises to legal orders; this check is the engine-side backstop.
              if (m.promise && !legalOrders.includes(m.promise))
                throw new Error(
                  `${power} promised an order it cannot issue. Retry this phase or branch.`,
                );
              pending.messages.push({ ...m, to: [...new Set(m.to)], id: randomUUID() });
            }
            pending.negotiated.push(key);
            saveMatch(match);
          }
        }
        for (const power of POWERS) {
          if (job.pause) return;
          if (pending.decisions[power]) continue;
          const legalOrders = ownLegalOrders(cp.state.legal, power);
          if (match.mode === 'live' && legalOrders.length) {
            const decision = await askAgent(
              match,
              power,
              'decide',
              decisionSchemaFor(power, legalOrders),
            );
            pending.decisions[power] = {
              ...decision,
              relationships: Object.fromEntries(
                decision.relationships
                  .filter((r) => r.power !== power)
                  .map((r) => [r.power, r.trust]),
              ),
            };
          } else if (match.mode === 'live') {
            // Nothing is legal for this country, so no model is asked. Never attribute scripted text to a live seat.
            pending.decisions[power] = {
              orders: [],
              explanation: 'No units or builds need orders this phase, so no agent was asked.',
              memory: 'No orders were required this phase.',
              relationships: {},
            };
          } else pending.decisions[power] = sampleDecision(match, power);
          saveMatch(match);
        }
        if (job.pause) return;
        try {
          await resolvePhase(match);
        } catch (error) {
          pending.decisions = {};
          saveMatch(match);
          throw error;
        }
        if (single || match.status === 'complete') break;
      } while (!job.pause);
    } catch (error) {
      match.status = 'error';
      match.error = error instanceof Error ? error.message : 'Simulation failed.';
    } finally {
      if (match.status === 'running') match.status = 'paused';
      saveMatch(match);
      active.delete(id);
    }
  })();
  return job.promise;
}
export async function buildSample(): Promise<Match> {
  const match = await createMatch(SAMPLE_NAME, 'sandbox', defaultConfigs(), {
    ...DEFAULT_LIMITS,
    maxPhases: SAMPLE_PHASES,
  });
  await startMatch(match.id, false);
  const completed = getMatch(match.id);
  if (completed.status === 'error') throw new Error(completed.error);
  completed.mode = 'sample';
  completed.name = SAMPLE_NAME;
  completed.sampleVersion = SAMPLE_VERSION;
  saveMatch(completed);
  return completed;
}

/** Name an older edition of the sample carries once a newer one exists. */
export function earlierEditionName(name: string) {
  return `${name.replace(/ · earlier edition.*$/, '')} · earlier edition`;
}

/**
 * Makes sure the current edition of the authored sample exists. Older sample records are kept,
 * because alternate timelines still compare against them, but renamed so they are never mistaken
 * for the edition offered to newcomers. A record without `sampleVersion` is the first edition.
 */
export async function ensureSample(): Promise<Match | undefined> {
  const samples = listMatches().filter((m) => m.mode === 'sample');
  for (const row of samples)
    if ((row.sampleVersion ?? 1) < SAMPLE_VERSION && !/ · earlier edition/.test(row.name)) {
      const old = getMatch(row.id);
      old.name = earlierEditionName(old.name);
      old.sampleVersion = old.sampleVersion ?? 1;
      saveMatch(old);
    }
  if (samples.some((m) => m.sampleVersion === SAMPLE_VERSION)) return undefined;
  return buildSample();
}

/**
 * Deletes a saved game for good. Refused while the game is playing (a model request may still be
 * settling), and the recorded sample is kept as the teaching replay that every fresh install shows.
 * Alternate timelines keep working: their original's absence is shown, never treated as an error.
 */
export function removeMatch(id: string) {
  const match = getMatch(id);
  if (match.mode === 'sample')
    throw Object.assign(new Error('The recorded sample is kept as a teaching replay and cannot be deleted.'), { status: 400 });
  if (isActive(id) || match.status === 'running')
    throw Object.assign(new Error('Pause the game before deleting it. A request may still be settling.'), { status: 409 });
  deleteMatchRecord(id);
}

export function runningIds() {
  return [...active.keys()];
}
export type { Power };
