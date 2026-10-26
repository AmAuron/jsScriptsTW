Status: approved

# Plan: defTroopsCounter layout v2 (spec.md AC-1..AC-13)

All code is in `defTroopsCounter.js` (one IIFE, 380 lines). Tests: `tests/core.test.js`, `tests/run.test.js`, `tests/fixtures.js`.
Line numbers are for main @ b3cd794.

## Tasks
- [x] T1 Constants + strings (anchor defTroopsCounter.js:4-60). AC-11, AC-12.
  - Keep `DEF_UNITS`. Add `VERSION = '2.0.0'`, `SKIP_UNITS = ['militia']`.
  - Both locales: delete `summary`, `sum`, `na`, `spear`, `sword`, `heavy`, `archer`. Add `all` ('All' / 'Todas') and
    `units: { spear, sword, axe, archer, spy, light, marcher, heavy, ram, catapult, knight, snob }`.
    en: Spearman, Swordsman, Axeman, Archer, Scout, Light cavalry, Mounted archer, Heavy cavalry, Ram, Catapult, Paladin, Nobleman.
    pt: Lanceiro, Espadachim, Viking, Arqueiro, Explorador, Cavalaria leve, Arqueiro a cavalo, Cavalaria pesada, Aríete, Catapulta, Paladino, Nobre.
  - pt_PT `scavenging: 'Em busca'`. Titles unchanged.
  - New `unitName(strings, u)`: own-property lookup in `strings.units`, else `u`.
- [x] T2 Generic counts (anchor :120-123 `emptyCounts`). `emptyCounts(units)` → `{u: 0}` for each unit in `units`.
  Unit-keyed maps (`cols`, `icons`, scavenge `counts`) are `Object.create(null)` and lookups use `u in map` on them, so a header unit named
  `constructor`/`toString` is just another unit (E11).
- [x] T3 `parseUnitsTable(doc)` (anchor :143-188). AC-1, AC-3.
  - Header loop already builds `cols` (unit → visual column). Also build `units` (header order, first occurrence, minus SKIP_UNITS)
    and `icons` (`{unit: rawSrc}` from the same img's `getAttribute('src')`).
  - Spear/sword/heavy still required (unchanged error shape).
  - Per village: `counts = emptyCounts(units)`; read every unit in `units` with `cellAtColumn`/`parseCount`; null → unreadable++.
  - Return `{ ok: true, villages, unreadable, units, icons, pages }` (drop `hasArcher`).
- [x] T4 `parseScavengePage(html)` (anchor :190-225). AC-1. Count every key of `unit_counts` that matches `/^[a-z]+$/`
  (same strict value check; bad value → unreadable++). `counts` starts `{}`; add with `(counts[u] || 0) + n`.
- [x] T5 `summarize(homeVillages, scavVillages, x, units)` (anchor :227-256). AC-2.
  - Entries hold `home`/`scav` = `emptyCounts(units)`; copy/add only keys in `units` (other keys ignored).
  - def = Σ over DEF_UNITS of `(e.home[u] || 0) + (e.scav[u] || 0)` (archer absent → 0). Qualify when def > x.
  - Rows `home`, `scavenging`, `total` = `emptyCounts(units)` summed for every unit in `units`; no `sum`.
  - Return `{ villagesTotal, villagesQualifying, home, scavenging, total, unreadable, units }` (drop `hasArcher`).
  - Unchanged: noid key/unreadable, string/number id merge, duplicate home id kept once, scav-only village counts.
- [x] T6 `safeIconSrc(src)` new, pure. AC-3, AC-10. Returns `src` when it is a string matching `^https?://` (case-insensitive) or
  `^/(?!/)`, else `null`.
- [x] T7 `parseGroupMenu(text, allLabel)` new, pure. AC-5. Returns `[{id: string, name: string}]`, always starting with
  `{id: '0', name: allLabel}`. `JSON.parse` in try; not an object with array `result` → just the "All" entry. For each entry:
  skip non-objects, `type === 'separator'`, and ids that are not (whole number >= 0) or `/^\d+$/` string; id = `String(Number(id))`;
  id '0' is skipped (already first); dedupe (first wins); name = `String(e.name ?? '').trim()` or `'#' + id` if empty.
- [x] T8 Render (anchor :102-118 `renderHtml`). AC-3, AC-4, AC-6, AC-11.
  - `renderTable(view, strings, units, icons)` → `<table class="vis">`: header `<th></th>` + per unit
    `<th style="text-align:center">` with `<img src alt title>` when `safeIconSrc(icons[u])`, else the escaped name;
    3 rows (home, scavenging, total), label `<td>` left aligned, numbers `<td style="text-align:center">`.
  - `renderHtml(view, strings, groups, units, icons, ids)` (`ids = {select, table}`) →
    `<h2>title</h2><p><select id=…>options</select></p><div id=…>${renderTable}</div>${warn}${footer}`.
    Option 0 `selected`. Warn `<p>` only if `view.unreadable > 0`. Footer `<p><small><b>${title} v${VERSION}</b></small></p>`.
    Everything through `escapeHtml` (names, ids, src, title).
- [x] T9 `run(deps)` (anchor :260-349). AC-5..AC-10, AC-13.
  - Run id: `const rid = (root.__defTroopsCounterRuns = (root.__defTroopsCounterRuns || 0) + 1);` right after the busy flag is set;
    `ids = { select: 'dtc_group_' + rid, table: 'dtc_table_' + rid }`.
  - Order of GETs: config (no wait, unchanged), then group menu: `await deps.wait(GAP_MS)`; `GET /game.php?village=<id>&screen=groups&mode=overview&ajax=load_group_menu`;
    call `deps.get` in its own try/catch, NOT through `fetchText` (that one fails the run); a rejected get, or a non-string/empty reply,
    → `parseGroupMenu(null, strings.all)` (only "All"; no error). Then overview, then scavenging (unchanged).
  - Extract the overview block (:281-315) into closure `readGroup(group)` that builds `base` with `group=${group}` and returns
    `{ villages, units, icons, unreadable }`; it throws RunFailure through `fail` exactly as today. First run = `readGroup('0')`.
    Keep `hasArcher` logic out; `units`/`icons` come from the first page read.
  - `view0 = summarize(home0, scav, x, units)`; `view0.unreadable += unreadable` (as today); `showDialog('def_troops_counter', renderHtml(view0, strings, groups, units, icons, ids))`.
  - Switch closure (made inside run, after showDialog): `cache = new Map([['0', view0]])`, `shown = '0'`, `latest = '0'`,
    `chain = Promise.resolve()` (serialises group fetches so the 200 ms gap holds across switches).
    `onChange(value)`: `g = groups.some(gr => gr.id === String(value)) ? String(value) : '0'`; `latest = g`;
    view = cache.get(g) or: `p = chain.then(() => readGroup(g)); chain = p.catch(() => {}); r = await p;`
    ids = Set of `String(v.id)` for `r.villages` with id != null; `view = summarize(r.villages, scav.filter(v => ids.has(String(v.id))), x, units)`; `cache.set(g, view)`.
    `r.unreadable` is NOT added to the group view (warning is global, first run only; the table HTML has no warning anyway).
    Then `if (latest !== g) return;` `if (!deps.setHtml(ids.table, renderTable(view, strings, units, icons))) return;` `shown = g`.
    catch: RunFailure → if `latest === g`: `deps.showError(msg)`, `latest = shown`, `deps.setValue(ids.select, shown)`; else ignore.
    Other errors → `deps.showError(String(e && e.message || e))` (never unhandled).
  - `try { if (typeof deps.bindChange === 'function') deps.bindChange(ids.select, onChange); } catch (e) { /* AC-10: dialog stays */ }`
  - Return `'ok'` after binding; the busy flag is cleared in `finally` as today (switch fetches run after it).
- [x] T10 `browserDeps` (anchor :351-369). Add
  `bindChange(id, fn)`: el = document.getElementById(id); if !el return false; `el.addEventListener('change', () => { fn(el.value).catch(() => {}); })`; return true.
  `setHtml(id, html)`: el ? (el.innerHTML = html, true) : false. `setValue(id, v)`: if el, `el.value = v`.
  Export `parseGroupMenu`, `safeIconSrc`, `renderTable`, `VERSION` in `api` (:371).
- [ ] T11 Docs: CLAUDE.md "Current script" line unchanged. Nothing else.

## Edge cases (each → Test matrix)
- Unit header with militia → excluded from units (E1). Duplicate unit header icon → first column only (existing).
- Unknown unit key (e.g. `unit_xyz`) → included, name falls back to key (E2).
- Icon src `javascript:alert(1)`, `//evil.com/x.png`, `data:…`, missing → text label (E3); `"` in src escaped (E4).
- Group menu: not JSON, `{}`, `result` not array, separator, `group_id` -1 / 1.5 / "abc" / null, duplicate id, empty name, id 0 listed,
  name with `<script>` (E5). Group ids as number 12 and string "12" dedupe (E6).
- Select value not in the list (hand-edited) → group 0 from cache, no GET (E7).
- Scav unit_counts with `axe: 5` → counted; `xyz: 3` key not in units → ignored by summarize (E8); `axe: 'x'` → unreadable (E9).
- World without archer: no archer column; def threshold still works (E10).

## Failure and ordering paths (each → Test matrix)
- F1 Group menu GET rejects → combo has only "All", dialog shown, no error, overview still fetched.
- F2 Group fetch rejects → error with URL, setHtml not called, setValue(select, previous group), cache has no entry; second pick of same group re-fetches.
- F3 Race: pick A (slow), pick B (fast) → only B drawn; A cached afterwards but not drawn; a later pick of A uses the cache (no GET).
- F4 Two picks → their GETs are serialised (log shows wait before each GET; A's GETs all before B's).
- F5 setHtml returns false (dialog closed) → no throw, `shown` unchanged (a later setValue on failure uses the old value).
- F6 bindChange throws → run returns 'ok', one dialog, no error.
- F7 Two runs → different select/table ids (rid increments); old run's handler draws only into its own table id.
- F8 Failure in group A while B is latest → no error shown, no setValue.
- F9 Busy flag still false after run 'ok' even though a switch is pending.
- F10 Pick A (slow), pick B, B fails → error, setValue(select, shown='0'); A arrives later → cached, not drawn (latest was reset to shown). Documented behaviour.
- F11 Group fetch with a missing `#units_table`, a missing spear column, and the overview page cap → each: errNoTable / errMissingColumn / errOverviewCap with URL, table untouched, not cached.
- F12 Group fetch where the world ignores page=-1 and paginates → pages followed, numbers summed (readGroup pagination branch).
- F13 Switch with scavenging disabled (scav = []) → home numbers only.
- F14 bindChange returns false (element missing) → run 'ok', no error.

## Consumers
- `summarize` return: read by `renderHtml`/`renderTable` and run.test.js html checks (sum/n/a removed → tests updated).
- `parseUnitsTable` return `hasArcher`: only read in run (:291-302) → removed with it.
- `I18N` keys removed (`summary`, `sum`, `na`, unit keys): only read in renderHtml (:102-118) and core.test.js:228-229 → tests updated.

## Batches
- B1a (T1-T5, strings/parse/summarize): Read list defTroopsCounter.js:1-100 and :120-258, tests/core.test.js:1-215, tests/fixtures.js.
  Turns core.test.js `i18n|parseUnitsTable|parseScavengePage|summarize` green. renderHtml and run() stay broken until B1b/B2 (expected).
  Guard: `node --check defTroopsCounter.js && node --test --test-name-pattern="parseX|i18n|parseCount|parseUnitsTable|parseScavengePage|scavengingEnabled|summarize" tests/core.test.js`.
- B1b (T6-T8, safeIconSrc/parseGroupMenu/render): Read list defTroopsCounter.js:60-125 (strings helpers, old renderHtml), the T1-T8 lines of this plan,
  tests/core.test.js describe blocks safeIconSrc/parseGroupMenu/renderTable/renderHtml. Turns all of core.test.js green.
  Guard: `node --check defTroopsCounter.js && node --test tests/core.test.js` (run.test.js is red until B2, expected).
- B2 (T9-T10, run): Read list defTroopsCounter.js from `function RunFailure` to end of file, the T1-T10 signatures in this plan,
  tests/run.test.js, tests/fixtures.js. Turns run.test.js green. Guard: `npm test` (whole suite).

## Test matrix (written first by test-writer; B = batch that turns it green)
fixtures.js: add `groupMenu(list)` → `JSON.stringify({ result: list })`; `unitsHtml` gains an `icons` option (unit → src) defaulting to `/graphic/unit/unit_<u>.png`.
core.test.js (B1):
- i18n: key parity incl. `Object.keys(units)` parity; both have `all`; pt `scavenging === 'Em busca'`; no `sum`/`na`/`summary` keys (AC-12).
- parseUnitsTable: units in header order without militia (E1); icons map; unknown unit kept (E2); counts for axe/spy read; unreadable axe cell counted (AC-1).
- parseScavengePage: axe counted (E8); bad axe value → unreadable (E9).
- summarize: threshold uses def only (village with axe 10000, spear 0, x=100 → not qualifying); qualifying village sums axe too (AC-2);
  archer absent from units → def still correct (E10); keys outside units ignored (E8); existing threshold/merge/noid/dup cases ported to `C()` without sum.
- E11: header unit `constructor` → counted as a unit, no crash.
- safeIconSrc: '/g/a.png', 'https://x/a.png', 'HTTP://x' ok; '//x', 'javascript:', 'data:', '', null, 5 → null (E3).
- parseGroupMenu: all E5/E6 cases, failure → `[{id:'0',name:'All'}]` (AC-5).
- renderTable: header img per unit with title = translated name; bad src → text (E3); `"` escaped (E4); 4 `tr`; no 'Sum'; centred cells (AC-3/4).
- renderHtml: select with ids.select, option 0 selected, options escaped, div ids.table, footer has `v2.0.0`, warning only when unreadable > 0, title escaped (AC-6/11).
run.test.js (B2): setup adds `GROUPS` url, fake `bindChange` (stores handler, can be set to throw), `setHtml` (records, returns configurable bool), `setValue` (records); happy routes include GROUPS.
- gets order `[CONFIG, GROUPS, OVERVIEW]` and `wait:200` before GROUPS (AC-5, AC-13); existing pagination/scav get lists gain GROUPS.
- F1; dialog html contains `<select id="dtc_group_1"` and options from the menu.
- switch to G: GET `…&group=G&page=-1`, setHtml(table id) with that group's numbers incl. scavenging for its villages only (AC-7).
- cache: second pick of G → no new GET; pick '0' → no GET (AC-7); E7.
- F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14.
- existing AC-1/2/8/9/11 run tests still pass (adjusted only for GROUPS url and removed sum).

## Checks
- `npm test` (node --check + node --test). No server, no smoke. Batch guards: per batch, see Batches (whole `npm test` only from B2).

## Dependencies
None.

## Risks
- Group-menu JSON shape unverified live → parser fails soft to "All" (AC-5); open question in spec.
- A new run started while an old dialog's switch fetch is in flight can exceed 5 req/s briefly; old dialog is replaced by Dialog.show, so its next switch is unlikely. Accepted (spec AC-13 limits the gap rule to within a run and within the switch chain).
- Tests that relied on `hasArcher`/`sum`/`n/a` must be rewritten, not deleted silently: test-writer ports each case.

## Build notes
- B1b: api export now has renderTable, safeIconSrc, parseGroupMenu, unitName, VERSION (B2 T10 only needs browserDeps). run() still calls old renderHtml until B2.
- B1a: unitName(strings,u) added (not yet in api export). TEST-FIX core.test.js:110 icons test used src without unit_ pattern, unidentifiable per plan T3.
- B2: readGroup body is not re-indented (inside run closure); browserDeps uses rt.document for bind/setHtml/setValue.
