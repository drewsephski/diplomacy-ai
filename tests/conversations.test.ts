import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sample, cleanup } from './sample-fixture.js';
import { conversationsAt, conversationsInPhase, messagePlaces, placesInText, subjectOf, summarize } from '../src/conversations.js';
import type { Dispatch, Match } from '../src/types.js';

after(cleanup);

const clone = (m: Match) => structuredClone(m);
const json = (x: unknown) => JSON.stringify(x);

test('the moment rule: a commitment is sealed at its own moment and revealed one moment later', () => {
  const at0 = conversationsAt(sample, 0).find((c) => c.id === 'ENGLAND+FRANCE')!;
  const france0 = at0.commitments.find((k) => k.from === 'FRANCE')!;
  assert.equal(france0.status, 'sealed');
  assert.equal(france0.actual, undefined);
  assert.equal(france0.result, undefined);
  const at1 = conversationsAt(sample, 1).find((c) => c.id === 'ENGLAND+FRANCE')!;
  const france1 = at1.commitments.find((k) => k.messageId === france0.messageId)!;
  assert.equal(france1.status, 'broken');
  assert.equal(france1.actualPlain, 'The fleet in Brest moves to the English Channel');
  assert.equal(france1.result, 'succeeded', 'the order France submitted instead succeeded');
  // Talks of a later phase never appear at an earlier moment.
  assert.ok(conversationsAt(sample, 0).every((c) => c.messages.every((m) => m.turn === 0)));
});

test('changing later turns never changes what an earlier moment shows', () => {
  for (const index of [0, 1, 3]) {
    const before = json(conversationsAt(sample, index));
    const altered = clone(sample);
    for (const t of altered.turns.slice(index + 1)) {
      t.messages = t.messages.map((m) => ({ ...m, text: 'FUTURE', promise: undefined }));
      t.promises = [];
    }
    for (const t of altered.turns.slice(index)) {
      // The phase on screen may show its talks, never its outcome: scramble its orders and checks.
      t.results = {};
      for (const p of Object.keys(t.decisions)) t.decisions[p as keyof typeof t.decisions].orders = ['A XXX H'];
      t.promises = t.promises.map((p) => ({ ...p, kept: !p.kept, actual: 'A XXX H' }));
    }
    altered.checkpoints = altered.checkpoints.slice(0, index + 1);
    assert.equal(json(conversationsAt(altered, index)), before, `moment ${index} is unchanged`);
  }
});

test('pending talks are visible only at the live edge, and their commitments are sealed', () => {
  const live = clone(sample);
  const n = live.turns.length;
  live.pending = {
    round: 0,
    messages: [{ id: 'p1', round: 0, from: 'FRANCE', to: ['ENGLAND'], kind: 'proposal', text: 'The Channel again?', promise: 'F BRE H', provinces: ['ENG'] }],
    negotiated: [],
    decisions: {},
  };
  const atEdge = conversationsAt(live, n).find((c) => c.id === 'ENGLAND+FRANCE')!;
  const latest = atEdge.messages.at(-1)!;
  assert.equal(latest.message.id, 'p1');
  assert.equal(latest.commitment?.status, 'sealed');
  assert.ok(atEdge.open.some((o) => /has not answered/.test(o)));
  assert.ok(!conversationsAt(live, n - 1).some((c) => c.messages.some((m) => m.message.id === 'p1')));
});

test('group conversations keep their real participants and never merge into a bilateral thread', () => {
  const cs = conversationsAt(sample, 1);
  const group = cs.find((c) => c.id === 'GERMANY+ITALY+AUSTRIA')!;
  assert.ok(group.group);
  assert.equal(group.messages.length, 2);
  assert.ok(!cs.find((c) => c.id === 'GERMANY+ITALY'), 'no bilateral thread was invented');
  // Italy accepted and both made promises; Austria said nothing, and the record says so.
  assert.deepEqual(group.mutual.map((x) => x.powers), [['GERMANY', 'ITALY']]);
  assert.ok(group.open.some((o) => o.startsWith('Austria-Hungary never answered')));
});

test('statuses only from the record: accepted by stated response, unilateral proposals stay unanswered', () => {
  const cs = conversationsAt(sample, 1);
  const channel = cs.find((c) => c.id === 'ENGLAND+FRANCE')!;
  const offer = channel.messages[0];
  assert.equal(offer.standing, 'accepted');
  assert.equal(channel.messages[1].replyTo?.source, 'recorded');
  assert.equal(channel.messages[1].summary.startsWith('Britain accepts France’s proposal'), true);
  const galicia = cs.find((c) => c.id === 'AUSTRIA+RUSSIA')!;
  assert.equal(galicia.messages[0].standing, 'unanswered');
  assert.equal(galicia.mutual.length, 0);
  const counter = cs.find((c) => c.id === 'FRANCE+GERMANY')!;
  assert.equal(counter.messages[0].standing, 'countered');
  assert.equal(counter.messages[1].standing, 'unanswered');
  assert.ok(counter.open.some((o) => /France never answered Germany’s counteroffer/.test(o)));
});

test('kept promises report the engine result; a kept promise can fail', () => {
  const sea = conversationsAt(sample, 1).find((c) => c.id === 'RUSSIA+TURKEY')!;
  const turkey = sea.commitments.find((k) => k.from === 'TURKEY' && k.turn === 0)!;
  assert.equal(turkey.status, 'kept');
  assert.equal(turkey.result, 'failed');
  assert.match(turkey.resultText!, /Bounced/);
});

test('subjects and places use plain names from structured fields, promises, and the text', () => {
  const cs = conversationsAt(sample, 0);
  assert.equal(cs.find((c) => c.id === 'ENGLAND+FRANCE')!.subject, 'The English Channel and London');
  assert.equal(subjectOf(['BEL', 'HOL']), 'Belgium and Holland');
  assert.equal(subjectOf(['BLA']), 'The Black Sea');
  assert.deepEqual(placesInText('Our fleets in the North Atlantic Ocean and the Mid-Atlantic, then Tyrolia and St. Petersburg.'), ['NAO', 'MAO', 'TYR', 'STP']);
  assert.deepEqual(placesInText('The Black Sea, Sweden, and Gulf of Lyon; also Bohemia.'), ['BLA', 'SWE', 'LYO', 'BOH']);
  assert.deepEqual(placesInText('Nothing here.'), []);
  const m: Dispatch = { id: 'x', round: 0, from: 'ITALY', to: ['AUSTRIA'], kind: 'proposal', text: 'Leave Trieste alone.', promise: 'A VEN S A ROM - APU', provinces: ['TYR'] };
  assert.deepEqual(messagePlaces(m), ['TYR', 'VEN', 'ROM', 'APU', 'TRI']);
  assert.equal(summarize(m), 'Italy proposes · promises: the army in Venice supports the army in Rome into Apulia');
});

/** A small record written before threading: no replyTo, response, request, provinces, or messageId. */
function oldRecord(): Match {
  const m = clone(sample);
  m.turns = m.turns.slice(0, 2);
  m.checkpoints = m.checkpoints.slice(0, 3);
  for (const t of m.turns) {
    t.messages = t.messages.map((x) => {
      const old = { ...x };
      delete old.replyTo;
      delete old.response;
      delete old.request;
      delete old.provinces;
      return old;
    });
    t.promises = t.promises.map((p) => {
      const old = { ...p };
      delete old.messageId;
      return old;
    });
  }
  return m;
}

test('old records without threading fields still read, with inferred links labelled as inferred', () => {
  const m = oldRecord();
  const cs = conversationsAt(m, 2);
  const channel = cs.find((c) => c.id === 'ENGLAND+FRANCE')!;
  const reply = channel.messages[1];
  assert.equal(reply.replyTo?.source, 'inferred');
  assert.equal(reply.replyTo?.id, channel.messages[0].message.id);
  assert.equal(channel.messages[0].standing, 'answered', 'an inferred reply never counts as acceptance');
  assert.equal(channel.commitments.find((k) => k.from === 'FRANCE')!.status, 'broken', 'promise checks match by sender and order');
  assert.ok(channel.subject.length > 0);
  // A message that is not a reply is never linked by inference.
  assert.equal(channel.messages[0].replyTo, undefined);
});

test('superseded only when the same sender later promises a different order for the same unit, same phase', () => {
  const m = clone(sample);
  const s = m.turns[0];
  const first = s.messages.find((x) => x.from === 'FRANCE' && x.promise === 'F BRE - MAO')!;
  s.messages.push({ id: 'later', round: 1, from: 'FRANCE', to: ['ENGLAND'], kind: 'reply', text: 'Change of plan: Brest holds.', promise: 'F BRE H' });
  const k = conversationsAt(m, 0).find((c) => c.id === 'ENGLAND+FRANCE')!.commitments.find((x) => x.messageId === first.id)!;
  assert.equal(k.supersededBy, 'later');
  const untouched = conversationsAt(sample, 0).find((c) => c.id === 'ENGLAND+FRANCE')!.commitments.find((x) => x.messageId === first.id)!;
  assert.equal(untouched.supersededBy, undefined);
});

test('conversations of one phase keep their links into earlier phases', () => {
  const autumn = conversationsInPhase(sample, 1, 1).find((c) => c.id === 'ENGLAND+FRANCE')!;
  assert.ok(autumn.messages.every((m) => m.turn === 1));
  const threat = autumn.messages.find((m) => m.message.kind === 'threat')!;
  assert.equal(threat.replyTo?.source, 'recorded');
  assert.equal(threat.replyTo?.from, 'FRANCE');
});
