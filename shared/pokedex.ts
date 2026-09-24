import raw from './data/pokedex.json';
import type { Pokemon } from './types.ts';

export const POKEDEX: Pokemon[] = raw as Pokemon[];
export const DEX_BY_ID: Map<string, Pokemon> = new Map(POKEDEX.map((p) => [p.id, p]));

export function getPokemon(id: string): Pokemon | undefined {
  return DEX_BY_ID.get(id);
}

export function isLegendaryish(p: Pokemon): boolean {
  return p.tags.legendary || p.tags.restricted || p.tags.mythical;
}

export function spriteUrl(p: Pokemon): string {
  return `https://play.pokemonshowdown.com/sprites/home-centered/${p.sprite}.png`;
}

export function fallbackSpriteUrl(p: Pokemon): string {
  return `https://play.pokemonshowdown.com/sprites/dex/${p.sprite}.png`;
}
