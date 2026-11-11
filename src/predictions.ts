/**
 * CONTRACT: the viewer's optional guesses ("Will France keep its word?"). Stored in this browser
 * only. Never sent to the server, never shown to an agent, never part of a match record.
 */
export type Guess = 'yes' | 'no';

const KEY = 'seven-powers-guesses';

function readAll(): Record<string, Guess> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Guess>) : {};
  } catch {
    return {};
  }
}

export function readGuess(matchId: string, questionId: string): Guess | undefined {
  const g = readAll()[`${matchId}:${questionId}`];
  return g === 'yes' || g === 'no' ? g : undefined;
}

export function writeGuess(matchId: string, questionId: string, guess: Guess | undefined) {
  try {
    const all = readAll();
    const key = `${matchId}:${questionId}`;
    if (guess) all[key] = guess;
    else delete all[key];
    // Bounded: keep the most recent 200 guesses.
    const entries = Object.entries(all).slice(-200);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* Private windows may block storage; the guess then lasts only for this view. */
  }
}
