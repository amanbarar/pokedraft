import { useState } from 'react';
import { DEX_BY_ID } from '../../../shared/pokedex.ts';
import { budgetLeft, spentBy, teamOf } from '../../../shared/rules.ts';
import type { Pokemon, RoomState } from '../../../shared/types.ts';
import { CostBadge, Sprite, Types } from '../components/Poke.tsx';
import { useToast } from '../components/Toast.tsx';
import { DraftBoard } from './DraftBoard.tsx';
import type { Act } from '../pages/RoomPage.tsx';

interface Props { state: RoomState; me: string | null; act: Act }

/** Showdown's importer accepts one species per block. */
const showdownExport = (team: Pokemon[]) => team.map((p) => p.name).join('\n\n');

export function ResultsView({ state, me, act }: Props) {
  const toast = useToast();
  const [view, setView] = useState<'teams' | 'board'>('teams');
  const isHost = me === state.hostId;
  const costOf = (playerId: string, pokemonId: string) =>
    state.picks.find((pk) => pk.playerId === playerId && pk.pokemonId === pokemonId)?.cost ?? 0;

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`, 'success'); }
    catch { toast('Clipboard unavailable in this browser', 'error'); }
  };
  const csv = () => {
    const rows = [['Trainer', 'Pick', 'Pokemon', 'Types', 'Cost']];
    for (const pk of state.picks) {
      const p = pk.pokemonId ? DEX_BY_ID.get(pk.pokemonId) : undefined;
      const player = state.players.find((x) => x.id === pk.playerId)?.name ?? '';
      rows.push([player, String(pk.turn + 1), p?.name ?? '(skipped)', p?.types.join('/') ?? '', String(pk.cost)]);
    }
    return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  };

  return (
    <div className="results">
      <div className="page-head">
        <div>
          <h1>Draft complete</h1>
          <p className="muted">{state.settings.name} · {state.players.length} trainers · {state.picks.filter((p) => p.pokemonId).length} Pokemon drafted</p>
        </div>
        <div className="btn-row">
          <button className="btn small" onClick={() => copy(csv(), 'CSV')}>Copy all as CSV</button>
          {isHost && <button className="btn small ghost" onClick={() => act('draft:reset')}>New draft in this room</button>}
        </div>
      </div>

      <div className="tabs">
        <button className={view === 'teams' ? 'on' : ''} onClick={() => setView('teams')}>Teams</button>
        <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Draft board</button>
      </div>

      {view === 'board' ? <DraftBoard state={state} /> : (
        <div className="teams">
          {state.players.map((player) => {
            const team = teamOf(state, player.id);
            return (
              <div key={player.id} className={`panel team-card${player.id === me ? ' me' : ''}`}>
                <div className="panel-head">
                  <h3>{player.name}{player.id === me && <span className="pill you">You</span>}</h3>
                  <span className="muted small">{spentBy(state, player.id)} spent · {budgetLeft(state, player.id)} left</span>
                </div>
                <ul className="team-list">
                  {team.map((p) => (
                    <li key={p.id}>
                      <Sprite p={p} size={40} />
                      <span className="tl-name">{p.name}<Types p={p} small /></span>
                      <CostBadge cost={costOf(player.id, p.id)} />
                    </li>
                  ))}
                </ul>
                <button className="btn small ghost full" onClick={() => copy(showdownExport(team), `${player.name}'s team`)}>
                  Copy Showdown import
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
