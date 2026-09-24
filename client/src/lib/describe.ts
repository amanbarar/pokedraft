import { CATEGORIES, STAGES, type FormatSettings } from '../../../shared/types.ts';

/** Human-readable rule summary for a format. */
export function describeFormat(s: FormatSettings): string[] {
  const out: string[] = [];
  out.push(`${s.budget} points, ${s.teamSize} Pokemon per team`);
  out.push(s.pool.gens.length ? `Gens ${[...s.pool.gens].sort().join(', ')}` : 'All generations');
  if (s.pool.types.length) out.push(`Types: ${s.pool.types.join(', ')}`);
  if (s.pool.stages.length) out.push(`Stages: ${s.pool.stages.map((st) => STAGES.find((x) => x.id === st)?.label).join(', ')}`);
  const only = CATEGORIES.filter((c) => s.pool.categories[c.id] === 'only').map((c) => c.label);
  const banned = CATEGORIES.filter((c) => s.pool.categories[c.id] === 'ban').map((c) => c.label);
  if (only.length) out.push(`Only: ${only.join(', ')}`);
  if (banned.length) out.push(`Banned: ${banned.join(', ')}`);
  if (s.pool.minBst !== null || s.pool.maxBst !== null) out.push(`BST ${s.pool.minBst ?? 0}-${s.pool.maxBst ?? 'max'}`);
  if (s.pool.bans.length) out.push(`${s.pool.bans.length} individual ban${s.pool.bans.length > 1 ? 's' : ''}`);
  if (s.team.monotype) out.push('Monotype teams');
  if (s.team.maxLegendaries !== null) out.push(`Max ${s.team.maxLegendaries} legendary/mythical`);
  if (s.team.maxMegas !== null) out.push(`Max ${s.team.maxMegas} Megas`);
  if (s.team.maxPerType !== null) out.push(`Max ${s.team.maxPerType} per type`);
  out.push(s.pricing.mode === 'flat' ? `Flat ${s.pricing.flatCost} pts each`
    : s.pricing.mode === 'normalized' ? `Costs scaled ${s.pricing.minCost}-${s.pricing.maxCost}` : 'Standard pricing');
  for (const g of s.pricing.groups ?? []) {
    const size = g.match === 'custom' ? ` (${g.pokemonIds.length} Pokemon)` : '';
    out.push(`${g.name}${size}: ${g.cost} pts each`);
  }
  const overrides = Object.keys(s.pricing.overrides).length;
  if (overrides) out.push(`${overrides} custom price${overrides > 1 ? 's' : ''}`);
  out.push(`${s.draft.order === 'snake' ? 'Snake' : 'Linear'} order`);
  out.push(s.draft.pickTimerSec ? `${s.draft.pickTimerSec}s pick timer` : 'No pick timer');
  if (!s.pool.speciesClause) out.push('Species clause off');
  return out;
}
