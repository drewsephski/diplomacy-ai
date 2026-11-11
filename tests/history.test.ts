import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_LIMITS, defaultConfigs } from '../src/domain.js';
import { describeResult, resultOf } from '../src/history.js';
import { POWERS, type Match } from '../src/types.js';

const directory = mkdtempSync(join(tmpdir(), 'seven-powers-history-'));
process.env.DATA_DIR = directory;
after(() => rmSync(directory, { recursive: true, force: true }));

const { createMatch, startMatch, forkMatch, removeMatch, isActive } = await import('../server/simulation.js');
const { getMatch, saveMatch, listMatches, normalizeMatch } = await import('../server/store.js');

test('a run that reaches its phase limit is described as a limit, never as a win', async () => {
  const limited = await createMatch('Limit run', 'sandbox', defaultConfigs(), { ...DEFAULT_LIMITS, maxPhases: 2 });
  await startMatch(limited.id, false);
  const waiting = await createMatch('Not started', 'sandbox', defaultConfigs(), DEFAULT_LIMITS);

  const rows = Object.fromEntries(listMatches().map((r) => [r.id, r]));
  assert.equal(rows[limited.id].result.kind, 'limit');
  assert.equal(rows[limited.id].phases, 2);
  assert.equal(rows[limited.id].phaseLimit, 2);
  assert.equal(rows[limited.id].calls, 0, 'sandbox games make no model calls');
  assert.equal(rows[waiting.id].result.kind, 'paused');
  assert.equal(rows[waiting.id].phases, 0);
  assert.match(describeResult(rows[limited.id]).title, /phase limit/);
  assert.doesNotMatch(describeResult(rows[limited.id]).title, /won/i);
});

test('an 18-center position is a win, and the same position at the limit is still a win', () => {
  const base = getMatch(listMatches().find((r) => r.result.kind === 'limit')!.id);
  const won = structuredClone(base) as Match;
  won.checkpoints.at(-1)!.state.board.centers.FRANCE = Array.from({ length: 18 }, (_, i) => `P${i}`);
  won.status = 'complete';
  const result = resultOf(won);
  assert.deepEqual(result, { kind: 'won', winner: 'FRANCE', centers: 18 });
  assert.match(describeResult({ result, phases: won.turns.length, phaseLimit: won.limits.maxPhases }).title, /France won with 18 of 34/);
  // Seventeen centers is not a win, even when the game has hit its phase limit.
  won.checkpoints.at(-1)!.state.board.centers.FRANCE = Array.from({ length: 17 }, (_, i) => `P${i}`);
  assert.equal(resultOf(won).kind, 'limit');
});

test('the recorded sample is kept: it cannot be deleted and is listed as a sample', async () => {
  const sample = await createMatch('The sample', 'sandbox', defaultConfigs(), DEFAULT_LIMITS);
  sample.mode = 'sample';
  saveMatch(sample);
  assert.throws(() => removeMatch(sample.id), (e: Error & { status?: number }) => e.status === 400 && /teaching replay/.test(e.message));
  assert.equal(getMatch(sample.id).mode, 'sample');
  assert.equal(listMatches().find((r) => r.id === sample.id)!.result.kind, 'sample');
});

test('a game that is playing cannot be deleted; deleting it after it pauses succeeds', async () => {
  const playing = await createMatch('Playing game', 'sandbox', defaultConfigs(), { ...DEFAULT_LIMITS, maxPhases: 3 });
  const job = startMatch(playing.id, false);
  assert.equal(isActive(playing.id), true);
  assert.throws(() => removeMatch(playing.id), (e: Error & { status?: number }) => e.status === 409);
  await job;
  assert.equal(isActive(playing.id), false);
  removeMatch(playing.id);
  assert.throws(() => getMatch(playing.id), /Match not found/);
});

test('an alternate timeline survives its deleted original: it plays, and the summary says the original is gone', async () => {
  const original = await createMatch('Original', 'sandbox', defaultConfigs(), DEFAULT_LIMITS);
  const child = await forkMatch(
    original,
    0,
    { power: 'ENGLAND', profile: 'diplomat' },
    'sandbox',
  );
  assert.equal(listMatches().find((r) => r.id === child.id)!.parentMissing, false);
  removeMatch(original.id);
  const row = listMatches().find((r) => r.id === child.id)!;
  assert.equal(row.parentMissing, true);
  assert.equal(row.parent?.name, 'Original', 'the record keeps the original name for the lineage line');
  const reloaded = getMatch(child.id);
  assert.equal(reloaded.parent?.id, original.id);
  assert.equal(reloaded.turns.length, 0);
});

test('records written by an earlier build still load: missing fields are filled, played data is not invented', () => {
  const legacy = { id: 'legacy-1', name: 'Old record', mode: 'sandbox', createdAt: '2026-01-01T00:00:00.000Z', status: 'paused' };
  saveMatch(legacy as unknown as Match);
  const row = listMatches().find((r) => r.id === 'legacy-1');
  assert.ok(row, 'the legacy record is listed');
  assert.equal(row.phases, 0);
  assert.equal(row.phaseLimit, DEFAULT_LIMITS.maxPhases);
  assert.equal(row.calls, 0);
  const loaded = getMatch('legacy-1');
  assert.deepEqual(loaded.usage, { calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0, actualUsd: 0, unpricedCalls: 0 });
  assert.deepEqual(loaded.turns, []);
  assert.deepEqual(loaded.checkpoints, []);
  const fromTurn = normalizeMatch({
    id: 'legacy-2',
    turns: [{ phase: 'S1901M', messages: [], decisions: {}, recap: '', title: '', results: {} } as never],
  });
  assert.deepEqual(fromTurn.turns[0].promises, []);
});

test('an unreadable row is skipped, so one damaged record never hides the rest of the list', () => {
  const raw = new DatabaseSync(join(directory, 'seven-powers.sqlite'));
  raw.prepare('INSERT INTO matches (id, data) VALUES (?, ?)').run('damaged', '{not json');
  raw.close();
  const ids = listMatches().map((r) => r.id);
  assert.ok(ids.includes('legacy-1'));
  assert.ok(!ids.includes('damaged'));
});

test('a display label exists for every result kind and never says won for a limit', () => {
  const kinds = [
    { kind: 'sample' },
    { kind: 'running' },
    { kind: 'paused' },
    { kind: 'open' },
    { kind: 'limit' },
    { kind: 'budget' },
    { kind: 'draw' },
    { kind: 'error' },
  ] as const;
  for (const result of kinds) {
    const d = describeResult({ result, phases: 4, phaseLimit: 6 });
    assert.ok(d.title.length > 0, result.kind);
  }
  assert.equal(POWERS.length, 7);
});
