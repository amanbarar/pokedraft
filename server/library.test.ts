import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PriceGroupLibrary } from './library.ts';

function tempFile() {
  const dir = mkdtempSync(join(tmpdir(), 'pokedraft-lib-'));
  return { file: join(dir, 'nested', 'price-groups.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('saved price groups persist across restarts', () => {
  const { file, cleanup } = tempFile();
  try {
    const lib = new PriceGroupLibrary(file);
    const g = lib.create({ name: '  OU threats ', cost: 18, pokemonIds: ['garchomp', 'dragapult', 'garchomp', 'fakemon'] });
    assert.equal(g.name, 'OU threats');
    assert.deepEqual(g.pokemonIds, ['garchomp', 'dragapult']);
    lib.update(g.id, { name: 'OU threats', cost: 19, pokemonIds: ['garchomp'] });
    lib.create({ name: 'Cheap picks', cost: 2, pokemonIds: ['magikarp'] });

    const reloaded = new PriceGroupLibrary(file); // simulates a server restart
    const names = reloaded.list().map((x) => x.name).sort();
    assert.deepEqual(names, ['Cheap picks', 'OU threats']);
    assert.equal(reloaded.get(g.id).cost, 19);
    assert.deepEqual(reloaded.get(g.id).pokemonIds, ['garchomp']);

    reloaded.remove(g.id);
    assert.equal(new PriceGroupLibrary(file).list().length, 1);
  } finally {
    cleanup();
  }
});

test('library validates input', () => {
  const { file, cleanup } = tempFile();
  try {
    const lib = new PriceGroupLibrary(file);
    assert.throws(() => lib.create({ name: '', cost: 5 }), /name/);
    assert.throws(() => lib.create({ name: 'X', cost: 500 }), /between 0 and 200/);
    lib.create({ name: 'Dupes', cost: 5 });
    assert.throws(() => lib.create({ name: 'dupes', cost: 5 }), /already exists/);
    assert.throws(() => lib.update('nope', { name: 'Y', cost: 1 }), /not found/);
  } finally {
    cleanup();
  }
});
