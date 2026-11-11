import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Match, MatchSummary } from '../src/types.js';
const directory = resolve(process.env.DATA_DIR || 'data');
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(resolve(directory, 'seven-powers.sqlite'));
db.exec(
  'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
);
export function saveMatch(match: Match) {
  db.prepare(
    'INSERT INTO matches (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
  ).run(match.id, JSON.stringify(match));
}
export function getMatch(id: string): Match {
  const row = db.prepare('SELECT data FROM matches WHERE id=?').get(id);
  if (!row) throw new Error('Match not found.');
  return JSON.parse(row.data as string) as Match;
}
export function listMatches(): MatchSummary[] {
  return db
    .prepare('SELECT data FROM matches')
    .all()
    .map((row) => {
      const m = JSON.parse(row.data as string) as Match;
      return {
        id: m.id,
        name: m.name,
        mode: m.mode,
        phases: m.turns.length,
        createdAt: m.createdAt,
        status: m.status,
        parent: m.parent,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
// Recover partial phases, but never resume billable work without an explicit action.
for (const row of db.prepare('SELECT data FROM matches').all()) {
  const m = JSON.parse(row.data as string) as Match;
  if (m.status === 'running') {
    m.status = 'paused';
    m.error = 'Server restarted. Completed calls are saved; resume when ready.';
    saveMatch(m);
  }
}
