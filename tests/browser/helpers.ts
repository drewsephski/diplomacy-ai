import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test';

/**
 * Shared browser-test helpers. Every record lives in the isolated store playwright.config.ts creates,
 * and the test server has no provider key (see no-billing.spec.ts). Live games are only ever fakes
 * fulfilled inside the browser, so no request in this suite can reach a paid provider.
 */
export const POWER_KEYS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
export const configs = (model = 'z-ai/glm-5.3-flash') =>
  Object.fromEntries(POWER_KEYS.map((p) => [p, { model, profile: 'strategist' }]));
export const limits = (maxPhases: number) => ({ maxPhases, budgetUsd: 5, maxOutputTokens: 1800, diplomacyRounds: 2 });

export interface GameRow {
  id: string;
  name: string;
  mode: string;
  status: string;
  phases: number;
}

export async function listGames(request: APIRequestContext) {
  return (await (await request.get('/api/matches')).json()) as GameRow[];
}

export async function getGame(request: APIRequestContext, id: string) {
  return (await (await request.get(`/api/matches/${id}`)).json()) as {
    id: string;
    status: string;
    turns: unknown[];
    pending?: unknown;
  };
}

/** Waits until the server reports the game idle (not running). */
export async function settle(request: APIRequestContext, id: string) {
  for (let i = 0; i < 80; i++) {
    const m = await getGame(request, id);
    if (m.status !== 'running') return m;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('The game did not settle');
}

/** Remove every non-sample record from this run's isolated store, so each test starts from a known state. */
export async function clearUserGames(request: APIRequestContext) {
  for (const game of await listGames(request)) {
    if (game.mode === 'sample') continue;
    await settle(request, game.id);
    const res = await request.delete(`/api/matches/${game.id}`);
    expect(res.ok(), `clear ${game.name}`).toBe(true);
  }
}

export async function createSandbox(request: APIRequestContext, name: string, maxPhases: number) {
  const res = await request.post('/api/matches', {
    data: { name, mode: 'sandbox', configs: configs(), limits: limits(maxPhases) },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string; name: string };
}

/** Plays a sandbox game through the server (no model calls) and waits until it settles. */
export async function playSandbox(request: APIRequestContext, id: string, single = false) {
  await request.post(`/api/matches/${id}/run`, { data: { single } });
  return settle(request, id);
}

/** Live setup UI without a key: health and catalog are faked in the browser. No call reaches a provider. */
export async function mockLiveCatalog(page: Page) {
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, liveConfigured: true, running: [] } }));
  await page.route('**/api/models', (r) =>
    r.fulfill({
      json: [
        { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', input: 0.00000004, output: 0.00000008, context: 200000 },
        { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', input: 0.000001, output: 0.000005, context: 200000 },
      ],
    }),
  );
}

export interface Traffic {
  runs: { id: string; ticket?: string; at: number }[];
  pauses: { id: string; ticket?: string; at: number }[];
  runsFor: (id: string) => number;
  pausesFor: (id: string) => number;
}

const idOf = (r: Request) => r.url().match(/\/matches\/([^/]+)\/(run|pause)$/)?.[1] ?? '';
const ticketOf = (r: Request) => {
  try {
    return (r.postDataJSON() as { ticket?: string } | null)?.ticket;
  } catch {
    return undefined;
  }
};

/** Counts every run (one phase requested) and pause request the page sends, per match. */
export function trackTraffic(page: Page): Traffic {
  const t: Traffic = {
    runs: [],
    pauses: [],
    runsFor: (id) => t.runs.filter((r) => r.id === id).length,
    pausesFor: (id) => t.pauses.filter((r) => r.id === id).length,
  };
  page.on('request', (r) => {
    if (r.method() !== 'POST') return;
    if (/\/run$/.test(r.url())) t.runs.push({ id: idOf(r), ticket: ticketOf(r), at: Date.now() });
    if (/\/pause$/.test(r.url())) t.pauses.push({ id: idOf(r), ticket: ticketOf(r), at: Date.now() });
  });
  return t;
}

export const historyTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'History', exact: true });
export const navTab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true });
export const primary = (page: Page) => page.locator('.play-button');
export const statusLine = (page: Page) => page.locator('.match-status .status-text');
export const guideCard = (page: Page) => page.locator('.guide-card');
export const moment = async (page: Page) =>
  (await page.locator('.timeline-labels').innerText()).match(/Moment (\d+) of (\d+)/)!.slice(1).map(Number);

/** Opens a saved game from History. */
export async function openFromHistory(page: Page, name: string, fromStart = false) {
  await historyTab(page).click();
  await page.getByRole('button', { name: fromStart ? `Replay ${name} from the start` : `Open ${name}`, exact: true }).click();
  await expect(page.locator('.match-name')).toContainText(name);
}

/** Asserts that no run request is sent for `ms` milliseconds. */
export async function expectNoRunsFor(page: Page, traffic: Traffic, ms: number) {
  const before = traffic.runs.length;
  await page.waitForTimeout(ms);
  expect(traffic.runs.length, 'run requests sent while nothing should play').toBe(before);
}

/** A live record built from the sample's checked phases, for browser-only fakes. Never sent to a server. */
export async function fakeLive(request: APIRequestContext, opts: { id: string; name: string; status: string; phases: number; maxPhases?: number }) {
  const sample = (await listGames(request)).find((g) => g.mode === 'sample')!;
  const base = await (await request.get(`/api/matches/${sample.id}`)).json();
  return {
    ...base,
    id: opts.id,
    name: opts.name,
    mode: 'live',
    status: opts.status,
    createdAt: new Date().toISOString(),
    turns: base.turns.slice(0, opts.phases),
    checkpoints: base.checkpoints.slice(0, opts.phases + 1),
    limits: { ...base.limits, maxPhases: opts.maxPhases ?? 9 },
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0, actualUsd: 0, unpricedCalls: 0 },
    pending: undefined,
    parent: undefined,
    intervention: undefined,
  };
}
