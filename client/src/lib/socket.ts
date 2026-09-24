import { io } from 'socket.io-client';
import type { Ack } from '../../../shared/types.ts';

export const socket = io({ transports: ['websocket', 'polling'] });

/** Emits an event and resolves with the server's ack data (rejects with its error). */
export function emit<T = unknown>(event: string, payload: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(10000).emit(event, payload, (err: Error | null, ack: Ack<T>) => {
      if (err) reject(new Error('The server did not respond. Check your connection.'));
      else if (!ack.ok) reject(new Error(ack.error ?? 'Request failed'));
      else resolve(ack.data as T);
    });
  });
}
