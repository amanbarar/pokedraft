# PokeDraft League

A real-time Pokemon draft league. Each trainer gets a points budget (100 by default) and drafts a team (10 by default) turn by turn from a shared pool of 1,213 Pokemon spanning all nine generations. Fully evolved Pokemon, legendaries and competitive meta threats cost more than their weaker alternatives.

## Quick start

```bash
npm install
npm run dev          # server on :3001 + client on http://localhost:5173
```

Production:

```bash
npm run build        # builds the client into dist/
npm start            # serves app + API + websockets on http://localhost:3001 (PORT env to change)
```

Other scripts: `npm test` (rules and draft engine tests), `npm run typecheck`, `npm run data` (refresh the Pokedex from Pokemon Showdown), `npx tsx scripts/e2e-smoke.ts http://localhost:3001` (full two-client draft against a running server).

## How a draft works

There are two ways to play:

- **Online:** each player joins the room from their own device with the 5-letter code or invite link.
- **On this device (pass & play):** on the home page, pick *On this device* and enter 2-6 player names. Everyone drafts from one screen: the header shows whose pick it is and a toast says who to pass the device to. You can mix modes: the host can add local players, bots and online players to the same room (*+ Add local player* in the lobby).

1. The host creates a room, picks a format preset and shares the code (online) or lists the players (local).
2. Friends join; the host can add bots, reorder or shuffle the draft order, and customize every rule.
3. Trainers pick in snake (or linear) order with an optional pick timer. When the timer runs out, the server auto-picks.
4. The host can pause, undo, force an auto-pick, or send everyone back to the lobby.
5. Once every roster is full, teams can be copied as a Showdown import or the whole draft as CSV.

Refreshing or reconnecting keeps your seat: a per-browser token is stored in localStorage. Rooms are saved to `data/rooms.json`, so drafts survive a server restart.

## Pricing

Standard costs range from 1 to 20 points (`shared/pricing.ts`):

- **Meta value**: the Smogon tier (Uber > OU > UU > ... > LC), using the National Dex tier for Pokemon not in the current games. This carries 60% of the weight.
- **Raw power**: base stat total, 40% of the weight.
- **Premiums**: +1 fully evolved, +2 legendary/mythical, +3 box legendary, +1 Ultra Beast/Paradox, +2 Mega.
- **Evolution guarantee**: every evolution costs strictly more than its pre-evolution, and every Mega costs more than its base form (for example Bulbasaur 2, Ivysaur 4, Venusaur 7).

Fully evolved Pokemon average exactly 10 points, which matches a 100-point, 10-pick budget.

**Price groups** let the host set one fixed price for a whole category: Box Legendary, Legendary, Mythical, Ultra Beast, Paradox, Mega, or a **custom group** they name and fill with any Pokemon (e.g. "Restricted threats: Garchomp, Dragapult = 25"). If a Pokemon matches several groups, the group highest in the list wins (reorder with the arrows). Groups are under *Rules & format → Pricing*; in the *Pool & prices* tab, clicking a Pokemon shows its group and lets the host tick which custom groups it belongs to.

**Saved price groups** (the *Price groups* page in the top nav) are custom groups stored on the server in `data/price-groups.json`, so they survive restarts and can be reused in any draft. Pick members with the multi-select picker: filter by name, type, generation, category, stage or cost, then click Pokemon to tick them or use *Select all matching*. In a lobby, *+ From saved groups* loads a copy into the room, and *Save to library* / *Update saved group* stores a room's custom group. A room keeps its own copy, so editing the library never changes a draft that's already running. The API is `GET/POST /api/price-groups` and `PUT/DELETE /api/price-groups/:id`. There are no accounts, so anyone who can reach the server can edit the library.

Price order: the pricing mode's cost, then price groups, then single-Pokemon overrides (which beat everything).

Formats can instead use **Scaled to pool** pricing (ranks the pool and spreads costs across a min–max range, for narrow pools like Legendary-only) or **Flat** pricing. The host can also override any single Pokemon's price or ban it from the lobby's *Pool & prices* tab.

## Formats

A format is plain data (`FormatSettings` in `shared/types.ts`), so new modes need no code changes:

| Setting | Options |
|---|---|
| Pool | generations, types, evolution stages, BST range, individual bans, species clause |
| Special categories | Legendary, Box Legendary, Mythical, Ultra Beast, Paradox, Mega, Regional forms: each set to **Allow**, **Ban**, or **Only** |
| Team rules | monotype (all picks share a type), max legendaries, max Megas, max per type |
| Pricing | standard, scaled to pool, or flat; min/max cost; price groups (category or custom); per-Pokemon overrides |
| Draft | budget, team size, max players, snake/linear order, pick timer |

Built-in presets (`shared/formats.ts`): Standard, Legendary Clash, Commoners Cup, Monotype, Type Takeover, Little Cup, Retro League, Mega Mayhem, Balanced League and Flat Draft. To add one, append a `preset(...)` entry.

### Pick legality

The same rules engine (`shared/rules.ts`) runs on the server, which enforces picks, and on the client, which greys out illegal picks and explains why. A pick is rejected if it:

- is out of turn or already drafted (including other formes of the same species under the species clause),
- costs more than your remaining budget,
- breaks a team rule,
- or leaves too few points to fill your remaining slots with the cheapest Pokemon still available. This means nobody can get stuck with an unfinishable team.

## Project layout

```
shared/     rules engine, pricing, format presets, types, pokedex.json (used by server and client)
server/     Express + Socket.IO server, room/draft state machine, JSON persistence
client/     React + Vite UI (home, lobby, live draft, results, price list)
scripts/    Pokedex builder and end-to-end smoke test
```

Pokemon data and sprites come from [Pokemon Showdown](https://play.pokemonshowdown.com).
