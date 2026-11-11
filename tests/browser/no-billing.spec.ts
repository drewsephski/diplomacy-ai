import { test, expect } from '@playwright/test';

/** Guard for the whole suite: the browser test server must run without a provider key, so no test can bill. */
test('the test server has no provider key and refuses to create a live game', async ({ request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health.liveConfigured).toBe(false);
  const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
  const configs = Object.fromEntries(POWERS.map((p) => [p, { model: 'z-ai/glm-5.3-flash', profile: 'strategist' }]));
  const res = await request.post('/api/matches', { data: { name: 'Must not exist', mode: 'live', configs } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/OPENROUTER_API_KEY/);
});
