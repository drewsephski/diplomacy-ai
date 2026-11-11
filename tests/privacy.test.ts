import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Dispatch, Turn } from '../src/types.js';
import { powerMap } from '../src/domain.js';

const directory = mkdtempSync(join(tmpdir(), 'seven-powers-privacy-'));
process.env.DATA_DIR = directory;
after(() => rmSync(directory, { recursive: true, force: true }));
const { createMatch, sanitizeDispatch } = await import('../server/simulation.js');
const { agentView, messageRefs } = await import('../server/privacy.js');
const { buildAgentPrompt } = await import('../server/provider.js');

const msg = (id: string, from: Dispatch['from'], to: Dispatch['to'], text: string, extra: Partial<Dispatch> = {}): Dispatch => ({
  id,
  round: 0,
  from,
  to,
  text,
  kind: 'proposal',
  ...extra,
});

async function scenario() {
  const match = await createMatch('privacy scenario', 'sandbox');
  // A resolved phase: Russia and Turkey talk privately; Germany replies to it in a group with Austria.
  const russiaTurkey = msg('rt-secret', 'RUSSIA', ['TURKEY'], 'THIRD_PARTY_PRIVATE_TEXT', { request: 'THIRD_PARTY_REQUEST' });
  const reply = msg('tr-reply', 'TURKEY', ['RUSSIA'], 'TURKEY_ANSWER', { kind: 'reply', replyTo: 'rt-secret', response: 'accept' });
  const toFrance = msg('ef', 'ENGLAND', ['FRANCE'], 'Channel peace', { promise: 'F LON - NTH' });
  // Turkey forwards in a group with France; its replyTo points at the Russia–Turkey message France never saw.
  const forward = msg('tf', 'TURKEY', ['FRANCE', 'ITALY'], 'GROUP_NOTE', { kind: 'reply', replyTo: 'rt-secret', response: 'counter' });
  const turn: Turn = {
    phase: 'S1901M',
    messages: [russiaTurkey, reply, toFrance, forward],
    decisions: powerMap(() => ({ orders: [], explanation: 'PUBLIC_EXPLANATION', memory: 'OWN_MEMORY', relationships: {} })),
    promises: [{ from: 'ENGLAND', to: ['FRANCE'], promised: 'F LON - NTH', actual: 'F LON - NTH', kept: true, messageId: 'ef' }],
    recap: '',
    title: '',
    results: { 'F LON': [] },
  };
  turn.decisions.RUSSIA = { orders: [], explanation: 'RUSSIAN_EXPLANATION', memory: 'RUSSIAN_MEMORY', relationships: { TURKEY: 77 } };
  match.turns.push(turn);
  match.checkpoints.push(structuredClone(match.checkpoints[0]));
  match.checkpoints[1].memories.RUSSIA = ['RUSSIAN_MEMORY'];
  match.pending = {
    round: 0,
    messages: [msg('now', 'RUSSIA', ['TURKEY'], 'PENDING_THIRD_PARTY'), msg('now-fr', 'ITALY', ['FRANCE'], 'Open to France', { request: 'Hold Piedmont' })],
    negotiated: [],
    decisions: { RUSSIA: { orders: ['SEALED_ORDER'], explanation: 'SEALED_EXPLANATION', memory: 'SEALED_MEMORY', relationships: {} } },
  };
  return match;
}

test("a third country's private message, and a reply link to it, never reach another country's observation", async () => {
  const match = await scenario();
  const france = JSON.stringify(agentView(match, 'FRANCE'));
  for (const secret of ['THIRD_PARTY_PRIVATE_TEXT', 'THIRD_PARTY_REQUEST', 'TURKEY_ANSWER', 'PENDING_THIRD_PARTY', 'rt-secret'])
    assert.ok(!france.includes(secret), `France never sees ${secret}`);
  const view = agentView(match, 'FRANCE');
  const group = view.privateHistory.find((m) => m.text === 'GROUP_NOTE')!;
  assert.ok(group, 'France sees the group message it received');
  assert.ok(!('replyTo' in group) && !('response' in group), 'the link to an unseen message is withheld');
  // Turkey was party to both, so its own view links them by reference.
  const turkey = agentView(match, 'TURKEY');
  const answered = turkey.privateHistory.find((m) => m.text === 'TURKEY_ANSWER')!;
  assert.equal(answered.replyTo, turkey.privateHistory.find((m) => m.text === 'THIRD_PARTY_PRIVATE_TEXT')!.ref);
  // The full prompt text carries the same guarantee.
  assert.ok(!buildAgentPrompt(match, 'FRANCE', 'negotiate').prompt.includes('THIRD_PARTY'));
});

test('sealed decisions, other memories, and other explanations never appear in an observation', async () => {
  const match = await scenario();
  for (const power of ['FRANCE', 'TURKEY', 'RUSSIA', 'ENGLAND'] as const) {
    const text = JSON.stringify(agentView(match, power));
    for (const secret of ['SEALED_ORDER', 'SEALED_EXPLANATION', 'SEALED_MEMORY'])
      assert.ok(!text.includes(secret), `${power} never sees a sealed decision`);
    if (power !== 'RUSSIA') {
      assert.ok(!text.includes('RUSSIAN_MEMORY'), `${power} never sees Russian memory`);
      assert.ok(!text.includes('RUSSIAN_EXPLANATION'), `${power} never sees Russian explanations`);
      assert.ok(!text.includes('"TURKEY":77'), `${power} never sees Russian trust scores`);
    }
  }
  assert.ok(JSON.stringify(agentView(match, 'RUSSIA')).includes('RUSSIAN_EXPLANATION'), 'own explanations are remembered');
});

test('the commitment ledger and open proposals hold only what the country was party to', async () => {
  const match = await scenario();
  const france = agentView(match, 'FRANCE');
  assert.equal(france.commitments.length, 1);
  assert.deepEqual(france.commitments[0], { phase: 'S1901M', from: 'ENGLAND', to: ['FRANCE'], promised: 'F LON - NTH', submitted: 'F LON - NTH', kept: true, result: 'succeeded' });
  assert.equal(agentView(match, 'GERMANY').commitments.length, 0, 'Germany was not party to that promise');
  assert.deepEqual(france.openProposals.map((p) => p.from), ['ITALY']);
  assert.equal(france.openProposals[0].request, 'Hold Piedmont');
  assert.equal(agentView(match, 'GERMANY').openProposals.length, 0);
  const refs = messageRefs(match, 'FRANCE');
  assert.ok(refs.every((r) => /^m\d+$/.test(r.ref)));
  assert.ok(!refs.some((r) => r.id === 'rt-secret' || r.id === 'now'));
});

test('the server backstop drops reply links to unseen messages and unknown provinces', async () => {
  const match = await scenario();
  const draft = { from: 'FRANCE' as const, to: ['ENGLAND' as const], round: 0, text: 'x', kind: 'reply' as const };
  const leak = sanitizeDispatch(match, 'FRANCE', { ...draft, replyTo: 'rt-secret', response: 'accept', provinces: ['bel', 'XYZ', 'STP/SC', 'BEL'], request: '  hold   Brest ' });
  assert.equal(leak.replyTo, undefined, 'France cannot answer the Russia–Turkey message');
  assert.equal(leak.response, undefined, 'a response needs a valid reply link');
  assert.deepEqual(leak.provinces, ['BEL', 'STP']);
  assert.equal(leak.request, 'hold Brest');
  const fine = sanitizeDispatch(match, 'FRANCE', { ...draft, replyTo: 'ef', response: 'decline' });
  assert.equal(fine.replyTo, 'ef');
  assert.equal(fine.response, 'decline');
  const pendingOk = sanitizeDispatch(match, 'FRANCE', { ...draft, replyTo: 'now-fr', response: 'counter' });
  assert.equal(pendingOk.replyTo, 'now-fr');
});
