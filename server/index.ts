import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { z } from 'zod';
import { POWERS } from '../src/types.js';
import { cleanGuidance, GUIDANCE_LIMITS } from '../src/domain.js';
import { getMatch, listMatches } from './store.js';
import {
  buildSample,
  createMatch,
  DEFAULT_LIMITS,
  extendMatch,
  forkMatch,
  isActive,
  pauseMatch,
  runningIds,
  startMatch,
} from './simulation.js';
import { spectatorView } from './privacy.js';
import { getModels } from './provider.js';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use('/api', (req, res, next) => {
  // This is a local single-operator observatory, not an unauthenticated public API.
  const origin = req.headers.origin;
  const host = req.hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    res.status(403).json({ error: 'Local access only.' });
    return;
  }
  if (origin) {
    try {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) {
        res.status(403).json({ error: 'Cross-origin access denied.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Invalid origin.' });
      return;
    }
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Cross-site access denied.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const profile = z.enum(['strategist', 'diplomat', 'opportunist', 'historical']);
const instructionText = z
  .string()
  .max(GUIDANCE_LIMITS.country)
  .optional()
  .transform((t) => cleanGuidance(t, GUIDANCE_LIMITS.country));
const config = z.object({ model: z.string().min(3).max(150), profile, instructions: instructionText });
const configs = z.object({
  ENGLAND: config,
  FRANCE: config,
  GERMANY: config,
  ITALY: config,
  AUSTRIA: config,
  RUSSIA: config,
  TURKEY: config,
});
const limits = z.object({
  maxPhases: z.number().int().min(1).max(200),
  budgetUsd: z.number().min(0.1).max(100),
  maxOutputTokens: z.number().int().min(800).max(6000),
  diplomacyRounds: z.number().int().min(1).max(4),
});
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    liveConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    running: runningIds(),
  }),
);
app.get('/api/models', async (_req, res) => res.json(await getModels()));
app.get('/api/matches', (_req, res) => res.json(listMatches()));
app.get('/api/matches/:id', (req, res) => res.json(spectatorView(getMatch(req.params.id))));
app.get('/api/matches/:id/export', (req, res) => {
  const match = getMatch(req.params.id);
  if (isActive(match.id)) {
    res.status(409).json({ error: 'Pause the match before exporting.' });
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="seven-powers-${match.id}.json"`);
  res.json({ format: 'seven-powers-v1', match: spectatorView(match) });
});
app.post('/api/matches', async (req, res) => {
  const input = z
    .object({
      name: z.string().min(1).max(100),
      mode: z.enum(['live', 'sandbox']),
      configs,
      limits: limits.optional(),
      briefing: z.string().max(GUIDANCE_LIMITS.briefing).optional(),
    })
    .parse(req.body);
  if (input.mode === 'live' && !process.env.OPENROUTER_API_KEY) {
    res
      .status(400)
      .json({
        error: 'Live agents need OPENROUTER_API_KEY in .env. Restart the server after adding it.',
      });
    return;
  }
  if (input.mode === 'live') {
    const catalog = await getModels();
    for (const c of Object.values(input.configs))
      if (!catalog.some((m) => m.id === c.model))
        throw new Error(`Model ${c.model} is unavailable or unsupported.`);
  }
  res
    .status(201)
    .json(
      spectatorView(
        await createMatch(
          input.name,
          input.mode,
          input.configs,
          input.limits || DEFAULT_LIMITS,
          input.briefing,
        ),
      ),
    );
});
app.post('/api/matches/:id/extend', (req, res) => {
  const input = z
    .object({ maxPhases: z.number().int().min(1).max(200), budgetUsd: z.number().min(0.1).max(100).optional() })
    .parse(req.body);
  const match = extendMatch(getMatch(req.params.id), input.maxPhases, input.budgetUsd);
  res.json(spectatorView(match));
});
app.post('/api/matches/:id/run', (req, res) => {
  const { single } = z.object({ single: z.boolean().default(false) }).parse(req.body);
  void startMatch(req.params.id, single);
  res.json(spectatorView(getMatch(req.params.id)));
});
app.post('/api/matches/:id/pause', (req, res) => {
  pauseMatch(req.params.id);
  res.json({ ok: true, settling: isActive(req.params.id) });
});
app.post('/api/matches/:id/branch', async (req, res) => {
  const input = z
    .object({
      at: z.number().int().nonnegative(),
      mode: z.enum(['live', 'sandbox']),
      limits: limits.optional(),
      intervention: z.object({
        power: z.enum(POWERS),
        order: z.string().max(80).optional(),
        message: z.string().min(1).max(1200).optional(),
        to: z.array(z.enum(POWERS)).min(1).max(6).optional(),
        profile: profile.optional(),
      }),
    })
    .parse(req.body);
  if (input.mode === 'live' && !process.env.OPENROUTER_API_KEY)
    throw new Error(
      'Live branches need OPENROUTER_API_KEY. Choose sandbox to explore without a key.',
    );
  res
    .status(201)
    .json(
      spectatorView(
        await forkMatch(
          getMatch(req.params.id),
          input.at,
          input.intervention,
          input.mode,
          input.limits,
        ),
      ),
    );
});
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next; // Express identifies error middleware by its four-argument signature.
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    res.status(message === 'Match not found.' ? 404 : 400).json({ error: message });
  },
);
if (!listMatches().some((m) => m.mode === 'sample')) {
  console.log('Preparing engine-adjudicated sample replay…');
  await buildSample();
}
const port = Number(process.env.PORT || 3001);
app.listen(port, '127.0.0.1', () =>
  console.log(`Seven Powers API listening on http://127.0.0.1:${port}`),
);
