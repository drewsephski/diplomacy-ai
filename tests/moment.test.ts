import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerMap } from '../src/domain.js';
import {
  centerDifferences,
  checkpointPhrase,
  compareTimelines,
  countryAt,
  describeIntervention,
  interventionOf,
  matchingCheckpoint,
  momentLabel,
  mutualTrustAt,
  questionFor,
  resolvedOrdersAt,
  resolvedPromisesAt,
  sealedPromisesAt,
  trustAt,
} from '../src/moment.js';
import { POWERS, type Board, type Checkpoint, type Decision, type Dispatch, type Match, type Power, type Turn } from '../src/types.js';

function board(name: string, units: Partial<Record<Power, string[]>>, centers: Partial<Record<Power, string[]>>): Board {
  return {
    name,
    units: powerMap((p) => units[p] ?? []),
    centers: powerMap((p) => centers[p] ?? []),
    retreats: powerMap(() => ({})),
    homes: powerMap(() => []),
    influence: powerMap(() => []),
    builds: powerMap(() => ({ count: 0, homes: [] })),
  };
}

function checkpoint(
  b: Board,
  extra: { memory?: string; trust?: Partial<Record<Power, Partial<Record<Power, number>>>>; instruction?: string; done?: boolean } = {},
): Checkpoint {
  return {
    state: { engine: {}, board: b, legal: powerMap(() => ({ x: ['F BRE - MAO', 'F BRE - ENG'] })), done: extra.done ?? false, outcome: [] },
    memories: powerMap(() => (extra.memory ? [extra.memory] : [])),
    relations: powerMap((p) => extra.trust?.[p] ?? {}),
    configs: powerMap(() => ({ model: 'x', profile: 'strategist' as const, instructions: extra.instruction })),
  };
}

function turn(phase: string, orders: Partial<Record<Power, string[]>>, extra: Partial<Turn> = {}): Turn {
  return {
    phase,
    messages: [],
    decisions: powerMap((p): Decision => ({ orders: orders[p] ?? [], explanation: '', memory: '', relationships: {} })),
    promises: [],
    recap: '',
    title: '',
    results: {},
    ...extra,
  };
}

function msg(id: string, from: Power, to: Power[], text: string, promise?: string): Dispatch {
  return { id, round: 0, from, to, text, kind: 'proposal', promise };
}

function make(checkpoints: Checkpoint[], turns: Turn[], over: Partial<Match> = {}): Match {
  return {
    id: 'm',
    name: 'Original',
    mode: 'sandbox',
    createdAt: '',
    status: 'paused',
    checkpoints,
    turns,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0, actualUsd: 0, unpricedCalls: 0 },
    limits: { maxPhases: 9, budgetUsd: 1, maxOutputTokens: 1000, diplomacyRounds: 2 },
    ...over,
  };
}

/**
 * Three moments. Spring 1901: France promises Britain an Atlantic move and enters the Channel.
 * Autumn 1901: Britain promises to stay out of Belgium; France takes Belgium. Every later fact has a
 * unique marker string so a leak into an earlier moment is easy to detect.
 */
function fixture() {
  const s = msg('s1', 'FRANCE', ['ENGLAND'], 'Our fleet goes to the Atlantic.', 'F BRE - MAO');
  const f = msg('f1', 'ENGLAND', ['FRANCE'], 'LATER-TALK Britain will hold.', 'F LON H');
  return make(
    [
      checkpoint(board('S1901M', { FRANCE: ['F BRE'], ENGLAND: ['F LON'] }, { FRANCE: ['BRE', 'PAR'], ENGLAND: ['LON'] }), {
        memory: 'Opening note',
        trust: { ENGLAND: { FRANCE: 40 }, FRANCE: { ENGLAND: 35 } },
        instruction: 'First instruction',
      }),
      checkpoint(board('F1901M', { FRANCE: ['F ENG'], ENGLAND: ['F LON'] }, { FRANCE: ['BRE', 'PAR'], ENGLAND: ['LON'] }), {
        memory: 'We promised Britain an Atlantic move',
        trust: { ENGLAND: { FRANCE: -20 }, FRANCE: { ENGLAND: 35 } },
        instruction: 'First instruction',
      }),
      checkpoint(board('S1902M', { FRANCE: ['F BEL'], ENGLAND: ['F LON'] }, { FRANCE: ['BRE', 'PAR', 'BEL'], ENGLAND: ['LON'] }), {
        memory: 'LATER-MEMORY',
        trust: { ENGLAND: { FRANCE: -60 }, FRANCE: { ENGLAND: 10 } },
        instruction: 'LATER-INSTRUCTION',
      }),
    ],
    [
      turn('S1901M', { FRANCE: ['F BRE - ENG'], ENGLAND: ['F LON H'] }, {
        messages: [s],
        promises: [{ from: 'FRANCE', to: ['ENGLAND'], promised: 'F BRE - MAO', actual: 'F BRE - ENG', kept: false, messageId: 's1' }],
        title: 'The Channel',
        recap: 'France entered the Channel.',
      }),
      turn('F1901M', { FRANCE: ['F ENG - BEL'], ENGLAND: ['F LON H'] }, {
        messages: [f],
        promises: [{ from: 'ENGLAND', to: ['FRANCE'], promised: 'F LON H', actual: 'F LON H', kept: true, messageId: 'f1' }],
        results: { 'F ENG': [] },
        title: 'LATER-TITLE',
      }),
    ],
  );
}

test('the moment label names the phase on screen and the last resolved phase, never a later one', () => {
  const m = fixture();
  assert.deepEqual(momentLabel(m, 0), { index: 0, phase: 'S1901M', season: 'Spring 1901', resolved: undefined });
  assert.equal(momentLabel(m, 1).season, 'Autumn 1901');
  assert.equal(momentLabel(m, 1).resolved?.season, 'Spring 1901');
  // Out-of-range moments clamp to the record instead of reading past it.
  assert.equal(momentLabel(m, 99).index, 2);
});

test('a country at an earlier moment shows that checkpoint, its instruction then, and the change since the previous moment', () => {
  const m = fixture();
  const at0 = countryAt(m, 0, 'FRANCE');
  assert.equal(at0.centers, 2);
  assert.equal(at0.change, undefined);
  assert.equal(at0.instruction, 'First instruction');
  const at2 = countryAt(m, 2, 'FRANCE');
  assert.equal(at2.centers, 3);
  assert.equal(at2.change, 1);
  assert.equal(at2.instruction, 'LATER-INSTRUCTION');
  assert.equal(countryAt(m, 1, 'FRANCE').instruction, 'First instruction');
  assert.equal(countryAt(m, 1, 'FRANCE').startCenters, 2);
});

test('orders and promise checks appear only for phases resolved before the moment', () => {
  const m = fixture();
  assert.deepEqual(resolvedOrdersAt(m, 0, 'FRANCE'), []);
  assert.deepEqual(resolvedPromisesAt(m, 0, 'FRANCE'), []);
  const orders = resolvedOrdersAt(m, 1, 'FRANCE');
  assert.deepEqual(
    orders.map((o) => [o.exact, o.plain, o.outcome]),
    [['F BRE - ENG', 'Fleet Brest moves to English Channel', 'Succeeded']],
  );
  const [p] = resolvedPromisesAt(m, 1, 'FRANCE');
  assert.equal(p.kept, false);
  assert.equal(p.promisedPlain, 'Fleet Brest moves to Mid-Atlantic Ocean');
  assert.equal(p.actualPlain, 'Fleet Brest moves to English Channel');
  // Autumn's orders are sealed at moment 1.
  assert.equal(resolvedOrdersAt(m, 1, 'FRANCE').some((o) => o.exact === 'F ENG - BEL'), false);
  assert.deepEqual(resolvedPromisesAt(m, 1, 'ENGLAND'), []);
});

test('promises of the phase on screen are visible as words and sealed as actions', () => {
  const m = fixture();
  assert.deepEqual(
    sealedPromisesAt(m, 0, 'FRANCE').map((s) => [s.id, s.promised, s.promisedPlain]),
    [['s1', 'F BRE - MAO', 'Fleet Brest moves to Mid-Atlantic Ocean']],
  );
  assert.deepEqual(sealedPromisesAt(m, 0, 'ENGLAND'), []);
  assert.deepEqual(sealedPromisesAt(m, 1, 'ENGLAND').map((s) => s.id), ['f1']);
  // The live edge reads pending talks only.
  const live = { ...m, pending: { round: 0, messages: [msg('p1', 'FRANCE', ['GERMANY'], 'Hold.', 'F BEL H')], negotiated: [], decisions: {} } };
  assert.deepEqual(sealedPromisesAt(live, 2, 'FRANCE').map((s) => s.id), ['p1']);
  assert.deepEqual(sealedPromisesAt(m, 2, 'FRANCE'), []);
});

test('trust is one country’s stated assessment at the moment, and mutual trust needs both sides', () => {
  const m = fixture();
  const t0 = trustAt(m, 0, 'ENGLAND').find((t) => t.other === 'FRANCE')!;
  assert.equal(t0.score, 40);
  assert.equal(t0.label, 'Britain’s stated trust in France');
  assert.equal(trustAt(m, 2, 'ENGLAND').find((t) => t.other === 'FRANCE')!.score, -60);
  assert.deepEqual(mutualTrustAt(m, 0), [{ a: 'ENGLAND', b: 'FRANCE', score: 35 }]);
  // One side lowered its score after the broken promise: no mutual reading remains.
  assert.deepEqual(mutualTrustAt(m, 1), []);
});

test('no reading at an earlier moment contains a fact recorded later', () => {
  const m = fixture();
  for (const index of [0, 1]) {
    const dump = JSON.stringify(
      POWERS.map((p) => [
        countryAt(m, index, p),
        resolvedOrdersAt(m, index, p),
        resolvedPromisesAt(m, index, p),
        sealedPromisesAt(m, index, p),
        trustAt(m, index, p),
      ]),
    );
    assert.doesNotMatch(dump, /LATER-INSTRUCTION|LATER-MEMORY|F ENG - BEL/);
    if (index === 0) assert.doesNotMatch(dump, /F BRE - ENG|F LON H/);
  }
});

test('the checkpoint and the change are named in plain words', () => {
  assert.equal(checkpointPhrase('S1901M'), 'the start of Spring 1901, before the orders were sealed');
  assert.equal(checkpointPhrase('F1901R'), 'the start of Autumn 1901 (retreats), before any retreat was ordered');
  assert.equal(checkpointPhrase('W1901A'), 'the start of Winter 1901 (adjustments), before builds and disbands were ordered');
  assert.equal(describeIntervention({ power: 'FRANCE', order: 'F BRE - MAO' }), 'France’s order is replaced: Fleet Brest moves to Mid-Atlantic Ocean.');
  assert.equal(questionFor({ power: 'FRANCE', order: 'F BRE - MAO' }), 'What if France had ordered: fleet Brest moves to Mid-Atlantic Ocean?');
  assert.match(describeIntervention({ power: 'ENGLAND', message: 'Hello', to: ['FRANCE'] }), /^Britain sends an extra message to France: “Hello”$/);
  assert.equal(questionFor({ power: 'GERMANY', profile: 'diplomat' }), 'What if Germany had played as a coalition builder?');
});

function branchOf(original: Match, at: number, frenchOrder: string, over: Partial<Match> = {}): Match {
  const after = board('F1901M', { FRANCE: ['F MAO'], ENGLAND: ['F LON'] }, { FRANCE: ['BRE', 'PAR'], ENGLAND: ['LON'] });
  return make(
    [...original.checkpoints.slice(0, at + 1), checkpoint(after)],
    [...original.turns.slice(0, at), turn('S1901M', { FRANCE: [frenchOrder], ENGLAND: ['F LON H'] }, { title: 'Alternate', recap: 'France kept its word.' })],
    { id: 'b', name: 'Original · Branch 1', parent: { id: 'm', name: 'Original', at, intervention: { power: 'FRANCE', order: frenchOrder }, question: 'What if France had kept its promise?' }, ...over },
  );
}

test('the comparison shows the first diverging phase only once the viewed moment is past it', () => {
  const original = fixture();
  const branch = branchOf(original, 0, 'F BRE - MAO');
  const before = compareTimelines(branch, original, 0);
  assert.equal(before.at, 0);
  assert.equal(before.from, 'S1901M');
  assert.deepEqual(before.shared, []);
  assert.equal(before.first, undefined);
  assert.match(before.firstMissing!, /Move to moment 1/);
  const after = compareTimelines(branch, original, 1);
  assert.equal(after.first?.season, 'Spring 1901');
  assert.deepEqual(
    after.first!.orders.map((d) => [d.power, d.original.map((o) => o.plain), d.branch.map((o) => o.plain)]),
    [['FRANCE', ['Fleet Brest moves to English Channel'], ['Fleet Brest moves to Mid-Atlantic Ocean']]],
  );
  // The original's later phase (Autumn 1901) is not part of the first divergence.
  assert.doesNotMatch(JSON.stringify(after), /LATER-TITLE|F ENG - BEL/);
});

test('a branch that has not played yet, and an older branch without a recorded change, are described honestly', () => {
  const original = fixture();
  const unplayed = make(original.checkpoints.slice(0, 2), original.turns.slice(0, 1), { parent: { id: 'm', name: 'Original', at: 1 }, intervention: { power: 'ENGLAND', profile: 'diplomat' } });
  assert.equal(compareTimelines(unplayed, original, 1).firstMissing, 'This alternate timeline has not played its first phase yet.');
  assert.deepEqual(compareTimelines(unplayed, original, 1).shared.map((s) => s.season), ['Spring 1901']);
  // Before it is applied the change lives on match.intervention; afterwards only parent.intervention keeps it.
  assert.deepEqual(interventionOf(unplayed), { power: 'ENGLAND', profile: 'diplomat' });
  assert.equal(interventionOf({ ...unplayed, intervention: undefined }), undefined);
});

test('centers held differently are listed by province, and maps are matched by phase name', () => {
  const a = board('S1902M', {}, { FRANCE: ['BRE', 'PAR', 'BEL'], ENGLAND: ['LON'] });
  const b = board('S1902M', {}, { FRANCE: ['BRE', 'PAR'], ENGLAND: ['LON', 'BEL'] });
  assert.deepEqual(centerDifferences(a, b), [{ code: 'BEL', name: 'Belgium', original: 'FRANCE', branch: 'ENGLAND' }]);

  // The original played an extra retreat phase, so the same game phase sits at a different index.
  const original = fixture();
  original.checkpoints.splice(1, 0, checkpoint(board('S1901R', {}, {})));
  const branch = branchOf(fixture(), 0, 'F BRE - MAO');
  assert.deepEqual(matchingCheckpoint(branch, original, 1), { index: 2, same: true });
  const lonely = make([checkpoint(board('S1901M', {}, {})), checkpoint(board('F1905M', {}, {}))], [turn('S1901M', {})], { parent: { id: 'm', name: 'o', at: 0 } });
  assert.deepEqual(matchingCheckpoint(lonely, fixture(), 1), { index: 1, same: false });
});
