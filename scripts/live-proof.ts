/**
 * Bounded live verification of the economical models. Runs ONE phase (seven private talks and
 * seven sealed orders, one diplomacy round) with GLM 5.3 Flash and Claude Haiku 5.5 alternating
 * across the seats, under a hard $0.10 budget. It records only transport facts: the model id,
 * reasoning settings, HTTP status, token counts, and provider-reported cost. Headers and the API
 * key are never read into the record or printed.
 *
 * Run: pnpm exec tsx scripts/live-proof.ts
 */
import 'dotenv/config';
import { GLM_MODEL, HAIKU_MODEL } from '../src/domain.js';
import { POWERS, type AgentConfig, type Power, type PowerMap } from '../src/types.js';
import { createMatch, startMatch, DEFAULT_LIMITS } from '../server/simulation.js';
import { getMatch } from '../server/store.js';
import { getModels } from '../server/provider.js';

const BUDGET_USD = 0.1;

if (!process.env.OPENROUTER_API_KEY) {
  console.log('OPENROUTER_API_KEY is not set in .env. No live proof was run.');
  process.exit(1);
}

const wire: Record<string, unknown>[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const response = await realFetch(input, init);
  if (!url.includes('/chat/completions')) return response;
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  const record: Record<string, unknown> = {
    model: body.model,
    reasoning: body.reasoning ?? null,
    max_tokens: body.max_tokens ?? null,
    http_status: response.status,
  };
  try {
    const json = (await response.clone().json()) as {
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        cost?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
      error?: { message?: string };
    };
    record.responded_model = json.model;
    record.prompt_tokens = json.usage?.prompt_tokens;
    record.completion_tokens = json.usage?.completion_tokens;
    record.reasoning_tokens = json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    record.cost_usd = json.usage?.cost;
    if (json.error) record.error = String(json.error.message ?? 'provider error').slice(0, 200);
  } catch {
    record.error = 'Response was not JSON.';
  }
  wire.push(record);
  return response;
};

// Seats alternate: even seats (England, Germany, Austria, Turkey) on GLM, the rest on Haiku.
const configs = Object.fromEntries(
  POWERS.map((p, seat): [Power, AgentConfig] => [
    p,
    { model: seat % 2 === 0 ? GLM_MODEL : HAIKU_MODEL, profile: 'strategist' },
  ]),
) as PowerMap<AgentConfig>;
// Catalog check first: both ids must be live, chat-capable and priced.
const catalog = await getModels();
for (const id of [GLM_MODEL, HAIKU_MODEL]) {
  const found = catalog.find((m) => m.id === id);
  console.log(
    `catalog ${id}: ${found ? `present · $${found.input * 1e6}/M in · $${found.output * 1e6}/M out${found.tiers ? ` · ${found.tiers.length} long-prompt tier(s)` : ''}` : 'MISSING'}`,
  );
  if (!found) process.exit(1);
}

const match = await createMatch(
  'Live verification · economical mix · GLM 5.3 Flash + Haiku 5.5 · one phase',
  'live',
  configs,
  { ...DEFAULT_LIMITS, maxPhases: 1, budgetUsd: BUDGET_USD, diplomacyRounds: 1 },
);
console.log(`created ${match.name}`);
// Single shot: one phase only, no retries; a failure stops here and leaves the partial record.
await startMatch(match.id);
const result = getMatch(match.id);

console.log('--- outcome ---');
console.log(`status: ${result.status}${result.error ? ` · error: ${result.error}` : ''}`);
console.log(`resolved phases: ${result.turns.length} (${result.turns.map((t) => t.phase).join(', ') || 'none'})`);
console.log(
  `usage: calls=${result.usage.calls} input=${result.usage.inputTokens} output=${result.usage.outputTokens} ` +
    `provider_cost_usd=${result.usage.actualUsd.toFixed(6)} reserved_or_estimated_usd=${result.usage.estimatedUsd.toFixed(6)} ` +
    `unpriced_calls=${result.usage.unpricedCalls} budget_usd=${BUDGET_USD}`,
);
console.log('seats:');
for (const p of POWERS) console.log(`  ${p.padEnd(8)} ${result.checkpoints[0].configs[p].model}`);
console.log('wire (one entry per request, no headers or keys):');
for (const r of wire) console.log(`  ${JSON.stringify(r)}`);
if (result.turns[0]) {
  const promises = result.turns[0].promises;
  console.log(
    `promises checked: ${promises.length} · kept ${promises.filter((p) => p.kept).length} · broken ${promises.filter((p) => !p.kept).length}`,
  );
  console.log(`messages exchanged: ${result.turns[0].messages.length}`);
}
console.log(`match id: ${match.id}`);
