import { useEffect, useState } from 'react';
import { PRESETS, cloneSettings } from '../../../shared/formats.ts';
import { CATEGORIES, GENS, STAGES, TYPES, type CategoryRule, type FormatSettings, type Stage, type TypeName } from '../../../shared/types.ts';
import { TypeBadge } from './Poke.tsx';
import { PriceGroupsEditor } from './PriceGroupsEditor.tsx';

interface Props {
  settings: FormatSettings;
  editable: boolean;
  playerCount: number;
  onChange: (next: FormatSettings) => void;
}

/** Number input that commits on blur/Enter so typing does not spam the server. */
function NumberField({ value, onCommit, min, max, allowEmpty, placeholder, disabled }: {
  value: number | null; onCommit: (v: number | null) => void; min?: number; max?: number;
  allowEmpty?: boolean; placeholder?: string; disabled?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    if (text.trim() === '') { if (allowEmpty) onCommit(null); else setText(String(value ?? '')); return; }
    let n = Math.round(Number(text));
    if (!Number.isFinite(n)) { setText(String(value ?? '')); return; }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input type="number" className="num" value={text} min={min} max={max} placeholder={placeholder} disabled={disabled}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

function TextField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { const t = text.trim(); if (t && t !== value) onCommit(t); else setText(value); };
  return (
    <input type="text" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function SettingsEditor({ settings: s, editable, playerCount, onChange }: Props) {
  const update = (fn: (draft: FormatSettings) => void) => {
    const next = cloneSettings(s);
    fn(next);
    if (next.presetId !== 'custom' && JSON.stringify({ ...next, presetId: '', name: '' }) !== JSON.stringify({ ...s, presetId: '', name: '' })) {
      next.presetId = 'custom';
    }
    onChange(next);
  };
  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    const next = cloneSettings(preset.settings);
    next.maxPlayers = Math.max(next.maxPlayers, playerCount);
    onChange(next);
  };

  return (
    <div className="settings">
      <section>
        <h3>Format</h3>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} className={`preset${s.presetId === p.id ? ' on' : ''}`} disabled={!editable}
              onClick={() => applyPreset(p.id)} title={p.description}>
              <strong>{p.name}</strong>
              <span>{p.tagline}</span>
            </button>
          ))}
          <div className={`preset custom${s.presetId === 'custom' ? ' on' : ''}`}>
            <strong>Custom</strong>
            <span>Tweak any rule below</span>
          </div>
        </div>
        {PRESETS.find((p) => p.id === s.presetId) && (
          <p className="muted small">{PRESETS.find((p) => p.id === s.presetId)!.description}</p>
        )}
      </section>

      <fieldset disabled={!editable}>
        <section>
          <h3>Basics</h3>
          <div className="fields">
            <label>Format name
              <TextField value={s.name} onCommit={(name) => onChange({ ...s, name })} />
            </label>
            <label>Budget (points)<NumberField value={s.budget} min={1} max={10000} onCommit={(v) => update((d) => { d.budget = v!; })} /></label>
            <label>Pokemon per team<NumberField value={s.teamSize} min={1} max={30} onCommit={(v) => update((d) => { d.teamSize = v!; })} /></label>
            <label>Max players<NumberField value={s.maxPlayers} min={Math.max(2, playerCount)} max={16} onCommit={(v) => update((d) => { d.maxPlayers = v!; })} /></label>
            <label>Pick timer (sec, 0 = off)<NumberField value={s.draft.pickTimerSec} min={0} max={3600} onCommit={(v) => update((d) => { d.draft.pickTimerSec = v!; })} /></label>
            <label>Draft order
              <select value={s.draft.order} onChange={(e) => update((d) => { d.draft.order = e.target.value as 'snake' | 'linear'; })}>
                <option value="snake">Snake (1-2-3-3-2-1)</option>
                <option value="linear">Linear (1-2-3-1-2-3)</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h3>Draft pool</h3>
          <div className="field-row">
            <span className="field-label">Generations</span>
            <div className="chips">
              {GENS.map((g) => (
                <button key={g} className={`chip${s.pool.gens.includes(g) ? ' on' : ''}`}
                  onClick={() => update((d) => { d.pool.gens = toggle(d.pool.gens, g); })}>Gen {g}</button>
              ))}
              {!s.pool.gens.length && <span className="muted small">All</span>}
            </div>
          </div>
          <div className="field-row">
            <span className="field-label">Types</span>
            <div className="chips">
              {TYPES.map((t) => (
                <button key={t} className={`type-chip${s.pool.types.includes(t) ? ' on' : ''}${s.pool.types.length && !s.pool.types.includes(t) ? ' off' : ''}`}
                  onClick={() => update((d) => { d.pool.types = toggle(d.pool.types, t as TypeName); })}>
                  <TypeBadge type={t} small />
                </button>
              ))}
              {!s.pool.types.length && <span className="muted small">All</span>}
            </div>
          </div>
          <div className="field-row">
            <span className="field-label">Evolution stage</span>
            <div className="chips">
              {STAGES.map((st) => (
                <button key={st.id} className={`chip${s.pool.stages.includes(st.id) ? ' on' : ''}`}
                  onClick={() => update((d) => { d.pool.stages = toggle(d.pool.stages, st.id as Stage); })}>{st.label}</button>
              ))}
              {!s.pool.stages.length && <span className="muted small">All</span>}
            </div>
          </div>
          <div className="field-row">
            <span className="field-label">Special Pokemon</span>
            <div className="cat-grid">
              {CATEGORIES.map((c) => (
                <div key={c.id} className="cat-row">
                  <span>{c.label}</span>
                  <div className="seg small">
                    {(['allow', 'ban', 'only'] as CategoryRule[]).map((r) => (
                      <button key={r} className={s.pool.categories[c.id] === r ? `on ${r}` : ''}
                        onClick={() => update((d) => { d.pool.categories[c.id] = r; })}>
                        {r === 'allow' ? 'Allow' : r === 'ban' ? 'Ban' : 'Only'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="fields">
            <label>Min base stat total<NumberField value={s.pool.minBst} min={0} max={1000} allowEmpty placeholder="none" onCommit={(v) => update((d) => { d.pool.minBst = v; })} /></label>
            <label>Max base stat total<NumberField value={s.pool.maxBst} min={0} max={1000} allowEmpty placeholder="none" onCommit={(v) => update((d) => { d.pool.maxBst = v; })} /></label>
            <label className="check">
              <input type="checkbox" checked={s.pool.speciesClause} onChange={(e) => update((d) => { d.pool.speciesClause = e.target.checked; })} />
              Species clause <span className="muted small">(drafting Rotom-Wash takes every Rotom)</span>
            </label>
          </div>
        </section>

        <section>
          <h3>Team rules</h3>
          <div className="fields">
            <label className="check">
              <input type="checkbox" checked={s.team.monotype} onChange={(e) => update((d) => { d.team.monotype = e.target.checked; })} />
              Monotype <span className="muted small">(every Pokemon shares a type)</span>
            </label>
            <label>Max legendary/mythical<NumberField value={s.team.maxLegendaries} min={0} max={30} allowEmpty placeholder="no limit" onCommit={(v) => update((d) => { d.team.maxLegendaries = v; })} /></label>
            <label>Max Megas<NumberField value={s.team.maxMegas} min={0} max={30} allowEmpty placeholder="no limit" onCommit={(v) => update((d) => { d.team.maxMegas = v; })} /></label>
            <label>Max of one type<NumberField value={s.team.maxPerType} min={1} max={30} allowEmpty placeholder="no limit" onCommit={(v) => update((d) => { d.team.maxPerType = v; })} /></label>
          </div>
        </section>

        <section>
          <h3>Pricing</h3>
          <div className="seg" role="group">
            {([['standard', 'Standard'], ['normalized', 'Scaled to pool'], ['flat', 'Flat']] as const).map(([m, label]) => (
              <button key={m} className={s.pricing.mode === m ? 'on' : ''} onClick={() => update((d) => { d.pricing.mode = m; })}>{label}</button>
            ))}
          </div>
          <p className="muted small">
            {s.pricing.mode === 'standard' && 'Costs come from competitive tier, base stats and evolution stage. Final evolutions and meta threats cost more; legendaries carry a premium.'}
            {s.pricing.mode === 'normalized' && 'Pokemon are ranked by strength within this pool and spread evenly across the cost range. Use this for narrow pools like Legendary-only or Little Cup.'}
            {s.pricing.mode === 'flat' && 'Every Pokemon costs the same. Strategy comes down to draft order.'}
          </p>
          <div className="fields">
            {s.pricing.mode !== 'flat' ? (
              <>
                <label>Min cost<NumberField value={s.pricing.minCost} min={0} max={200} onCommit={(v) => update((d) => { d.pricing.minCost = v!; })} /></label>
                <label>Max cost<NumberField value={s.pricing.maxCost} min={0} max={200} onCommit={(v) => update((d) => { d.pricing.maxCost = v!; })} /></label>
              </>
            ) : (
              <label>Cost per Pokemon<NumberField value={s.pricing.flatCost} min={0} max={200} onCommit={(v) => update((d) => { d.pricing.flatCost = v!; })} /></label>
            )}
            {Object.keys(s.pricing.overrides).length > 0 && (
              <div className="inline-note">
                {Object.keys(s.pricing.overrides).length} custom price(s)
                {editable && <button className="link" onClick={() => update((d) => { d.pricing.overrides = {}; })}>Reset</button>}
              </div>
            )}
          </div>
          <PriceGroupsEditor settings={s} editable={editable}
            onChange={(groups) => update((d) => { d.pricing.groups = groups; })} />
        </section>
      </fieldset>
    </div>
  );
}
