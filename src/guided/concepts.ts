/**
 * CONTRACT: short teaching notes, introduced when the situation on screen makes them relevant.
 * Each is at most two sentences, states the rule only, and can be reopened from the glossary.
 * Which ones a viewer has already seen is remembered by the UI (prefs), not here.
 */
export type ConceptId =
  | 'observer'
  | 'goal'
  | 'centers'
  | 'promise-vs-order'
  | 'simultaneous'
  | 'kept-but-failed'
  | 'bounce'
  | 'support'
  | 'what-if';

export interface Concept {
  id: ConceptId;
  title: string;
  text: string;
}

export const CONCEPTS: Record<ConceptId, Concept> = {
  observer: {
    id: 'observer',
    title: 'You are watching',
    text: 'Seven independent countries make every decision. You never give orders: follow a country, read its talks, and see what happens.',
  },
  goal: {
    id: 'goal',
    title: 'What each country wants',
    text: 'Every country is trying to grow by taking supply centers, the dots on the map, while keeping its own.',
  },
  centers: {
    id: 'centers',
    title: 'Supply centers',
    text: 'Each supply center supports one unit. Whoever holds 18 of the 34 wins.',
  },
  'promise-vs-order': {
    id: 'promise-vs-order',
    title: 'Promises are not orders',
    text: 'Countries talk in private and may promise a move. The real orders are written separately, in secret, and nothing forces them to match.',
  },
  simultaneous: {
    id: 'simultaneous',
    title: 'Everyone moves at once',
    text: 'All seven countries seal their orders, then every order resolves at the same moment. No one sees another’s orders first.',
  },
  'kept-but-failed': {
    id: 'kept-but-failed',
    title: 'A kept promise can still fail',
    text: 'Keeping a promise means submitting the promised order. Whether the move works depends on what everyone else ordered.',
  },
  bounce: {
    id: 'bounce',
    title: 'Bounces',
    text: 'When equal forces try to enter the same place, neither gets in and both stay where they were.',
  },
  support: {
    id: 'support',
    title: 'Support',
    text: 'A unit can lend its strength to another unit’s move instead of moving itself. The stronger side wins a contested place.',
  },
  'what-if': {
    id: 'what-if',
    title: 'What if?',
    text: 'You can change one decision at an earlier moment and play an alternate timeline. The original record never changes.',
  },
};
