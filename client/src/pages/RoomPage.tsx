import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getName, setName } from '../lib/identity.ts';
import { emit } from '../lib/socket.ts';
import { useRoom } from '../lib/useRoom.ts';
import { useToast } from '../components/Toast.tsx';
import { LobbyView } from '../views/LobbyView.tsx';
import { DraftView } from '../views/DraftView.tsx';
import { ResultsView } from '../views/ResultsView.tsx';

export type Act = (event: string, payload?: object) => Promise<boolean>;

export function RoomPage() {
  const { code = '' } = useParams();
  const room = useRoom(code);
  const toast = useToast();
  const [nameInput, setNameInput] = useState(getName());

  const act: Act = useCallback(async (event, payload) => {
    try {
      await emit(event, payload);
      return true;
    } catch (err) {
      toast((err as Error).message, 'error');
      return false;
    }
  }, [toast]);

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setName(nameInput);
    room.join();
  };

  if (!room.state) {
    return (
      <div className="center-panel panel">
        {room.error ? (
          <>
            <h2>Can't open room {code.toUpperCase()}</h2>
            <p className="muted">{room.error}</p>
            <Link className="btn" to="/">Back home</Link>
          </>
        ) : (
          <p className="muted">{room.connected ? 'Joining room...' : 'Connecting to server...'}</p>
        )}
      </div>
    );
  }

  const { state, me } = room;
  return (
    <div className="room">
      {!room.connected && <div className="banner warn">Connection lost. Reconnecting...</div>}
      {room.needsName && state.status === 'lobby' && (
        <form className="banner join-banner" onSubmit={submitName}>
          <span>You're watching this lobby. Enter a name to join the draft:</span>
          <input type="text" value={nameInput} maxLength={24} placeholder="Trainer name" onChange={(e) => setNameInput(e.target.value)} autoFocus />
          <button className="btn primary small">Join</button>
          {room.error && <span className="error-text">{room.error}</span>}
        </form>
      )}
      {me === null && state.status !== 'lobby' && !room.needsName && (
        <div className="banner">You're spectating. The draft started before you joined.</div>
      )}
      {state.status === 'lobby' && <LobbyView state={state} me={me ?? null} act={act} />}
      {(state.status === 'drafting' || state.status === 'paused') && (
        <DraftView state={state} me={me ?? null} act={act} clockOffset={room.clockOffset} />
      )}
      {state.status === 'complete' && <ResultsView state={state} me={me ?? null} act={act} />}
    </div>
  );
}
