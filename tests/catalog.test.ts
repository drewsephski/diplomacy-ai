import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLM_MODEL, HAIKU_MODEL } from '../src/domain.js';

// Pure catalog and pricing logic; no network and no billable calls.
const { filterCatalog, ratesFor, providerSettings, CHAT_ENDPOINT } = await import(
  '../server/provider.js'
);

const base = {
  name: 'Model',
  context_length: 200000,
  supported_parameters: ['structured_outputs'],
};

test('catalog keeps chat-completions models and drops batch-only entries', () => {
  const models = filterCatalog({
    data: [
      {
        ...base,
        id: 'vendor/chat',
        pricing: { prompt: '0.000001', completion: '0.000002' },
        endpoints: [CHAT_ENDPOINT, '/api/v1/responses'],
      },
      {
        ...base,
        id: 'vendor/batch-only:batch',
        pricing: { prompt: '0.000001', completion: '0.000002' },
        endpoints: ['/api/v1/batches'],
      },
      {
        ...base,
        id: 'vendor/no-endpoint-list',
        pricing: { prompt: '0.000001', completion: '0.000002' },
      },
    ],
  });
  assert.deepEqual(
    models.map((m) => m.id),
    ['vendor/chat', 'vendor/no-endpoint-list'],
  );
});

test('catalog drops models without structured outputs, with per-request fees, or invalid prices', () => {
  const models = filterCatalog({
    data: [
      {
        ...base,
        id: 'no-structured',
        supported_parameters: [],
        pricing: { prompt: '0', completion: '0' },
      },
      {
        ...base,
        id: 'per-request-fee',
        pricing: { prompt: '0', completion: '0', request: '0.01' },
      },
      { ...base, id: 'nan-price', pricing: { prompt: 'free', completion: '0' } },
      { ...base, id: 'infinite-price', pricing: { prompt: 'Infinity', completion: '0' } },
      { ...base, id: 'negative-price', pricing: { prompt: '-1', completion: '0' } },
      { ...base, id: 'valid', pricing: { prompt: '0.0000001', completion: '0.0000005' } },
    ],
  });
  assert.deepEqual(
    models.map((m) => m.id),
    ['valid'],
  );
});

test('prompt-size tiers are preserved in threshold order, and a model with an unreadable tier is excluded', () => {
  const [model] = filterCatalog({
    data: [
      {
        ...base,
        id: HAIKU_MODEL,
        pricing: {
          prompt: '0.0000001',
          completion: '0.0000005',
          overrides: [
            { min_prompt_tokens: 100000, prompt: '0.0000005', completion: '0.0000025' },
            { min_prompt_tokens: 50000, prompt: '0.0000003', completion: '0.0000010' },
          ],
        },
      },
    ],
  });
  assert.deepEqual(model.tiers, [
    { minPromptTokens: 50000, input: 0.0000003, output: 0.000001 },
    { minPromptTokens: 100000, input: 0.0000005, output: 0.0000025 },
  ]);
  const unreadable = filterCatalog({
    data: [
      {
        ...base,
        id: 'vendor/bad-tier',
        pricing: {
          prompt: '0.0000001',
          completion: '0.0000005',
          overrides: [{ min_prompt_tokens: 50000, prompt: 'bad', completion: '0.0000010' }],
        },
      },
    ],
  });
  assert.deepEqual(unreadable, []);
});

test('reservations use the higher rate of an applicable tier and never the cheap base rate for long prompts', () => {
  const model = {
    id: 'x',
    name: 'x',
    input: 0.0000001,
    output: 0.0000005,
    context: 1_000_000,
    tiers: [{ minPromptTokens: 100000, input: 0.0000005, output: 0.0000025 }],
  };
  assert.deepEqual(ratesFor(model, 99_999), { input: 0.0000001, output: 0.0000005 });
  assert.deepEqual(ratesFor(model, 100_000), { input: 0.0000005, output: 0.0000025 });
  const cost = (promptTokens: number, outputTokens: number) => {
    const r = ratesFor(model, promptTokens);
    return promptTokens * r.input + outputTokens * r.output;
  };
  // Crossing the threshold must raise the reservation, not leave it at the base rate.
  assert.ok(cost(100_000, 1800) > cost(99_999, 1800) * 4.5);
});

test('a tier never lowers a base rate, so a cheap override cannot under-reserve', () => {
  const model = {
    id: 'x',
    name: 'x',
    input: 0.000002,
    output: 0.000004,
    context: 1000,
    tiers: [{ minPromptTokens: 1, input: 0.000001, output: 0.000001 }],
  };
  assert.deepEqual(ratesFor(model, 10), { input: 0.000002, output: 0.000004 });
});

test('economical models run at low reasoning effort; other models keep provider defaults', () => {
  assert.deepEqual(providerSettings(GLM_MODEL), {
    reasoning: { effort: 'low', exclude: true },
  });
  assert.deepEqual(providerSettings(HAIKU_MODEL), {
    reasoning: { effort: 'low', exclude: true },
  });
  assert.equal(providerSettings('vendor/other'), undefined);
});

test('time-window overrides apply conservatively at any hour, and one malformed entry never discards the catalog', () => {
  const models = filterCatalog({
    data: [
      {
        ...base,
        id: 'vendor/window',
        pricing: {
          prompt: '0.000000075',
          completion: '0.0000003',
          overrides: [
            { utc_start: 1500, utc_end: 100, prompt: '0.0000002', completion: '0.0000009' },
          ],
        },
      },
      { id: 'vendor/malformed', pricing: 'not-an-object' },
      {
        ...base,
        id: HAIKU_MODEL,
        pricing: { prompt: '0.0000001', completion: '0.0000005' },
      },
    ],
  });
  const window = models.find((m) => m.id === 'vendor/window');
  assert.ok(window, 'window-priced model stays in the catalog');
  assert.deepEqual(window.tiers, [{ minPromptTokens: 0, input: 0.0000002, output: 0.0000009 }]);
  assert.deepEqual(ratesFor(window, 10), { input: 0.0000002, output: 0.0000009 });
  assert.ok(models.some((m) => m.id === HAIKU_MODEL), 'valid models survive a malformed neighbor');
  assert.equal(models.length, 2);
});

test('a model whose tier price cannot be read is excluded rather than under-reserved', () => {
  const models = filterCatalog({
    data: [
      {
        ...base,
        id: 'vendor/unreadable-tier',
        pricing: {
          prompt: '0.000001',
          completion: '0.000002',
          overrides: [{ min_prompt_tokens: 1000, prompt: 'expensive', completion: '0.000002' }],
        },
      },
    ],
  });
  assert.deepEqual(models, []);
});
