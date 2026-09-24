import { useMemo, useState, type FormEvent } from 'react';
import { cloneSettings } from '../../../shared/formats.ts';
import { DEX_BY_ID } from '../../../shared/pokedex.ts';
import { priceGroupFor, priceSheet } from '../../../shared/pricing.ts';
import { analyzeFormat, getPool } from '../../../shared/rules.ts';
import type { FormatSettings, Pokemon, RoomState } from '../../../shared/types.ts';
import { PoolBrowser } from '../components/PoolBrowser.tsx';
import { PokemonDetail } from '../components/PokemonDetail.tsx';
import { SettingsEditor } from '../components/SettingsEditor.tsx';
import { useToast } from '../components/Toast.tsx';
import { describeFormat } from '../lib/describe.ts';
import type { Act } from '../pages/RoomPage.tsx';

interface Props { state: RoomState; me: string | null; act: Act }

export function LobbyView({ state, me, act }: Props) {
  const toast = useToast();
  const isHost = me === state.hostId;
  const [tab, setTab] = useState<'rules' | 'pool'>('rules');
  const [selected, setSelected] = useState<Pokemon | null>(null);
  const s = state.settings;
  const { pokemon, costs } = useMemo(() => getPool(s), [s]);
  const report = useMemo(() => analyzeFormat(s, state.players.length), [s, state.players.length]);
  const defaultCosts = useMemo(() => priceSheet(pokemon, { ...s.pricing, overrides: {} }), [pokemon, s.pricing]);

  const saveSettings = (next: FormatSettings) => act('room:settings', { settings: next });
  const move = (idx: number, dir: -1 | 1) => {
    const ids = state.players.map((p) => p.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    act('room:order', { order: ids });
  };
  const setPrice = (id: string, value: number | null) => {
    const next = cloneSettings(s);
    if (value === null || value === defaultCosts.get(id)) delete next.pricing.overrides[id];
    else next.pricing.overrides[id] = value;
    next.presetId = 'custom';
    saveSettings(next);
  };
  const toggleGroupMember = (groupId: string, pokemonId: string) => {
    const next = cloneSettings(s);
    next.pricing.groups = (next.pricing.groups ?? []).map((g) => g.id !== groupId ? g : {
      ...g,
      pokemonIds: g.pokemonIds.includes(pokemonId) ? g.pokemonIds.filter((x) => x !== pokemonId) : [...g.pokemonIds, pokemonId],
    });
    next.presetId = 'custom';
    saveSettings(next);
  };
  const setBanned = (id: string, banned: boolean) => {
    const next = cloneSettings(s);
    next.pool.bans = banned ? [...next.pool.bans, id] : next.pool.bans.filter((b) => b !== id);
    next.presetId = 'custom';
    saveSettings(next);
    setSelected(null);
  };

  const link = `${location.origin}/room/${state.code}`;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`, 'success'); }
    catch { toast(`Copy failed. ${what}: ${text}`, 'error'); }
  };

  return (
    <div className="lobby">
      <aside className="lobby-side">
        <div className="panel">
          <div className="room-code-label muted small">Room code</div>
          <button className="room-code" onClick={() => copy(state.code, 'Room code')} title="Copy code">{state.code}</button>
          <button className="btn ghost small full" onClick={() => copy(link, 'Invite link')}>Copy invite link</button>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Trainers <span className="muted">{state.players.length}/{s.maxPlayers}</span></h3>
          </div>
          <p className="muted small">Draft order, top picks first{s.draft.order === 'snake' ? ' (snakes back each round)' : ''}.</p>
          <ol className="players">
            {state.players.map((p, i) => (
              <li key={p.id} className={p.id === me ? 'me' : ''}>
                <span className={`dot${p.connected ? ' on' : ''}`} title={p.connected ? 'Online' : 'Offline'} />
                <span className="pname">{p.name}</span>
                {p.id === state.hostId && <span className="pill">Host</span>}
                {p.isBot && <span className="pill bot">Bot</span>}
                {p.local && <span className="pill local" title="Drafts on the host's device">Local</span>}
                {p.id === me && <span className="pill you">You</span>}
                {isHost && (
                  <span className="row-actions">
                    <button className="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                    <button className="icon" onClick={() => move(i, 1)} disabled={i === state.players.length - 1} aria-label="Move down">▼</button>
                    {p.id !== state.hostId && (
                      <button className="icon danger" onClick={() => act('room:kick', { playerId: p.id })} aria-label={`Remove ${p.name}`}>✕</button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {isHost && <AddLocalPlayer act={act} disabled={state.players.length >= s.maxPlayers} />}
          {isHost && (
            <div className="btn-row">
              <button className="btn small" onClick={() => act('room:addBot')} disabled={state.players.length >= s.maxPlayers}>+ Add bot</button>
              <button className="btn small" onClick={() => act('room:order', { order: 'shuffle' })}>Shuffle order</button>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>{s.name}</h3>
          <ul className="rule-list">{describeFormat(s).map((r) => <li key={r}>{r}</li>)}</ul>
          <div className="report">
            <div><strong>{report.poolSize}</strong><span>in pool</span></div>
            <div><strong>{report.avgCost.toFixed(1)}</strong><span>avg cost</span></div>
            <div><strong>{report.minTeamCost}</strong><span>cheapest team</span></div>
          </div>
          {report.problems.map((p) => <p key={p} className="error-text small">{p}</p>)}
          {isHost ? (
            <button className="btn primary full" disabled={state.players.length < 2 || report.problems.length > 0}
              onClick={() => act('draft:start')}>
              {state.players.length < 2 ? 'Need 2+ trainers to start' : 'Start draft'}
            </button>
          ) : (
            <p className="muted small center">Waiting for the host to start the draft...</p>
          )}
        </div>
      </aside>

      <section className="lobby-main">
        <div className="tabs">
          <button className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}>Rules & format</button>
          <button className={tab === 'pool' ? 'on' : ''} onClick={() => setTab('pool')}>Pool & prices ({pokemon.length})</button>
        </div>
        {!isHost && <p className="muted small">Only the host can change the format.</p>}

        {tab === 'rules' ? (
          <div className="panel">
            <SettingsEditor settings={s} editable={isHost} playerCount={state.players.length} onChange={saveSettings} />
          </div>
        ) : (
          <div className="panel">
            {isHost && <p className="muted small">Click a Pokemon to change its price or ban it from this draft.</p>}
            {s.pool.bans.length > 0 && (
              <div className="bans">
                <span className="field-label">Banned:</span>
                {s.pool.bans.map((id) => (
                  <span key={id} className="chip on">
                    {DEX_BY_ID.get(id)?.name ?? id}
                    {isHost && <button className="chip-x" onClick={() => setBanned(id, false)} aria-label="Unban">×</button>}
                  </span>
                ))}
              </div>
            )}
            <PoolBrowser pokemon={pokemon} costs={costs} onSelect={setSelected} selectedId={selected?.id}
              renderExtra={(p) => {
                if (s.pricing.overrides[p.id] !== undefined) return <span className="override-flag" title="Custom price">edited</span>;
                const g = priceGroupFor(p, s.pricing.groups ?? []);
                return g ? <span className="override-flag" title={`Priced by group: ${g.name}`}>{g.name}</span> : null;
              }} />
          </div>
        )}
      </section>

      {selected && (
        <PokemonDetail p={selected} cost={costs.get(selected.id) ?? 0} onClose={() => setSelected(null)}>
          <GroupInfo p={selected} settings={s} editable={isHost} hasOverride={s.pricing.overrides[selected.id] !== undefined}
            onToggle={toggleGroupMember} />
          {isHost && (
            <PriceEditor key={selected.id} cost={costs.get(selected.id) ?? 0} defaultCost={defaultCosts.get(selected.id) ?? 0}
              onSave={(v) => setPrice(selected.id, v)} onBan={() => setBanned(selected.id, true)} />
          )}
        </PokemonDetail>
      )}
    </div>
  );
}

function PriceEditor({ cost, defaultCost, onSave, onBan }: {
  cost: number; defaultCost: number; onSave: (v: number | null) => void; onBan: () => void;
}) {
  const [value, setValue] = useState(String(cost));
  const n = Math.round(Number(value));
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 200;
  return (
    <div className="price-editor">
      <label className="inline">Price
        <input type="number" className="num" min={0} max={200} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn small primary" disabled={!valid || n === cost} onClick={() => onSave(n)}>Save price</button>
      {cost !== defaultCost && <button className="btn small ghost" onClick={() => onSave(null)}>Reset to {defaultCost}</button>}
      <button className="btn small danger" onClick={onBan}>Ban from pool</button>
    </div>
  );
}

function GroupInfo({ p, settings, editable, hasOverride, onToggle }: {
  p: Pokemon; settings: FormatSettings; editable: boolean; hasOverride: boolean;
  onToggle: (groupId: string, pokemonId: string) => void;
}) {
  const groups = settings.pricing.groups ?? [];
  const active = priceGroupFor(p, groups);
  const custom = groups.filter((g) => g.match === 'custom');
  if (!active && !(editable && custom.length)) return null;
  return (
    <div className="group-info">
      {active && (
        <p className="small">
          Price group: <strong>{active.name}</strong> ({active.cost} pts)
          {hasOverride && <span className="muted"> (overridden by this Pokemon's own price)</span>}
        </p>
      )}
      {editable && custom.length > 0 && (
        <div className="group-toggles">
          <span className="muted small">Custom groups:</span>
          {custom.map((g) => (
            <label key={g.id} className="check small">
              <input type="checkbox" checked={g.pokemonIds.includes(p.id)} onChange={() => onToggle(g.id, p.id)} />
              {g.name} <span className="muted">({g.cost} pts)</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Adds a pass-and-play seat drafted from the host's device. */
function AddLocalPlayer({ act, disabled }: { act: Act; disabled: boolean }) {
  const [name, setName] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && (await act('room:addLocal', { name }))) setName('');
  };
  return (
    <form className="add-local" onSubmit={submit}>
      <input type="text" value={name} maxLength={24} placeholder="Local player name" disabled={disabled}
        onChange={(e) => setName(e.target.value)} aria-label="Local player name" />
      <button className="btn small" disabled={disabled || !name.trim()}>+ Add local player</button>
    </form>
  );
}
