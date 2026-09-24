import { DEX_BY_ID, POKEDEX } from './pokedex.ts';
import type { Pokemon, PriceGroup, PricingRules } from './types.ts';

export const MAX_STANDARD_COST = 20;

// Competitive-tier weight: how "meta" a Pokemon is. Higher tiers cost more.
const TIER_VALUE: Record<string, number> = {
  AG: 20, Uber: 18, '(Uber)': 17, OU: 14, '(OU)': 13, UUBL: 12, UU: 10, RUBL: 9, RU: 8,
  NUBL: 7, NU: 6, PUBL: 5, PU: 4, ZUBL: 4, ZU: 3, NFE: 2, LC: 1,
};
// National Dex puts every untiered Pokemon in "RU", so only trust its upper tiers.
const TRUSTED_NATDEX = new Set(['AG', 'Uber', '(Uber)', 'OU', '(OU)', 'UUBL', 'UU', 'RUBL']);

/** Tier-based meta value, or null when the Pokemon has no meaningful tier. */
export function metaValue(p: Pokemon): number | null {
  const current = p.tier ? TIER_VALUE[p.tier] : undefined;
  const natDex = p.natDexTier && TRUSTED_NATDEX.has(p.natDexTier) ? TIER_VALUE[p.natDexTier] : undefined;
  if (current === undefined && natDex === undefined) return null;
  return Math.max(current ?? 0, natDex ?? 0);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Cost from raw power alone: roughly 300 BST -> 3, 500 -> 10, 600 -> 13, 720 -> 17 */
function bstValue(p: Pokemon): number {
  return clamp((p.bst - 200) / 30, 1, 18);
}

function rawCost(p: Pokemon): number {
  const meta = metaValue(p);
  let cost = meta === null ? bstValue(p) - 1 : 0.6 * meta + 0.4 * bstValue(p);
  if (p.stage === 'final') cost += 1;
  if (p.tags.restricted) cost += 3;
  else if (p.tags.legendary || p.tags.mythical) cost += 2;
  if (p.tags.ultraBeast || p.tags.paradox) cost += 1;
  if (p.tags.mega) cost += 2;
  return clamp(Math.round(cost), 1, MAX_STANDARD_COST);
}

/**
 * Standard costs for the whole dex. Guarantees every evolution costs strictly
 * more than its pre-evolution (capped at the max cost), and every Mega costs
 * more than its base forme.
 */
function computeStandardCosts(): Map<string, number> {
  const costs = new Map<string, number>();
  const resolve = (p: Pokemon): number => {
    const known = costs.get(p.id);
    if (known !== undefined) return known;
    let cost = rawCost(p);
    const parent = p.prevo ? DEX_BY_ID.get(p.prevo)
      : p.tags.mega ? DEX_BY_ID.get(p.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, ''))
      : undefined;
    if (parent) cost = Math.min(MAX_STANDARD_COST, Math.max(cost, resolve(parent) + 1));
    costs.set(p.id, cost);
    return cost;
  };
  POKEDEX.forEach(resolve);
  return costs;
}

export const STANDARD_COSTS = computeStandardCosts();

export function standardCost(id: string): number {
  return STANDARD_COSTS.get(id) ?? 1;
}

/** Relative strength used for ranking (bots, normalized pricing tiebreaks). */
export function powerScore(p: Pokemon): number {
  return standardCost(p.id) * 10 + p.bst / 100;
}

export function matchesPriceGroup(p: Pokemon, group: PriceGroup): boolean {
  switch (group.match) {
    case 'custom': return group.pokemonIds.includes(p.id);
    // "Legendary" means sub-legendaries; box legendaries have their own group
    case 'legendary': return p.tags.legendary && !p.tags.restricted;
    default: return p.tags[group.match];
  }
}

/** The first group (in list order) that prices this Pokemon, if any. */
export function priceGroupFor(p: Pokemon, groups: PriceGroup[]): PriceGroup | undefined {
  return groups.find((g) => matchesPriceGroup(p, g));
}

/** Final costs for every Pokemon in a pool: mode cost, then price groups, then individual overrides. */
export function priceSheet(pool: Pokemon[], rules: PricingRules): Map<string, number> {
  const sheet = new Map<string, number>();
  const lo = Math.max(0, Math.round(rules.minCost));
  const hi = Math.max(lo, Math.round(rules.maxCost));

  if (rules.mode === 'flat') {
    for (const p of pool) sheet.set(p.id, Math.max(0, Math.round(rules.flatCost)));
  } else if (rules.mode === 'normalized') {
    // Rank-based rescale: the weakest in the pool costs minCost, the strongest maxCost.
    const ranked = [...pool].sort((a, b) => powerScore(a) - powerScore(b));
    const n = ranked.length;
    let prevScore = -1;
    let prevCost = lo;
    ranked.forEach((p, i) => {
      const score = powerScore(p);
      const cost = score === prevScore ? prevCost : n <= 1 ? hi : Math.round(lo + (i / (n - 1)) * (hi - lo));
      sheet.set(p.id, cost);
      prevScore = score;
      prevCost = cost;
    });
  } else {
    for (const p of pool) sheet.set(p.id, clamp(standardCost(p.id), lo, hi));
  }

  for (const p of pool) {
    const group = priceGroupFor(p, rules.groups ?? []);
    if (group) sheet.set(p.id, Math.max(0, Math.round(group.cost)));
  }
  for (const [id, cost] of Object.entries(rules.overrides ?? {})) {
    if (sheet.has(id) && Number.isFinite(cost)) sheet.set(id, Math.max(0, Math.round(cost)));
  }
  return sheet;
}
