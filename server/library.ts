import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEX_BY_ID } from '../shared/pokedex.ts';
import type { SavedPriceGroup } from '../shared/types.ts';
import { DraftError } from './rooms.ts';

export const MAX_SAVED_GROUPS = 200;

/** Validates untrusted group input (name, cost, members). */
export function cleanGroupInput(input: unknown): Pick<SavedPriceGroup, 'name' | 'cost' | 'pokemonIds'> {
  const g = (input ?? {}) as Partial<SavedPriceGroup>;
  const name = typeof g.name === 'string' ? g.name.trim().replace(/\s+/g, ' ').slice(0, 30) : '';
  if (!name) throw new DraftError('Give the group a name');
  const cost = Math.round(Number(g.cost));
  if (!Number.isFinite(cost) || cost < 0 || cost > 200) throw new DraftError('Cost must be between 0 and 200');
  const ids = Array.isArray(g.pokemonIds) ? g.pokemonIds : [];
  const pokemonIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && DEX_BY_ID.has(id)))].slice(0, 1500);
  return { name, cost, pokemonIds };
}

/** Custom price groups shared by every draft, persisted to a JSON file. */
export class PriceGroupLibrary {
  private groups: SavedPriceGroup[] = [];

  constructor(private file: string, private now: () => number = Date.now) {
    if (existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8'));
        this.groups = Array.isArray(raw) ? raw : [];
      } catch (err) {
        console.error(`Could not read ${file}; starting with an empty price group library`, err);
      }
    }
  }

  list(): SavedPriceGroup[] {
    return [...this.groups].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): SavedPriceGroup {
    const g = this.groups.find((x) => x.id === id);
    if (!g) throw new DraftError('Saved price group not found');
    return g;
  }

  create(input: unknown): SavedPriceGroup {
    if (this.groups.length >= MAX_SAVED_GROUPS) throw new DraftError(`The library is full (${MAX_SAVED_GROUPS} groups)`);
    const clean = cleanGroupInput(input);
    this.assertUniqueName(clean.name);
    const group: SavedPriceGroup = { id: randomUUID().slice(0, 12), ...clean, createdAt: this.now(), updatedAt: this.now() };
    this.groups.push(group);
    this.save();
    return group;
  }

  update(id: string, input: unknown): SavedPriceGroup {
    const group = this.get(id);
    const clean = cleanGroupInput(input);
    this.assertUniqueName(clean.name, id);
    Object.assign(group, clean, { updatedAt: this.now() });
    this.save();
    return group;
  }

  remove(id: string) {
    this.get(id);
    this.groups = this.groups.filter((g) => g.id !== id);
    this.save();
  }

  private assertUniqueName(name: string, exceptId?: string) {
    if (this.groups.some((g) => g.id !== exceptId && g.name.toLowerCase() === name.toLowerCase()))
      throw new DraftError(`A saved group called "${name}" already exists`);
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.groups, null, 2));
    renameSync(tmp, this.file);
  }
}
