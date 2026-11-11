import type { ConceptId } from './concepts';
import { POWERS, type Power } from '../types';

/**
 * Viewer preferences, remembered in this browser only. Never sent to the server, never part of a
 * match record, never seen by an agent. Every read survives blocked storage (private windows).
 */

/** Guided view is on for new viewers. */
export const GUIDED_KEY = 'seven-powers-guided';
/** Kept for records of older builds: the old orientation card's dismissal also hides the welcome. */
export const INTRO_KEY = 'seven-powers-intro-hidden';
export const FOLLOW_KEY = 'seven-powers-follow';
export const CONCEPTS_KEY = 'seven-powers-concepts-seen';

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
    /* Private windows may block storage; the welcome panel then simply reappears. */
  }
}

/** The followed country. France by default: the sample's introductory story is told from Paris. */
export function readFollow(): Power {
  try {
    const stored = localStorage.getItem(FOLLOW_KEY);
    return (POWERS as readonly string[]).includes(stored ?? '') ? (stored as Power) : 'FRANCE';
  } catch {
    return 'FRANCE';
  }
}

export function writeFollow(power: Power) {
  try {
    localStorage.setItem(FOLLOW_KEY, power);
  } catch {
    /* The choice then lasts only for this page view. */
  }
}

/** Teaching notes the viewer has already dismissed with "Got it". */
export function readSeenConcepts(): Set<ConceptId> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONCEPTS_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(parsed) ? (parsed.filter((x) => typeof x === 'string') as ConceptId[]) : []);
  } catch {
    return new Set();
  }
}

export function writeSeenConcepts(seen: Set<ConceptId>) {
  try {
    localStorage.setItem(CONCEPTS_KEY, JSON.stringify([...seen]));
  } catch {
    /* The notes then reappear on the next visit. */
  }
}
