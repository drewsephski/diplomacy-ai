import {
  POWERS,
  type Match,
  type Power,
  type PowerMap,
  type AgentConfig,
  type Profile,
} from './types';
export const NATIONS: Record<
  Power,
  {
    name: string;
    formal: string;
    color: string;
    initials: string;
    objective: string;
    historical: string;
  }
> = {
  ENGLAND: {
    name: 'Britain',
    formal: 'The British Empire',
    color: '#bd8193',
    initials: 'GB',
    objective: 'Command the seas. Choose a continental ally before choosing an enemy.',
    historical:
      'In 1901 Britain prioritizes naval security and its global empire. Continental commitments remain a choice, not a destiny.',
  },
  FRANCE: {
    name: 'France',
    formal: 'The French Republic',
    color: '#759bbd',
    initials: 'FR',
    objective: 'Secure the west. Keep two fronts from becoming three.',
    historical:
      'France faces a powerful Germany and has an existing relationship with Russia. Seek security while protecting western approaches.',
  },
  GERMANY: {
    name: 'Germany',
    formal: 'The German Empire',
    color: '#b9a77d',
    initials: 'DE',
    objective: 'Turn a vulnerable center into a network of indispensable allies.',
    historical:
      'Germany is an industrial continental power concerned by encirclement. Its ties to Austria-Hungary and Italy matter, but do not bind future decisions.',
  },
  ITALY: {
    name: 'Italy',
    formal: 'The Kingdom of Italy',
    color: '#85a38b',
    initials: 'IT',
    objective: 'Find room to grow without making the Mediterranean an enemy.',
    historical:
      'Italy balances its alliance ties with interests in the Mediterranean and friction with Austria-Hungary. Its future alignment is open.',
  },
  AUSTRIA: {
    name: 'Austria-Hungary',
    formal: 'The Habsburg Monarchy',
    color: '#bd8272',
    initials: 'AH',
    objective: 'Survive the crossroads. Build trust before the borders close in.',
    historical:
      'Austria-Hungary seeks stability and influence in the Balkans, with German cooperation and Russian competition as important considerations.',
  },
  RUSSIA: {
    name: 'Russia',
    formal: 'The Russian Empire',
    color: '#a49abe',
    initials: 'RU',
    objective: 'Expand on two horizons. Never let distance divide your diplomacy.',
    historical:
      'Russia has interests in the Balkans, the straits, and northern Europe. Its relationship with France is relevant; later agreements with Britain are not predetermined.',
  },
  TURKEY: {
    name: 'Turkey',
    formal: 'The Ottoman Empire',
    color: '#c6ac70',
    initials: 'OT',
    objective: 'Secure the straits. Make the southeastern corner a fortress.',
    historical:
      'The Ottoman Empire seeks to protect its territory and position around the straits amid pressure from neighboring powers. No future wartime alignment is assumed.',
  },
};
/** Limits for the observer's guidance text. Shared by the setup form and the server validation. */
export const GUIDANCE_LIMITS = { briefing: 600, country: 400 } as const;

/** Examples of concrete strategy guidance, shown as suggestions only. */
export const GUIDANCE_EXAMPLES = {
  briefing: 'Try diplomacy before attacking. Keep at least one defensive unit near your home centers.',
  country: 'Seek cooperation with France. Avoid a war on two fronts if you can.',
};

export const PROFILES: Record<Profile, { name: string; description: string }> = {
  strategist: {
    name: 'Strategist',
    description: 'Pursue 18 supply centers. Balance growth, defense, and credible alliances.',
  },
  diplomat: {
    name: 'Coalition builder',
    description: 'Prefer durable coalitions and reciprocity, but pursue your own victory.',
  },
  opportunist: {
    name: 'Opportunist',
    description:
      'Exploit weak borders and broken coalitions. Deception is available, not mandatory.',
  },
  historical: {
    name: 'Historically informed',
    description:
      'Begin with the country’s interests in 1901. Never assume future alliances or events.',
  },
};
/** Plain text only: control characters removed, line breaks kept, surrounding space trimmed. */
export function cleanGuidance(text: string | undefined, max: number) {
  const kept = Array.from(text ?? '')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return ch === '\n' || ch === '\t' || (code > 31 && code !== 127);
    })
    .join('');
  return kept
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function powerMap<T>(fn: (p: Power) => T): PowerMap<T> {
  return Object.fromEntries(POWERS.map((p) => [p, fn(p)])) as PowerMap<T>;
}
/** Verified OpenRouter ids for the economical default and comparison presets. */
export const GLM_MODEL = 'z-ai/glm-5.3-flash';
export const HAIKU_MODEL = 'anthropic/claude-haiku-5.5';
const MODEL_NAMES: Record<string, string> = {
  [GLM_MODEL]: 'GLM 5.3 Flash',
  [HAIKU_MODEL]: 'Claude Haiku 5.5',
};
/** Short, human label for a model id. Unknown ids keep their slug, never a guessed name. */
export function modelLabel(id: string) {
  return MODEL_NAMES[id] ?? (id.split('/').at(-1) || id);
}
export interface ModelPreset {
  id: string;
  name: string;
  description: string;
  modelFor: (power: Power, seat: number) => string;
}
export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'glm',
    name: 'GLM 5.3 Flash',
    description: 'All seven seats on the economical default.',
    modelFor: () => GLM_MODEL,
  },
  {
    id: 'haiku',
    name: 'Haiku 5.5 only',
    description: 'All seven seats on Claude Haiku 5.5, for a single-model comparison.',
    modelFor: () => HAIKU_MODEL,
  },
  {
    id: 'mixed',
    name: 'Economical mix',
    description: 'Alternate GLM 5.3 Flash and Haiku 5.5 across the seats.',
    modelFor: (_p, seat) => (seat % 2 === 0 ? GLM_MODEL : HAIKU_MODEL),
  },
];
export const defaultConfigs = (): PowerMap<AgentConfig> =>
  powerMap(() => ({ model: GLM_MODEL, profile: 'strategist' }));
export function phaseName(phase: string) {
  if (phase === 'COMPLETED') return 'Match complete';
  return `${phase[0] === 'S' ? 'Spring' : phase[0] === 'F' ? 'Autumn' : 'Winter'} ${phase.slice(1, 5)}`;
}
export function phaseKind(phase: string) {
  return phase.endsWith('R') ? 'Retreats' : phase.endsWith('A') ? 'Adjustments' : 'Movement';
}

/** Plain-language provenance for each match mode. Used in the status bar, archive and footer. */
export const MODE_LABEL: Record<Match['mode'], string> = {
  sample: 'RECORDED SAMPLE',
  sandbox: 'LOCAL SANDBOX',
  live: 'AI COUNTRIES',
};

export const MODE_HINT: Record<Match['mode'], string> = {
  sample: 'A teaching replay of a recorded game, checked by the rules engine. No model calls.',
  sandbox: 'Deterministic policies choose orders. No model calls and no cost.',
  live: 'Each country is a real AI model that talks and orders. Each call is billed through OpenRouter.',
};

export const MODE_ARCHIVE: Record<Match['mode'], string> = {
  sample: 'Recorded sample',
  sandbox: 'Local sandbox',
  live: 'AI countries',
};

/** Phases where countries talk before sealing orders. Retreats and adjustments skip talks. */
export function talkRounds(phase: string, diplomacyRounds: number) {
  return phase.endsWith('M') ? diplomacyRounds : 0;
}
