import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { powerMap } from '../src/domain.js';
import type { Dispatch } from '../src/types.js';
const directory = mkdtempSync(join(tmpdir(), 'seven-powers-tests-'));
process.env.DATA_DIR = directory;
const { createMatch, forkMatch, startMatch, pauseMatch, DEFAULT_LIMITS, isActive } =
  await import('../server/simulation.js');
const { getMatch } = await import('../server/store.js');
const { agentView, spectatorView, visibleMessages } = await import('../server/privacy.js');
after(() => rmSync(directory, { recursive: true, force: true }));

test('private projections never leak unrelated channels, memories, profiles, or sealed decisions', async () => {
  const match = await createMatch('privacy', 'sandbox');
  const secret = 'SECRET_RUSSIAN_MEMORY';
  match.checkpoints[0].memories.RUSSIA = [secret];
  const message: Dispatch = {
    id: 'group',
    round: 0,
    from: 'RUSSIA',
    to: ['TURKEY', 'AUSTRIA'],
    text: 'SECRET_GROUP_CHANNEL',
    kind: 'alliance',
  };
  match.pending = {
    round: 0,
    messages: [
      message,
      {
        id: 'bilateral',
        round: 0,
        from: 'FRANCE',
        to: ['ENGLAND'],
        text: 'Channel peace',
        kind: 'proposal',
      },
    ],
    negotiated: [],
    decisions: {
      RUSSIA: {
        orders: ['SECRET_ORDER'],
        explanation: 'SECRET_EXPLANATION',
        memory: secret,
        relationships: { TURKEY: 99 },
      },
    },
  };
  const france = JSON.stringify(agentView(match, 'FRANCE'));
  assert.ok(!france.includes('SECRET_'));
  assert.ok(france.includes('Channel peace'));
  assert.ok(JSON.stringify(agentView(match, 'TURKEY')).includes('SECRET_GROUP_CHANNEL'));
  assert.ok(!JSON.stringify(agentView(match, 'TURKEY')).includes(secret));
  assert.equal(visibleMessages([message], 'GERMANY').length, 0);
  const spectator = JSON.stringify(spectatorView(match));
  assert.ok(spectator.includes('SECRET_GROUP_CHANNEL'));
  assert.ok(!spectator.includes('SECRET_ORDER'));
  assert.ok(!spectator.includes('SECRET_EXPLANATION'));
});

test('full phase pipeline adjudicates, persists, reveals, checks commitments, and captures centers', async () => {
  const m = await createMatch('flow', 'sandbox', undefined, { ...DEFAULT_LIMITS, maxPhases: 4 });
  await startMatch(m.id, true);
  const first = getMatch(m.id);
  assert.equal(first.turns.length, 1);
  assert.equal(first.checkpoints.length, 2);
  assert.equal(first.status, 'paused');
  assert.equal(first.checkpoints[1].state.board.name, 'F1901M');
  assert.ok(first.checkpoints[1].state.board.units.FRANCE.includes('F ENG'));
  assert.ok(first.turns[0].promises.some((p) => p.from === 'FRANCE' && !p.kept));
  assert.ok(first.turns[0].promises.some((p) => p.from === 'ENGLAND' && p.kept));
  assert.equal(first.usage.calls, 0);
  assert.ok(first.checkpoints[1].memories.ENGLAND.some((m) => m.includes('Broken')));
  assert.ok(!first.checkpoints[1].memories.GERMANY.some((m) => m.includes('F BRE - MAO')));
  await startMatch(m.id);
  const end = getMatch(m.id);
  assert.equal(end.status, 'complete');
  assert.equal(end.turns.length, 4);
  assert.ok(end.checkpoints[2].state.board.centers.FRANCE.includes('BEL'));
  assert.ok(end.turns.some((t) => t.phase.endsWith('A')));
  assert.throws(() => startMatch(m.id), /limit/);
});

test('branch restores past memory, excludes future, changes a legal order, and leaves original immutable', async () => {
  const m = await createMatch('original', 'sandbox', undefined, {
    ...DEFAULT_LIMITS,
    maxPhases: 3,
  });
  await startMatch(m.id);
  const original = getMatch(m.id);
  const frozen = JSON.stringify(original);
  const fork = await forkMatch(original, 0, { power: 'FRANCE', order: 'F BRE - MAO' }, 'sandbox');
  assert.equal(fork.turns.length, 0);
  assert.deepEqual(
    fork.checkpoints[0].memories,
    powerMap(() => []),
  );
  assert.equal(fork.checkpoints[0].state.board.name, 'S1901M');
  assert.equal(fork.usage.calls, 0);
  await startMatch(fork.id, true);
  const alternative = getMatch(fork.id);
  assert.ok(alternative.checkpoints[1].state.board.units.FRANCE.includes('F MAO'));
  assert.ok(alternative.turns[0].promises.find((p) => p.from === 'FRANCE')?.kept);
  assert.equal(JSON.stringify(getMatch(m.id)), frozen);
  assert.equal(alternative.parent?.at, 0);
  await assert.rejects(
    () => forkMatch(original, 0, { power: 'FRANCE', order: 'A PAR - MOS' }, 'sandbox'),
    /not a legal order/,
  );
});

test('pause settles partial phase and resume keeps received diplomacy without duplication', async () => {
  const m = await createMatch('pause', 'sandbox', undefined, { ...DEFAULT_LIMITS, maxPhases: 2 });
  const run = startMatch(m.id);
  assert.ok(isActive(m.id));
  assert.throws(() => startMatch(m.id), /already running/);
  pauseMatch(m.id);
  await run;
  const stopped = getMatch(m.id);
  assert.equal(stopped.status, 'paused');
  assert.ok(stopped.turns.length <= 1);
  await startMatch(m.id);
  const resumed = getMatch(m.id);
  assert.equal(resumed.status, 'complete');
  for (const turn of resumed.turns)
    assert.equal(new Set(turn.messages.map((m) => m.id)).size, turn.messages.length);
});

test('profile and diplomatic branches scope interventions to the selected country and audience', async () => {
  const m = await createMatch('interventions', 'sandbox');
  const branch = await forkMatch(
    m,
    0,
    {
      power: 'FRANCE',
      profile: 'historical',
      message: 'Let us cooperate.',
      to: ['ENGLAND', 'GERMANY'],
    },
    'sandbox',
  );
  assert.equal(branch.checkpoints[0].configs.FRANCE.profile, 'historical');
  assert.equal(branch.checkpoints[0].configs.ENGLAND.profile, 'strategist');
  await startMatch(branch.id, true);
  const updated = getMatch(branch.id);
  assert.ok(updated.turns[0].messages.some((m) => m.round === -1 && m.to.length === 2));
  assert.equal(updated.intervention, undefined);
});
