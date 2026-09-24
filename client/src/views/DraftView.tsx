import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEX_BY_ID } from '../../../shared/pokedex.ts';
import {
  budgetLeft, createPickChecker, currentPlayerId, currentTurn, getPool, sharedTypes, takenIds, teamOf, totalTurns, upcomingPlayerIds,
} from '../../../shared/rules.ts';
import type { Pokemon, RoomState } from '../../../shared/types.ts';
import { PoolBrowser, type CardStatus } from '../components/PoolBrowser.tsx';
import { PokemonDetail } from '../components/PokemonDetail.tsx';
import { CostBadge, Sprite, TypeBadge } from '../components/Poke.tsx';
import { useToast } from '../components/Toast.tsx';
import { DraftBoard } from './DraftBoard.tsx';
import type { Act } from '../pages/RoomPage.tsx';

interface Props { state: RoomState; me: string | null; act: Act; clockOffset: number }

function useCountdown(deadline: number | null, clockOffset: number) {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now() + clockOffset), 250);
    return () => clearInterval(t);
  }, [deadline, clockOffset]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

export function DraftView({ state, me, act, clockOffset }: Props) {
  const toast = useToast();
  const isHost = me === state.hostId;
  const s = state.settings;
  const { pokemon, costs } = useMemo(() => getPool(s), [s]);
  const [selected, setSelected] = useState<Pokemon | null>(null);
  const [tab, setTab] = useState<'pool' | 'board'>('pool');
  const [busy, setBusy] = useState(false);

  const onClock = currentPlayerId(state);
  const onClockPlayer = state.players.find((p) => p.id === onClock);
  // The seat this device drafts for: yourself, or a local (pass-and-play) player on the clock
  const seat = me && isHost && onClockPlayer?.local ? onClockPlayer.id : me;
  const seatPlayer = state.players.find((p) => p.id === seat);
  const seatIsMe = seat === me;
  const myTurn = !!seat && onClock === seat && state.status === 'drafting';
  const turn = currentTurn(state);
  const total = totalTurns(state);
  const round = Math.floor(turn / state.players.length) + 1;
  const secondsLeft = useCountdown(state.status === 'drafting' ? state.turnDeadline : null, clockOffset);
  const pausedSeconds = state.status === 'paused' && state.pausedRemainingMs !== null ? Math.ceil(state.pausedRemainingMs / 1000) : null;

  const takenBy = useMemo(() => {
    const map = new Map<string, string>();
    const names = new Map(state.players.map((p) => [p.id, p.name]));
    const drafted = new Map(state.picks.filter((pk) => pk.pokemonId).map((pk) => [pk.pokemonId!, pk.playerId]));
    const species = new Map<string, string>();
    for (const [id, owner] of drafted) species.set(DEX_BY_ID.get(id)!.baseSpecies, owner);
    const taken = takenIds(state);
    for (const p of pokemon) {
      if (!taken.has(p.id)) continue;
      const owner = drafted.get(p.id) ?? species.get(p.baseSpecies);
      map.set(p.id, owner ? names.get(owner) ?? '?' : 'Taken');
    }
    return map;
  }, [state, pokemon]);

  const checker = useMemo(() => (seat ? createPickChecker(state, seat, { ignoreTurn: true }) : null), [state, seat]);
  const status = useCallback((p: Pokemon): CardStatus => ({ takenBy: takenBy.get(p.id), verdict: checker?.(p.id) }), [takenBy, checker]);

  // Nudge the player when their turn starts
  const lastTurnSeat = useRef<string | null>(null);
  const turnSeat = myTurn ? seat : null;
  useEffect(() => {
    if (turnSeat && turnSeat !== lastTurnSeat.current) {
      toast(seatIsMe ? "You're on the clock!" : `Pass the device to ${seatPlayer?.name}!`, 'success');
    }
    lastTurnSeat.current = turnSeat;
    const base = 'PokeDraft League';
    document.title = turnSeat ? `▶ ${seatIsMe ? 'Your' : `${seatPlayer?.name}'s`} pick! - PokeDraft` : base;
    return () => { document.title = base; };
  }, [turnSeat, seatIsMe, seatPlayer?.name, toast]);

  // Close the drawer if someone else drafts the selected Pokemon
  useEffect(() => { if (selected && takenBy.has(selected.id)) setSelected(null); }, [takenBy, selected]);

  const draft = async (p: Pokemon) => {
    setBusy(true);
    if (await act('draft:pick', { pokemonId: p.id })) setSelected(null);
    setBusy(false);
  };

  const myTeam = seat ? teamOf(state, seat) : [];
  const myBudget = seat ? budgetLeft(state, seat) : 0;
  const myPicks = seat ? state.picks.filter((pk) => pk.playerId === seat).length : 0;
  const slotsLeft = s.teamSize - myPicks;
  const upcoming = upcomingPlayerIds(state, state.players.length + 1).slice(1);
  const selectedVerdict = selected && checker ? checker(selected.id) : null;

  return (
    <div className="draft">
      <div className="draft-head panel">
        <div className="dh-info">
          <div className="muted small">{s.name} · Round {Math.min(round, s.teamSize)}/{s.teamSize} · Pick {Math.min(turn + 1, total)}/{total}</div>
          <div className="on-clock">
            {state.status === 'paused' ? (
              <span className="paused">Draft paused{pausedSeconds !== null ? ` · ${pausedSeconds}s left on the clock` : ''}</span>
            ) : (
              <>
                <span className={`clock-name${myTurn ? ' mine' : ''}`}>{myTurn ? (seatIsMe ? 'Your pick!' : `${seatPlayer?.name}'s pick!`) : `${onClockPlayer?.name ?? '...'} is picking`}</span>
                {onClockPlayer?.isBot && <span className="muted small">thinking...</span>}
                {myTurn && !seatIsMe && <span className="pill local">On this device</span>}
              </>
            )}
          </div>
          {upcoming.length > 0 && (
            <div className="upcoming small muted">Next: {upcoming.map((id) => state.players.find((p) => p.id === id)?.name).join(' → ')}</div>
          )}
        </div>
        {secondsLeft !== null && (
          <div className={`timer${secondsLeft <= 10 ? ' urgent' : ''}`} aria-label="Time left">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </div>
        )}
        {isHost && (
          <div className="host-controls">
            {state.status === 'drafting'
              ? <button className="btn small" onClick={() => act('draft:pause')}>Pause</button>
              : <button className="btn small primary" onClick={() => act('draft:resume')}>Resume</button>}
            <button className="btn small" onClick={() => act('draft:undo')} disabled={!state.picks.length}>Undo pick</button>
            <button className="btn small" onClick={() => act('draft:autopick')} disabled={state.status !== 'drafting'} title="Auto-pick for whoever is on the clock">Auto-pick</button>
            <ConfirmButton label="End & return to lobby" onConfirm={() => act('draft:reset')} />
          </div>
        )}
      </div>

      <div className="draft-body">
        <aside className="draft-players">
          {state.players.map((p) => {
            const team = teamOf(state, p.id);
            const left = budgetLeft(state, p.id);
            return (
              <div key={p.id} className={`pcard${p.id === onClock ? ' active' : ''}${p.id === seat ? ' me' : ''}`}>
                <div className="pcard-head">
                  <span className={`dot${p.connected ? ' on' : ''}`} />
                  <strong>{p.name}</strong>
                  {p.isBot && <span className="pill bot">Bot</span>}
                  {p.local && <span className="pill local">Local</span>}
                  <span className="pcard-budget">{left} pts</span>
                </div>
                <div className="budget-bar"><span style={{ width: `${Math.max(0, (left / s.budget) * 100)}%` }} /></div>
                <div className="mini-team">
                  {Array.from({ length: s.teamSize }, (_, i) => team[i]
                    ? <span key={i} className="mini" title={`${team[i].name} (${costs.get(team[i].id) ?? '?'})`}><Sprite p={team[i]} size={32} /></span>
                    : <span key={i} className="mini vacant" />)}
                </div>
              </div>
            );
          })}
        </aside>

        <section className="draft-main">
          <div className="tabs">
            <button className={tab === 'pool' ? 'on' : ''} onClick={() => setTab('pool')}>Draft pool</button>
            <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>Draft board</button>
          </div>
          {tab === 'pool' ? (
            <PoolBrowser pokemon={pokemon} costs={costs} status={me ? status : (p) => ({ takenBy: takenBy.get(p.id) })}
              onSelect={setSelected} selectedId={selected?.id} defaultAvail={me ? 'legal' : 'available'} />
          ) : (
            <DraftBoard state={state} />
          )}
        </section>

        <aside className="draft-side">
          {me && (
            <div className="panel my-team">
              <div className="panel-head">
                <h3>{seatIsMe ? 'Your team' : `${seatPlayer?.name}'s team`}</h3>
                <span className="muted small">{myPicks}/{s.teamSize}</span>
              </div>
              <div className="budget-big">
                <strong>{myBudget}</strong> <span className="muted">/ {s.budget} pts left</span>
              </div>
              {slotsLeft > 0 && <div className="muted small">≈ {(myBudget / slotsLeft).toFixed(1)} pts per remaining slot</div>}
              {s.team.monotype && myTeam.length > 0 && (
                <div className="small">Team type: {sharedTypes(myTeam)!.map((t) => <TypeBadge key={t} type={t} small />)}</div>
              )}
              <ul className="team-list">
                {myTeam.map((p) => (
                  <li key={p.id}><Sprite p={p} size={36} /><span>{p.name}</span><CostBadge cost={costs.get(p.id) ?? 0} /></li>
                ))}
                {Array.from({ length: Math.max(0, slotsLeft) }, (_, i) => <li key={`e${i}`} className="empty-slot">Empty slot</li>)}
              </ul>
            </div>
          )}
          <div className="panel pick-log">
            <h3>Pick log</h3>
            <ol reversed>
              {[...state.picks].reverse().slice(0, 40).map((pk) => {
                const p = pk.pokemonId ? DEX_BY_ID.get(pk.pokemonId) : null;
                const who = state.players.find((x) => x.id === pk.playerId)?.name ?? '?';
                return (
                  <li key={pk.turn}>
                    <span className="muted small">#{pk.turn + 1}</span>{' '}
                    <strong>{who}</strong>{' '}
                    {p ? <>took <span className="log-mon">{p.name}</span> <span className="muted">({pk.cost})</span></> : <span className="muted">skipped (no legal picks)</span>}
                    {pk.auto && p && <span className="pill auto">auto</span>}
                  </li>
                );
              })}
              {!state.picks.length && <li className="muted">No picks yet.</li>}
            </ol>
          </div>
        </aside>
      </div>

      {selected && (
        <PokemonDetail p={selected} cost={costs.get(selected.id) ?? 0} onClose={() => setSelected(null)}>
          {me ? (
            <>
              <button className="btn primary big" disabled={!myTurn || busy || !selectedVerdict?.ok} onClick={() => draft(selected)}>
                Draft {selected.name} for {costs.get(selected.id)} pts
              </button>
              {selectedVerdict && !selectedVerdict.ok && <p className="error-text small">{selectedVerdict.reason}</p>}
              {myTurn && !seatIsMe && <p className="muted small">Drafting for {seatPlayer?.name}.</p>}
              {selectedVerdict?.ok && !myTurn && <p className="muted small">You can draft this when it's your turn.</p>}
            </>
          ) : <p className="muted small">Spectators can't draft.</p>}
        </PokemonDetail>
      )}
    </div>
  );
}

function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`btn small ${armed ? 'danger' : 'ghost'}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Click again to confirm' : label}
    </button>
  );
}
