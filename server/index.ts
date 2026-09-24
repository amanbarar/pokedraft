import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { PRESETS } from '../shared/formats.ts';
import type { Ack } from '../shared/types.ts';
import { DraftError, RoomManager } from './rooms.ts';
import { RoomStore } from './store.ts';
import { PriceGroupLibrary } from './library.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3001);
const DATA_FILE = process.env.DATA_FILE ?? join(ROOT, 'data', 'rooms.json');
const GROUPS_FILE = process.env.GROUPS_FILE ?? join(dirname(DATA_FILE), 'price-groups.json');

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });

const store = new RoomStore(DATA_FILE, () => [...manager.rooms.values()]);
const manager = new RoomManager({
  onChange: (room) => {
    io.to(room.state.code).emit('room:state', room.state, Date.now());
    store.scheduleSave();
  },
});
manager.load(store.load());

const library = new PriceGroupLibrary(GROUPS_FILE);

app.use('/api', express.json({ limit: '200kb' }));

/** Runs a handler and maps DraftErrors to 400 responses. */
const handle = (fn: (req: express.Request) => unknown, status = 200) =>
  (req: express.Request, res: express.Response) => {
    try {
      res.status(status).json({ ok: true, data: fn(req) });
    } catch (err) {
      if (err instanceof DraftError) {
        res.status(/not found/i.test(err.message) ? 404 : 400).json({ ok: false, error: err.message });
      } else {
        console.error(err);
        res.status(500).json({ ok: false, error: 'Something went wrong' });
      }
    }
  };

app.get('/api/price-groups', handle(() => library.list()));
app.post('/api/price-groups', handle((req) => library.create(req.body), 201));
app.put('/api/price-groups/:id', handle((req) => library.update(req.params.id, req.body)));
app.delete('/api/price-groups/:id', handle((req) => { library.remove(req.params.id); return null; }));

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: manager.rooms.size }));
app.get('/api/formats', (_req, res) => res.json(PRESETS));
app.get('/api/rooms/:code', (req, res) => {
  const room = manager.rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
  res.json({ ok: true, data: room.state });
});

// Serve the built client in production (after `npm run build`)
const DIST = join(ROOT, 'dist');
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')));
}

interface Session { code: string | null; playerId: string | null; token: string | null }

io.on('connection', (socket: Socket) => {
  const session: Session = { code: null, playerId: null, token: null };

  /** Wraps a handler so errors become acks instead of crashes. */
  const on = <T>(event: string, handler: (payload: T) => unknown) => {
    socket.on(event, (payload: T, ack?: (res: Ack) => void) => {
      try {
        const data = handler(payload ?? ({} as T));
        ack?.({ ok: true, data });
      } catch (err) {
        if (!(err instanceof DraftError)) console.error(`[${event}]`, err);
        ack?.({ ok: false, error: err instanceof DraftError ? err.message : 'Something went wrong' });
      }
    });
  };

  const enter = (code: string, playerId: string | null) => {
    if (session.code && session.code !== code) socket.leave(session.code);
    session.code = code;
    session.playerId = playerId;
    socket.data.playerId = playerId;
    socket.join(code);
  };

  const requireRoom = () => {
    if (!session.code) throw new DraftError('Join a room first');
    return session.code;
  };

  on<{ name: string; token: string; presetId?: string; localPlayers?: string[] }>('room:create', ({ name, token, presetId, localPlayers }) => {
    if (typeof token !== 'string' || token.length < 8) throw new DraftError('Missing client token');
    session.token = token;
    const room = manager.create(name, token, presetId, localPlayers);
    enter(room.state.code, room.state.hostId);
    socket.emit('room:state', room.state, Date.now());
    return { code: room.state.code, playerId: room.state.hostId };
  });

  on<{ code: string; name: string; token: string }>('room:join', ({ code, name, token }) => {
    if (typeof token !== 'string' || token.length < 8) throw new DraftError('Missing client token');
    session.token = token;
    const { room, playerId } = manager.join(code, token, name);
    enter(room.state.code, playerId);
    socket.emit('room:state', room.state, Date.now());
    return { code: room.state.code, playerId };
  });

  on<{ code: string }>('room:watch', ({ code }) => {
    const room = manager.get(code);
    const playerId = session.token ? room.tokens[session.token] ?? null : null;
    enter(room.state.code, playerId);
    socket.emit('room:state', room.state, Date.now());
    return { code: room.state.code, playerId };
  });

  on<{ settings: unknown }>('room:settings', ({ settings }) => manager.updateSettings(requireRoom(), session.playerId, settings));
  on('room:addBot', () => manager.addBot(requireRoom(), session.playerId));
  on<{ name: string }>('room:addLocal', ({ name }) => manager.addLocalPlayer(requireRoom(), session.playerId, name));
  on<{ playerId: string }>('room:kick', ({ playerId }) => manager.kick(requireRoom(), session.playerId, playerId));
  on<{ order: string[] | 'shuffle' }>('room:order', ({ order }) => manager.setOrder(requireRoom(), session.playerId, order));
  on('draft:start', () => manager.start(requireRoom(), session.playerId));
  on<{ pokemonId: string }>('draft:pick', ({ pokemonId }) => manager.pick(requireRoom(), session.playerId, String(pokemonId)));
  on('draft:autopick', () => manager.forceAutoPick(requireRoom(), session.playerId));
  on('draft:undo', () => manager.undo(requireRoom(), session.playerId));
  on('draft:pause', () => manager.pause(requireRoom(), session.playerId));
  on('draft:resume', () => manager.resume(requireRoom(), session.playerId));
  on('draft:reset', () => manager.reset(requireRoom(), session.playerId));

  socket.on('disconnect', () => {
    if (!session.code || !session.playerId) return;
    const { code, playerId } = session;
    // Only mark offline if no other socket is holding this seat
    const stillHere = [...io.sockets.sockets.values()].some(
      (s) => s.id !== socket.id && s.rooms.has(code) && (s.data as { playerId?: string }).playerId === playerId,
    );
    if (!stillHere) manager.setConnected(code, playerId, false);
  });
});

const shutdown = () => {
  manager.shutdown();
  store.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

http.listen(PORT, () => {
  console.log(`PokeDraft server on http://localhost:${PORT}${existsSync(DIST) ? '' : '  (dev mode: open http://localhost:5173)'}`);
});
