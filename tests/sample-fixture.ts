import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Match } from '../src/types.js';

/**
 * Builds the authored sample once per test file, in a scratch data directory, through the real
 * engine. Import it before anything that opens the store.
 */
const directory = mkdtempSync(join(tmpdir(), 'seven-powers-sample-'));
process.env.DATA_DIR = directory;
const simulation = await import('../server/simulation.js');
export const sample: Match = await simulation.buildSample();
export { simulation };
export function cleanup() {
  rmSync(directory, { recursive: true, force: true });
}
