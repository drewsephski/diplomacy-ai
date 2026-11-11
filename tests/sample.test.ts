import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sample, simulation, cleanup } from './sample-fixture.js';
import { conversationsAt } from '../src/conversations.js';
import { describeOrder } from '../src/story.js';
import type { Match } from '../src/types.js';

after(cleanup);
const { getMatch, listMatches, saveMatch } = await import('../server/store.js');
const { SAMPLE_VERSION, SAMPLE_NAME } = await import('../server/sample-agent.js');

const turn = (phase: string) => sample.turns.find((t) => t.phase === phase)!;
const all = sample.turns.flatMap((t) => t.messages);

test('the sample is labelled with its edition and every phase was adjudicated', () => {
  assert.equal(sample.mode, 'sample');
  assert.equal(sample.sampleVersion, SAMPLE_VERSION);
  assert.equal(sample.name, SAMPLE_NAME);
  assert.equal(sample.checkpoints.length, sample.turns.length + 1);
  assert.equal(sample.usage.calls, 0);
  assert.equal(listMatches().find((r) => r.id === sample.id)!.sampleVersion, SAMPLE_VERSION);
});

test('Spring 1901: the Channel promise is broken, and Britain accepted with a promise of its own', () => {
  const s = turn('S1901M');
  const france = s.promises.find((p) => p.from === 'FRANCE' && p.promised === 'F BRE - MAO')!;
  assert.equal(france.kept, false);
  assert.equal(france.actual, 'F BRE - ENG');
  const offer = s.messages.find((m) => m.id === france.messageId)!;
  assert.deepEqual(offer.to, ['ENGLAND']);
  const reply = s.messages.find((m) => m.replyTo === offer.id)!;
  assert.equal(reply.from, 'ENGLAND');
  assert.equal(reply.response, 'accept');
  assert.equal(s.promises.find((p) => p.messageId === reply.id)?.kept, true);
  for (const p of s.promises) assert.ok(p.messageId && s.messages.some((m) => m.id === p.messageId), 'every promise check names its message');
});

test('a kept promise whose order still failed: the Black Sea bounce', () => {
  const s = turn('S1901M');
  const turkey = s.promises.find((p) => p.from === 'TURKEY')!;
  assert.equal(turkey.kept, true);
  assert.ok(s.results[describeOrder(turkey.promised).unit].includes('bounce'));
});

test('Britain reacts next phase, in reply to the broken promise, and only because the fleet is really there', () => {
  const autumn = turn('F1901M');
  const threat = autumn.messages.find((m) => m.from === 'ENGLAND' && m.kind === 'threat')!;
  assert.match(threat.text, /Your fleet is in the Channel/);
  assert.ok(sample.checkpoints[1].state.board.units.FRANCE.includes('F ENG'));
  const answered = turn('S1901M').messages.find((m) => m.id === threat.replyTo)!;
  assert.equal(answered.from, 'FRANCE', 'a recorded reply across phases');
  // A spring later, Britain and Germany take Belgium with a supported attack.
  const spring = turn('S1902M');
  assert.ok(spring.decisions.GERMANY.orders.includes('A HOL S F ENG - BEL'));
  assert.ok(spring.results['F BEL']?.includes('dislodged'));
  assert.ok(spring.messages.some((m) => m.from === 'ENGLAND' && m.response === 'decline'), 'a declined offer');
});

test('a group thread keeps its three participants; a unilateral proposal is never accepted; a counteroffer exists', () => {
  const end = conversationsAt(sample, sample.turns.length);
  const group = end.find((c) => c.id === 'GERMANY+ITALY+AUSTRIA')!;
  assert.ok(group.group);
  assert.deepEqual(group.participants, ['GERMANY', 'ITALY', 'AUSTRIA']);
  assert.ok(group.messages.length >= 2);
  const galicia = end.find((c) => c.id === 'AUSTRIA+RUSSIA')!;
  assert.equal(galicia.messages.length, 1);
  assert.equal(galicia.messages[0].standing, 'unanswered');
  assert.equal(galicia.mutual.length, 0);
  assert.ok(galicia.open.some((o) => /never answered/.test(o)));
  assert.ok(all.some((m) => m.response === 'counter'));
  // Recorded reply links are real: each points at an earlier message its sender could see.
  const replies = all.filter((m) => m.replyTo);
  assert.ok(replies.length >= 8);
  for (const r of replies) {
    const target = all.find((m) => m.id === r.replyTo)!;
    assert.ok(target.from === r.from || target.to.includes(r.from));
  }
});

test('a quiet phase exists: talks, no promise, no contest, no change of centers', () => {
  const quiet = sample.turns.findIndex(
    (t) => t.phase.endsWith('M') && t.promises.length === 0 && !Object.values(t.results).some((r) => r.length),
  );
  assert.ok(quiet > 0, 'one movement phase is quiet');
  const before = sample.checkpoints[quiet].state.board.centers;
  const afterCenters = sample.checkpoints[quiet + 1].state.board.centers;
  assert.deepEqual(before, afterCenters);
});

test('later phases are varied rather than mass bounces, and no template message is repeated', () => {
  for (const t of sample.turns.filter((x) => x.phase.endsWith('M'))) {
    const moves = Object.values(t.decisions).flatMap((d) => d.orders).filter((o) => describeOrder(o).kind === 'move');
    const bounced = moves.filter((o) => t.results[describeOrder(o).unit]?.includes('bounce'));
    assert.ok(bounced.length <= Math.max(2, moves.length / 2), `${t.phase}: ${bounced.length} of ${moves.length} moves bounced`);
  }
  const texts = all.map((m) => m.text);
  assert.equal(new Set(texts).size, texts.length, 'no message text repeats');
  const changes = sample.turns.map((_, i) => JSON.stringify(sample.checkpoints[i].state.board.centers) !== JSON.stringify(sample.checkpoints[i + 1].state.board.centers));
  assert.ok(changes.filter(Boolean).length >= 3, 'supply centers change hands in several phases');
});

test('a sandbox branch where France keeps its promise never accuses France of being in the Channel', async () => {
  const branch = await simulation.forkMatch(sample, 0, { power: 'FRANCE', order: 'F BRE - MAO' }, 'sandbox', { ...sample.limits, maxPhases: 4 }, 'What if France had kept its promise?');
  assert.deepEqual(branch.parent?.intervention, { power: 'FRANCE', order: 'F BRE - MAO' });
  assert.equal(branch.parent?.question, 'What if France had kept its promise?');
  await simulation.startMatch(branch.id);
  const played: Match = getMatch(branch.id);
  assert.equal(played.status, 'complete', played.error);
  const texts = played.turns.flatMap((t) => t.messages.map((m) => m.text));
  assert.ok(!texts.some((t) => /Your fleet is in the Channel/.test(t)));
  assert.ok(texts.some((t) => /You kept your word on the Channel/.test(t)));
  assert.ok(!texts.some((t) => /France broke its word/.test(t)), 'Britain never cites a betrayal that did not happen');
  assert.deepEqual(played.parent?.intervention, { power: 'FRANCE', order: 'F BRE - MAO' }, 'kept after the intervention is applied');
});

test('ensureSample keeps an older edition, renames it, and builds the current one only once', async () => {
  const old = structuredClone(sample);
  old.id = 'older-edition';
  delete old.sampleVersion;
  saveMatch(old);
  // The current edition exists, so nothing new is built, but the older one is renamed.
  assert.equal(await simulation.ensureSample(), undefined);
  const renamed = getMatch('older-edition');
  assert.equal(renamed.name, `${SAMPLE_NAME} · earlier edition`);
  assert.equal(renamed.sampleVersion, 1);
  assert.equal(renamed.mode, 'sample');
  const rows = listMatches().filter((r) => r.mode === 'sample');
  assert.equal(rows.filter((r) => r.sampleVersion === SAMPLE_VERSION).length, 1);
});
