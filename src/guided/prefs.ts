/** Guided view is on for new viewers. The choice is remembered in this browser only. */
export const GUIDED_KEY = 'seven-powers-guided';
export const INTRO_KEY = 'seven-powers-intro-hidden';

export function readGuided(): boolean {
  try {
    const stored = localStorage.getItem(GUIDED_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    // Storage can be blocked in private windows. The guided default still applies.
    return true;
  }
}

export function writeGuided(on: boolean) {
  try {
    localStorage.setItem(GUIDED_KEY, on ? '1' : '0');
  } catch {
    /* The choice then lasts only for this page view. */
  }
}

export function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* Private windows may block storage; the welcome card then simply reappears. */
  }
}
