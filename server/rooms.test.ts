import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../shared/formats.ts';
import { budgetLeft, currentPlayerId, teamOf } from '../shared/rules.ts';
import { DraftError, RoomManager } from './rooms.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function manager() {
  return new RoomManager({ onChange: () => {}, botDelayMs: 0 });
}

test('lobby: join, name clash, host-only actions', () => {
  const m = manager();
  const room = m.create('Ash', 'token-ash-1', 'standard');
  const { playerId } = m.join(room.state.code, 'token-misty', 'Misty');
  assert.ok(playerId);
  assert.throws(() => m.join(room.state.code, 'token-other', 'ash'), DraftError);
  assert.throws(() => m.addBot(room.state.code, playerId), /Only the host/);
  // rejoining with the same token keeps the seat
  assert.equal(m.join(room.state.code, 'token-misty', 'Whatever').playerId, playerId);
  m.shutdown();
});

for (const preset of PRESETS) {
  test(`full bot draft completes: ${preset.id}`, async () => {
    const m = manager();
    const room = m.create('Host', 'token-host-1', preset.id);
    const code = room.state.code;
    const host = room.state.hostId;
    m.updateSettings(code, host, { ...room.state.settings, draft: { order: 'snake', pickTimerSec: 0 } });
    for (let i = 0; i < 3; i++) m.addBot(code, host);
    m.start(code, host);
    // Host drafts via auto-pick on each of their turns; bots pick themselves
    for (let guard = 0; room.state.status === 'drafting' && guard < 500; guard++) {
      if (currentPlayerId(room.state) === host) m.forceAutoPick(code, host);
      await wait(1);
    }
    assert.equal(room.state.status, 'complete');
    for (const p of room.state.players) {
      assert.equal(teamOf(room.state, p.id).length, room.state.settings.teamSize, `${p.name} team size`);
      assert.ok(budgetLeft(room.state, p.id) >= 0, `${p.name} over budget`);
    }
    const ids = room.state.picks.map((pk) => pk.pokemonId);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate picks');
    m.shutdown();
  });
}

test('undo rewinds past bot picks to the last human pick', async () => {
  const m = manager();
  const room = m.create('Host', 'token-host-2');
  const { code, hostId } = room.state;
  m.updateSettings(code, hostId, { ...room.state.settings, draft: { order: 'linear', pickTimerSec: 0 } });
  m.addBot(code, hostId);
  m.start(code, hostId);
  m.pick(code, hostId, 'garchomp');
  await wait(10); // bot picks
  assert.equal(room.state.picks.length, 2);
  m.undo(code, hostId);
  assert.equal(room.state.picks.length, 0);
  assert.equal(currentPlayerId(room.state), hostId);
  m.shutdown();
});

test('pick timer auto-picks when it expires', async () => {
  const m = manager();
  const room = m.create('Host', 'token-host-3');
  const { code, hostId } = room.state;
  m.join(code, 'token-p2', 'P2');
  m.updateSettings(code, hostId, { ...room.state.settings, draft: { order: 'snake', pickTimerSec: 0 } });
  m.start(code, hostId);
  // Simulate an expired clock via pause/resume with 0ms remaining
  m.pause(code, hostId);
  room.state.pausedRemainingMs = 0;
  room.state.settings.draft.pickTimerSec = 1;
  m.resume(code, hostId);
  await wait(20);
  assert.equal(room.state.picks.length, 1);
  assert.equal(room.state.picks[0].auto, true);
  m.shutdown();
});

test('local pass-and-play: host device drafts for every local seat', () => {
  const m = manager();
  const room = m.create('Ash', 'token-local-host', 'standard', ['Misty', 'Brock']);
  const { code, hostId } = room.state;
  assert.deepEqual(room.state.players.map((p) => [p.name, !!p.local]), [['Ash', false], ['Misty', true], ['Brock', true]]);
  assert.throws(() => m.addLocalPlayer(code, hostId, 'misty'), /already used/);
  m.addLocalPlayer(code, hostId, 'Gary');
  // A remote guest cannot draft for local seats
  const { playerId: guest } = m.join(code, 'token-local-guest', 'Tracey');
  m.updateSettings(code, hostId, { ...room.state.settings, teamSize: 2, draft: { order: 'snake', pickTimerSec: 0 } });
  m.start(code, hostId);
  m.pick(code, hostId, 'garchomp'); // Ash
  assert.equal(room.state.picks[0].playerId, hostId);
  m.pick(code, hostId, 'dragapult'); // Misty, via host device
  assert.equal(room.state.picks[1].playerId, room.state.players[1].id);
  m.pick(code, hostId, 'kingambit'); // Brock
  m.pick(code, hostId, 'greattusk'); // Gary
  assert.throws(() => m.pick(code, hostId, 'gholdengo'), /Not your turn/); // Tracey is remote
  m.pick(code, guest, 'gholdengo');
  m.pick(code, guest, 'ironvaliant'); // snake: Tracey again
  assert.equal(currentPlayerId(room.state), room.state.players[3].id);
  m.shutdown();
});
