import { useEffect, type ReactNode } from 'react';
import { DEX_BY_ID } from '../../../shared/pokedex.ts';
import { standardCost } from '../../../shared/pricing.ts';
import type { Pokemon } from '../../../shared/types.ts';
import { CostBadge, Sprite, StatBars, Tags, Types, stageLabel } from './Poke.tsx';

interface Props {
  p: Pokemon;
  cost: number;
  onClose: () => void;
  /** Action area (e.g. Draft button) */
  children?: ReactNode;
}

export function PokemonDetail({ p, cost, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const line = [DEX_BY_ID.get(p.prevo ?? ''), ...p.evos.map((id) => DEX_BY_ID.get(id))].filter(Boolean) as Pokemon[];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label={`${p.name} details`}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="detail-head">
          <Sprite p={p} size={128} />
          <div>
            <div className="muted small">#{String(p.num).padStart(4, '0')} · Gen {p.gen} · {stageLabel(p)}</div>
            <h2>{p.name}</h2>
            <Types p={p} />
            <Tags p={p} />
          </div>
          <div className="detail-cost"><CostBadge cost={cost} /><span className="muted small">points</span></div>
        </div>
        <StatBars p={p} />
        <dl className="facts">
          <dt>Abilities</dt><dd>{p.abilities.join(', ')}</dd>
          <dt>Competitive tier</dt><dd>{p.tier && p.tier !== 'Illegal' ? p.tier : '-'}{p.natDexTier ? ` (NatDex ${p.natDexTier})` : ''}</dd>
          <dt>Standard cost</dt><dd>{standardCost(p.id)} pts</dd>
          {line.length > 0 && (
            <>
              <dt>Evolution line</dt>
              <dd>{line.map((x) => `${x.name} (${standardCost(x.id)})`).join(', ')}</dd>
            </>
          )}
        </dl>
        {children && <div className="detail-actions">{children}</div>}
      </aside>
    </div>
  );
}
