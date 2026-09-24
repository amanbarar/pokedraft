import { randomBytes, randomUUID } from 'node:crypto';
import { baseSettings, cloneSettings, getPreset, sanitizeSettings } from '../shared/formats.ts';
import {
  analyzeFormat, chooseAutoPick, createPickChecker, currentPlayerId, currentTurn, getPool, totalTurns,
} from '../shared/rules.ts';
import type { FormatSettings, RoomState } from '../shared/types.ts';

const BOT_NAMES = ['Oak Bot', 'Elm Bot', 'Birch Bot', 'Rowan Bot', 'Juniper Bot', 'Sycamore Bot', 'Kukui Bot', 'Magnolia Bot', 'Sada Bot', 'Turo Bot'];
const BOT_DELAY_MS = 1200;
const ROOM_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface RoomRecord {
  state: RoomState;
  /** secret client token -> public player id */
  tokens: Record<string, string>;
  lastActivity: number;
}

export class DraftError extends Error {}

function newCode(existing: Map<string, unknown>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from(randomBytes(5), (b) => alphabet[b % alphabet.length]).join('');
    if (!existing.has(code)) return code;
  }
}

const newPlayerId = () => randomUUID().slice(0, 8);

function cleanName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
  if (!n) throw new DraftError('Please enter a name');
  return n;
}

export interface RoomManagerOptions {
  onChange: (room: RoomRecord) => void;
  now?: () => number;
  botDelayMs?: number;
}

export class RoomManager {
  rooms = new Map<string, RoomRecord>();
  private timers = new Map<string, NodeJS.Timeout>();
  private now: () => number;
  private botDelayMs: number;

  constructor(private opts: RoomManagerOptions) {
    this.now = opts.now ?? Date.now;
    this.botDelayMs = opts.botDelayMs ?? BOT_DELAY_MS;
  }

  // ------------------------------------------------------------ lifecycle

  /** Restore persisted rooms and resume any running drafts. */
  load(records: RoomRecord[]) {
    const cutoff = this.now() - ROOM_TTL_MS;
    for (const rec of records) {
      if (rec.lastActivity < cutoff) continue;
      for (const p of rec.state.players) p.connected = p.isBot;
      // Upgrade rooms saved by older versions (e.g. missing price groups)
      rec.state.settings = sanitizeSettings(rec.state.settings);
      this.rooms.set(rec.state.code, rec);
      if (rec.state.status === 'drafting') this.schedule(rec);
    }
  }

  get(code: string): RoomRecord {
    const room = this.rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) throw new DraftError('Room not found. Check the code and try again.');
    return room;
  }

  private touch(room: RoomRecord) {
    room.lastActivity = this.now();
    this.opts.onChange(room);
  }

  private requireHost(room: RoomRecord, playerId: string | null) {
    if (!playerId || room.state.hostId !== playerId) throw new DraftError('Only the host can do that');
  }

  private requireLobby(room: RoomRecord) {
    if (room.state.status !== 'lobby') throw new DraftError('The draft has already started');
  }

  // ------------------------------------------------------------ lobby

  create(hostName: unknown, token: string, presetId?: string, localPlayers: unknown = []): RoomRecord {
    const localNames = Array.isArray(localPlayers) ? localPlayers.map(cleanName) : [];
    const name = cleanName(hostName);
    const code = newCode(this.rooms);
    const hostId = newPlayerId();
    const preset = presetId ? getPreset(presetId) : undefined;
    const settings: FormatSettings = preset ? cloneSettings(preset.settings) : baseSettings();
    const room: RoomRecord = {
      state: {
        code, createdAt: this.now(), hostId, status: 'lobby', settings,
        players: [{ id: hostId, name, isBot: false, connected: true }],
        picks: [], turnDeadline: null, pausedRemainingMs: null,
      },
      tokens: { [token]: hostId },
      lastActivity: this.now(),
    };
    if (localNames.length) {
      settings.maxPlayers = Math.max(settings.maxPlayers, Math.min(16, localNames.length + 1));
      for (const n of localNames) this.pushLocal(room, n);
    }
    this.rooms.set(code, room);
    this.touch(room);
    return room;
  }

  /** Adds a pass-and-play seat that the host drafts for on their device. */
  addLocalPlayer(code: string, playerId: string | null, name: unknown) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    this.pushLocal(room, cleanName(name));
    this.touch(room);
  }

  private pushLocal(room: RoomRecord, name: string) {
    const { players, settings } = room.state;
    if (players.length >= settings.maxPlayers) throw new DraftError(`This room is full (max ${settings.maxPlayers} players)`);
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new DraftError(`The name "${name}" is already used`);
    players.push({ id: newPlayerId(), name, isBot: false, local: true, connected: true });
  }

  /** The seat an action is taken for: the host's device drafts for local players on the clock. */
  private actingSeat(room: RoomRecord, playerId: string): string {
    const onClock = currentPlayerId(room.state);
    const seat = room.state.players.find((p) => p.id === onClock);
    return playerId === room.state.hostId && seat?.local ? seat.id : playerId;
  }

  /** Joins as a player (lobby) or reconnects; returns null playerId for spectators. */
  join(code: string, token: string, name: unknown): { room: RoomRecord; playerId: string | null } {
    const room = this.get(code);
    const existing = room.tokens[token];
    if (existing && room.state.players.some((p) => p.id === existing)) {
      const player = room.state.players.find((p) => p.id === existing)!;
      player.connected = true;
      this.touch(room);
      return { room, playerId: existing };
    }
    if (room.state.status !== 'lobby') return { room, playerId: null };
    if (room.state.players.length >= room.state.settings.maxPlayers) throw new DraftError('This room is full');
    const playerName = cleanName(name);
    if (room.state.players.some((p) => p.name.toLowerCase() === playerName.toLowerCase()))
      throw new DraftError('That name is taken in this room');
    const id = newPlayerId();
    room.state.players.push({ id, name: playerName, isBot: false, connected: true });
    room.tokens[token] = id;
    this.touch(room);
    return { room, playerId: id };
  }

  setConnected(code: string, playerId: string, connected: boolean) {
    const room = this.rooms.get(code);
    const player = room?.state.players.find((p) => p.id === playerId);
    if (!room || !player || player.connected === connected) return;
    player.connected = connected;
    this.touch(room);
  }

  updateSettings(code: string, playerId: string | null, settings: unknown) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    const next = sanitizeSettings(settings);
    if (next.maxPlayers < room.state.players.length) next.maxPlayers = room.state.players.length;
    room.state.settings = next;
    this.touch(room);
  }

  addBot(code: string, playerId: string | null) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    if (room.state.players.length >= room.state.settings.maxPlayers) throw new DraftError('This room is full');
    const used = new Set(room.state.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${room.state.players.length + 1}`;
    room.state.players.push({ id: newPlayerId(), name, isBot: true, connected: true });
    this.touch(room);
  }

  kick(code: string, playerId: string | null, targetId: string) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    if (targetId === room.state.hostId) throw new DraftError('The host cannot be removed');
    room.state.players = room.state.players.filter((p) => p.id !== targetId);
    for (const [tok, id] of Object.entries(room.tokens)) if (id === targetId) delete room.tokens[tok];
    this.touch(room);
  }

  setOrder(code: string, playerId: string | null, order: string[] | 'shuffle') {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    const players = room.state.players;
    if (order === 'shuffle') {
      for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
      }
    } else {
      if (!Array.isArray(order) || order.length !== players.length || !players.every((p) => order.includes(p.id)))
        throw new DraftError('Invalid draft order');
      room.state.players = order.map((id) => players.find((p) => p.id === id)!);
    }
    this.touch(room);
  }

  // ------------------------------------------------------------ draft

  start(code: string, playerId: string | null) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.requireLobby(room);
    if (room.state.players.length < 2) throw new DraftError('Need at least 2 players (add a bot to practice)');
    const report = analyzeFormat(room.state.settings, room.state.players.length);
    if (report.problems.length) throw new DraftError(report.problems[0]);
    room.state.status = 'drafting';
    room.state.picks = [];
    this.advance(room);
  }

  pick(code: string, playerId: string | null, pokemonId: string) {
    const room = this.get(code);
    if (!playerId) throw new DraftError('Spectators cannot pick');
    this.applyPick(room, this.actingSeat(room, playerId), pokemonId, false);
  }

  /** Host forces an auto-pick for whoever is on the clock (e.g. an absent player). */
  forceAutoPick(code: string, playerId: string | null) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.state.status !== 'drafting') throw new DraftError('The draft is not running');
    this.autoPick(room);
  }

  undo(code: string, playerId: string | null) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    const { state } = room;
    if (state.status === 'lobby') throw new DraftError('Nothing to undo');
    // Undo back past any bot/auto picks to the last human decision
    let removed = state.picks.pop();
    if (!removed) throw new DraftError('Nothing to undo');
    while (removed && state.picks.length && this.isBot(room, removed.playerId)) removed = state.picks.pop();
    if (state.status === 'complete') state.status = 'drafting';
    if (state.status === 'paused') {
      state.pausedRemainingMs = state.settings.draft.pickTimerSec * 1000 || null;
      this.touch(room);
      return;
    }
    this.advance(room);
  }

  pause(code: string, playerId: string | null) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.state.status !== 'drafting') throw new DraftError('The draft is not running');
    this.clearTimer(room.state.code);
    room.state.status = 'paused';
    room.state.pausedRemainingMs = room.state.turnDeadline ? Math.max(0, room.state.turnDeadline - this.now()) : null;
    room.state.turnDeadline = null;
    this.touch(room);
  }

  resume(code: string, playerId: string | null) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.state.status !== 'paused') throw new DraftError('The draft is not paused');
    room.state.status = 'drafting';
    const remaining = room.state.pausedRemainingMs;
    room.state.pausedRemainingMs = null;
    this.advance(room, remaining ?? undefined);
  }

  /** Host returns a finished or running draft to the lobby, clearing picks. */
  reset(code: string, playerId: string | null) {
    const room = this.get(code);
    this.requireHost(room, playerId);
    this.clearTimer(room.state.code);
    Object.assign(room.state, { status: 'lobby', picks: [], turnDeadline: null, pausedRemainingMs: null });
    this.touch(room);
  }

  private isBot(room: RoomRecord, playerId: string) {
    return !!room.state.players.find((p) => p.id === playerId)?.isBot;
  }

  private applyPick(room: RoomRecord, playerId: string, pokemonId: string, auto: boolean) {
    const verdict = createPickChecker(room.state, playerId)(pokemonId);
    if (!verdict.ok) throw new DraftError(verdict.reason);
    const cost = getPool(room.state.settings).costs.get(pokemonId)!;
    room.state.picks.push({ pokemonId, playerId, cost, turn: currentTurn(room.state), auto, at: this.now() });
    this.advance(room);
  }

  private autoPick(room: RoomRecord) {
    const playerId = currentPlayerId(room.state);
    if (!playerId) return;
    const choice = chooseAutoPick(room.state, playerId);
    if (choice) {
      this.applyPick(room, playerId, choice, true);
    } else {
      // No legal Pokemon left for this player: skip their turn
      room.state.picks.push({ pokemonId: null, playerId, cost: 0, turn: currentTurn(room.state), auto: true, at: this.now() });
      this.advance(room);
    }
  }

  /** Moves the draft forward: completes it, or arms the timer / bot for the next turn. */
  private advance(room: RoomRecord, remainingMs?: number) {
    const { state } = room;
    this.clearTimer(state.code);
    state.turnDeadline = null;
    if (state.status === 'drafting' && currentTurn(state) >= totalTurns(state)) state.status = 'complete';
    if (state.status === 'drafting') {
      const timerMs = state.settings.draft.pickTimerSec * 1000;
      if (timerMs > 0) state.turnDeadline = this.now() + (remainingMs ?? timerMs);
      this.schedule(room);
    }
    this.touch(room);
  }

  private schedule(room: RoomRecord) {
    const { state } = room;
    const playerId = currentPlayerId(state);
    if (!playerId) return;
    let delay: number | null = null;
    if (this.isBot(room, playerId)) delay = this.botDelayMs;
    if (state.turnDeadline) {
      const untilDeadline = Math.max(0, state.turnDeadline - this.now());
      delay = delay === null ? untilDeadline : Math.min(delay, untilDeadline);
    }
    if (delay === null) return;
    const turn = currentTurn(state);
    this.timers.set(state.code, setTimeout(() => {
      this.timers.delete(state.code);
      if (state.status !== 'drafting' || currentTurn(state) !== turn) return;
      try { this.autoPick(room); } catch (err) { console.error('auto-pick failed', err); }
    }, delay));
  }

  private clearTimer(code: string) {
    const t = this.timers.get(code);
    if (t) clearTimeout(t);
    this.timers.delete(code);
  }

  shutdown() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
