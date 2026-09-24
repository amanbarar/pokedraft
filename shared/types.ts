export const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;
export type TypeName = (typeof TYPES)[number];

export const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type Stage = 'basic' | 'middle' | 'final' | 'single' | 'mega';
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'basic', label: 'Unevolved' },
  { id: 'middle', label: 'Middle stage' },
  { id: 'final', label: 'Fully evolved' },
  { id: 'single', label: 'No evolution line' },
  { id: 'mega', label: 'Mega / Primal' },
];

export type Category = 'legendary' | 'restricted' | 'mythical' | 'ultraBeast' | 'paradox' | 'mega' | 'regional';
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'legendary', label: 'Legendary' },
  { id: 'restricted', label: 'Box Legendary' },
  { id: 'mythical', label: 'Mythical' },
  { id: 'ultraBeast', label: 'Ultra Beast' },
  { id: 'paradox', label: 'Paradox' },
  { id: 'mega', label: 'Mega / Primal' },
  { id: 'regional', label: 'Regional form' },
];

export interface Stats { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }

export interface Pokemon {
  id: string;
  name: string;
  num: number;
  gen: number;
  types: TypeName[];
  stats: Stats;
  bst: number;
  abilities: string[];
  baseSpecies: string;
  forme: string | null;
  stage: Stage;
  prevo: string | null;
  evos: string[];
  /** Smogon singles tier for the current gen ("OU", "Uber", "Illegal", ...) */
  tier: string | null;
  /** Smogon National Dex tier (covers Pokemon not in the current game) */
  natDexTier: string | null;
  tags: Record<Category, boolean>;
  sprite: string;
}

/** allow = in the pool, ban = removed, only = pool is restricted to "only" categories */
export type CategoryRule = 'allow' | 'ban' | 'only';

export interface PoolRules {
  /** Empty = all generations */
  gens: number[];
  /** Empty = all types. Pokemon must have at least one listed type. */
  types: TypeName[];
  /** Empty = all stages */
  stages: Stage[];
  categories: Record<Category, CategoryRule>;
  minBst: number | null;
  maxBst: number | null;
  /** Pokemon ids removed from the pool */
  bans: string[];
  /** Once one forme of a species is drafted, its other formes are taken too */
  speciesClause: boolean;
}

export interface TeamRules {
  /** Every Pokemon on a team must share at least one common type */
  monotype: boolean;
  /** Max legendary + mythical Pokemon per team (null = unlimited) */
  maxLegendaries: number | null;
  maxMegas: number | null;
  /** Max Pokemon of any single type per team (null = unlimited) */
  maxPerType: number | null;
}

export type PricingMode = 'standard' | 'normalized' | 'flat';

/** What a price group matches: a built-in category, or a hand-picked list of Pokemon. */
export type PriceGroupMatch = 'legendary' | 'restricted' | 'mythical' | 'ultraBeast' | 'paradox' | 'mega' | 'custom';
export const PRICE_GROUP_MATCHES: { id: Exclude<PriceGroupMatch, 'custom'>; label: string; hint: string }[] = [
  { id: 'restricted', label: 'Box Legendary', hint: 'Mewtwo, Rayquaza, Koraidon...' },
  { id: 'legendary', label: 'Legendary', hint: 'Sub-legendaries: birds, beasts, Lati@s...' },
  { id: 'mythical', label: 'Mythical', hint: 'Mew, Celebi, Jirachi...' },
  { id: 'ultraBeast', label: 'Ultra Beast', hint: 'Nihilego, Kartana...' },
  { id: 'paradox', label: 'Paradox', hint: 'Great Tusk, Iron Valiant...' },
  { id: 'mega', label: 'Mega / Primal', hint: 'Only in formats that allow Megas' },
];

export interface PriceGroup {
  id: string;
  name: string;
  match: PriceGroupMatch;
  /** Members of a custom group (ignored for built-in matches) */
  pokemonIds: string[];
  /** Every matching Pokemon costs exactly this */
  cost: number;
  /** Saved-library group this was loaded from / saved to */
  libraryId?: string;
}

/** A custom price group saved on the server for reuse across drafts. */
export interface SavedPriceGroup {
  id: string;
  name: string;
  cost: number;
  pokemonIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PricingRules {
  /** standard: fixed cost from tier/BST/evolution; normalized: rescale costs across this pool; flat: every pick costs the same */
  mode: PricingMode;
  minCost: number;
  maxCost: number;
  flatCost: number;
  /** Fixed prices by group; the first matching group wins. Applied after the mode's cost. */
  groups: PriceGroup[];
  /** Per-Pokemon cost overrides (pokemon id -> cost); beat groups */
  overrides: Record<string, number>;
}

export interface DraftRules {
  order: 'snake' | 'linear';
  /** Seconds per pick; 0 disables the timer */
  pickTimerSec: number;
}

export interface FormatSettings {
  presetId: string;
  name: string;
  budget: number;
  teamSize: number;
  maxPlayers: number;
  pool: PoolRules;
  team: TeamRules;
  pricing: PricingRules;
  draft: DraftRules;
}

export interface FormatPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  settings: FormatSettings;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  /** Pass-and-play seat: drafted from the host's device */
  local?: boolean;
  connected: boolean;
}

export interface Pick {
  /** null = the turn was skipped because no legal pick existed */
  pokemonId: string | null;
  playerId: string;
  cost: number;
  turn: number;
  auto: boolean;
  at: number;
}

export type RoomStatus = 'lobby' | 'drafting' | 'paused' | 'complete';

export interface RoomState {
  code: string;
  createdAt: number;
  hostId: string;
  status: RoomStatus;
  settings: FormatSettings;
  /** Draft order */
  players: Player[];
  picks: Pick[];
  /** Epoch ms when the current pick auto-resolves */
  turnDeadline: number | null;
  /** Time left on the clock when the draft was paused */
  pausedRemainingMs: number | null;
}

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}
