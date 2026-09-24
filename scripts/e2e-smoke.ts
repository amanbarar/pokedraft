// End-to-end smoke test against a running server: npx tsx scripts/e2e-smoke.ts [url]
// Two human clients + one bot run a full Monotype draft over real sockets.
import { io, type Socket } from 'socket.io-client';
import type { Ack, RoomState } from '../shared/types.ts';
import { chooseAutoPick, currentPlayerId, teamOf, sharedTypes, budgetLeft } from '../shared/rules.ts';
import { getPreset } from '../shared/formats.ts';

const URL = process.argv[2] ?? 'http://localhost:3001';

function client(): Promise<{ socket: Socket; states: RoomState[] }> {
  const socket = io(URL, { transports: ['websocket'] });
  const states: RoomState[] = [];
  socket.on('room:state', (s: RoomState) => states.push(s));
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve({ socket, states }));
    socket.on('connect_error', reject);
  });
}

const call = <T>(s: Socket, event: string, payload: object = {}) =>
  new Promise<T>((resolve, reject) =>
    s.emit(event, payload, (ack: Ack<T>) => (ack.ok ? resolve(ack.data as T) : reject(new Error(`${event}: ${ack.error}`)))));

const expectError = async (p: Promise<unknown>, pattern: RegExp) => {
  try { await p; } catch (err) { if (pattern.test((err as Error).message)) return; throw err; }
  throw new Error(`expected error ${pattern}`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latest = (c: { states: RoomState[] }) => c.states[c.states.length - 1];

const host = await client();
const guest = await client();
const { code, playerId: hostId } = await call<{ code: string; playerId: string }>(host.socket, 'room:create', { name: 'Ash', token: 'e2e-host-token', presetId: 'standard' });
console.log('room', code);
const { playerId: guestId } = await call<{ playerId: string }>(guest.socket, 'room:join', { code, name: 'Misty', token: 'e2e-guest-token' });
await expectError(call(guest.socket, 'room:addBot'), /Only the host/);
await call(host.socket, 'room:addBot');
const settings = { ...getPreset('monotype')!.settings, draft: { order: 'snake', pickTimerSec: 30 } };
await call(host.socket, 'room:settings', { settings });
await call(host.socket, 'draft:start');
await sleep(100);

const clients: Record<string, typeof host> = { [hostId]: host, [guestId]: guest };
let illegalChecked = false;
for (let guard = 0; guard < 400; guard++) {
  const state = latest(host);
  if (state.status === 'complete') break;
  const turn = currentPlayerId(state);
  const c = turn ? clients[turn] : undefined;
  if (c) {
    if (!illegalChecked && state.picks.length > 3) {
      // Picking out of turn must fail
      const other = c === host ? guest : host;
      await expectError(call(other.socket, 'draft:pick', { pokemonId: 'pikachu' }), /Not your turn/);
      illegalChecked = true;
    }
    const pick = chooseAutoPick(state, turn!);
    await call(c.socket, 'draft:pick', { pokemonId: pick });
  }
  await sleep(c ? 30 : 200);
}

const final = latest(host);
if (final.status !== 'complete') throw new Error(`draft did not complete: ${final.status} after ${final.picks.length} picks`);
for (const p of final.players) {
  const team = teamOf(final, p.id);
  console.log(`${p.name.padEnd(8)} ${budgetLeft(final, p.id).toString().padStart(3)} pts left  [${sharedTypes(team)?.join('/')}]  ${team.map((x) => x.name).join(', ')}`);
  if (!sharedTypes(team)?.length) throw new Error('monotype violated');
}
if (!illegalChecked) throw new Error('out-of-turn check did not run');
const res = await fetch(`${URL}/room/${code}`);
console.log('SPA route status', res.status, (await res.text()).includes('<div id="root">') ? 'serves index.html' : 'MISSING index.html');
console.log('E2E OK');
host.socket.close();
guest.socket.close();
