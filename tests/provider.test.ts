import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GLM_MODEL, powerMap } from '../src/domain.js';
import { POWERS, type Power } from '../src/types.js';
const directory = mkdtempSync(join(tmpdir(), 'seven-powers-provider-'));
process.env.DATA_DIR = directory;
process.env.OPENROUTER_API_KEY = 'test-only-not-a-real-key';
const { createMatch, startMatch, DEFAULT_LIMITS } = await import('../server/simulation.js');
const { getMatch } = await import('../server/store.js');
const originalFetch = globalThis.fetch;
const seen: { power: Power; view: Record<string, unknown> }[] = [];
const bodies: Record<string, unknown>[] = [];
let sent = 0;
let fail = false;
let illegalPromise = false;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('/models'))
    return Response.json({
      data: [
        {
          id: 'test/model',
          name: 'Test model',
          context_length: 1000000,
          pricing: { prompt: '0.000001', completion: '0.000002' },
          supported_parameters: ['structured_outputs'],
        },
        {
          id: GLM_MODEL,
          name: 'GLM 5.3 Flash',
          context_length: 1000000,
          pricing: { prompt: '0.0000000399', completion: '0.0000000784' },
          endpoints: ['/api/v1/chat/completions', '/api/v1/responses'],
          supported_parameters: ['structured_outputs', 'reasoning'],
        },
        {
          id: 'vendor/batch-only',
          name: 'Batch only',
          context_length: 1000,
          pricing: { prompt: '0.000001', completion: '0.000001' },
          endpoints: ['/api/v1/batches'],
          supported_parameters: ['structured_outputs'],
        },
      ],
    });
  if (!url.endsWith('/chat/completions'))
    throw new Error(`Unexpected URL in provider test: ${url}`);
  sent++;
  if (fail) throw new Error('Provider unavailable');
  const body = JSON.parse(String(init?.body));
  const prompt = body.messages.find((m: { role: string }) => m.role === 'user').content;
  bodies.push(body);
  const view = JSON.parse(prompt.split('OBSERVATION:\n')[1]);
  const p = view.power as Power;
  seen.push({ power: p, view });
  const recipients: Record<Power, Power> = {
    ENGLAND: 'FRANCE',
    FRANCE: 'ENGLAND',
    GERMANY: 'AUSTRIA',
    ITALY: 'TURKEY',
    AUSTRIA: 'GERMANY',
    RUSSIA: 'TURKEY',
    TURKEY: 'RUSSIA',
  };
  const content = prompt.startsWith('Send')
    ? {
        messages: [
          {
            to: [recipients[p]],
            text: `PRIVATE-${p}-${recipients[p]}`,
            kind: 'proposal',
            // Austria's unit is not Germany's to promise; the schema must refuse this output.
            promise: illegalPromise && p === 'GERMANY' ? 'A VIE - GAL' : null,
          },
        ],
      }
    : {
        orders: Object.values(view.legalOrders as Record<string, string[]>).map((options) =>
          options.find((o) => o.endsWith(' H')),
        ),
        explanation: 'Protect the opening position.',
        memory: `PERSONAL-${p}`,
        relationships: [],
      };
  return Response.json({
    id: `test-${sent}`,
    object: 'chat.completion',
    created: Date.now() / 1000,
    model: 'test/model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: JSON.stringify(content) },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.001 },
  });
};
after(() => {
  globalThis.fetch = originalFetch;
  rmSync(directory, { recursive: true, force: true });
});

test('SDK simulation flow sends seven independent observations and accounts for all 14 calls', async () => {
  const m = await createMatch(
    'provider contract',
    'live',
    powerMap(() => ({ model: 'test/model', profile: 'strategist' })),
    { ...DEFAULT_LIMITS, maxPhases: 1, diplomacyRounds: 1 },
  );
  await startMatch(m.id);
  const result = getMatch(m.id);
  assert.equal(result.status, 'complete', result.error);
  assert.equal(result.turns.length, 1);
  assert.equal(result.usage.calls, 14);
  assert.equal(result.usage.inputTokens, 1400);
  assert.ok(Math.abs(result.usage.actualUsd - 0.014) < 0.00001);
  assert.equal(seen.length, 14);
  for (const { power, view } of seen) {
    assert.equal(view.power, power);
    assert.ok(!('decisions' in view));
    for (const msg of view.currentDiplomacy as { from: Power; to: Power[] }[])
      assert.ok(msg.from === power || msg.to.includes(power));
    assert.ok(!JSON.stringify(view).includes('PERSONAL-')); // No other agent's in-flight memory.
  }
});

test('budget refuses a request before any billable call is sent', async () => {
  const before = sent;
  const m = await createMatch(
    'budget',
    'live',
    powerMap(() => ({ model: 'test/model', profile: 'strategist' })),
    { ...DEFAULT_LIMITS, budgetUsd: 0.000001 },
  );
  await startMatch(m.id);
  const result = getMatch(m.id);
  assert.equal(result.status, 'error');
  assert.match(result.error!, /Budget limit/);
  assert.equal(sent, before);
  assert.equal(result.usage.calls, 0);
});

test('provider failure pauses safely, records the reservation, and does not automatically retry', async () => {
  fail = true;
  const before = sent;
  const m = await createMatch(
    'provider failure',
    'live',
    powerMap(() => ({ model: 'test/model', profile: 'strategist' })),
  );
  await startMatch(m.id);
  const result = getMatch(m.id);
  assert.equal(result.status, 'error');
  assert.equal(result.turns.length, 0);
  assert.equal(result.usage.calls, 1);
  assert.equal(sent - before, 1);
  assert.ok(result.usage.estimatedUsd > 0);
  assert.equal(result.usage.unpricedCalls, 1);
});

test('economical GLM seats send low reasoning effort on every live call', async () => {
  fail = false;
  bodies.length = 0;
  const m = await createMatch(
    'reasoning transport',
    'live',
    powerMap(() => ({ model: GLM_MODEL, profile: 'strategist' })),
    { ...DEFAULT_LIMITS, maxPhases: 1, diplomacyRounds: 1 },
  );
  await startMatch(m.id);
  const result = getMatch(m.id);
  assert.equal(result.status, 'complete', result.error);
  assert.equal(bodies.length, 14);
  for (const body of bodies) assert.deepEqual(body.reasoning, { effort: 'low', exclude: true });
  assert.equal(bodies[0].model, GLM_MODEL);
});

/** Every `enum` array in a JSON schema, at any depth. */
function enumsIn(node: unknown, found: unknown[][] = []): unknown[][] {
  if (Array.isArray(node)) node.forEach((n) => enumsIn(n, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'enum' && Array.isArray(value)) found.push(value);
      else enumsIn(value, found);
    }
  }
  return found;
}

const sameSet = (a: unknown[], b: unknown[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

test('structured output contract limits promises and orders to the legal set on the wire', async () => {
  fail = false;
  illegalPromise = false;
  bodies.length = 0;
  const m = await createMatch(
    'schema contract',
    'live',
    powerMap(() => ({ model: 'test/model', profile: 'strategist' })),
    { ...DEFAULT_LIMITS, maxPhases: 1, diplomacyRounds: 1 },
  );
  await startMatch(m.id);
  const result = getMatch(m.id);
  assert.equal(result.status, 'complete', result.error);
  const legal = result.checkpoints[0].state.legal;
  assert.equal(bodies.length, 14);
  for (const body of bodies) {
    const format = body.response_format as { type: string; json_schema: { schema: unknown } };
    assert.equal(format.type, 'json_schema');
    const messages = body.messages as { role: string; content: string }[];
    const prompt = messages.find((x) => x.role === 'user')!.content;
    const power = (JSON.parse(prompt.split('OBSERVATION:\n')[1]) as { power: Power }).power;
    const own = [...new Set(Object.values(legal[power]).flat())];
    const enums = enumsIn(format.json_schema.schema);
    const others = POWERS.filter((p) => p !== power);
    // This country's exact legal order set is the only order enum (promise, or each sealed order)...
    assert.ok(
      enums.some((e) => sameSet(e, own)),
      `${power} schema lacks its exact legal set`,
    );
    // ...and the other six powers are the only recipients or relationship partners.
    assert.ok(
      enums.some((e) => sameSet(e, others)),
      `${power} schema must exclude itself from recipients`,
    );
  }
});

test('an illegal promise is refused by the schema and nothing from that phase is saved', async () => {
  illegalPromise = true;
  const m = await createMatch(
    'illegal promise',
    'live',
    powerMap(() => ({ model: 'test/model', profile: 'strategist' })),
    { ...DEFAULT_LIMITS, maxPhases: 1, diplomacyRounds: 1 },
  );
  await startMatch(m.id);
  illegalPromise = false;
  const result = getMatch(m.id);
  assert.equal(result.status, 'error');
  // The schema refused the output, so the engine-side backstop was never reached.
  assert.doesNotMatch(result.error!, /promised an order it cannot issue/);
  assert.equal(result.turns.length, 0);
  assert.equal(result.checkpoints.length, 1);
  assert.ok(!(result.pending?.messages ?? []).some((msg) => msg.promise === 'A VIE - GAL'));
});

test('negotiation schema accepts only own legal promises, null, and other powers as recipients', async () => {
  const { negotiationSchemaFor, ownLegalOrders } = await import('../server/provider.js');
  const { engine } = await import('../server/engine.js');
  const state = await engine('inspect');
  const own = ownLegalOrders(state.legal, 'GERMANY');
  const schema = negotiationSchemaFor('GERMANY', own);
  const message = (promise: unknown, to: unknown = ['FRANCE']) => ({
    messages: [{ to, text: 'x', kind: 'proposal', promise }],
  });
  assert.ok(schema.safeParse(message(null)).success);
  assert.ok(schema.safeParse(message('F KIE - DEN')).success);
  assert.ok(!schema.safeParse(message('A VIE - GAL')).success, "Austria's unit is not Germany's");
  assert.ok(!schema.safeParse(message('F BRE - MAO')).success, 'France never legal for Germany');
  assert.ok(!schema.safeParse(message(null, ['GERMANY'])).success, 'no self-messages');
  assert.ok(!schema.safeParse(message(null, ['FRANCE', 'FRANCE2'])).success, 'unknown recipient');
});
