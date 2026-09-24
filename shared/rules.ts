import { POKEDEX, DEX_BY_ID, isLegendaryish } from './pokedex.ts';
import { priceSheet, powerScore } from './pricing.ts';
import { CATEGORIES } from './types.ts';
import type { FormatSettings, Pokemon, RoomState, TypeName } from './types.ts';

// ---------------------------------------------------------------- pool

export function inPool(p: Pokemon, settings: FormatSettings): boolean {
  const pool = settings.pool;
  if (pool.gens.length && !pool.gens.includes(p.gen)) return false;
  if (pool.types.length && !p.types.some((t) => pool.types.includes(t))) return false;
  if (pool.stages.length && !pool.stages.includes(p.stage)) return false;
  if (pool.minBst !== null && p.bst < pool.minBst) return false;
  if (pool.maxBst !== null && p.bst > pool.maxBst) return false;
  if (pool.bans.includes(p.id)) return false;

  const onlyCats = CATEGORIES.filter((c) => pool.categories[c.id] === 'only');
  if (onlyCats.length && !onlyCats.some((c) => p.tags[c.id])) return false;
  if (CATEGORIES.some((c) => pool.categories[c.id] === 'ban' && p.tags[c.id])) return false;
  return true;
}

export interface PoolInfo {
  pokemon: Pokemon[];
  costs: Map<string, number>;
}

let poolCache: { key: string; info: PoolInfo } | null = null;

/** The draftable pool and its price sheet (memoized for the last settings seen). */
export function getPool(settings: FormatSettings): PoolInfo {
  const key = JSON.stringify([settings.pool, settings.pricing]);
  if (poolCache?.key === key) return poolCache.info;
  const pokemon = POKEDEX.filter((p) => inPool(p, settings));
  const info = { pokemon, costs: priceSheet(pokemon, settings.pricing) };
  poolCache = { key, info };
  return info;
}

// ---------------------------------------------------------------- turn order

export function totalTurns(state: RoomState): number {
  return state.players.length * state.settings.teamSize;
}

/** Index into state.players of whoever drafts on the given turn. */
export function playerIndexForTurn(turn: number, playerCount: number, order: 'snake' | 'linear'): number {
  const round = Math.floor(turn / playerCount);
  const pos = turn % playerCount;
  return order === 'snake' && round % 2 === 1 ? playerCount - 1 - pos : pos;
}

export function currentTurn(state: RoomState): number {
  return state.picks.length;
}

export function currentPlayerId(state: RoomState): string | null {
  if (state.status !== 'drafting' && state.status !== 'paused') return null;
  const turn = currentTurn(state);
  if (turn >= totalTurns(state) || !state.players.length) return null;
  return state.players[playerIndexForTurn(turn, state.players.length, state.settings.draft.order)].id;
}

/** Upcoming player ids starting from the current turn. */
export function upcomingPlayerIds(state: RoomState, count: number): string[] {
  const out: string[] = [];
  const total = totalTurns(state);
  for (let t = currentTurn(state); t < total && out.length < count; t++) {
    out.push(state.players[playerIndexForTurn(t, state.players.length, state.settings.draft.order)].id);
  }
  return out;
}

// ---------------------------------------------------------------- teams

export function teamOf(state: RoomState, playerId: string): Pokemon[] {
  return state.picks
    .filter((pk) => pk.playerId === playerId && pk.pokemonId)
    .map((pk) => DEX_BY_ID.get(pk.pokemonId!)!)
    .filter(Boolean);
}

export function spentBy(state: RoomState, playerId: string): number {
  return state.picks.filter((pk) => pk.playerId === playerId).reduce((a, pk) => a + pk.cost, 0);
}

export function budgetLeft(state: RoomState, playerId: string): number {
  return state.settings.budget - spentBy(state, playerId);
}

/** Types every Pokemon on the team shares (all 18 for an empty team). */
export function sharedTypes(team: Pokemon[]): TypeName[] | null {
  if (!team.length) return null;
  return team.reduce<TypeName[]>((acc, p) => acc.filter((t) => p.types.includes(t)), [...team[0].types]);
}

/** Ids no longer available: drafted, or sharing a species with something drafted. */
export function takenIds(state: RoomState): Set<string> {
  const taken = new Set<string>();
  const species = new Set<string>();
  for (const pk of state.picks) {
    if (!pk.pokemonId) continue;
    taken.add(pk.pokemonId);
    const p = DEX_BY_ID.get(pk.pokemonId);
    if (p) species.add(p.baseSpecies);
  }
  if (state.settings.pool.speciesClause) {
    for (const p of getPool(state.settings).pokemon) if (species.has(p.baseSpecies)) taken.add(p.id);
  }
  return taken;
}

// ---------------------------------------------------------------- legality

export type PickVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Builds a checker answering "can this player draft X right now?" for many
 * candidates efficiently. `ignoreTurn` lets clients preview legality off-turn.
 */
export function createPickChecker(state: RoomState, playerId: string, opts: { ignoreTurn?: boolean } = {}) {
  const { settings } = state;
  const { pokemon: pool, costs } = getPool(settings);
  const taken = takenIds(state);
  const team = teamOf(state, playerId);
  const picksMade = state.picks.filter((pk) => pk.playerId === playerId).length;
  const left = budgetLeft(state, playerId);
  const slotsAfter = settings.teamSize - picksMade - 1;
  const shared = sharedTypes(team);
  const legends = team.filter(isLegendaryish).length;
  const megas = team.filter((p) => p.tags.mega).length;
  const typeCounts = new Map<string, number>();
  for (const p of team) for (const t of p.types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);

  const available = pool.filter((p) => !taken.has(p.id));
  // Sorted cheapest costs of remaining Pokemon, per monotype type-set (memoized)
  const cheapestCache = new Map<string, { id: string; cost: number }[]>();
  const cheapestFor = (types: TypeName[] | null) => {
    const key = types ? types.join('/') : '*';
    let list = cheapestCache.get(key);
    if (!list) {
      list = available
        .filter((p) => !types || p.types.some((t) => types.includes(t)))
        .map((p) => ({ id: p.id, cost: costs.get(p.id)! }))
        .sort((a, b) => a.cost - b.cost)
        .slice(0, Math.max(0, slotsAfter) + 1);
      cheapestCache.set(key, list);
    }
    return list;
  };

  return (pokemonId: string): PickVerdict => {
    if (!opts.ignoreTurn) {
      if (state.status !== 'drafting') return { ok: false, reason: 'The draft is not running' };
      if (currentPlayerId(state) !== playerId) return { ok: false, reason: 'Not your turn' };
    }
    const p = DEX_BY_ID.get(pokemonId);
    const cost = costs.get(pokemonId);
    if (!p || cost === undefined) return { ok: false, reason: 'Not in this draft pool' };
    if (taken.has(pokemonId)) return { ok: false, reason: 'Already drafted' };
    if (picksMade >= settings.teamSize) return { ok: false, reason: 'Your team is full' };
    if (cost > left) return { ok: false, reason: `Costs ${cost}, you have ${left} left` };

    let nextShared: TypeName[] | null = null;
    if (settings.team.monotype) {
      nextShared = shared ? shared.filter((t) => p.types.includes(t)) : [...p.types];
      if (!nextShared.length) return { ok: false, reason: `Monotype: must be ${shared!.join(' or ')}` };
    }
    if (settings.team.maxLegendaries !== null && isLegendaryish(p) && legends >= settings.team.maxLegendaries)
      return { ok: false, reason: `Max ${settings.team.maxLegendaries} legendary/mythical per team` };
    if (settings.team.maxMegas !== null && p.tags.mega && megas >= settings.team.maxMegas)
      return { ok: false, reason: `Max ${settings.team.maxMegas} Megas per team` };
    if (settings.team.maxPerType !== null) {
      const full = p.types.find((t) => (typeCounts.get(t) ?? 0) >= settings.team.maxPerType!);
      if (full) return { ok: false, reason: `Max ${settings.team.maxPerType} ${full}-types per team` };
    }

    // Leave enough budget to fill every remaining slot with the cheapest options.
    if (slotsAfter > 0) {
      const cheapest = cheapestFor(nextShared).filter((c) => c.id !== pokemonId).slice(0, slotsAfter);
      const reserve = cheapest.reduce((a, c) => a + c.cost, 0);
      if (left - cost < reserve)
        return { ok: false, reason: `Leaves ${left - cost} pts; need ${reserve} to fill ${slotsAfter} more slot${slotsAfter > 1 ? 's' : ''}` };
    }
    return { ok: true };
  };
}

export function legalPicks(state: RoomState, playerId: string): Pokemon[] {
  const check = createPickChecker(state, playerId);
  return getPool(state.settings).pokemon.filter((p) => check(p.id).ok);
}

/**
 * Auto-pick used by bots and when the pick timer expires: the strongest legal
 * Pokemon that keeps spending on pace with the remaining budget.
 */
export function chooseAutoPick(state: RoomState, playerId: string, rng: () => number = Math.random): string | null {
  const legal = legalPicks(state, playerId);
  if (!legal.length) return null;
  const { costs } = getPool(state.settings);
  const picksMade = state.picks.filter((pk) => pk.playerId === playerId).length;
  const slots = state.settings.teamSize - picksMade;
  const pace = budgetLeft(state, playerId) / Math.max(1, slots);
  // Vary how aggressively each pick spends so bots don't all draft identically
  const stretch = 0.9 + rng() * 0.9;
  const onPace = legal.filter((p) => costs.get(p.id)! <= Math.ceil(pace * stretch));
  const candidates = (onPace.length ? onPace : legal)
    .map((p) => ({ p, score: powerScore(p) * (0.85 + rng() * 0.3) }))
    .sort((a, b) => b.score - a.score);
  return candidates[0].p.id;
}

// ---------------------------------------------------------------- lobby checks

export interface FormatReport {
  poolSize: number;
  minTeamCost: number;
  avgCost: number;
  problems: string[];
}

export function analyzeFormat(settings: FormatSettings, playerCount: number): FormatReport {
  const { pokemon, costs } = getPool(settings);
  const sorted = pokemon.map((p) => costs.get(p.id)!).sort((a, b) => a - b);
  const minTeamCost = sorted.slice(0, settings.teamSize).reduce((a, c) => a + c, 0);
  const avgCost = sorted.length ? sorted.reduce((a, c) => a + c, 0) / sorted.length : 0;
  const problems: string[] = [];
  const needed = settings.teamSize * Math.max(playerCount, 1);
  const speciesCount = new Set(pokemon.map((p) => p.baseSpecies)).size;
  const effective = settings.pool.speciesClause ? speciesCount : pokemon.length;
  if (effective < needed)
    problems.push(`Pool has ${effective} draftable species but ${playerCount} players x ${settings.teamSize} picks need ${needed}.`);
  if (minTeamCost > settings.budget)
    problems.push(`The cheapest possible team costs ${minTeamCost}, over the ${settings.budget}-point budget.`);
  return { poolSize: pokemon.length, minTeamCost, avgCost, problems };
}
