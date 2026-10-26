# Critique: defTroopsCounter layout v2

## Plan review
1. High: B1's guard (`npm test`) could not pass while run() still used the old signatures. Fixed: B1 split into B1a and B1b with core-only guards; whole `npm test` only from B2.
2. Medium: the group-menu GET through `fetchText` would fail the run. Fixed: it calls `deps.get` in its own try/catch, and a non-string or empty reply falls back to "All".
3. Medium: B2's Read list was too thin. Fixed: it now runs from `RunFailure` to the end of the file, plus the plan's signatures, run.test.js and fixtures.js.
4. Medium: B1 was too big. Fixed: split into B1a (T1-T5) and B1b (T6-T8).
5. Medium: the switch path had test gaps. Fixed: added F11 (no table, missing column, page cap), F12 (pagination), F13 (no scavenging) and F14 (bindChange false), and stated that a group view doesn't add `r.unreadable`.
6. Low: switch fetches can overlap a new run. Accepted and noted in Risks.
7. Low: a failed pick resets `latest`. Documented as F10.
8. Low: Object.prototype unit keys. Fixed: unit maps use `Object.create(null)`, and E11 was added.

## Code audit
Read in full: defTroopsCounter.js, tests/core.test.js, tests/fixtures.js. The diff for tests/run.test.js (about lines 908-1270) was not read, so run-level test coverage was not checked.
No critical or high findings. The escaping, `safeIconSrc`, group-menu parsing and threshold logic match AC-1..AC-6 and AC-11/12.

1. (fixed) Medium, `fix` (AC-7 caching): defTroopsCounter.js, onChange (about line 355-363). `cache.get(g)` is checked before the fetch starts, and the result is cached only after it finishes. If the user picks an uncached group G, picks H, then picks G again while the first G fetch is still in flight, both picks find no cache entry and each runs a full `readGroup(G)`. That doubles the GETs, including page loops. The 200 ms gap still holds because of the serial chain. Fix: keep a `pending` Map of group id to in-flight promise, reuse it, and delete the entry on failure so retry still works (about 8 lines).
2. Low, `todo`: defTroopsCounter.js, `parseScavengePage`, `counts = {}` (about line 259-269). A scavenge `unit_counts` key named `constructor` passes `/^[a-z]+$/`. `counts[u] || 0` then returns `Object.prototype.constructor`, which is truthy, so the sum becomes a string such as "function Object()...5". The `copyInto` call in `summarize` only copies it if the header also has a `constructor` unit. In that case the row cells and totals become garbage. Fix: use `Object.create(null)` for `counts` there.
3. Low, `todo`: defTroopsCounter.js, `parseScavengePage` (about line 262-270). An unreadable scavenge value for a unit with no overview column increments `unreadable`, although the spec says such a unit is ignored. The result is a spurious warning. Fix: skip the unit before counting it, which needs the header unit list passed in.
