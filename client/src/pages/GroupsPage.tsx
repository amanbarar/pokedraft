import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SavedPriceGroup } from '../../../shared/types.ts';
import { MemberPreview } from '../components/MemberPreview.tsx';
import { PokemonPicker } from '../components/PokemonPicker.tsx';
import { useToast } from '../components/Toast.tsx';
import { createSavedGroup, deleteSavedGroup, listSavedGroups, updateSavedGroup, type GroupInput } from '../lib/library.ts';

/** Manage the server-wide library of custom price groups. */
export function GroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<SavedPriceGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedPriceGroup | 'new' | null>(null);

  const refresh = useCallback(() => {
    listSavedGroups().then((g) => { setGroups(g); setLoadError(null); }).catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(refresh, [refresh]);

  const save = async (input: GroupInput) => {
    try {
      if (editing === 'new') await createSavedGroup(input);
      else if (editing) await updateSavedGroup(editing.id, input);
      toast(`Saved "${input.name}"`, 'success');
      setEditing(null);
      refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const remove = async (g: SavedPriceGroup) => {
    try {
      await deleteSavedGroup(g.id);
      toast(`Deleted "${g.name}"`, 'success');
      refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <div className="groups-page">
      <div className="page-head">
        <div>
          <h1>Saved price groups</h1>
          <p className="muted">
            Build reusable groups of Pokemon that all cost the same, e.g. “OU threats = 18” or “Budget picks = 2”.
            They are saved on the server and can be loaded into any draft lobby under Rules → Pricing.
          </p>
        </div>
        {editing === null && <button className="btn primary" onClick={() => setEditing('new')}>+ New group</button>}
      </div>

      {editing !== null && (
        <GroupForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing}
          onSave={save} onCancel={() => setEditing(null)} />
      )}

      {loadError && <p className="error-text">{loadError}</p>}
      {groups === null && !loadError && <p className="muted">Loading...</p>}
      {groups?.length === 0 && editing === null && (
        <div className="panel empty">No saved groups yet. Create one to reuse custom prices across drafts.</div>
      )}
      <div className="saved-groups">
        {groups?.map((g) => (
          <div key={g.id} className="panel saved-group">
            <div className="panel-head">
              <h3>{g.name}</h3>
              <span className="cost cost-md" title="Cost of every Pokemon in this group">{g.cost}</span>
            </div>
            <p className="muted small">{g.pokemonIds.length} Pokemon · updated {new Date(g.updatedAt).toLocaleDateString()}</p>
            <MemberPreview ids={g.pokemonIds} max={12} />
            <div className="btn-row">
              <button className="btn small" onClick={() => setEditing(g)}>Edit</button>
              <ConfirmDelete onConfirm={() => remove(g)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupForm({ initial, onSave, onCancel }: {
  initial: SavedPriceGroup | null;
  onSave: (g: GroupInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cost, setCost] = useState(String(initial?.cost ?? 10));
  const [ids, setIds] = useState<string[]>(initial?.pokemonIds ?? []);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = Math.round(Number(cost));
  const valid = name.trim() && cost.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 200;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    await onSave({ name: name.trim(), cost: n, pokemonIds: ids });
    setBusy(false);
  };

  return (
    <>
    <form className="panel group-form" onSubmit={submit}>
      <h3>{initial ? `Edit “${initial.name}”` : 'New price group'}</h3>
      <div className="fields">
        <label>Group name
          <input type="text" value={name} maxLength={30} placeholder="e.g. OU threats" onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>Cost per Pokemon
          <input type="number" className="num" min={0} max={200} value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        <button type="button" className="btn" onClick={() => setPicking(true)}>
          Select Pokemon ({ids.length})
        </button>
      </div>
      <MemberPreview ids={ids} onRemove={(id) => setIds((xs) => xs.filter((x) => x !== id))} />
      <div className="btn-row">
        <button className="btn primary" disabled={!valid || busy}>{busy ? 'Saving...' : 'Save group'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
    {/* Rendered outside the form so the picker's buttons don't submit it */}
    {picking && (
      <PokemonPicker title={`Pokemon in “${name || 'new group'}”`} initial={ids}
        onDone={(next) => { setIds(next); setPicking(false); }} onCancel={() => setPicking(false)} />
    )}
    </>
  );
}

function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`btn small ${armed ? 'danger' : 'ghost'}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Click again to delete' : 'Delete'}
    </button>
  );
}
