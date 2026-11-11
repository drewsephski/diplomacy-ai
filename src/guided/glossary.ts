/**
 * Short, plain definitions for the words the guided walkthrough uses. Each entry describes the
 * game rule only. No historical claim, so nothing here needs a source beyond the rules themselves.
 */
export interface Term {
  /** Word as it appears in the copy (matched case-insensitively). */
  word: string;
  /** Definition shown inline and in the legend. */
  meaning: string;
}

export const TERMS: Term[] = [
  { word: 'army', meaning: 'A land unit. It moves across land and cannot cross open sea without a convoy.' },
  { word: 'fleet', meaning: 'A sea unit. It moves across seas and along coasts. It can carry an army by convoy.' },
  {
    word: 'support',
    meaning: 'One unit helps another succeed. A supporting unit adds strength to a move or a hold, and the support is cut if the supporter is attacked.',
  },
  {
    word: 'supply center',
    meaning: 'A city or port that supports one unit. Holding 18 of the 34 supply centers wins the game.',
  },
  {
    word: 'bounce',
    meaning: 'Two units of equal strength try to enter the same province. Both fail and stay where they were.',
  },
  {
    word: 'standoff',
    meaning: 'A contested province where an attack bounced. No unit enters, and no supply center changes hands.',
  },
  {
    word: 'convoy',
    meaning: 'A fleet at sea carries an army across water. The army moves only if the convoy holds for the whole route.',
  },
  {
    word: 'dislodged',
    meaning: 'A unit pushed out of its province by a stronger attack. Next it must retreat to an empty neighbor or disband.',
  },
  {
    word: 'promise',
    meaning: 'A private message that names one exact order. The record checks it against the order the country actually submitted.',
  },
  {
    word: 'sealed orders',
    meaning: 'Orders submitted in secret. They are revealed only when the phase resolves, and all orders resolve together.',
  },
  {
    word: 'checkpoint',
    meaning: 'The board at the start of a phase, as the rules engine recorded it. Stepping through checkpoints never changes the record.',
  },
  {
    word: 'phase',
    meaning: 'One step of the game: a Spring or Autumn movement, a retreat step, or a Winter adjustment step.',
  },
];

const BY_WORD = new Map(TERMS.map((t) => [t.word.toLowerCase(), t]));

export function termMeaning(word: string) {
  return BY_WORD.get(word.toLowerCase())?.meaning;
}

/**
 * Splits copy into plain text and known terms, so the UI can make each term tappable. Longer terms
 * come first so "supply center" is matched before any shorter word.
 */
export function splitTerms(text: string): { text: string; term?: Term }[] {
  const words = [...TERMS].sort((a, b) => b.word.length - a.word.length).map((t) => t.word);
  const pattern = new RegExp(`\\b(${words.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi');
  const out: { text: string; term?: Term }[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    const term = BY_WORD.get(match[0].toLowerCase().replace(/\s+/g, ' '));
    out.push({ text: match[0], term });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Glossary entries for the words a given piece of copy uses, in the order they were asked for. */
export function glossaryFor(words: string[]): Term[] {
  return words.map((w) => BY_WORD.get(w.toLowerCase())).filter((t): t is Term => Boolean(t));
}
