import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideNext, type WatchInput } from '../src/watch/decide.js';

const base: WatchInput = {
  kind: 'watch',
  fired: true,
  status: 'paused',
  turns: 2,
  maxPhases: 6,
  finished: false,
  guided: false,
  cleared: 2,
  reading: false,
  inFlight: false,
};

test('a request in flight or a phase in progress always waits; nothing is sent twice', () => {
  assert.deepEqual(decideNext({ ...base, inFlight: true }), { type: 'wait', reason: 'in-flight' });
  assert.deepEqual(decideNext({ ...base, status: 'running' }), { type: 'wait', reason: 'running' });
  assert.deepEqual(decideNext({ ...base, status: 'running', guided: true, turns: 3 }), { type: 'wait', reason: 'running' });
});

test('guided view holds every phase that resolved during the session until the viewer continues', () => {
  assert.deepEqual(decideNext({ ...base, guided: true, turns: 3, cleared: 2 }), { type: 'wait', reason: 'hold' });
  assert.deepEqual(decideNext({ ...base, guided: true, turns: 3, cleared: 3 }), { type: 'run' });
  // The final phase is held too, so its walkthrough opens before the session reports the end.
  assert.deepEqual(decideNext({ ...base, guided: true, turns: 6, cleared: 5, status: 'complete' }), { type: 'wait', reason: 'hold' });
  assert.deepEqual(decideNext({ ...base, guided: true, turns: 6, cleared: 6, status: 'complete' }), { type: 'stop', reason: 'finished' });
});

test('expert view plays on without a hold, and stops at a winner, the limit, or an error', () => {
  assert.deepEqual(decideNext({ ...base, turns: 3, cleared: 2 }), { type: 'run' });
  assert.deepEqual(decideNext({ ...base, finished: true }), { type: 'stop', reason: 'finished' });
  assert.deepEqual(decideNext({ ...base, turns: 6 }), { type: 'stop', reason: 'limit' });
  assert.deepEqual(decideNext({ ...base, status: 'error' }), { type: 'stop', reason: 'error' });
  assert.deepEqual(decideNext({ ...base, reading: true }), { type: 'wait', reason: 'reading' });
});

test('a single-phase session sends one request and then ends', () => {
  assert.deepEqual(decideNext({ ...base, kind: 'once', fired: false }), { type: 'run' });
  assert.deepEqual(decideNext({ ...base, kind: 'once', fired: true, inFlight: true }), { type: 'wait', reason: 'in-flight' });
  assert.deepEqual(decideNext({ ...base, kind: 'once', fired: true, status: 'running' }), { type: 'wait', reason: 'running' });
  assert.deepEqual(decideNext({ ...base, kind: 'once', fired: true }), { type: 'stop', reason: 'step' });
});
