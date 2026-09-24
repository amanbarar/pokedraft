import { DEX_BY_ID } from './pokedex.ts';
import type { Category, CategoryRule, FormatPreset, FormatSettings, PriceGroup, TypeName } from './types.ts';
import { CATEGORIES, GENS, PRICE_GROUP_MATCHES, STAGES, TYPES } from './types.ts';

export const MAX_PRICE_GROUPS = 30;

const cats = (overrides: Partial<Record<Category, CategoryRule>> = {}): Record<Category, CategoryRule> => ({
  legendary: 'allow', restricted: 'allow', mythical: 'allow', ultraBeast: 'allow',
  paradox: 'allow', mega: 'ban', regional: 'allow', ...overrides,
});

export function baseSettings(): FormatSettings {
  return {
    presetId: 'standard',
    name: 'Standard Draft',
    budget: 100,
    teamSize: 10,
    maxPlayers: 6,
    pool: {
      gens: [], types: [], stages: [], categories: cats(),
      minBst: null, maxBst: null, bans: [], speciesClause: true,
    },
    team: { monotype: false, maxLegendaries: null, maxMegas: null, maxPerType: null },
    pricing: { mode: 'standard', minCost: 1, maxCost: 20, flatCost: 10, groups: [], overrides: {} },
    draft: { order: 'snake', pickTimerSec: 90 },
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

function preset(
  id: string, name: string, tagline: string, description: string, patch: DeepPartial<FormatSettings>,
): FormatPreset {
  const b = baseSettings();
  const settings: FormatSettings = {
    ...b, ...patch, presetId: id, name,
    pool: { ...b.pool, ...patch.pool, categories: { ...b.pool.categories, ...patch.pool?.categories } },
    team: { ...b.team, ...patch.team },
    pricing: { ...b.pricing, ...patch.pricing, groups: [...(patch.pricing?.groups ?? [])] as PriceGroup[], overrides: { ...(patch.pricing?.overrides ?? {}) } as Record<string, number> },
    draft: { ...b.draft, ...patch.draft },
  } as FormatSettings;
  return { id, name, tagline, description, settings };
}

export const PRESETS: FormatPreset[] = [
  preset('standard', 'Standard Draft', 'Every generation, every Pokemon',
    'The full National Dex. Legendaries are allowed but priced at a premium; Megas are off.', {}),
  preset('legendary', 'Legendary Clash', 'Legendaries & Mythicals only',
    'Only Legendary and Mythical Pokemon. Costs are rescaled within the pool so a 10-mon team still fits in 100 points.',
    { pool: { categories: cats({ legendary: 'only', restricted: 'only', mythical: 'only' }) } as never,
      pricing: { mode: 'normalized', minCost: 3, maxCost: 18 } }),
  preset('commoners', 'Commoners Cup', 'No legends, no beasts',
    'Bans Legendaries, Mythicals, Ultra Beasts and Paradox Pokemon. Pure fundamentals.',
    { pool: { categories: cats({ legendary: 'ban', restricted: 'ban', mythical: 'ban', ultraBeast: 'ban', paradox: 'ban' }) } as never }),
  preset('monotype', 'Monotype', 'One type to rule your team',
    'Everyone drafts from the full pool, but every Pokemon on your team must share a common type. Your first pick narrows your options.',
    { team: { monotype: true, maxLegendaries: 2 } }),
  preset('single-type', 'Type Takeover', 'The whole pool is one type',
    'The host picks a type (Dragon by default) and the entire pool is limited to it. Costs are rescaled within the pool.',
    { pool: { types: ['Dragon'] as TypeName[] }, pricing: { mode: 'normalized', minCost: 2, maxCost: 18 } }),
  preset('little-cup', 'Little Cup', 'Baby Pokemon only',
    'Only unevolved Pokemon that can still evolve. No legendaries. Costs are rescaled so the best babies still cost a premium.',
    { pool: { stages: ['basic'], categories: cats({ legendary: 'ban', restricted: 'ban', mythical: 'ban', ultraBeast: 'ban', paradox: 'ban', mega: 'ban' }) } as never,
      pricing: { mode: 'normalized', minCost: 2, maxCost: 16 } }),
  preset('retro', 'Retro League', 'Kanto & Johto classics',
    'Generations 1 and 2 only, no regional forms, no box legendaries.',
    { pool: { gens: [1, 2], categories: cats({ regional: 'ban', restricted: 'ban' }) } as never }),
  preset('mega', 'Mega Mayhem', 'Megas are back',
    'Mega Evolutions and Primals join the pool. Max two per team, and they cost more than their base forme.',
    { pool: { categories: cats({ mega: 'allow' }) } as never, team: { maxMegas: 2 } }),
  preset('balanced', 'Balanced League', 'Capped legends, capped types',
    'Standard pool with at most one Legendary/Mythical and three Pokemon of any one type per team.',
    { team: { maxLegendaries: 1, maxPerType: 3 } }),
  preset('auction', 'Flat Draft', 'Every pick costs the same',
    'Points are off the table: every Pokemon costs 10, so it comes down to draft order and strategy.',
    { pricing: { mode: 'flat', flatCost: 10 } }),
];

export function getPreset(id: string): FormatPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function cloneSettings(s: FormatSettings): FormatSettings {
  return JSON.parse(JSON.stringify(s));
}

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const nullableInt = (v: unknown, lo: number, hi: number) =>
  v === null || v === undefined || v === '' ? null : int(v, lo, hi, lo);

/** Coerces untrusted input into valid settings (used by the server on every update). */
export function sanitizeSettings(input: unknown): FormatSettings {
  const d = baseSettings();
  const s = (input ?? {}) as Partial<FormatSettings>;
  const pool = (s.pool ?? {}) as Partial<FormatSettings['pool']>;
  const team = (s.team ?? {}) as Partial<FormatSettings['team']>;
  const pricing = (s.pricing ?? {}) as Partial<FormatSettings['pricing']>;
  const draft = (s.draft ?? {}) as Partial<FormatSettings['draft']>;
  const ruleOf = (v: unknown): CategoryRule => (v === 'ban' || v === 'only' ? v : 'allow');

  const groups: PriceGroup[] = [];
  const seenGroupIds = new Set<string>();
  for (const g of Array.isArray(pricing.groups) ? pricing.groups.slice(0, MAX_PRICE_GROUPS) : []) {
    const match = g?.match === 'custom' || PRICE_GROUP_MATCHES.some((m) => m.id === g?.match) ? g.match : null;
    if (!match) continue;
    let id = typeof g.id === 'string' && g.id ? g.id.slice(0, 40) : `g`;
    while (seenGroupIds.has(id)) id += '_';
    seenGroupIds.add(id);
    const fallbackName = PRICE_GROUP_MATCHES.find((m) => m.id === match)?.label ?? 'Custom group';
    groups.push({
      id,
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 30) : fallbackName,
      match,
      pokemonIds: match === 'custom' && Array.isArray(g.pokemonIds)
        ? [...new Set(g.pokemonIds.filter((x): x is string => typeof x === 'string' && DEX_BY_ID.has(x)))].slice(0, 1500)
        : [],
      cost: int(g.cost, 0, 200, 10),
      ...(match === 'custom' && typeof g.libraryId === 'string' && g.libraryId ? { libraryId: g.libraryId.slice(0, 40) } : {}),
    });
  }

  const overrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(pricing.overrides ?? {})) {
    if (typeof k === 'string' && k.length < 40) overrides[k] = int(v, 0, 200, 0);
  }

  return {
    presetId: typeof s.presetId === 'string' ? s.presetId.slice(0, 40) : 'custom',
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 60) : d.name,
    budget: int(s.budget, 1, 10000, d.budget),
    teamSize: int(s.teamSize, 1, 30, d.teamSize),
    maxPlayers: int(s.maxPlayers, 2, 16, d.maxPlayers),
    pool: {
      gens: Array.isArray(pool.gens) ? [...new Set(pool.gens.filter((g) => (GENS as readonly number[]).includes(g)))] : [],
      types: Array.isArray(pool.types) ? [...new Set(pool.types.filter((t) => (TYPES as readonly string[]).includes(t)))] : [],
      stages: Array.isArray(pool.stages) ? [...new Set(pool.stages.filter((st) => STAGES.some((x) => x.id === st)))] : [],
      categories: Object.fromEntries(
        CATEGORIES.map((c) => [c.id, ruleOf(pool.categories?.[c.id] ?? d.pool.categories[c.id])]),
      ) as Record<Category, CategoryRule>,
      minBst: nullableInt(pool.minBst, 0, 1000),
      maxBst: nullableInt(pool.maxBst, 0, 1000),
      bans: Array.isArray(pool.bans) ? [...new Set(pool.bans.filter((b) => typeof b === 'string'))].slice(0, 2000) : [],
      speciesClause: pool.speciesClause !== false,
    },
    team: {
      monotype: !!team.monotype,
      maxLegendaries: nullableInt(team.maxLegendaries, 0, 30),
      maxMegas: nullableInt(team.maxMegas, 0, 30),
      maxPerType: nullableInt(team.maxPerType, 1, 30),
    },
    pricing: {
      mode: pricing.mode === 'normalized' || pricing.mode === 'flat' ? pricing.mode : 'standard',
      minCost: int(pricing.minCost, 0, 200, d.pricing.minCost),
      maxCost: int(pricing.maxCost, 0, 200, d.pricing.maxCost),
      flatCost: int(pricing.flatCost, 0, 200, d.pricing.flatCost),
      groups,
      overrides,
    },
    draft: {
      order: draft.order === 'linear' ? 'linear' : 'snake',
      pickTimerSec: int(draft.pickTimerSec, 0, 3600, d.draft.pickTimerSec),
    },
  };
}
