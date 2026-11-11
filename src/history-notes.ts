import { NATIONS } from './domain';
import type { Power } from './types';

/**
 * Real history, kept apart from the simulated timeline. Every note here is labelled as real
 * history and carries its source. Nothing here reads a match: simulated events never mix with
 * these notes, and these notes never decide anything in the simulation (agents only ever see the
 * 1901 position, never later events).
 */

export interface HistoryContext {
  title: string;
  date: string;
  body: string;
  source: string;
  url: string;
  /** Countries the note is about, so a country panel can show the notes that concern it. */
  powers: Power[];
}

/** Sourced context notes, shown on "Compared with history" and in country panels. */
export const contexts: HistoryContext[] = [
  {
    title: 'Alliances were choices, not a script.',
    date: '1901–1907',
    body: 'Britain’s agreements with Japan, France, and Russia developed through separate negotiations. A Franco-British understanding in this simulation is a strategic choice, not evidence that an Entente must emerge.',
    source: 'UK Government · Lord Lansdowne',
    url: 'https://www.gov.uk/government/history/past-foreign-secretaries/henry-petty-fitzmaurice',
    powers: ['ENGLAND', 'FRANCE', 'RUSSIA'],
  },
  {
    title: 'An alliance did not guarantee entry into war.',
    date: '1914–1915',
    body: 'Italy belonged to the Triple Alliance but stayed neutral in 1914 and entered the war against Austria-Hungary in 1915. A coalition’s membership is less informative than the actions its members take.',
    source: 'National WWI Museum · Italy enters the war',
    url: 'https://www.theworldwar.org/learn/about-wwi/italy-enters-world-war-i',
    powers: ['ITALY', 'AUSTRIA', 'GERMANY'],
  },
  {
    title: 'The Ottoman alignment was not inevitable.',
    date: '1914',
    body: 'The Ottoman Empire was not part of the Central Powers at the beginning of August 1914. Its later entry illustrates why this observatory leaves future alignments open rather than encoding the eventual wartime blocs.',
    source: 'Canadian War Museum · Origins and early phases',
    url: 'https://www.warmuseum.ca/firstworldwar/history/going-to-war/origins-and-early-phases/',
    powers: ['TURKEY', 'GERMANY'],
  },
];

export interface HistoryNote {
  /** Always "Real history", so a note can never be read as part of the simulated game. */
  label: 'Real history';
  title: string;
  date?: string;
  text: string;
  /** Where the text comes from. `url` is set for external sources. */
  source: string;
  url?: string;
}

/** Shown with every note: the simulation is not a forecast. */
export const HISTORY_CAVEAT = 'Real history, for context only. This game’s countries make their own choices from the 1901 position.';

/**
 * Short notes for one country: its 1901 position (the same sourced brief the historical profile
 * uses), then any sourced context note that concerns it. With `other`, only notes that concern
 * both countries follow the position note.
 */
export function historyNotesFor(power: Power, other?: Power): HistoryNote[] {
  const position: HistoryNote = {
    label: 'Real history',
    title: `${NATIONS[power].formal} in 1901`,
    date: '1901',
    text: NATIONS[power].historical,
    source: 'Seven Powers country brief, written from the 1901 position only',
  };
  const related = contexts
    .filter((c) => c.powers.includes(power) && (!other || c.powers.includes(other)))
    .map((c): HistoryNote => ({ label: 'Real history', title: c.title, date: c.date, text: c.body, source: c.source, url: c.url }));
  return [position, ...related];
}

/** The one note a compact panel has room for: the most specific sourced note, else the 1901 brief. */
export function historyNoteFor(power: Power, other?: Power): HistoryNote {
  const notes = historyNotesFor(power, other);
  return (other ? notes.find((n) => n.url) : undefined) ?? notes[0];
}
