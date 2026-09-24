import { useState } from 'react';
import { fallbackSpriteUrl, spriteUrl } from '../../../shared/pokedex.ts';
import type { Pokemon, TypeName } from '../../../shared/types.ts';

export function Sprite({ p, size = 64 }: { p: Pokemon; size?: number }) {
  const [src, setSrc] = useState(() => spriteUrl(p));
  return (
    <img
      className="sprite" src={src} alt={p.name} width={size} height={size} loading="lazy"
      onError={() => { const fb = fallbackSpriteUrl(p); if (src !== fb) setSrc(fb); }}
    />
  );
}

export function TypeBadge({ type, small }: { type: TypeName; small?: boolean }) {
  return <span className={`type type-${type.toLowerCase()}${small ? ' type-sm' : ''}`}>{type}</span>;
}

export function Types({ p, small }: { p: Pokemon; small?: boolean }) {
  return <span className="types">{p.types.map((t) => <TypeBadge key={t} type={t} small={small} />)}</span>;
}

export function CostBadge({ cost, dim }: { cost: number; dim?: boolean }) {
  const tier = cost >= 16 ? 'xl' : cost >= 12 ? 'lg' : cost >= 7 ? 'md' : 'sm';
  return <span className={`cost cost-${tier}${dim ? ' cost-dim' : ''}`} title={`${cost} points`}>{cost}</span>;
}

export function Tags({ p }: { p: Pokemon }) {
  const tags: string[] = [];
  if (p.tags.restricted) tags.push('Box Legend');
  else if (p.tags.legendary) tags.push('Legendary');
  if (p.tags.mythical) tags.push('Mythical');
  if (p.tags.ultraBeast) tags.push('Ultra Beast');
  if (p.tags.paradox) tags.push('Paradox');
  if (p.tags.mega) tags.push('Mega');
  if (!tags.length) return null;
  return <span className="tags">{tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>;
}

const STAT_LABELS: [keyof Pokemon['stats'], string][] = [
  ['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe'],
];

export function StatBars({ p }: { p: Pokemon }) {
  return (
    <div className="stats">
      {STAT_LABELS.map(([k, label]) => {
        const v = p.stats[k];
        const hue = Math.min(120, (v / 150) * 120);
        return (
          <div key={k} className="stat-row">
            <span className="stat-label">{label}</span>
            <span className="stat-val">{v}</span>
            <span className="stat-bar"><span style={{ width: `${Math.min(100, (v / 200) * 100)}%`, background: `hsl(${hue} 70% 50%)` }} /></span>
          </div>
        );
      })}
      <div className="stat-row stat-total"><span className="stat-label">Total</span><span className="stat-val">{p.bst}</span></div>
    </div>
  );
}

const STAGE_LABEL: Record<Pokemon['stage'], string> = {
  basic: 'Unevolved', middle: 'Middle stage', final: 'Fully evolved', single: 'No evolutions', mega: 'Mega / Primal',
};
export const stageLabel = (p: Pokemon) => STAGE_LABEL[p.stage];
