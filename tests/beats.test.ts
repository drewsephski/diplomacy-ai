import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sample, cleanup } from './sample-fixture.js';
import { deriveWalkthrough, questionsAt, whatIfsFor } from '../src/guided/beats.js';
import { historyNoteFor, historyNotesFor, contexts } from '../src/history-notes.js';
import { POWERS, type Match } from '../src/types.js';

after(cleanup);
const json = (x: unknown) => JSON.stringify(x);

test('the first walkthrough opens on the France–Britain stakes, then asks before it reveals', () => {
  const w = deriveWalkthrough(sample, 0, { follow: 'FRANCE' })!;
  const [stakes] = w.beats;
  assert.equal(stakes.kind, 'stakes');
  assert.deepEqual(stakes.powers.slice(0, 2), ['FRANCE', 'ENGLAND']);
  assert.equal(stakes.focus, 'ENG');
  assert.deepEqual(stakes.concepts, ['observer', 'goal', 'centers']);
  assert.match(stakes.body, /can move into the English Channel this phase/);
  const kinds = w.beats.map((b) => b.kind);
  assert.ok(kinds.indexOf('talks') < kinds.indexOf('question'));
  assert.ok(kinds.indexOf('question') < kinds.indexOf('sealed'));
  assert.equal(w.beats[w.revealAt].kind, 'reveal');
  assert.equal(w.beats.at(-1)!.kind, 'next');
  assert.ok(w.beats.find((b) => b.kind === 'talks')!.concept === 'promise-vs-order');
  assert.equal(w.beats.find((b) => b.kind === 'sealed')!.concept, 'simultaneous');
  assert.ok(w.beats.some((b) => b.concept === 'kept-but-failed' && b.event?.kind === 'kept-promise-failed'));
  // The promise question is answered after the reveal, never before.
  const q = w.questions.find((x) => x.kind === 'promise')!;
  assert.match(q.text, /Will France send its fleet from Brest into the Mid-Atlantic Ocean, as it told Britain\?/);
  assert.equal(q.answer?.outcome, 'no');
  for (const b of w.beats.slice(0, w.revealAt)) assert.equal(b.question?.answer, undefined);
});

test('before-reveal beats never contain that phase’s orders or results', () => {
  for (let turn = 0; turn < sample.turns.length; turn++) {
    const w = deriveWalkthrough(sample, turn, { follow: 'FRANCE' })!;
    const t = sample.turns[turn];
    const orders = POWERS.flatMap((p) => t.decisions[p].orders);
    // Orders that were never spoken in talks must not appear before the reveal.
    const spoken = new Set(t.messages.map((m) => m.promise).filter(Boolean));
    for (const b of w.beats.slice(0, w.revealAt)) {
      assert.equal(b.board, 'before');
      const text = json({ ...b, conversations: undefined });
      for (const o of orders) if (!spoken.has(o)) assert.ok(!text.includes(o), `${t.phase} ${b.id} leaks ${o}`);
      assert.ok(!/succeeded|bounced|dislodged|broke/.test(b.body + (b.matters ?? '')) || /Earlier, in/.test(b.matters ?? ''), `${b.id} talks about results`);
      for (const c of b.conversations ?? []) for (const k of c.commitments.filter((x) => x.turn === turn)) assert.equal(k.status, 'sealed');
    }
    for (const b of w.beats.slice(w.revealAt)) assert.equal(b.board, 'after');
  }
});

test('a walkthrough never reads later turns or checkpoints', () => {
  for (const turn of [0, 1, 3]) {
    const before = json(deriveWalkthrough(sample, turn, { follow: 'FRANCE' }));
    const altered: Match = structuredClone(sample);
    altered.turns = altered.turns.slice(0, turn + 1);
    altered.checkpoints = altered.checkpoints.slice(0, turn + 2);
    altered.turns.push({ ...structuredClone(sample.turns[turn]), phase: 'FUTURE', messages: [] });
    assert.equal(json(deriveWalkthrough(altered, turn, { follow: 'FRANCE' })), before, `turn ${turn}`);
  }
});

test('quiet phases stay at three beats or fewer, and brief mode starts at the sealed orders', () => {
  const quiet = sample.turns.map((_, i) => deriveWalkthrough(sample, i)!).filter((w) => w.quiet);
  assert.ok(quiet.length >= 2, 'adjustments and the quiet spring are quiet');
  for (const w of quiet) assert.ok(w.beats.length <= 3, `${w.phase}: ${w.beats.length} beats`);
  const spring = quiet.find((w) => w.phase === 'S1903M')!;
  assert.ok(spring, 'Spring 1903 is the quiet movement phase');
  assert.match(spring.beats.at(-1)!.body, /quiet phase/);
  const brief = deriveWalkthrough(sample, 0, { brief: true })!;
  assert.equal(brief.beats[0].kind, 'sealed');
  assert.ok(brief.questions.length > 0, 'questions are still answered in the summary');
});

test('following a country puts its situation first', () => {
  const russia = deriveWalkthrough(sample, 0, { follow: 'RUSSIA' })!;
  assert.ok(russia.beats[0].powers.includes('RUSSIA'));
  assert.ok(questionsAt(sample, 0, 'RUSSIA')[0].powers.includes('RUSSIA'));
});

test('continuity: a later phase recalls the earlier broken promise between the same countries', () => {
  const w = deriveWalkthrough(sample, 1, { follow: 'FRANCE' })!;
  assert.match(w.beats[0].matters!, /Earlier, in Spring 1901, France broke a promise to Britain/);
});

test('questionsAt never answers and never reads sealed orders of the phase on screen', () => {
  const live: Match = structuredClone(sample);
  const n = live.turns.length;
  live.pending = {
    round: 1,
    messages: [{ id: 'p', round: 0, from: 'FRANCE', to: ['ENGLAND'], kind: 'proposal', text: 'Hold Brest.', promise: live.checkpoints[n].state.legal.FRANCE.BRE?.find((o) => o.endsWith(' H')) ?? 'F BRE H' }],
    negotiated: [],
    decisions: { FRANCE: { orders: ['SEALED'], explanation: 'SEALED', memory: 'SEALED', relationships: {} } },
  };
  for (let i = 0; i <= n; i++) {
    const qs = questionsAt(live, i);
    assert.ok(qs.length <= 2);
    for (const q of qs) assert.equal(q.answer, undefined);
    assert.ok(!json(qs).includes('SEALED'));
  }
  const withoutDecisions = structuredClone(live);
  withoutDecisions.pending!.decisions = {};
  assert.equal(json(questionsAt(withoutDecisions, n)), json(questionsAt(live, n)), 'sealed decisions change nothing');
  // Moment 0 with no resolved history still asks from the board, legal orders, and talks alone.
  const opening: Match = { ...structuredClone(sample), turns: [structuredClone(sample.turns[0])], checkpoints: sample.checkpoints.slice(0, 1) };
  opening.turns[0].results = {};
  opening.turns[0].promises = [];
  assert.equal(json(questionsAt(opening, 0)), json(questionsAt(sample, 0)));
});

test('what-ifs are single legal interventions at the checkpoint, with honest caveats', () => {
  let count = 0;
  for (let turn = 0; turn < sample.turns.length; turn++)
    for (const w of whatIfsFor(sample, turn)) {
      count++;
      assert.equal(w.at, turn);
      const legal = Object.values(sample.checkpoints[turn].state.legal[w.intervention.power]).flat();
      assert.ok(legal.includes(w.intervention.order!), `${w.id} is legal`);
      assert.match(w.caveat.sandbox, /not react to the change strategically/);
      assert.match(w.caveat.sandbox, /messages do not change their orders/);
      assert.match(w.caveat.live, /billed/);
    }
  assert.ok(count >= 3);
  const first = whatIfsFor(sample, 0)[0];
  assert.equal(first.question, 'What if France had kept its promise?');
  assert.deepEqual(first.intervention, { power: 'FRANCE', order: 'F BRE - MAO' });
  assert.ok(whatIfsFor(sample, 0).some((w) => w.id.includes('unblock')), 'kept-but-failed offers the blocking country’s alternative');
  assert.ok(whatIfsFor(sample, 3).some((w) => w.question.startsWith('What if Germany had not supported')));
});

test('real-history notes are labelled and sourced, and never mention the simulated game', () => {
  for (const p of POWERS) {
    const notes = historyNotesFor(p);
    assert.ok(notes.length >= 1);
    for (const n of notes) {
      assert.equal(n.label, 'Real history');
      assert.ok(n.source.length > 0);
    }
  }
  assert.equal(contexts.length, 3);
  assert.ok(historyNoteFor('ITALY', 'AUSTRIA').url, 'a pair gets its sourced note');
});
