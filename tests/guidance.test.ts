import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanGuidance, defaultConfigs, GUIDANCE_LIMITS, powerMap } from '../src/domain.js';
import type { Match } from '../src/types.js';

const directory = mkdtempSync(join(tmpdir(), 'seven-powers-guidance-'));
process.env.DATA_DIR = directory;
const { createMatch, forkMatch, extendMatch, DEFAULT_LIMITS } = await import('../server/simulation.js');
const { getMatch, saveMatch } = await import('../server/store.js');
const { agentView, spectatorView } = await import('../server/privacy.js');
const { buildAgentPrompt } = await import('../server/provider.js');
after(() => rmSync(directory, { recursive: true, force: true }));

const FRANCE_TEXT = 'FRANCE_PRIVATE_GUIDANCE: seek cooperation with France only through the Channel';
const GERMANY_TEXT = 'GERMANY_PRIVATE_GUIDANCE: keep two fronts from opening';
const BRIEFING = 'SHARED_BRIEFING: try diplomacy before attacking';

function configsWithGuidance() {
  const configs = defaultConfigs();
  configs.FRANCE = { ...configs.FRANCE, instructions: FRANCE_TEXT };
  configs.GERMANY = { ...configs.GERMANY, instructions: GERMANY_TEXT };
  return configs;
}

test('guidance is persisted in SQLite with the match, and the stored record reads it back', async () => {
  const created = await createMatch('guided', 'live', configsWithGuidance(), DEFAULT_LIMITS, BRIEFING);
  const stored = getMatch(created.id);
  assert.equal(stored.briefing, BRIEFING);
  assert.equal(stored.checkpoints[0].configs.FRANCE.instructions, FRANCE_TEXT);
  assert.equal(stored.checkpoints[0].configs.ITALY.instructions, '');
});

test('sandbox matches never store guidance, because deterministic policies cannot read it', async () => {
  const created = await createMatch('sandbox', 'sandbox', configsWithGuidance(), DEFAULT_LIMITS, BRIEFING);
  const stored = getMatch(created.id);
  assert.equal(stored.briefing, undefined);
  assert.equal(stored.checkpoints[0].configs.FRANCE.instructions, undefined);
});

test('each country observes the shared briefing and only its own instructions', async () => {
  const match = await createMatch('isolation', 'live', configsWithGuidance(), DEFAULT_LIMITS, BRIEFING);
  const france = agentView(match, 'FRANCE');
  const germany = agentView(match, 'GERMANY');
  assert.deepEqual(france.guidance, { sharedBriefing: BRIEFING, yourInstructions: FRANCE_TEXT });
  assert.deepEqual(germany.guidance, { sharedBriefing: BRIEFING, yourInstructions: GERMANY_TEXT });
  // Nobody's observation contains another country's instructions.
  assert.ok(!JSON.stringify(france).includes('GERMANY_PRIVATE_GUIDANCE'));
  assert.ok(!JSON.stringify(germany).includes('FRANCE_PRIVATE_GUIDANCE'));
});

test('the prompt actually sent for a country contains its guidance, the rules caveat, and no other country’s text', async () => {
  const match = await createMatch('prompt', 'live', configsWithGuidance(), DEFAULT_LIMITS, BRIEFING);
  const france = buildAgentPrompt(match, 'FRANCE', 'decide');
  assert.ok(france.prompt.includes(FRANCE_TEXT), 'own instructions reach the prompt');
  assert.ok(france.prompt.includes(BRIEFING), 'shared briefing reaches the prompt');
  assert.ok(!france.prompt.includes(GERMANY_TEXT), 'other countries stay out of the prompt');
  assert.match(france.system, /never changes the rules/, 'system prompt says guidance is below the rules');
  const negotiate = buildAgentPrompt(match, 'GERMANY', 'negotiate');
  assert.ok(negotiate.prompt.includes(GERMANY_TEXT));
  assert.ok(!negotiate.prompt.includes(FRANCE_TEXT));
});

test('the spectator projection exposes guidance for inspection, and existing matches without fields still work', async () => {
  const match = await createMatch('legacy', 'live', defaultConfigs(), DEFAULT_LIMITS);
  // A record saved before guidance existed has no briefing and no per-country instructions.
  const legacy = JSON.parse(JSON.stringify(match)) as Match;
  delete legacy.briefing;
  for (const config of Object.values(legacy.checkpoints[0].configs)) {
    delete config.instructions;
  }
  saveMatch(legacy);
  const restored = getMatch(legacy.id);
  assert.deepEqual(agentView(restored, 'ITALY').guidance, { sharedBriefing: '', yourInstructions: '' });
  assert.equal(spectatorView(restored).briefing, undefined);
  const withText = await createMatch('inspect', 'live', configsWithGuidance(), DEFAULT_LIMITS, BRIEFING);
  assert.equal(spectatorView(withText).briefing, BRIEFING);
});

test('branches inherit the checkpoint’s guidance, and the original record is not changed by the branch', async () => {
  const original = await createMatch('origin', 'live', configsWithGuidance(), DEFAULT_LIMITS, BRIEFING);
  const fork = await forkMatch(original, 0, { power: 'FRANCE', profile: 'opportunist' }, 'sandbox');
  assert.equal(fork.briefing, BRIEFING);
  assert.equal(fork.checkpoints[0].configs.GERMANY.instructions, GERMANY_TEXT);
  assert.equal(getMatch(original.id).checkpoints[0].configs.FRANCE.profile, 'strategist');
});

test('guidance text is plain text: control characters are removed and the length is bounded', () => {
  assert.equal(cleanGuidance('a\u0000b\u0007c  \r\n', 100), 'abc  \n'.trim());
  assert.equal(cleanGuidance('x'.repeat(900), GUIDANCE_LIMITS.briefing).length, GUIDANCE_LIMITS.briefing);
  assert.equal(cleanGuidance(undefined, 10), '');
  assert.equal(cleanGuidance('<b>hi</b>', 50), '<b>hi</b>', 'markup is kept as text, not interpreted');
});

test('a run that stopped at its phase limit can be extended; a game with a winner or a sample cannot', async () => {
  const match = await createMatch('extend', 'live', defaultConfigs(), { ...DEFAULT_LIMITS, maxPhases: 2 });
  assert.throws(() => extendMatch(match, 0), /Choose a phase limit above the phases already played/);
  // Simulate a finished run that stopped at its limit: two phases recorded, status complete.
  const turn = { phase: 'S1901M', messages: [], decisions: powerMap(() => ({ orders: [], explanation: '', memory: '', relationships: {} })), promises: [], recap: '', title: '', results: {} };
  match.turns = [turn, { ...turn, phase: 'F1901M' }];
  match.checkpoints.push({ ...match.checkpoints[0] });
  match.status = 'complete';
  saveMatch(match);
  const extended = extendMatch(getMatch(match.id), 4, 8);
  assert.equal(extended.limits.maxPhases, 4);
  assert.equal(extended.limits.budgetUsd, 8);
  assert.equal(extended.status, 'paused');

  const sample = await createMatch('sample', 'sandbox', defaultConfigs(), DEFAULT_LIMITS);
  sample.mode = 'sample';
  assert.throws(() => extendMatch(sample, 20), /fixed recording/);

  const winner = await createMatch('won', 'live', defaultConfigs(), { ...DEFAULT_LIMITS, maxPhases: 2 });
  winner.checkpoints[0].state.done = true;
  assert.throws(() => extendMatch(winner, 20), /has a winner/);
});
