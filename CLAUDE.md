# jsScriptsTW

Tribal Wars browser scripts, served from GitHub Pages and loaded with `$.getScript`.

- Each script is one plain ES2020 browser file at the repo root (no build step, no jQuery inside).
- Current script: `defTroopsCounter.js` (see `spec.md` and `architecture-plan.md` while a build is in flight).
- Tests: `node:test` + `node:assert/strict`, CommonJS `require('../defTroopsCounter.js')`, jsdom for DOM parsing. Fixtures in `tests/fixtures.js`.
- Check: `npm test` (= `node --check defTroopsCounter.js && node --test 'tests/*.test.js'`). No server, so no smoke check.
- Scripts only issue GET requests through the injected `get` dependency; no module-level mutable state.
- Pre-commit housekeeping: archive `spec.md`, `architecture-plan.md` and `critique.md` under `docs/archive/<feature>/`.

## Gotchas
- Hosting: the scripts are served by GitHub Pages from `main` (root). If Pages is off, the URL 404s and `$.getScript` fails silently, so the bookmarklet just does nothing. A new script is live only after its PR is merged.
- Parsing game data: never trust `Number()` or `+x`. `''`, `null`, `[]` and `false` become 0 and `true` becomes 1. Accept a finite number or a `/^\d+$/` string, and count anything else as unreadable.
- Unit maps: read count maps with `Object.hasOwn`, never `obj[key] || 0`, because a key such as `constructor` resolves to `Object.prototype`.
- Overview pagination: Tribal Wars renders the current page in `.paged-nav-item` as plain text, not a link, so the nav links never include the page you are on.
