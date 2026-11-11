import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerMap } from '../src/domain.js';
import { compassBetween, deriveGuidedPhase, MAX_POPUPS, type GuidedEvent } from '../src/guided/events.js';
import { glossaryFor, splitTerms, termMeaning } from '../src/guided/glossary.js';
import { guideReducer, initialGuide, pendingPhases, type GuideState } from '../src/guided/reducer.js';
import type { Board, Decision, Match, Power, Turn } from '../src/types.js';

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
    decisions: powerMap((p): Decision => ({ orders: orders[p] ?? [], explanation: '', memory: '', relationships: {} })),
    promises: [],
    recap: '',
    title: '',
    results: {},
    ...extra,
  };
}

function match(checkpoints: ReturnType<typeof checkpoint>[], turns: Turn[]): Match {
  return {
    id: 'm',
    name: 'm',
    mode: 'sandbox',
    createdAt: '',
    status: 'paused',
    checkpoints,
    turns,
    usage: {} as Match['usage'],
    limits: {} as Match['limits'],
  } as Match;
}

const kinds = (events: GuidedEvent[]) => events.map((e) => e.kind);

test('a supported attack into an occupied province is a supported-attack, naming the supporter', () => {
  const before = board('S1901M', { FRANCE: ['A BUR', 'F ENG'], GERMANY: ['A BEL'] }, {});
  const after = board('F1901M', { FRANCE: ['A BUR', 'F BEL'], GERMANY: [] }, {});
  const t = turn('S1901M', { FRANCE: ['A BUR S F ENG - BEL', 'F ENG - BEL'], GERMANY: ['A BEL H'] }, {
    results: { 'A BUR': [], 'F ENG': [], 'A BEL': [] },
  });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  const attack = phase.events.find((e) => e.kind === 'supported-attack');
  assert.ok(attack, 'supported attack event exists');
  assert.equal(attack!.focus, 'BEL');
  assert.match(attack!.happened, /France sent its fleet from the English Channel into Belgium/);
  assert.match(attack!.happened, /backed that move/);
  assert.ok(attack!.exact.includes('A BUR S F ENG - BEL'));
  assert.equal(attack!.powers[0], 'FRANCE');
});

test('an uncontested move into an empty province is routine: counted, never a popup', () => {
  const before = board('S1901M', { FRANCE: ['A PAR'] }, { FRANCE: ['PAR'] });
  const after = board('F1901M', { FRANCE: ['A BUR'] }, { FRANCE: ['PAR'] });
  const t = turn('S1901M', { FRANCE: ['A PAR - BUR'] }, { results: { 'A PAR': [] } });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  assert.equal(phase.events.length, 0);
  assert.equal(phase.routine, 1);
  assert.equal(phase.orderCount, 1);
});

test('a bounced move names the defender, and two bounces in one province form one standoff', () => {
  const before = board('S1901M', { FRANCE: ['A BUR'], GERMANY: ['A MUN', 'A MAR'] }, {});
  const after = before;
  const t = turn('S1901M', { FRANCE: ['A BUR - MUN'], GERMANY: ['A MUN H', 'A MAR - MUN'] }, {
    results: { 'A BUR': ['bounce'], 'A MAR': ['bounce'], 'A MUN': [] },
  });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  const standoffs = phase.events.filter((e) => e.kind === 'standoff');
  assert.equal(standoffs.length, 1, 'both attacks on Munich become one standoff');
  assert.match(standoffs[0].headline, /Standoff over Munich/);
  assert.match(standoffs[0].happened, /tried to send its army from Burgundy into Munich, but it was blocked and bounced/);
  assert.match(standoffs[0].happened, /Germany held the province/);
  assert.match(standoffs[0].matters, /no supply center changed hands/);
});

test('a successful move into an occupied province without support is attack-occupied; a failed one is a standoff', () => {
  const before = board('S1901M', { FRANCE: ['A BUR'], GERMANY: ['A MUN'] }, {});
  const after = board('F1901M', { FRANCE: ['A MUN'], GERMANY: ['A TYR'] }, {});
  const moved = turn('S1901M', { FRANCE: ['A BUR - MUN'], GERMANY: ['A MUN - TYR'] }, { results: { 'A BUR': [] } });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [moved]), 0)!;
  const move = phase.events.find((e) => e.kind === 'attack-occupied');
  assert.ok(move);
  assert.equal(move!.headline, 'France moved into Munich');
  assert.match(move!.matters, /Germany held Munich when the phase began/);
});

test('convoys are one grouped event, and a failed convoy says the army stayed put', () => {
  const before = board('S1901M', { ENGLAND: ['F LON', 'A LVP'], FRANCE: ['A PAR'] }, {});
  const after = before;
  const t = turn('S1901M', { ENGLAND: ['F LON - NTH', 'A LVP - BEL VIA'], FRANCE: ['A PAR - BEL VIA'] }, {
    results: { 'A LVP': ['no convoy'], 'A PAR': [] },
  });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  const convoy = phase.events.filter((e) => e.kind === 'convoy');
  assert.equal(convoy.length, 1);
  assert.equal(convoy[0].headline, '1 of 2 convoyed moves failed');
  assert.match(convoy[0].happened, /Britain's army in Liverpool was meant to cross to Belgium, but no fleet carried it/);
  assert.match(convoy[0].happened, /France's army in Paris crossed the water to Belgium/);
});

test('a dislodged unit is shown with the rule for what happens next, and retreats are grouped', () => {
  const before = board('S1901R', { ITALY: ['A VEN'], AUSTRIA: ['A TYR', 'A VIE'] }, {});
  const after = board('F1901R', { ITALY: [], AUSTRIA: ['A TYR', 'A VIE'] }, {});
  const t = turn('F1901M', {}, { results: { 'A VEN': ['dislodged'] } });
  const retreat = turn('F1901R', { ITALY: ['A VEN R TRI'] }, { results: { 'A VEN': [] } });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after), checkpoint(after)], [t, retreat]), 0)!;
  const dislodged = phase.events.find((e) => e.kind === 'dislodged');
  assert.ok(dislodged, 'dislodged event');
  assert.equal(dislodged!.headline, "Italy's army in Venice was pushed out");
  assert.match(dislodged!.matters, /retreat to an empty neighboring province/);
  // The retreat step is its own phase with its own popup.
  const retreatPhase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after), checkpoint(after)], [t, retreat]), 1)!;
  const retreats = retreatPhase.events.filter((e) => e.kind === 'retreat');
  assert.equal(retreats.length, 1);
  assert.match(retreats[0].happened, /Italy's army retreated from Venice to Trieste/);
});

test('winter adjustments are one popup covering builds and disbands', () => {
  const before = board('W1901A', { FRANCE: ['A PAR', 'A BRE'], RUSSIA: ['A MOS'] }, { FRANCE: ['PAR', 'BRE', 'MAR'], RUSSIA: ['MOS'] });
  const after = board('S1902M', { FRANCE: ['A PAR', 'A BRE', 'A MAR'], RUSSIA: [] }, { FRANCE: ['PAR', 'BRE', 'MAR'], RUSSIA: ['MOS'] });
  const t = turn('W1901A', { FRANCE: ['A MAR B'], RUSSIA: ['A MOS D'] }, { results: {} });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  assert.deepEqual(kinds(phase.events), ['adjustment']);
  assert.equal(phase.events[0].headline, 'Winter adjustments: 1 build, 1 disband');
  assert.match(phase.events[0].happened, /France built an army in Marseilles/);
  assert.match(phase.events[0].happened, /Russia disbanded an army in Moscow/);
});

test('a broken promise states the promised order, the submitted order, and that the record cannot show intent', () => {
  const before = board('S1901M', { ENGLAND: ['F LON'], FRANCE: ['F BRE'] }, {});
  const after = before;
  const t = turn('S1901M', { FRANCE: ['F BRE - ENG'] }, {
    messages: [
      { id: 'd1', round: 0, from: 'FRANCE', to: ['ENGLAND'], text: 'My Brest fleet will sail west.', kind: 'proposal', promise: 'F BRE - MAO' },
    ],
    promises: [{ from: 'FRANCE', to: ['ENGLAND'], promised: 'F BRE - MAO', actual: 'F BRE - ENG', kept: false }],
    results: { 'F BRE': [] },
  });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  const broken = phase.events[0];
  assert.equal(broken.kind, 'broken-promise', 'broken promise is the first popup');
  assert.equal(broken.headline, 'France broke its promise to Britain');
  const west = compassBetween('BRE', 'MAO');
  assert.ok(west, 'direction comes from map geometry');
  assert.match(broken.happened, new RegExp(`had promised Britain to send its fleet ${west} from Brest into the Mid-Atlantic Ocean`));
  assert.match(broken.happened, /France sent its fleet from Brest into the English Channel/);
  assert.match(broken.matters, /cannot show whether Britain planned around/);
  assert.deepEqual(broken.quote, { from: 'FRANCE', text: 'My Brest fleet will sail west.' });
  assert.deepEqual(broken.compare, { promised: 'F BRE - MAO', actual: 'F BRE - ENG' });
});

test('a kept promise whose order still failed is a separate event from a broken promise', () => {
  const before = board('S1901M', { TURKEY: ['F ANK'], RUSSIA: ['F SEV'] }, {});
  const after = before;
  const t = turn('S1901M', { TURKEY: ['F ANK - BLA'], RUSSIA: ['F SEV - BLA'] }, {
    promises: [{ from: 'TURKEY', to: ['RUSSIA'], promised: 'F ANK - BLA', actual: 'F ANK - BLA', kept: true }],
    results: { 'F ANK': ['bounce'], 'F SEV': ['bounce'] },
  });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  assert.ok(phase.events.some((e) => e.kind === 'kept-promise-failed'));
  assert.ok(!phase.events.some((e) => e.kind === 'broken-promise'));
  const kept = phase.events.find((e) => e.kind === 'kept-promise-failed')!;
  assert.match(kept.headline, /kept its word, but the order failed/);
});

test('a successful kept promise is described as kept, and several are grouped into one popup', () => {
  const before = board('S1901M', { ENGLAND: ['F LON'], GERMANY: ['A BER'] }, {});
  const after = before;
  const t = turn('S1901M', { ENGLAND: ['F LON - NTH'], GERMANY: ['A BER H'] }, {
    promises: [
      { from: 'ENGLAND', to: ['FRANCE'], promised: 'F LON - NTH', actual: 'F LON - NTH', kept: true },
      { from: 'GERMANY', to: ['FRANCE'], promised: 'A BER H', actual: 'A BER H', kept: true },
    ],
    results: { 'F LON': [], 'A BER': [] },
  });
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  const kept = phase.events.filter((e) => e.kind === 'kept-promise');
  assert.equal(kept.length, 1);
  assert.equal(kept[0].headline, '2 promises were kept exactly as written');
});

test('private talks never claim an agreement, and an offer is labelled as one', () => {
  const b = board('S1901M', { FRANCE: ['A PAR'] }, {});
  const t = turn('S1901M', { FRANCE: ['A PAR H'] }, {
    messages: [
      { id: 'a', round: 0, from: 'FRANCE', to: ['GERMANY'], text: 'Let us keep the border quiet.', kind: 'proposal' },
    ],
  });
  const phase = deriveGuidedPhase(match([checkpoint(b), checkpoint(b)], [t]), 0)!;
  const talks = phase.events.find((e) => e.kind === 'talks')!;
  assert.match(talks.happened, /1 proposal, 0 replies\. 0 named a specific order\./);
  assert.match(talks.happened, /A proposal is an offer, not an agreement/);
  assert.doesNotMatch(talks.happened + talks.headline, /alliance|agreed|treaty/i);
});

test('popups are capped, and the rest are listed as overflow instead of stacking', () => {
  // Seven countries each gain one center: seven separate popups before the cap.
  const before = board('S1901M', {}, {});
  const after = board('F1901M', {}, {
    ENGLAND: ['LON'],
    FRANCE: ['PAR'],
    GERMANY: ['BER'],
    ITALY: ['ROM'],
    AUSTRIA: ['VIE'],
    RUSSIA: ['MOS'],
    TURKEY: ['CON'],
  });
  const t = turn('S1901M', {});
  const phase = deriveGuidedPhase(match([checkpoint(before), checkpoint(after)], [t]), 0)!;
  assert.equal(phase.events.length, MAX_POPUPS);
  assert.equal(phase.overflow.length, 7 - MAX_POPUPS);
  assert.ok(phase.overflow.every((h) => h.includes('now holds') || h.includes('gained')));
});

test('a phase reads only its own two checkpoints: changing later history leaves the walkthrough unchanged', () => {
  const b0 = board('S1901M', { FRANCE: ['A PAR'] }, { FRANCE: ['PAR'] });
  const b1 = board('F1901M', { FRANCE: ['A BUR'] }, { FRANCE: ['PAR'] });
  const t0 = turn('S1901M', { FRANCE: ['A PAR - BUR'] }, { results: { 'A PAR': [] } });
  const cps = [checkpoint(b0), checkpoint(b1)];
  const before = JSON.stringify(deriveGuidedPhase(match(cps, [t0]), 0));
  const future = board('S1902M', { FRANCE: ['A PAR'], GERMANY: ['A BER'] }, { FRANCE: ['PAR', 'BER'] });
  const mutated = match(
    [...cps, checkpoint(future)],
    [t0, turn('F1901M', { GERMANY: ['A BER - PRU'] }, { promises: [{ from: 'GERMANY', to: ['FRANCE'], promised: 'A BER - PRU', actual: 'A BER H', kept: false }] })],
  );
  assert.equal(JSON.stringify(deriveGuidedPhase(mutated, 0)), before);
});

test('no walkthrough exists for a phase that has not resolved', () => {
  const b = board('S1901M', {}, {});
  assert.equal(deriveGuidedPhase(match([checkpoint(b)], []), 0), undefined);
});

test('guide state: open, step is clamped to the summary card, and close only counts a finished phase as reviewed', () => {
  let s: GuideState = initialGuide(2);
  s = guideReducer(s, { type: 'open', turn: 2 });
  assert.deepEqual(s, { turn: 2, step: 0, reviewed: 2 });
  s = guideReducer(s, { type: 'step', to: 99, count: 3 });
  assert.equal(s.step, 3, 'clamped to the summary card');
  s = guideReducer(s, { type: 'step', to: -4, count: 3 });
  assert.equal(s.step, 0, 'never below the first popup');
  // Closing early (not finished) keeps the phase in the live queue.
  const early = guideReducer(s, { type: 'close' });
  assert.equal(early.turn, undefined);
  assert.equal(pendingPhases(early, 3), 1);
  // Finishing the phase marks it reviewed.
  const done = guideReducer({ ...s, step: 3 }, { type: 'close', finished: true });
  assert.equal(done.reviewed, 3);
  assert.equal(pendingPhases(done, 3), 0);
});

test('guide state: reset drops any open phase, and stepping while closed does nothing', () => {
  const closed = guideReducer(initialGuide(0), { type: 'step', to: 2, count: 5 });
  assert.equal(closed.turn, undefined);
  assert.equal(closed.step, 0);
  const open = guideReducer(initialGuide(1), { type: 'open', turn: 4, step: 2 });
  assert.deepEqual(guideReducer(open, { type: 'reset', resolved: 9 }), { step: 0, reviewed: 9 });
});

test('glossary: known words become tappable terms, longer phrases win, and definitions are rule-only', () => {
  const parts = splitTerms('A fleet can support an army. Supply center counts matter.');
  const terms = parts.filter((p) => p.term).map((p) => p.term!.word);
  assert.deepEqual(terms, ['fleet', 'support', 'army', 'supply center']);
  assert.equal(splitTerms('Plain sentence.').length, 1);
  assert.match(termMeaning('army') ?? '', /land unit/);
  assert.equal(termMeaning('nonsense'), undefined);
  assert.ok(glossaryFor(['bounce', 'army']).length === 2);
});
