import { useState } from 'react';
import { DEX_BY_ID } from '../../../shared/pokedex.ts';
import { Sprite } from './Poke.tsx';

/** Compact sprite list of a group's members, collapsing long lists. */
export function MemberPreview({ ids, onRemove, max = 24, outside }: {
  ids: string[];
  onRemove?: (id: string) => void;
  max?: number;
  /** Ids to show dimmed (e.g. not in the current pool) */
  outside?: (id: string) => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!ids.length) return <span className="muted small">No Pokemon yet.</span>;
  const shown = expanded ? ids : ids.slice(0, max);
  return (
    <div className="member-preview">
      {shown.map((id) => {
        const p = DEX_BY_ID.get(id);
        if (!p) return null;
        const dim = outside?.(id);
        return (
          <span key={id} className={`member${dim ? ' outside' : ''}`} title={dim ? `${p.name} (not in this format's pool)` : p.name}>
            <Sprite p={p} size={24} />
            {p.name}
            {onRemove && <button className="chip-x" onClick={() => onRemove(id)} aria-label={`Remove ${p.name}`}>×</button>}
          </span>
        );
      })}
      {ids.length > max && (
        <button className="link small" onClick={() => setExpanded((x) => !x)}>
          {expanded ? 'Show less' : `+${ids.length - max} more`}
        </button>
      )}
    </div>
  );
}
