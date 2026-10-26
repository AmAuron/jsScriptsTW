# jsScriptsTW

Tribal Wars browser scripts, served from GitHub Pages and loaded with `$.getScript`.

- Each script is one plain ES2020 browser file at the repo root (no build step, no jQuery inside).
- Current script: `defTroopsCounter.js` (see `spec.md` and `architecture-plan.md` while a build is in flight).
- Tests: `node:test` + `node:assert/strict`, CommonJS `require('../defTroopsCounter.js')`, jsdom for DOM parsing. Fixtures in `tests/fixtures.js`.
- Check: `npm test` (= `node --check defTroopsCounter.js && node --test 'tests/*.test.js'`). No server, so no smoke check.
- Scripts only issue GET requests through the injected `get` dependency; no module-level mutable state.
- Pre-commit housekeeping: archive `spec.md`, `architecture-plan.md` and `critique.md` under `docs/archive/<feature>/`.
