import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { EngineState, PowerMap } from '../src/types.js';
export function engine(
  action: 'inspect' | 'resolve' | 'validate',
  state?: EngineState,
  orders?: PowerMap<string[]>,
): Promise<EngineState> {
  return new Promise((res, reject) => {
    const child = spawn(
      process.env.PYTHON_PATH || resolve('.venv/bin/python'),
      [resolve('engine/bridge.py')],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Rules engine timed out after 30 seconds.'));
    }, 30_000);
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timeout);
      reject(new Error(`Rules engine unavailable. Run pnpm setup:engine. ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(out);
        if (code || result.error) reject(new Error(result.error || err));
        else res(result);
      } catch {
        reject(new Error(`Rules engine returned an invalid response: ${err.slice(0, 500)}`));
      }
    });
    child.stdin.on('error', () => {
      /* spawn/close reports the actual failure */
    });
    child.stdin.end(JSON.stringify({ action, engine: state?.engine, orders }));
  });
}
