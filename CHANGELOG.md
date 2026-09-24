# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1-pallet] - 2026-09-25

First public release. Pre-1.0: the project is still under active development, and
early releases carry a Pokemon town codename until the API/format surface settles
into a stable 1.0.0 (see [RELEASING.md](RELEASING.md)).

### Added

- Real-time Pokemon draft rooms over Socket.IO, joinable with a 5-letter code or invite link.
- Pass & play mode: 2-6 local players draft from one shared screen, with prompts for whose turn it is.
- Mixed rooms: hosts can combine local players, bots, and online players in the same draft.
- Snake or linear draft order with an optional pick timer and server-side auto-pick on timeout.
- Host controls: pause, undo, force an auto-pick, reorder/shuffle draft order, or send everyone back to the lobby.
- Shared rules engine (`shared/rules.ts`) enforcing legal picks identically on server and client, including turn order, budget, species clause, and team rules.
- Pricing engine (`shared/pricing.ts`) combining Smogon tier, base stat total, and premiums (fully evolved, legendary/mythical, box legendary, Ultra Beast/Paradox, Mega), with a guarantee that evolutions always cost more than their pre-evolutions.
- Standard, Scaled-to-pool, and Flat pricing modes, plus per-Pokemon price overrides and bans.
- Price groups for setting one fixed price across a category (Box Legendary, Legendary, Mythical, Ultra Beast, Paradox, Mega) or a custom named group.
- Saved price groups library (`data/price-groups.json`) with a multi-select picker (filter by name, type, generation, category, stage, cost) and a REST API (`GET/POST /api/price-groups`, `PUT/DELETE /api/price-groups/:id`).
- Nine built-in format presets (Standard, Legendary Clash, Commoners Cup, Monotype, Type Takeover, Little Cup, Retro League, Mega Mayhem, Balanced League, Flat Draft), plus configurable pool, special-category, team, pricing, and draft rules.
- Pokedex data (1,213 Pokemon across nine generations) sourced from Pokemon Showdown, with a refresh script (`npm run data`).
- Result export: copy a team as a Showdown import, or the whole draft as CSV.
- Reconnect support via a per-browser token, and room persistence to `data/rooms.json` so drafts survive a server restart.
- End-to-end smoke test (`scripts/e2e-smoke.ts`) covering a full two-client draft against a running server.

[Unreleased]: https://github.com/amanbarar/pokedraft/compare/v0.0.1-pallet...HEAD
[0.0.1-pallet]: https://github.com/amanbarar/pokedraft/releases/tag/v0.0.1-pallet
