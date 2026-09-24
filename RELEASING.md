# Releasing

PokeDraft uses [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)-style release notes in
[CHANGELOG.md](CHANGELOG.md). There is no CI/CD pipeline yet, so releases are cut
and deployed by hand using the steps below.

## Pre-1.0 versioning

The project hasn't reached a stable `1.0.0` yet. Until it does, every release is a
`0.0.x` build with a Pokemon town codename as its prerelease suffix, e.g. `0.0.1-pallet`
(the first release, named for Pallet Town — where a Pokemon journey starts). Each
release bumps the patch number and moves to the next town, in whatever order you like
(`0.0.2-viridian`, `0.0.3-pewter`, ...). Drop the codename and switch to ordinary
`MAJOR.MINOR.PATCH` bumps once the format/API surface is stable enough to call it `1.0.0`.

## 1. Decide the version

- **Pre-1.0** — pick the next `0.0.x-townname` (see above).
- **Post-1.0 patch** (`1.0.x`) — bug fixes, no behavior/API changes.
- **Post-1.0 minor** (`1.x.0`) — new features, backward-compatible.
- **Post-1.0 major** (`x.0.0`) — breaking changes (room/save-file format, API, etc).

## 2. Verify main is releasable

```bash
git checkout main
git pull
npm ci
npm run typecheck
npm test
npm run build
```

All four must pass before continuing.

## 3. Update the changelog

Move everything under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) into a new
dated section, and add fresh comparison links at the bottom of the file:

```markdown
## [Unreleased]

## [0.0.2-viridian] - YYYY-MM-DD

### Added
- ...

### Fixed
- ...
```

```markdown
[Unreleased]: https://github.com/amanbarar/pokedraft/compare/v0.0.2-viridian...HEAD
[0.0.2-viridian]: https://github.com/amanbarar/pokedraft/compare/v0.0.1-pallet...v0.0.2-viridian
```

(Post-1.0, the same pattern applies with plain `vX.Y.Z` tags instead of town names.)

## 4. Bump the version and tag

While on codenamed pre-1.0 versions, `npm version` can't pick the next town name for
you, so set the version by hand, then commit and tag (commit the changelog first so
it's included):

```bash
git add CHANGELOG.md
git commit -m "Update changelog for v0.0.2-viridian"

npm version 0.0.2-viridian -m "Release v0.0.2-viridian"
```

This creates a `v0.0.2-viridian` commit and matching annotated git tag. Once the
project moves past codenames, `npm version patch|minor|major` works normally.

## 5. Push

```bash
git push origin main
git push origin vX.Y.Z
```

## 6. Publish the GitHub release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes-file <(awk '/^## \[X.Y.Z\]/{flag=1; next} /^## \[/{flag=0} flag' CHANGELOG.md)
```

Simplest in practice: run `gh release create vX.Y.Z` without `--notes-file` and paste the
new CHANGELOG.md section into the editor GitHub opens, or copy it in via `--notes`.

## 7. Deploy

There's no hosting platform wired up yet. Once one is chosen, replace this section with
the concrete steps (e.g. a platform's git-push deploy, or a Dockerfile + registry push).
Until then, deploying a release means, on the target machine/server:

```bash
git fetch --tags
git checkout vX.Y.Z
npm ci
npm run build
npm start   # or restart the process under your process manager (pm2, systemd, etc.)
```

`PORT` (default `3001`) and any other env vars should already be set in the server's
environment; rooms and saved price groups live in `data/`, which is gitignored, so they
persist across deploys as long as that directory isn't wiped.

## 8. Sanity check

Open the deployed URL, create a room, and confirm a draft can start end-to-end
(`npx tsx scripts/e2e-smoke.ts <url>` can automate this against a running server).
