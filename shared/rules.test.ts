import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, baseSettings, getPreset, sanitizeSettings } from './formats.ts';
import { POKEDEX, DEX_BY_ID, isLegendaryish } from './pokedex.ts';
import { standardCost, priceSheet } from './pricing.ts';
import { analyzeFormat, createPickChecker, getPool, playerIndexForTurn } from './rules.ts';
import type { FormatSettings, RoomState } from './types.ts';

function room(settings: FormatSettings, picks: [string, string][] = []): RoomState {
  const { costs } = getPool(settings);
  return {
    code: 'TEST', createdAt: 0, hostId: 'a', status: 'drafting', settings,
    players: [{ id: 'a', name: 'A', isBot: false, connected: true }, { id: 'b', name: 'B', isBot: false, connected: true }],
    picks: picks.map(([playerId, pokemonId], turn) => ({ playerId, pokemonId, cost: costs.get(pokemonId)!, turn, auto: false, at: 0 })),
    turnDeadline: null, pausedRemainingMs: null,
  };
}

test('evolutions always cost more than their pre-evolution', () => {
  for (const p of POKEDEX) {
    if (p.prevo && DEX_BY_ID.has(p.prevo) && standardCost(p.prevo) < 20)
      assert.ok(standardCost(p.id) > standardCost(p.prevo), `${p.name} should cost more than ${p.prevo}`);
  }
  assert.ok(standardCost('charizardmegay') > standardCost('charizard'));
});

test('meta Pokemon cost more than weak ones with similar stats', () => {
  assert.ok(standardCost('garchomp') > standardCost('flygon'));
  assert.ok(standardCost('mewtwo') >= 18);
  assert.equal(standardCost('magikarp'), 1);
});

test('snake order reverses every other round', () => {
  const order = Array.from({ length: 8 }, (_, t) => playerIndexForTurn(t, 4, 'snake'));
  assert.deepEqual(order, [0, 1, 2, 3, 3, 2, 1, 0]);
  assert.deepEqual(Array.from({ length: 5 }, (_, t) => playerIndexForTurn(t, 2, 'linear')), [0, 1, 0, 1, 0]);
});

test('legendary-only pool contains only legendaries and mythicals', () => {
  const { pokemon } = getPool(getPreset('legendary')!.settings);
  assert.ok(pokemon.length > 50);
  assert.ok(pokemon.every(isLegendaryish));
});

test('single-type pool and little cup filters', () => {
  assert.ok(getPool(getPreset('single-type')!.settings).pokemon.every((p) => p.types.includes('Dragon')));
  const lc = getPool(getPreset('little-cup')!.settings).pokemon;
  assert.ok(lc.every((p) => p.stage === 'basic' && !isLegendaryish(p)));
});

test('every preset is playable at its max player count', () => {
  for (const preset of PRESETS) {
    const report = analyzeFormat(preset.settings, preset.settings.maxPlayers);
    assert.deepEqual(report.problems, [], preset.id);
  }
});

test('normalized pricing spans the configured range', () => {
  const pool = getPool(getPreset('legendary')!.settings).pokemon;
  const costs = [...priceSheet(pool, { mode: 'normalized', minCost: 3, maxCost: 18, flatCost: 0, groups: [], overrides: {} }).values()];
  assert.equal(Math.min(...costs), 3);
  assert.equal(Math.max(...costs), 18);
});

test('pick checker enforces turn, taken, and species clause', () => {
  const s = baseSettings();
  const state = room(s, [['a', 'rotomwash']]);
  assert.equal(createPickChecker(state, 'a')('garchomp').ok, false); // not a's turn
  const b = createPickChecker(state, 'b');
  assert.equal(b('rotomwash').ok, false);
  assert.equal(b('rotomheat').ok, false); // species clause
  assert.equal(b('garchomp').ok, true);
});

test('pick checker reserves budget for remaining slots', () => {
  const s = { ...baseSettings(), budget: 25 };
  const check = createPickChecker(room(s), 'a');
  // 20-pt Mewtwo would leave 5 pts for 9 slots; the cheapest 9 cost at least 9
  assert.equal(check('mewtwo').ok, false);
  assert.equal(check('magikarp').ok, true);
});

test('monotype requires a shared type', () => {
  const s = getPreset('monotype')!.settings;
  const state = room(s, [['a', 'charizard'], ['b', 'bulbasaur']]); // turn 2 in snake -> b
  const b = createPickChecker(state, 'b');
  assert.equal(b('ivysaur').ok, true); // same evolution line is a different species
  assert.equal(b('oddish').ok, true); // Grass/Poison shares types
  assert.equal(b('squirtle').ok, false);
});

test('legendary cap per team', () => {
  const s = { ...getPreset('balanced')!.settings, draft: { order: 'linear' as const, pickTimerSec: 0 } };
  const state = room(s, [['a', 'articuno'], ['b', 'bulbasaur']]);
  const a = createPickChecker(state, 'a');
  assert.equal(a('zapdos').ok, false);
  assert.equal(a('pikachu').ok, true);
});

test('sanitizeSettings rejects junk', () => {
  const s = sanitizeSettings({ budget: 'lots', teamSize: 999, pool: { gens: [1, 42], types: ['Fire', 'Cheese'] }, pricing: { mode: 'weird' } });
  assert.equal(s.budget, 100);
  assert.equal(s.teamSize, 30);
  assert.deepEqual(s.pool.gens, [1]);
  assert.deepEqual(s.pool.types, ['Fire']);
  assert.equal(s.pricing.mode, 'standard');
});

test('price groups set category and custom prices; order and overrides decide conflicts', () => {
  const s = baseSettings();
  s.pool.categories.mega = 'allow';
  s.pricing.groups = [
    { id: 'c', name: 'Banned-ish', match: 'custom', pokemonIds: ['garchomp', 'mewtwo'], cost: 25 },
    { id: 'r', name: 'Box', match: 'restricted', pokemonIds: [], cost: 30 },
    { id: 'l', name: 'Legends', match: 'legendary', pokemonIds: [], cost: 12 },
    { id: 'u', name: 'UBs', match: 'ultraBeast', pokemonIds: [], cost: 9 },
    { id: 'p', name: 'Paradox', match: 'paradox', pokemonIds: [], cost: 11 },
    { id: 'm', name: 'Mythical', match: 'mythical', pokemonIds: [], cost: 13 },
  ];
  s.pricing.overrides = { lugia: 3 };
  const { costs } = getPool(s);
  assert.equal(costs.get('garchomp'), 25);
  assert.equal(costs.get('mewtwo'), 25); // custom group is listed first
  assert.equal(costs.get('rayquaza'), 30);
  assert.equal(costs.get('articuno'), 12); // sub-legendary, not box
  assert.equal(costs.get('nihilego'), 9);
  assert.equal(costs.get('greattusk'), 11);
  assert.equal(costs.get('mew'), 13);
  assert.equal(costs.get('lugia'), 3); // individual override beats group
  assert.equal(costs.get('pikachu'), standardCost('pikachu')); // untouched
});

test('sanitizeSettings cleans price groups', () => {
  const s = sanitizeSettings({ pricing: { groups: [
    { id: 'a', name: '', match: 'legendary', cost: 999 },
    { id: 'a', name: 'Mine', match: 'custom', pokemonIds: ['garchomp', 'notapokemon', 'garchomp'], cost: '7' },
    { id: 'x', match: 'weird', cost: 1 },
  ] } });
  assert.equal(s.pricing.groups.length, 2);
  assert.equal(s.pricing.groups[0].name, 'Legendary');
  assert.equal(s.pricing.groups[0].cost, 200);
  assert.notEqual(s.pricing.groups[1].id, s.pricing.groups[0].id);
  assert.deepEqual(s.pricing.groups[1].pokemonIds, ['garchomp']);
  assert.equal(s.pricing.groups[1].cost, 7);
});

test('alternate formes share their species legendary/mythical/UB/paradox tags', () => {
  const special = (p: (typeof POKEDEX)[number]) =>
    (['legendary', 'restricted', 'mythical', 'ultraBeast', 'paradox'] as const).filter((t) => p.tags[t]).join();
  const byName = new Map(POKEDEX.map((p) => [p.name, p]));
  for (const p of POKEDEX) {
    const base = p.forme ? byName.get(p.baseSpecies) : undefined;
    if (base) assert.equal(special(p), special(base), `${p.name} should match ${base.name}`);
  }
});

test('banning special categories removes every forme of those species', () => {
  const s = baseSettings();
  s.pool.categories = { ...s.pool.categories, legendary: 'ban', restricted: 'ban', mythical: 'ban', ultraBeast: 'ban', paradox: 'ban' };
  const pool = getPool(s).pokemon;
  const banned = ['landorustherian', 'kyuremblack', 'calyrexshadow', 'arceusfire', 'silvallyfire', 'articunogalar',
    'deoxysattack', 'necrozmaduskmane', 'urshifurapidstrike', 'ogerponwellspring', 'hoopaunbound', 'mewtwo', 'nihilego', 'greattusk', 'gougingfire', 'ragingbolt', 'ironboulder', 'ironcrown'];
  for (const id of banned) assert.ok(!pool.some((p) => p.id === id), `${id} should be banned`);
  assert.ok(pool.every((p) => !isLegendaryish(p) && !p.tags.ultraBeast && !p.tags.paradox));
  assert.ok(pool.some((p) => p.id === 'garchomp'));
  // Commoners Cup preset uses the same bans
  assert.ok(getPool(getPreset('commoners')!.settings).pokemon.every((p) => !isLegendaryish(p) && !p.tags.ultraBeast && !p.tags.paradox));
});
