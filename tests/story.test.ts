import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerMap } from '../src/domain.js';
import { buildStory, describeOrder, outcomeText, provinceName, watchNext } from '../src/story.js';
import { POWERS, type Board, type Match, type Turn, type Power } from '../src/types.js';

function board(name: string, units: Partial<Record<Power, string[]>>, centers: Partial<Record<Power, string[]>>): Board {
  const each = <T,>(f: (p: Power) => T) => powerMap(f);
  return {
    name,
    units: each((p) => units[p] ?? []),
    centers: each((p) => centers[p] ?? []),
    retreats: each(() => ({})),
    homes: each(() => []),
    influence: each(() => []),
    builds: each(() => ({ count: 0, homes: [] })),
  };
}

function checkpoint(b: Board) {
  return {
    state: { engine: {}, board: b, legal: powerMap(() => ({})), done: false, outcome: [] },
    memories: powerMap(() => []),
    relations: powerMap(() => ({})),
    configs: powerMap(() => ({ model: 'x', profile: 'strategist' as const })),
  };
}

function turn(phase: string, orders: Partial<Record<Power, string[]>>, extra: Partial<Turn> = {}): Turn {
  return {
    phase,
    messages: [],
    decisions: powerMap((p) => ({ orders: orders[p] ?? [], explanation: '', memory: '', relationships: {} })),
    promises: [],
    recap: '',
    title: '',
    results: {},
    ...extra,
  };
}

function match(checkpoints: ReturnType<typeof checkpoint>[], turns: Turn[]): Match {
  return { id: 'm', name: 'm', mode: 'sandbox', createdAt: '', status: 'paused', checkpoints, turns, usage: {} as Match['usage'], limits: {} as Match['limits'] } as Match;
}

test('orders translate into plain actions while exact text stays available', () => {
  const cases: [string, string, string][] = [
    ['A PAR - BUR', 'move', 'Army Paris moves to Burgundy'],
    ['F BRE H', 'hold', 'Fleet Brest holds its position'],
    ['A BUR S F ENG - BEL', 'support', 'Army Burgundy supports fleet English Channel moving to Belgium'],
    ['A BUR S A PAR', 'support', 'Army Burgundy supports army Paris to hold'],
    ['F ENG C A PAR - BEL', 'convoy', 'Fleet English Channel convoys army Paris to Belgium'],
    ['A PAR R BUR', 'retreat', 'Army Paris retreats to Burgundy'],
    ['A PAR D', 'disband', 'Army Paris disbands'],
    ['A PAR B', 'build', 'Build army in Paris'],
  ];
  for (const [order, kind, summary] of cases) {
    const reading = describeOrder(order);
    assert.equal(reading.kind, kind, order);
    assert.equal(reading.exact, order);
    assert.equal(reading.summary, summary, order);
  }
  assert.equal(describeOrder('A PAR - BUR').target, 'BUR');
  assert.equal(describeOrder('X NOPE').kind, 'unknown');
});

test('coastal provinces and engine results read as understandable words', () => {
  assert.equal(provinceName('STP/SC'), 'St. Petersburg (south coast)');
  assert.equal(provinceName('XYZ'), 'XYZ');
  assert.equal(outcomeText([]), 'Succeeded');
  assert.match(outcomeText(['bounce']), /Bounced/);
  assert.match(outcomeText(['cut']), /Support was cut/);
});

test('a broken commitment is reported with the promised and submitted orders side by side', () => {
  const before = board('S1901M', { FRANCE: ['F BRE', 'A PAR'] }, { FRANCE: ['BRE', 'PAR', 'MAR'] });
  const after = board('F1901M', { FRANCE: ['F BRE', 'A PAR'] }, { FRANCE: ['BRE', 'PAR', 'MAR'] });
  const t = turn('S1901M', { FRANCE: ['F BRE H', 'A PAR - BUR'] }, {
    promises: [{ from: 'FRANCE', to: ['ENGLAND'], promised: 'F BRE - MAO', actual: 'F BRE H', kept: false }],
  });
  const story = buildStory(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  const first = story.moments[0];
  assert.equal(first.tone, 'broken');
  assert.equal(first.label, 'Broken commitment');
  assert.deepEqual(first.compare, { promised: 'F BRE - MAO', actual: 'F BRE H' });
  assert.equal(first.power, 'FRANCE');
  assert.equal(story.counts.broken, 1);
});

test('a kept order that still failed is distinguished from a broken commitment', () => {
  const before = board('S1901M', { FRANCE: ['A BUR'], GERMANY: ['A MUN'] }, {});
  const after = board('F1901M', { FRANCE: ['A BUR'], GERMANY: ['A MUN'] }, {});
  const t = turn('S1901M', { FRANCE: ['A BUR S A PAR - MUN'] }, {
    promises: [{ from: 'FRANCE', to: ['GERMANY'], promised: 'A BUR S A PAR - MUN', actual: 'A BUR S A PAR - MUN', kept: true }],
    results: { 'A BUR': ['cut'] },
  });
  const story = buildStory(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  assert.ok(story.moments.some((m) => m.tone === 'kept-failed'), 'kept-but-failed moment');
  assert.ok(!story.moments.some((m) => m.tone === 'broken'), 'no broken commitment');
});

test('center changes name the new holder and the previous owner from the adjacent checkpoints', () => {
  const before = board('S1901M', { GERMANY: ['A BER'], RUSSIA: ['A WAR'] }, { GERMANY: ['BER'], RUSSIA: ['WAR'], ITALY: ['ROM'] });
  const after = board('F1901M', { GERMANY: ['A BER'], RUSSIA: ['A WAR'] }, { GERMANY: ['BER', 'ROM'], RUSSIA: ['WAR'], ITALY: [] });
  const story = buildStory(match([checkpoint(before), checkpoint(after)], [turn('S1901M', {})]), 0)!;
  const gain = story.moments.find((m) => m.tone === 'gain')!;
  assert.equal(gain.power, 'GERMANY');
  assert.equal(gain.province, 'ROM');
  assert.match(gain.detail, /held by Italy/);
  assert.equal(story.counts.gained, 1);
  assert.equal(story.counts.lost, 1);
});

test('a bounced attack is a standoff, and a successful move into an occupied province is an invasion', () => {
  const before = board('S1901M', { FRANCE: ['A BUR'], GERMANY: ['A MUN'], ITALY: ['A VEN'] }, {});
  const after = board('F1901M', { FRANCE: ['A BUR'], GERMANY: ['A MUN'], ITALY: ['A VEN'] }, {});
  const bounced = turn('S1901M', { FRANCE: ['A BUR - MUN'], GERMANY: ['A MUN H'] }, { results: { 'A BUR': ['bounce'] } });
  const storyBounced = buildStory(match([checkpoint(before), checkpoint(after)], [bounced]), 0)!;
  const standoff = storyBounced.moments.find((m) => m.tone === 'standoff');
  assert.ok(standoff, 'standoff');
  assert.match(standoff!.headline, /Army Burgundy moves to Munich, and it bounced/);
  assert.equal(storyBounced.counts.standoffs, 1);

  const moved = turn('S1901M', { FRANCE: ['A BUR - MUN'], GERMANY: ['A MUN - TYR'] }, { results: { 'A BUR': [] } });
  const storyMoved = buildStory(match([checkpoint(before), checkpoint(after)], [moved]), 0)!;
  assert.ok(storyMoved.moments.some((m) => m.tone === 'invasion'), 'successful move into occupied province');
  assert.ok(!storyMoved.moments.some((m) => m.tone === 'standoff'));
});

test('a phase with nothing notable is described as quiet, not as a broken promise', () => {
  const b = board('S1901M', { FRANCE: ['A PAR'] }, { FRANCE: ['PAR'] });
  const story = buildStory(match([checkpoint(b), checkpoint(b)], [turn('S1901M', { FRANCE: ['A PAR H'] })]), 0)!;
  assert.equal(story.moments.length, 1);
  assert.equal(story.moments[0].tone, 'quiet');
});

test('a moment never reads future checkpoints or turns: changing later history leaves the story unchanged', () => {
  const b0 = board('S1901M', { FRANCE: ['A PAR'] }, { FRANCE: ['PAR'] });
  const b1 = board('F1901M', { FRANCE: ['A BUR'] }, { FRANCE: ['PAR'] });
  const t0 = turn('S1901M', { FRANCE: ['A PAR - BUR'] });
  const cps = [checkpoint(b0), checkpoint(b1)];
  const turns = [t0];
  const before = JSON.stringify(buildStory(match(cps, turns), 0));
  // Append an unrelated future with a dramatic change that must not influence turn 0.
  const future = board('S1902M', { FRANCE: ['A PAR'], GERMANY: ['A BER'] }, { FRANCE: ['PAR', 'BER'] });
  const mutated = match([...cps, checkpoint(future)], [...turns, turn('F1901M', { GERMANY: ['A BER - PRU'] }, { promises: [{ from: 'GERMANY', to: ['FRANCE'], promised: 'A BER - PRU', actual: 'A BER H', kept: false }] })]);
  assert.equal(JSON.stringify(buildStory(mutated, 0)), before);
});

test('watch-next guidance follows the phase kind', () => {
  assert.match(watchNext('S1901R'), /retreat/);
  assert.match(watchNext('F1901A'), /builds/i);
  assert.match(watchNext('S1901M'), /standoff/i);
});

test('story is undefined for a turn that has not resolved', () => {
  const b = board('S1901M', {}, {});
  assert.equal(buildStory(match([checkpoint(b)], []), 0), undefined);
  assert.ok(POWERS.length === 7);
});
