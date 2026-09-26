# Organic Reaction Navigator

An offline-first knowledge system for JEE organic chemistry: species, classes, reagents, reactions with conditions and outcomes, mechanisms, exceptions, routes and a versioned syllabus — explored through derived graph views.

**Status:** Phase 0 (architecture + scaffold) complete. Implementation starts at Phase 1.

## Quick start
```bash
nvm use            # Node 22
npm install
npm run check      # typecheck, lint, boundaries, size, hardcode, tests
npm run dev        # http://localhost:5173
```
Serve builds over http(s) (`npm run build && npm run preview`); opening `index.html` from disk is not supported.

## Documentation
Start with `docs/ARCHITECTURE.md` (section map), then `docs/SONNET_HANDOFF.md` for implementation.
Rules for coding agents: `CLAUDE.md`. Current state: `docs/PROJECT_STATE.json`, `docs/PROGRESS.md`.

## Legacy
The single-file v6 app is a requirements reference only. Its data can be imported (Phase 3) via its "Export JSON" file; see `docs/MIGRATION.md §4`.
