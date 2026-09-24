import { useEffect, useMemo, useState } from 'react';
import { createSavedGroup, listSavedGroups, updateSavedGroup } from '../lib/library.ts';
import { MemberPreview } from './MemberPreview.tsx';
import { PokemonPicker } from './PokemonPicker.tsx';
import { useToast } from './Toast.tsx';
import { MAX_PRICE_GROUPS } from '../../../shared/formats.ts';
import { POKEDEX } from '../../../shared/pokedex.ts';
import { priceGroupFor } from '../../../shared/pricing.ts';
import { getPool } from '../../../shared/rules.ts';
import { PRICE_GROUP_MATCHES, type FormatSettings, type PriceGroup, type PriceGroupMatch, type SavedPriceGroup } from '../../../shared/types.ts';
import { Sprite } from './Poke.tsx';

interface Props {
  settings: FormatSettings;
  editable: boolean;
  onChange: (groups: PriceGroup[]) => void;
}

const newId = () => Math.random().toString(36).slice(2, 10);

/** Default cost suggested when a built-in group is added. */
const SUGGESTED_COST: Record<Exclude<PriceGroupMatch, 'custom'>, number> = {
  restricted: 20, legendary: 14, mythical: 15, ultraBeast: 12, paradox: 12, mega: 16,
};

export function PriceGroupsEditor({ settings, editable, onChange }: Props) {
  const groups = settings.pricing.groups ?? [];
  const pool = useMemo(() => getPool(settings).pokemon, [settings]);
  const poolIds = useMemo(() => new Set(pool.map((p) => p.id)), [pool]);

  // How many pool Pokemon each group actually prices (earlier groups win overlaps)
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of pool) {
      const g = priceGroupFor(p, groups);
      if (g) c.set(g.id, (c.get(g.id) ?? 0) + 1);
    }
    return c;
  }, [pool, groups]);

  const update = (id: string, patch: Partial<PriceGroup>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const remove = (id: string) => onChange(groups.filter((g) => g.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...groups];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const addBuiltIn = (match: Exclude<PriceGroupMatch, 'custom'>) => {
    const label = PRICE_GROUP_MATCHES.find((m) => m.id === match)!.label;
    onChange([...groups, { id: newId(), name: label, match, pokemonIds: [], cost: SUGGESTED_COST[match] }]);
  };
  // Custom groups go first so hand-picked prices beat broad categories
  const addCustom = () =>
    onChange([{ id: newId(), name: `Custom group ${groups.filter((g) => g.match === 'custom').length + 1}`, match: 'custom', pokemonIds: [], cost: 10 }, ...groups]);

  const full = groups.length >= MAX_PRICE_GROUPS;

  // Server-wide saved groups
  const toast = useToast();
  const [library, setLibrary] = useState<SavedPriceGroup[] | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const openLibrary = () => {
    setShowLibrary((x) => !x);
    listSavedGroups().then(setLibrary).catch((e: Error) => toast(e.message, 'error'));
  };
  const addFromLibrary = (sg: SavedPriceGroup) => {
    onChange([{ id: newId(), name: sg.name, match: 'custom', pokemonIds: [...sg.pokemonIds], cost: sg.cost, libraryId: sg.id }, ...groups]);
    toast(`Loaded "${sg.name}" (${sg.pokemonIds.length} Pokemon at ${sg.cost} pts)`, 'success');
  };
  const saveToLibrary = async (g: PriceGroup) => {
    const input = { name: g.name, cost: g.cost, pokemonIds: g.pokemonIds };
    try {
      let saved: SavedPriceGroup;
      try {
        if (!g.libraryId) throw new Error('not found');
        saved = await updateSavedGroup(g.libraryId, input);
      } catch (err) {
        if (!/not found/i.test((err as Error).message)) throw err;
        saved = await createSavedGroup(input);
      }
      if (saved.id !== g.libraryId) update(g.id, { libraryId: saved.id });
      toast(`Saved "${saved.name}" to your price groups`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <div className="price-groups">
      <div className="pg-intro">
        <strong>Price groups</strong>
        <span className="muted small">
          Set a fixed cost for a whole category, or make your own group and add Pokemon to it.
          If a Pokemon is in several groups, the group highest in the list sets its price. A price set on a single Pokemon beats any group.
        </span>
      </div>

      {groups.length > 0 && (
        <ol className="pg-list">
          {groups.map((g, i) => (
            <li key={g.id} className="pg-item">
              <div className="pg-row">
                <span className="pg-rank">{i + 1}</span>
                <GroupName value={g.name} disabled={!editable} onCommit={(name) => update(g.id, { name })} />
                <span className="pill">{g.match === 'custom' ? 'Custom' : PRICE_GROUP_MATCHES.find((m) => m.id === g.match)?.label}</span>
                <label className="inline pg-cost">
                  <CostInput value={g.cost} disabled={!editable} onCommit={(cost) => update(g.id, { cost })} /> pts
                </label>
                <span className="muted small pg-count">{counts.get(g.id) ?? 0} in pool</span>
                {editable && (
                  <span className="row-actions">
                    <button className="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Higher priority">▲</button>
                    <button className="icon" onClick={() => move(i, 1)} disabled={i === groups.length - 1} aria-label="Lower priority">▼</button>
                    <button className="icon danger" onClick={() => remove(g.id)} aria-label={`Delete ${g.name}`}>✕</button>
                  </span>
                )}
              </div>
              {g.match === 'custom' && (
                <CustomMembers group={g} editable={editable} poolIds={poolIds}
                  onChange={(pokemonIds) => update(g.id, { pokemonIds })} onSave={() => saveToLibrary(g)} />
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && (
        <div className="chips pg-add">
          <button className="chip on" onClick={addCustom} disabled={full}>+ Custom group</button>
          <button className="chip on" onClick={openLibrary} disabled={full} aria-expanded={showLibrary}>+ From saved groups</button>
          {PRICE_GROUP_MATCHES.map((m) => (
            <button key={m.id} className="chip" title={m.hint} onClick={() => addBuiltIn(m.id)}
              disabled={full || groups.some((g) => g.match === m.id)}>
              + {m.label}
            </button>
          ))}
        </div>
      )}
      {editable && showLibrary && (
        <div className="library-menu">
          {library === null && <span className="muted small">Loading saved groups...</span>}
          {library?.length === 0 && (
            <span className="muted small">No saved groups yet. Save a custom group here, or create some on the <a href="/groups" target="_blank" rel="noreferrer">Price groups page</a>.</span>
          )}
          {library?.map((sg) => {
            const loaded = groups.some((g) => g.libraryId === sg.id);
            return (
              <button key={sg.id} className="library-item" onClick={() => addFromLibrary(sg)} disabled={loaded || full}>
                <strong>{sg.name}</strong>
                <span className="muted small">{sg.pokemonIds.length} Pokemon · {sg.cost} pts{loaded ? ' · already added' : ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomMembers({ group, editable, poolIds, onChange, onSave }: {
  group: PriceGroup; editable: boolean; poolIds: Set<string>; onChange: (ids: string[]) => void; onSave: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const q = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (q.length < 2) return [];
    return POKEDEX.filter((p) => p.name.toLowerCase().includes(q) && !group.pokemonIds.includes(p.id))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
      .slice(0, 8);
  }, [q, group.pokemonIds]);

  const add = (id: string) => { onChange([...group.pokemonIds, id]); setQuery(''); };

  return (
    <div className="pg-members">
      <MemberPreview ids={group.pokemonIds} outside={(id) => !poolIds.has(id)}
        onRemove={editable ? (id) => onChange(group.pokemonIds.filter((x) => x !== id)) : undefined} />
      {editable && (
        <div className="pg-member-actions">
          <button className="btn small" onClick={() => setPicking(true)}>Select Pokemon ({group.pokemonIds.length})</button>
          <div className="pg-search">
            <input type="search" placeholder="Quick add..." value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && suggestions[0]) { e.preventDefault(); add(suggestions[0].id); } }} />
            {suggestions.length > 0 && (
              <ul className="suggest">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => add(p.id)}>
                      <Sprite p={p} size={24} /> {p.name}
                      {!poolIds.has(p.id) && <span className="muted small"> (not in pool)</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn small ghost" onClick={onSave} disabled={!group.pokemonIds.length}
            title="Save this group on the server so it can be reused in other drafts">
            {group.libraryId ? 'Update saved group' : 'Save to library'}
          </button>
        </div>
      )}
      {picking && (
        <PokemonPicker title={`Pokemon in “${group.name}” (${group.cost} pts each)`} initial={group.pokemonIds}
          onDone={(ids) => { onChange(ids); setPicking(false); }} onCancel={() => setPicking(false)} />
      )}
    </div>
  );
}

function GroupName({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { const t = text.trim(); if (t && t !== value) onCommit(t.slice(0, 30)); else setText(value); };
  return (
    <input type="text" className="pg-name" value={text} maxLength={30} disabled={disabled} aria-label="Group name"
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

function CostInput({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (text.trim() === '' || !Number.isFinite(n)) return setText(String(value));
    const clamped = Math.min(200, Math.max(0, n));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <input type="number" className="num pg-cost-input" min={0} max={200} value={text} disabled={disabled} aria-label="Group cost"
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
