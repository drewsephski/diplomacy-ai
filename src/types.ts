export const POWERS = [
  'ENGLAND',
  'FRANCE',
  'GERMANY',
  'ITALY',
  'AUSTRIA',
  'RUSSIA',
  'TURKEY',
] as const;
export type Power = (typeof POWERS)[number];
export type Profile = 'strategist' | 'diplomat' | 'opportunist' | 'historical';
export interface AgentConfig {
  model: string;
  profile: Profile;
  /** Optional private guidance from the observer for this country only. Plain text, never rules. */
  instructions?: string;
}
export type PowerMap<T> = Record<Power, T>;
export interface Board {
  name: string;
  units: PowerMap<string[]>;
  centers: PowerMap<string[]>;
  retreats: PowerMap<Record<string, string[]>>;
  homes: PowerMap<string[]>;
  influence: PowerMap<string[]>;
  builds: PowerMap<{ count: number; homes: string[] }>;
}
export interface EngineState {
  engine: Record<string, unknown>;
  board: Board;
  legal: PowerMap<Record<string, string[]>>;
  done: boolean;
  outcome: string[];
  resolution?: { name: string; orders: PowerMap<string[]>; results: Record<string, string[]> };
}
export interface Dispatch {
  id: string;
  round: number;
  from: Power;
  to: Power[];
  text: string;
  kind: 'proposal' | 'reply' | 'threat' | 'alliance';
  promise?: string;
}
export interface Decision {
  orders: string[];
  explanation: string;
  memory: string;
  relationships: Partial<PowerMap<number>>;
}
export interface PromiseCheck {
  from: Power;
  to: Power[];
  promised: string;
  actual: string;
  kept: boolean;
}
export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  actualUsd: number;
  unpricedCalls: number;
}
export interface Checkpoint {
  state: EngineState;
  memories: PowerMap<string[]>;
  relations: PowerMap<Partial<PowerMap<number>>>;
  configs: PowerMap<AgentConfig>;
}
export interface Turn {
  phase: string;
  messages: Dispatch[];
  decisions: PowerMap<Decision>;
  promises: PromiseCheck[];
  recap: string;
  title: string;
  results: Record<string, string[]>;
}
export interface Limits {
  maxPhases: number;
  budgetUsd: number;
  maxOutputTokens: number;
  diplomacyRounds: number;
}
export interface PendingPhase {
  round: number;
  messages: Dispatch[];
  negotiated: string[];
  /** Spectator view: full decisions are withheld until resolution; only the count is shared. */
  decisions: Partial<PowerMap<Decision>>;
  sealedCount?: number;
}
export interface Intervention {
  power: Power;
  order?: string;
  message?: string;
  to?: Power[];
  profile?: Profile;
}
export interface Match {
  id: string;
  name: string;
  mode: 'sample' | 'sandbox' | 'live';
  createdAt: string;
  status: 'paused' | 'running' | 'complete' | 'error';
  error?: string;
  checkpoints: Checkpoint[];
  turns: Turn[];
  usage: Usage;
  limits: Limits;
  pending?: PendingPhase;
  parent?: { id: string; name: string; at: number };
  intervention?: Intervention;
  /** Optional shared briefing sent to every live country. Plain text, never rules. */
  briefing?: string;
}
/** How a saved game ended, read from its recorded position. Shared by the server summary and the History tab. */
export type GameResult =
  | { kind: 'sample' }
  | { kind: 'running' }
  | { kind: 'paused' }
  | { kind: 'open' }
  | { kind: 'won'; winner: Power; centers: number }
  | { kind: 'limit' }
  | { kind: 'budget' }
  | { kind: 'draw' }
  | { kind: 'error' };

/** One row of the History tab. Deliberately small: no prompts, usage details, orders, or keys. */
export interface MatchSummary {
  id: string;
  name: string;
  mode: Match['mode'];
  /** Phases recorded so far. */
  phases: number;
  /** The phase limit the game was created or last extended with. */
  phaseLimit: number;
  createdAt: string;
  status: Match['status'];
  parent?: Match['parent'];
  /** The original game this alternate timeline came from has been deleted. */
  parentMissing: boolean;
  result: GameResult;
  /** Live model calls made, and the conservative cost in USD. Zero for sandbox and sample records. */
  calls: number;
  costUsd: number;
}
export interface PriceTier {
  /** Applies once the prompt reaches this many tokens. Rates are USD per token. */
  minPromptTokens: number;
  input: number;
  output: number;
}
export interface ModelInfo {
  id: string;
  name: string;
  input: number;
  output: number;
  context: number;
  tiers?: PriceTier[];
}
