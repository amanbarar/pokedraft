import { DEX_BY_ID } from '../../../shared/pokedex.ts';
import { playerIndexForTurn } from '../../../shared/rules.ts';
import type { RoomState } from '../../../shared/types.ts';
import { Sprite } from '../components/Poke.tsx';

/** Classic round-by-player grid of every pick. */
export function DraftBoard({ state }: { state: RoomState }) {
  const n = state.players.length;
  const rounds = state.settings.teamSize;
  const byTurn = new Map(state.picks.map((pk) => [pk.turn, pk]));
  const current = state.status === 'complete' ? -1 : state.picks.length;

  return (
    <div className="board-wrap">
      <table className="board">
        <thead>
          <tr>
            <th>Rd</th>
            {state.players.map((p) => <th key={p.id}>{p.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, r) => (
            <tr key={r}>
              <th>{r + 1}</th>
              {state.players.map((_, col) => {
                // Find the turn number that lands on this column in this round
                let turn = r * n;
                while (playerIndexForTurn(turn, n, state.settings.draft.order) !== col) turn++;
                const pk = byTurn.get(turn);
                const p = pk?.pokemonId ? DEX_BY_ID.get(pk.pokemonId) : null;
                return (
                  <td key={col} className={turn === current ? 'current' : ''}>
                    {p ? (
                      <div className="board-cell" title={`${p.name} (${pk!.cost} pts)`}>
                        <Sprite p={p} size={40} />
                        <span>{p.name}</span>
                        <span className="muted small">{pk!.cost}</span>
                      </div>
                    ) : pk ? <span className="muted small">skipped</span> : <span className="muted small">{turn + 1}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
