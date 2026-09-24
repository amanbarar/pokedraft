import { useEffect, useMemo, useState } from 'react';
import { POKEDEX } from '../../../shared/pokedex.ts';
import { STANDARD_COSTS } from '../../../shared/pricing.ts';
import type { Pokemon } from '../../../shared/types.ts';
import { PoolBrowser } from './PoolBrowser.tsx';

interface Props {
  title: string;
  initial: string[];
  /** Pokemon to choose from (defaults to the whole Pokedex) */
  pokemon?: Pokemon[];
  onDone: (ids: string[]) => void;
  onCancel: () => void;
}

/** Full-screen multi-select over the Pokedex with all pool filters. */
export function PokemonPicker({ title, initial, pokemon = POKEDEX, onDone, onCancel }: Props) {
  const [picked, setPicked] = useState(() => new Set(initial));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onCancel]);

  const toggle = (p: Pokemon) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
    return next;
  });
  const addAll = (list: Pokemon[]) => setPicked((prev) => new Set([...prev, ...list.map((p) => p.id)]));
  const removeAll = (list: Pokemon[]) => setPicked((prev) => {
    const next = new Set(prev);
    for (const p of list) next.delete(p.id);
    return next;
  });

  // Keep the original dex order for output; ids outside the list are preserved too
  const ordered = useMemo(() => {
    const inList = pokemon.filter((p) => picked.has(p.id)).map((p) => p.id);
    const outside = [...picked].filter((id) => !pokemon.some((p) => p.id === id));
    return [...inList, ...outside];
  }, [picked, pokemon]);

  return (
    <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="picker">
        <header className="picker-head">
          <div>
            <h2>{title}</h2>
            <p className="muted small">Filter, then click Pokemon to tick them, or use “Select all matching”. Prices shown are standard costs.</p>
          </div>
          <div className="btn-row">
            <span className="picked-count"><strong>{picked.size}</strong> selected</span>
            <button className="btn ghost" onClick={onCancel}>Cancel</button>
            <button className="btn primary" onClick={() => onDone(ordered)}>Done</button>
          </div>
        </header>
        <div className="picker-body">
          <PoolBrowser
            pokemon={pokemon}
            costs={STANDARD_COSTS}
            onSelect={toggle}
            picked={picked}
            renderSelectionBar={(filtered) => {
              const shownPicked = filtered.filter((p) => picked.has(p.id)).length;
              return (
                <div className="selection-bar">
                  <button className="btn small" onClick={() => addAll(filtered)} disabled={shownPicked === filtered.length}>
                    Select all matching ({filtered.length})
                  </button>
                  <button className="btn small ghost" onClick={() => removeAll(filtered)} disabled={!shownPicked}>
                    Deselect matching ({shownPicked})
                  </button>
                  <button className="btn small ghost" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear all</button>
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
