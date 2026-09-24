import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { isLegendaryish } from '../../../shared/pokedex.ts';
import type { PickVerdict } from '../../../shared/rules.ts';
import { GENS, TYPES, type Pokemon, type TypeName } from '../../../shared/types.ts';
import { CostBadge, Sprite, TypeBadge, Types } from './Poke.tsx';

export interface CardStatus {
  takenBy?: string;
  verdict?: PickVerdict;
}

type Sort = 'cost-desc' | 'cost-asc' | 'bst' | 'speed' | 'dex' | 'name';
type Avail = 'all' | 'available' | 'legal';
type Cat = 'any' | 'legend' | 'nonlegend' | 'beast' | 'mega' | 'regional';

interface Props {
  pokemon: Pokemon[];
  costs: Map<string, number>;
  status?: (p: Pokemon) => CardStatus;
  onSelect?: (p: Pokemon) => void;
  selectedId?: string | null;
  /** Extra per-card content (e.g. host price editor) */
  renderExtra?: (p: Pokemon) => ReactNode;
  toolbarExtra?: ReactNode;
  defaultAvail?: Avail;
  /** Multi-select mode: ids shown as ticked */
  picked?: Set<string>;
  /** Rendered above the grid with the current filtered list (e.g. "select all shown") */
  renderSelectionBar?: (filtered: Pokemon[]) => ReactNode;
}

const PAGE = 120;

export function PoolBrowser({
  pokemon, costs, status, onSelect, selectedId, renderExtra, toolbarExtra, defaultAvail = 'all', picked, renderSelectionBar,
}: Props) {
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<TypeName[]>([]);
  const [gen, setGen] = useState(0);
  const [cat, setCat] = useState<Cat>('any');
  const [stage, setStage] = useState('any');
  const [maxCost, setMaxCost] = useState('');
  const [avail, setAvail] = useState<Avail>(status ? defaultAvail : 'all');
  const [sort, setSort] = useState<Sort>('cost-desc');
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(() => {
    const max = maxCost === '' ? Infinity : Number(maxCost);
    const list = pokemon.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.abilities.some((a) => a.toLowerCase().includes(q))) return false;
      if (types.length && !types.every((t) => p.types.includes(t))) return false;
      if (gen && p.gen !== gen) return false;
      if (stage !== 'any' && p.stage !== stage) return false;
      if ((costs.get(p.id) ?? 0) > max) return false;
      switch (cat) {
        case 'legend': if (!isLegendaryish(p)) return false; break;
        case 'nonlegend': if (isLegendaryish(p) || p.tags.ultraBeast || p.tags.paradox) return false; break;
        case 'beast': if (!p.tags.ultraBeast && !p.tags.paradox) return false; break;
        case 'mega': if (!p.tags.mega) return false; break;
        case 'regional': if (!p.tags.regional) return false; break;
      }
      if (status && avail !== 'all') {
        const s = status(p);
        if (s.takenBy) return false;
        if (avail === 'legal' && s.verdict && !s.verdict.ok) return false;
      }
      return true;
    });
    const cost = (p: Pokemon) => costs.get(p.id) ?? 0;
    const sorters: Record<Sort, (a: Pokemon, b: Pokemon) => number> = {
      'cost-desc': (a, b) => cost(b) - cost(a) || b.bst - a.bst,
      'cost-asc': (a, b) => cost(a) - cost(b) || b.bst - a.bst,
      bst: (a, b) => b.bst - a.bst,
      speed: (a, b) => b.stats.spe - a.stats.spe,
      dex: (a, b) => a.num - b.num,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(sorters[sort]);
  }, [pokemon, costs, q, types, gen, cat, stage, maxCost, avail, sort, status]);

  const toggleType = (t: TypeName) =>
    setTypes((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : xs.length >= 2 ? [xs[1], t] : [...xs, t]));
  const clear = () => { setQuery(''); setTypes([]); setGen(0); setCat('any'); setStage('any'); setMaxCost(''); };
  const anyFilter = query || types.length || gen || cat !== 'any' || stage !== 'any' || maxCost !== '';

  return (
    <div className="pool">
      <div className="pool-toolbar">
        <input className="search" type="search" placeholder="Search Pokemon or ability..." value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        <select value={gen} onChange={(e) => setGen(Number(e.target.value))} aria-label="Generation">
          <option value={0}>All gens</option>
          {GENS.map((g) => <option key={g} value={g}>Gen {g}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value as Cat)} aria-label="Category">
          <option value="any">All categories</option>
          <option value="legend">Legendary / Mythical</option>
          <option value="nonlegend">Non-legendary</option>
          <option value="beast">Ultra Beast / Paradox</option>
          <option value="mega">Mega / Primal</option>
          <option value="regional">Regional forms</option>
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Evolution stage">
          <option value="any">Any stage</option>
          <option value="final">Fully evolved</option>
          <option value="single">No evolutions</option>
          <option value="middle">Middle stage</option>
          <option value="basic">Unevolved</option>
          <option value="mega">Mega</option>
        </select>
        <input className="num" type="number" min={0} placeholder="Max pts" value={maxCost}
          onChange={(e) => setMaxCost(e.target.value)} aria-label="Maximum cost" />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="cost-desc">Cost: high to low</option>
          <option value="cost-asc">Cost: low to high</option>
          <option value="bst">Base stat total</option>
          <option value="speed">Speed</option>
          <option value="dex">Dex number</option>
          <option value="name">Name</option>
        </select>
        {status && (
          <div className="seg" role="group" aria-label="Availability">
            {(['all', 'available', 'legal'] as Avail[]).map((a) => (
              <button key={a} className={avail === a ? 'on' : ''} onClick={() => setAvail(a)}>
                {a === 'all' ? 'All' : a === 'available' ? 'Undrafted' : 'Legal picks'}
              </button>
            ))}
          </div>
        )}
        {toolbarExtra}
      </div>
      <div className="type-filter">
        {TYPES.map((t) => (
          <button key={t} className={`type-chip${types.includes(t) ? ' on' : ''}${types.length && !types.includes(t) ? ' off' : ''}`}
            onClick={() => toggleType(t)}>
            <TypeBadge type={t} small />
          </button>
        ))}
        <span className="muted count">{filtered.length} of {pokemon.length}</span>
        {anyFilter ? <button className="link" onClick={clear}>Clear filters</button> : null}
      </div>

      {renderSelectionBar?.(filtered)}
      <div className="grid">
        {filtered.slice(0, limit).map((p) => {
          const s = status?.(p) ?? {};
          const cost = costs.get(p.id) ?? 0;
          const blocked = !!s.takenBy || (s.verdict && !s.verdict.ok);
          const title = s.takenBy ? `Drafted by ${s.takenBy}` : s.verdict && !s.verdict.ok ? s.verdict.reason : `${p.name} - ${cost} pts`;
          return (
            <div key={p.id} className={`card${blocked ? ' blocked' : ''}${s.takenBy ? ' taken' : ''}${selectedId === p.id ? ' selected' : ''}${picked?.has(p.id) ? ' picked' : ''}`}
              title={title}>
              <button className="card-main" onClick={() => onSelect?.(p)} disabled={!onSelect} aria-pressed={picked ? picked.has(p.id) : undefined}>
                <CostBadge cost={cost} dim={blocked} />
                <Sprite p={p} size={72} />
                <span className="card-name">{p.name}</span>
                <Types p={p} small />
                <span className="card-meta">BST {p.bst} · Gen {p.gen}</span>
                {s.takenBy && <span className="card-flag">{s.takenBy}</span>}
                {picked && <span className="pick-check" aria-hidden>{picked.has(p.id) ? '✓' : ''}</span>}
              </button>
              {renderExtra?.(p)}
            </div>
          );
        })}
      </div>
      {filtered.length > limit && (
        <button className="btn ghost more" onClick={() => setLimit((l) => l + PAGE * 2)}>
          Show more ({filtered.length - limit} left)
        </button>
      )}
      {!filtered.length && <p className="empty">No Pokemon match these filters.</p>}
    </div>
  );
}
