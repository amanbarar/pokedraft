import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState } from '../../../shared/types.ts';
import { getName, getToken } from './identity.ts';
import { emit, socket } from './socket.ts';

interface JoinResult { code: string; playerId: string | null }

export interface RoomConnection {
  state: RoomState | null;
  /** Your player id; null = spectating; undefined = still joining */
  me: string | null | undefined;
  needsName: boolean;
  error: string | null;
  connected: boolean;
  /** Server clock minus local clock, for accurate timers */
  clockOffset: number;
  join: () => void;
}

export function useRoom(code: string): RoomConnection {
  const [state, setState] = useState<RoomState | null>(null);
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [clockOffset, setClockOffset] = useState(0);
  const codeRef = useRef(code.toUpperCase());
  codeRef.current = code.toUpperCase();

  const join = useCallback(() => {
    const name = getName();
    const token = getToken();
    emit<JoinResult>('room:join', { code: codeRef.current, name, token })
      .then((res) => { setMe(res.playerId); setNeedsName(false); setError(null); })
      .catch((err: Error) => {
        if (/enter a name|name is taken/i.test(err.message)) {
          setNeedsName(true);
          if (name) setError(err.message);
          // Watch the lobby while the user picks a name
          emit<JoinResult>('room:watch', { code: codeRef.current }).then(() => setMe(null)).catch(() => {});
        } else {
          setError(err.message);
        }
      });
  }, []);

  useEffect(() => {
    const onState = (s: RoomState, serverNow: number) => {
      if (s.code !== codeRef.current) return;
      setState(s);
      if (serverNow) setClockOffset(serverNow - Date.now());
    };
    const onConnect = () => { setConnected(true); join(); };
    const onDisconnect = () => setConnected(false);
    socket.on('room:state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();
    return () => {
      socket.off('room:state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [code, join]);

  return { state, me, needsName, error, connected, clockOffset, join };
}
