import { useMemo, useState } from 'react';
import { PRESETS } from '../../../shared/formats.ts';
import { getPool } from '../../../shared/rules.ts';
import type { Pokemon } from '../../../shared/types.ts';
import { PoolBrowser } from '../components/PoolBrowser.tsx';
import { PokemonDetail } from '../components/PokemonDetail.tsx';

/** Browse every format's pool and price list. */
export function DexPage() {
  const [presetId, setPresetId] = useState('standard');
  const [selected, setSelected] = useState<Pokemon | null>(null);
  const settings = PRESETS.find((p) => p.id === presetId)!.settings;
  const { pokemon, costs } = useMemo(() => getPool(settings), [settings]);

  return (
    <div className="dex-page">
      <div className="page-head">
        <div>
          <h1>Price list</h1>
          <p className="muted">Browse each format's draft pool and what every Pokemon costs.</p>
        </div>
        <label className="inline">Format
          <select value={presetId} onChange={(e) => { setPresetId(e.target.value); setSelected(null); }}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <PoolBrowser pokemon={pokemon} costs={costs} onSelect={setSelected} selectedId={selected?.id} />
      {selected && <PokemonDetail p={selected} cost={costs.get(selected.id) ?? 0} onClose={() => setSelected(null)} />}
    </div>
  );
}
