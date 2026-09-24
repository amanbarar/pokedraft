// Builds shared/data/pokedex.json from Pokemon Showdown's public data.
// Run with: npm run data   (only needed to refresh the bundled dataset)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'shared', 'data', 'pokedex.json');
const BASE = 'https://play.pokemonshowdown.com/data';

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

const dex = JSON.parse(await getText(`${BASE}/pokedex.json`));
const fmtModule = { exports: {} };
new Function('exports', await getText(`${BASE}/formats-data.js`))(fmtModule.exports);
const formats = fmtModule.exports.BattleFormatsData;

const toId = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function genFromNum(n) {
  if (n <= 151) return 1;
  if (n <= 251) return 2;
  if (n <= 386) return 3;
  if (n <= 493) return 4;
  if (n <= 649) return 5;
  if (n <= 721) return 6;
  if (n <= 809) return 7;
  if (n <= 905) return 8;
  return 9;
}

const FORM_GEN = { Alola: 7, Galar: 8, Hisui: 8, Paldea: 9, Mega: 6, Primal: 6 };

// Tags Showdown's data leaves out (the Scarlet/Violet DLC Paradox Pokemon)
const TAG_FIXES = {
  gougingfire: ['Paradox'], ragingbolt: ['Paradox'], ironboulder: ['Paradox'], ironcrown: ['Paradox'],
};

const EXCLUDED_NONSTANDARD = new Set(['CAP', 'Custom', 'Future', 'LGPE', 'Unobtainable']);
const EXCLUDED_TAGS = new Set(['Pokestar', 'Past Unobtainable']);

function isExcluded(key, p, fd) {
  if (p.num <= 0 || !p.baseStats) return true;
  const nonstd = fd.isNonstandard ?? p.isNonstandard;
  if (nonstd && EXCLUDED_NONSTANDARD.has(nonstd)) return true;
  if ((p.tags ?? []).some((t) => EXCLUDED_TAGS.has(t))) return true;
  const forme = p.forme ?? '';
  if (/Gmax|Totem/.test(forme)) return true;
  // Pikachu cosplay/cap formes are gimmicks, not draftable species
  if (p.baseSpecies === 'Pikachu') return true;
  // In-battle transformations (Zen Mode, Blade Forme, ...) except Megas/Primals
  const isMega = /^Mega|Primal/.test(forme);
  if (p.battleOnly && !isMega) return true;
  // Cosmetic variants (identical types and stats to the base forme) are duplicates
  const base = p.baseSpecies && dex[toId(p.baseSpecies)];
  if (base && !isMega && JSON.stringify(base.types) === JSON.stringify(p.types) &&
      JSON.stringify(base.baseStats) === JSON.stringify(p.baseStats)) return true;
  return false;
}

const out = [];
for (const [key, p] of Object.entries(dex)) {
  const fd = formats[key] ?? {};
  if (isExcluded(key, p, fd)) continue;

  const forme = p.forme ?? '';
  const formeRoot = forme.split('-')[0];
  // Showdown only tags the base forme; alternate formes (Landorus-Therian,
  // Arceus-Fire, Mewtwo-Mega-X...) inherit their species' legendary status.
  const baseEntry = p.baseSpecies ? dex[toId(p.baseSpecies)] : undefined;
  const tags = [...(p.tags ?? baseEntry?.tags ?? []), ...(TAG_FIXES[toId(p.baseSpecies ?? p.name)] ?? [])];
  const isMega = /^Mega/.test(forme) || formeRoot === 'Primal';
  const isRegional = ['Alola', 'Galar', 'Hisui', 'Paldea'].includes(formeRoot);

  // Evolution data lives on the base forme for alternate formes (e.g. Megas)
  const hasEvos = (p.evos ?? []).length > 0;
  const hasPrevo = !!p.prevo;
  let stage;
  if (isMega) stage = 'mega';
  else if (!hasPrevo && !hasEvos) stage = 'single';
  else if (!hasPrevo) stage = 'basic';
  else if (hasEvos) stage = 'middle';
  else stage = 'final';

  const s = p.baseStats;
  const bst = s.hp + s.atk + s.def + s.spa + s.spd + s.spe;

  out.push({
    id: key,
    name: p.name,
    num: p.num,
    gen: FORM_GEN[formeRoot] ?? genFromNum(p.num),
    types: p.types,
    stats: s,
    bst,
    abilities: Object.values(p.abilities ?? {}),
    baseSpecies: p.baseSpecies ?? p.name,
    forme: forme || null,
    stage,
    prevo: p.prevo ? toId(p.prevo) : null,
    evos: (p.evos ?? []).map(toId),
    tier: fd.tier ?? p.tier ?? null,
    natDexTier: fd.natDexTier ?? null,
    tags: {
      legendary: tags.includes('Sub-Legendary') || tags.includes('Restricted Legendary'),
      restricted: tags.includes('Restricted Legendary'),
      mythical: tags.includes('Mythical'),
      ultraBeast: tags.includes('Ultra Beast'),
      paradox: tags.includes('Paradox'),
      mega: isMega,
      regional: isRegional,
    },
    sprite: (p.forme && p.baseSpecies ? toId(p.baseSpecies) + '-' + toId(p.forme) : key),
  });
}

out.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${out.length} Pokemon to ${OUT}`);
