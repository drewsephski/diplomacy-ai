import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_LIMITS, defaultConfigs, powerMap } from '../src/domain.js';
import { summarizeMatch } from '../src/history.js';
import type { Checkpoint, Match, MatchSummary, Turn } from '../src/types.js';

const directory = resolve(process.env.DATA_DIR || 'data');
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(resolve(directory, 'seven-powers.sqlite'));
db.exec(
  'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
);

/**
 * Fills fields that records written by earlier builds may not have, so every reader can rely on
 * the current shape. Nothing is invented for played data: missing turns or checkpoints stay empty.
 */
export function normalizeMatch(raw: Partial<Match> & { id: string }): Match {
  const turns = (raw.turns ?? []).map(
    (t): Turn => ({
      ...t,
      messages: t.messages ?? [],
      promises: t.promises ?? [],
      results: t.results ?? {},
      recap: t.recap ?? '',
      title: t.title ?? '',
    }),
  );
  const checkpoints = (raw.checkpoints ?? []).map(
    (c): Checkpoint => ({
      ...c,
      memories: c.memories ?? powerMap(() => []),
      relations: c.relations ?? powerMap(() => ({})),
      configs: c.configs ?? defaultConfigs(),
    }),
  );
  return {
    ...raw,
    name: raw.name || 'Untitled game',
    mode: raw.mode === 'live' || raw.mode === 'sample' ? raw.mode : 'sandbox',
    createdAt: raw.createdAt ?? new Date(0).toISOString(),
    status: raw.status ?? 'paused',
    checkpoints,
    turns,
    usage: {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      actualUsd: 0,
      unpricedCalls: 0,
      ...raw.usage,
    },
    limits: { ...DEFAULT_LIMITS, ...raw.limits },
  } as Match;
}

function parseRow(data: unknown): Match {
  return normalizeMatch(JSON.parse(String(data)) as Partial<Match> & { id: string });
}

export function saveMatch(match: Match) {
  db.prepare(
    'INSERT INTO matches (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
  ).run(match.id, JSON.stringify(match));
}

export function getMatch(id: string): Match {
  const row = db.prepare('SELECT data FROM matches WHERE id=?').get(id);
  if (!row) throw new Error('Match not found.');
  return parseRow(row.data);
}

/** Removes one record. Callers check the guards (sample, active job) first; see removeMatch in simulation.ts. */
export function deleteMatchRecord(id: string) {
  const result = db.prepare('DELETE FROM matches WHERE id=?').run(id);
  if (!result.changes) throw new Error('Match not found.');
}

/**
 * Summaries for the History tab. A row that cannot be read is skipped rather than failing the whole
 * list, so one damaged record never hides the others. A child whose original was deleted is flagged,
 * never dropped.
 */
export function listMatches(): MatchSummary[] {
  const matches: Match[] = [];
  for (const row of db.prepare('SELECT data FROM matches').all()) {
    try {
      matches.push(parseRow(row.data));
    } catch {
      // Unreadable record: leave it in place for inspection and keep the rest of the list working.
    }
  }
  const ids = new Set(matches.map((m) => m.id));
  const rows: MatchSummary[] = [];
  for (const m of matches) {
    try {
      rows.push(summarizeMatch(m, ids));
    } catch {
      // A record that cannot be summarized is left out of the list, never allowed to fail it.
    }
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Recover partial phases, but never resume billable work without an explicit action.
for (const row of db.prepare('SELECT data FROM matches').all()) {
  try {
    const m = parseRow(row.data);
    if (m.status === 'running') {
      m.status = 'paused';
      m.error = 'Server restarted. Completed calls are saved; resume when ready.';
      saveMatch(m);
    }
  } catch {
    // Left untouched; listMatches skips it.
  }
}
