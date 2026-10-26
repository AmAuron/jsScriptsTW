Status: approved

# Plan: defTroopsCounter (spec.md)

The repo is empty and has no git yet. The orchestrator's pre-flight bootstraps it (see Checks). All code lives in one browser file,
`defTroopsCounter.js`, at the repo root (GitHub Pages serves it). It is plain ES2020, no build step, no jQuery inside (only `$.getScript` loads it).

## File shape: defTroopsCounter.js (new file)
```
(function (root) {
  'use strict';
  const DEF_UNITS = ['spear', 'sword', 'heavy', 'archer'];
  const MAX_X = 10000000, MAX_SCAV_PAGES = 100, GAP_MS = 200;
  const I18N = { en_US: {...}, pt_PT: {...} };
  ...functions below...
  const api = { DEF_UNITS, MAX_X, MAX_SCAV_PAGES, GAP_MS, I18N, parseX, pickStrings, parseCount, parseUnitsTable,
                parseScavengePage, scavengingEnabled, summarize, renderHtml, run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else run(browserDeps(root));
})(typeof window !== 'undefined' ? window : globalThis);
```
Shared shape `Counts = {spear, sword, heavy, archer}` (integers >= 0); `Row = Counts & {sum}`.

## Tasks
- [x] T1 (B1a) `I18N` + `pickStrings(locale) -> strings` (en_US fallback). Keys, the same in both locales:
  `title, summary ("{q} of {n} villages have more than {x} def troops"), home, scavenging, total, spear, sword, heavy, archer, sum, na,
  unreadable ("{n} unreadable values were counted as 0"), loading, errUsage (includes the example `javascript:var MIN_TROOPS=5000;$.getScript('https://amauron.github.io/jsScriptsTW/defTroopsCounter.js');`),
  errPremium, errFetch ("... {url}"), errConfig ("... {url}"), errNoTable ("... {url}"), errMissingColumn ("... {unit} ... {url}"), errScavenge ("... {url}"), errScavengeCap ("... {url}"), errBusy`.
  `format(str, vars)` replaces `{k}`. AC-7, AC-1.
- [x] T2 (B1a) `parseX(raw) -> {ok:true, x} | {ok:false}`. It accepts a number, or a string of digits after trim. It must be an integer, 0 <= x <= MAX_X.
  `undefined`, null, '', '5k', '5.5', 5.5, -1, NaN, Infinity, MAX_X+1 and booleans are all rejected. AC-1.
- [x] T3 (B1a) `parseCount(text) -> number|null`. Trim it, strip `.`, `,`, spaces and NBSP thousands separators, then it must match `/^\d+$/`, else null. AC-6.
- [x] T4 (B1b) `parseUnitsTable(doc) -> {ok:true, villages:[{id:string|null, counts:Counts}], unreadable, hasArcher} | {ok:false, error:'noTable'} | {ok:false, error:'missingColumn', unit}`.
  It uses only DOM APIs (`querySelector`), so it works in jsdom and the browser.
  Table: `#units_table`, or `noTable`. Header row: the first `tr` in the table (anywhere, thead or not) that holds an `img` whose `src` matches
  `UNIT_IMG = /\/unit_([a-z]+)[^/]*\.(?:png|webp|gif)(?:\?|$)/i` (so `unit_spear_2.png` and `unit_spear@2x.png` both read as spear). No such row: `missingColumn` 'spear'.
  Column index: the sum of `colSpan` of the earlier cells in that row (colspan-aware), so a td at the same visual position is found by walking the village row's cells by colSpan too.
  spear/sword/heavy are required, else `missingColumn`. archer is optional (`hasArcher`).
  Villages: one per `tbody` of the table, skipping a tbody that has no `tr`, that contains the header row, or whose first `tr` has no `td`. Its first `tr`'s cells at the same visual indices give the counts.
  `parseCount` null or a missing cell: 0, unreadable++. Archer is 0 when there is no column, and that does not count as unreadable.
  id: `.quickedit-vn[data-id]`, else the first `[data-id]`, else `/[?&]village=(\d+)/` from the first `a[href]`; else null.
  Also returns `pages`: the sorted unique N >= 0 from every `a[href]` inside `.paged-nav-item` or `#paged_view_content .paged-nav-item` matching `/[?&]page=(\d+)/` (an empty list when there is no nav). AC-3, AC-4, AC-6.
- [x] T5 (B1b) `parseScavengePage(html) -> {ok:true, villages:[{id:string, counts:Counts}], unreadable} | {ok:false}`.
  Find `ScavengeMassScreen` (missing: fail). In the lines after it, take the first line whose trim starts with `[` and ends with `]` or `],`.
  Drop a trailing comma, then `JSON.parse` (a throw: fail). It must be an array (else fail).
  Each element must be an object with a `village_id` number or digit string (else fail).
  A missing `village_id` fails the whole page on purpose (AC-8: unknown shape, so no numbers rather than wrong numbers).
  Squads: `Object.values(el.options || {})` (array or object). For each option whose `scavenging_squad` is an object (null/undefined skipped) with an object `unit_counts`,
  add DEF_UNITS from it (other keys such as militia, spy are ignored). A missing key is 0. A value that is not a non-negative integer (after Number()): 0, unreadable++. AC-11, AC-6.
- [x] T6 (B1a) `scavengingEnabled(xmlText) -> true|false|null`. null (unreadable) when the text has no `<config` tag and no `</config>` (e.g. an HTML login page).
  Otherwise take the `<game>...</game>` block (regex, non-greedy) and in it `/<scavenging>\s*(\d+)\s*<\/scavenging>/`: "1" is true; any other value, or no tag, is false.
  (A regex, not DOMParser, so it is pure for Node; the `<game>` scoping matches the spec's `config>game>scavenging`.) AC-11.
- [x] T7 (B1b) `summarize(homeVillages, scavVillages, x, hasArcher) -> {villagesTotal, villagesQualifying, home:Row, scavenging:Row, total:Row, unreadable, hasArcher}`.
  Merge into a Map keyed by id (String). A home village with id null gets key `noid:<index>` and unreadable += 1.
  A scav-only id creates an entry (home 0). The same id seen twice in the scav list is summed. A home id seen twice (overlapping overview pages) is kept once, the first one, with no warning.
  Qualifies when the sum over DEF_UNITS of (home+scav) > x. Only qualifying villages add to the Rows; total = home + scavenging per unit; sum = sum of the 4.
  The `unreadable` argument counts are added by run(), not here (summarize adds only the noid count). AC-5.
- [x] T8 (B1a) `renderHtml(summary, strings, x) -> string`. Holds an `h2` title, a `p` summary, and `table.vis` with a header (blank, spear, sword, heavy, archer, sum) and rows home, scavenging, total.
  The archer cells show `strings.na` when `!hasArcher`. There is a `p` warning only when unreadable > 0.
  Numbers are `String(n)`, with no locale formatting, so the tests are deterministic. Every string goes through `escapeHtml` (& < > " '). AC-7.
- [x] T9 (B2) `async run(deps) -> 'ok'|'error'|'busy'`. deps: `{root, get(url)->Promise<string>, wait(ms)->Promise, parseHtml(html)->Document, showError(msg), showInfo(msg), showDialog(id, html)}`.
  `root.game_data` and `root.MIN_TROOPS` come from `deps.root`. Order:
  1. strings = pickStrings(root.game_data && root.game_data.locale). If `root.game_data` is missing, it shows errPremium and returns 'error'.
  2. busy: `if (root.__defTroopsCounterRunning) { showError(errBusy); return 'busy' }` sits outside the try. Then it sets the flag to true, and only then opens a `try { ... } finally { flag = false }`.
     A 'busy' return never clears another run's flag. The flag is the one deliberate cross-run global (spec AC-9 notes it).
  3. parseX(root.MIN_TROOPS); fails: showError(errUsage), return 'error' with no get (AC-1)
  4. `!(game_data.features && game_data.features.Premium && game_data.features.Premium.active)`: errPremium, no get (AC-2)
  5. showInfo(loading)
  6. get(`/interface.php?func=get_config`)
     scavengingEnabled(text) === null: errConfig with that URL, 'error'.
  7. wait(GAP_MS), get(`/game.php?village=${game_data.village.id}&screen=overview_villages&mode=units&group=0&page=-1`), parseHtml, parseUnitsTable.
     If its `pages` is non-empty (the world paginated in spite of page=-1), fetch every listed `page=N` in ascending order, each one with wait(GAP_MS) first, and use their villages instead.
     A village id already seen is kept once (summarize). Any of those pages failing: the same errors, no dialog (no partial numbers).
  8. if scavenging: for N = 0..MAX_SCAV_PAGES-1: wait(GAP_MS), get(`/game.php?village=${id}&screen=place&mode=scavenge_mass&page=${N}`), parseScavengePage.
     Stop at an empty array, or when the first village_id equals the previous page's first id (that page is not added).
     If page MAX_SCAV_PAGES-1 (the 100th page, N=99) is fetched and still non-empty and not a repeat: errScavengeCap with the URL, 'error' (no partial numbers).
  9. summarize, add the parser unreadable counts, showDialog('def_troops_counter', renderHtml(...)), return 'ok'.
  Any get rejection: showError(format(errFetch, {url})). A parse failure gives the matching error. Each returns 'error' with no showDialog (AC-8).
  Every get after the first is preceded by wait(GAP_MS) (AC-12). The only state is local variables (AC-9). Only `get` is used (AC-10).
- [x] T10 (B2) `browserDeps(root)`:
  - `get`: `fetch(url, {credentials:'same-origin', signal})`, where an `AbortController` aborts after 30000 ms; it rejects when `!res.ok`, so a hung request cannot keep the busy flag forever
  - `wait`: setTimeout
  - `parseHtml`: `new DOMParser().parseFromString(h, 'text/html')`
  - `showError`: `root.UI.ErrorMessage`, `showInfo`: `root.UI.InfoMessage`, `showDialog`: `root.Dialog.show`
  The browser branch calls `run(...)` and `.catch`es into showError, so it never throws uncaught. Not unit-tested (glue); covered by the live run.

## Edge cases (each one has a test below)
- X bounds: 0 is accepted; MAX_X is accepted; MAX_X+1, -1, 5.5, '5.5', '', ' 7 ' (accepted as 7), '5k', NaN, Infinity and true are rejected.
- Ids: a home village with no id; the same id twice in scav pages; a scav-only id; ids as number vs string ("12" and 12 merge).
- Cells: '', 'abc', '1.234' (gives 1234), a missing td (a short row).
- Columns: archer missing (hasArcher false, shows n/a); heavy missing (error); the columns reordered (the header decides).
- Scavenge: no marker; malformed JSON; not an array; an element without village_id; a null squad; options as an object vs an array; empty array on page 0.
- Scav pagination: stops at an empty page; at a repeated first id; the 100-page cap (101 non-empty pages offered) gives errScavengeCap, 100 scav gets, no dialog.
- Overview pagination: a page=-1 response with a paged nav listing pages 0,1 gives 2 more gets, and the villages of both pages counted once each (overlap deduped).
- Header: a table with no thead (header tr in the first tbody) still parses, and that tbody is not a village; a colspan=2 header cell before the units shifts nothing; `unit_spear@2x.png` reads as spear.
- Ids: `.quickedit-vn[data-id]` wins over another `[data-id]` earlier in the tbody; a duplicate home id is counted once.
- Threshold: def == X is not counted; X+1 is counted; X=0 with an all-zero village is not counted.
- i18n: the pt_PT keys equal the en_US keys; an unknown locale falls back to en_US.
- Escaping: renderHtml output never holds a raw `<` that comes from a string.

## Failure and ordering paths
- Config get rejects: error with that URL, no further get, no dialog.
- Overview get rejects / noTable / missingColumn: error, no scav gets, no dialog.
- Scav page 2 fails to parse after page 1 parsed: error, no dialog (no partial numbers).
- Re-entry while running: the second run returns 'busy' and the flag is still true afterwards. The flag is cleared after both success and error (the next run then proceeds).
- Config returns a login HTML page (200): errConfig, no further get.
- No module-level mutable state: two runs with different X give independent summaries.

## Consumers
- None: the repo is new. `root.__defTroopsCounterRunning` is the only global the script writes, and only this file reads it.

## Batches
- B1a (T1-T3, T6, T8): the file skeleton, strings, the small parsers and the renderer. Read list: spec.md, this plan's T1-T3/T6/T8, tests/core.test.js (its `describe`s for parseX, i18n, parseCount, scavengingEnabled, renderHtml). Turns green: those describes.
- B1b (T4, T5, T7): the table/scavenge parsers and summarize, after B1a. Read list: this plan's T4/T5/T7, defTroopsCounter.js, tests/fixtures.js, tests/core.test.js (the remaining describes). Turns green: tests/core.test.js.
- B2 (T9-T10, after B1b): runner + browser glue, which append to the same file. Read list: this plan T9-T10, defTroopsCounter.js, tests/run.test.js. Turns green: tests/run.test.js.

## Test matrix (written first by test-writer, `node:test` + `node:assert/strict`, CommonJS `require('../defTroopsCounter.js')`)
tests/fixtures.js (helpers, no tests):
- `unitsHtml({units:['spear','sword','axe','spy','light','heavy','ram','catapult','snob'], villages:[{id, idVia:'data-id'|'href'|null, counts:{unit:text}}]})`
  builds `<table id="units_table"><thead><tr><th>Village</th><th></th>` + `<th><img src="/graphic/unit/unit_<u>.png"></th>` per unit + `</tr></thead>`,
  plus one `<tbody>` per village: a first row `<td>` (village name with `span.quickedit-vn[data-id]` or `a[href="/game.php?village=ID&screen=overview"]`), `<td>your own</td>`, then one td per unit,
  plus a second row "in village" with different numbers (must be ignored).
- `scavHtml(arr)` gives `<script>\n var x = new ScavengeMassScreen(\n {"a":1},\n ${JSON.stringify(arr)},\n 5\n );</script>`
- `doc(html)` gives `new JSDOM(html).window.document`.

tests/core.test.js (B1a/B1b; one `describe` per function):
- AC-1 parseX: each X-bounds case above.
- AC-7 i18n: key parity; pickStrings('xx_XX') === en_US; errUsage contains `MIN_TROOPS`.
- AC-6 parseCount: '12' gives 12; '1.234' gives 1234; '1 234' (NBSP) gives 1234; '' gives null; 'abc' gives null; '-3' gives null.
- AC-3/4 parseUnitsTable: a normal world without archer (the second row ignored, the ids read both ways); an archer world; columns reordered; header without thead; colspan header; `@2x` img; quickedit-vn id priority; `pages` [0,1] from a nav, [] without one;
  heavy missing gives missingColumn 'heavy'; no table gives noTable; a bad cell and a short row give unreadable 2 and no NaN; a tbody with no tr is skipped.
- AC-11 parseScavengePage: valid (2 villages, one with 2 squads, one null squad, one undefined squad, militia and spy in unit_counts ignored); options as an object; empty array gives villages [];
  no marker, malformed JSON, not an array, no village_id (intentional): all {ok:false}; a squad value 'x' gives unreadable 1.
- AC-11 scavengingEnabled: `<config><game><scavenging>1</scavenging></game></config>` gives true; 0 gives false; no tag gives false; `<scavenging>1</scavenging>` outside `<game>` gives false; `<html>login</html>` gives null.
- AC-5 summarize: the threshold cases; merge by id incl. "12"/12; scav-only; a duplicate scav id summed; noid gives unreadable 1 and home counted; totals equal home+scav.
- AC-7 renderHtml: holds the 3 rows and the sum as plain digits (e.g. `12345`); n/a when no archer; warning present only when unreadable > 0; a string with `<b>` in strings is escaped.

tests/run.test.js (B2), with fakes: `get` serves a URL map (or rejects), `wait` logs ms into the same call log as `get`, and the show* calls are recorded:
- AC-1: MIN_TROOPS missing gives 'error', errUsage, 0 gets.
- AC-2: premium false gives errPremium, 0 gets.
- AC-3/5/7: the happy path without scavenging (config 0) gives 2 gets (config, overview with `group=0&page=-1`), 1 showDialog whose html holds the expected sum.
- AC-11: scavenging on, pages 0 and 1 with data and page 2 [] give 5 gets and add scav numbers; a repeated first id stops; the 100-page cap stops (MAX_SCAV_PAGES gets of scav).
- AC-12: the log shows `wait(200)` before every get but the first.
- AC-8: config rejects / config is a login page / overview rejects / noTable / scav page 1 malformed / scav cap each give 'error', the error text holds the failing URL in every case, 0 showDialog.
- AC-3: overview pagination (nav with pages 0,1) gives the extra gets, deduped villages, and a dialog.
- AC-7: `game_data.locale='pt_PT'` gives the pt_PT dialog title; locale undefined gives en_US; `game_data` missing gives 'error' with no throw.
- AC-9: busy flag set gives 'busy', 0 gets, and the flag is still true afterwards; after an error run the flag is false; two sequential runs with different X give different summaries.
- AC-10: every requested URL is a GET via deps.get (no other channel in deps), and none contains `page_size` or `action=`.

## Checks
- Iterate: `cd /home/jsimao/projects/jsScriptsTW && node --test 'tests/*.test.js' 2>&1 | tail -n 30`
- Syntax: `node --check defTroopsCounter.js`
- Final: `npm test` (= `node --check defTroopsCounter.js && node --test 'tests/*.test.js'`). There is no server, so no smoke check.
- Batch guards: `npm test` (the whole suite is small).
- Pre-flight bootstrap (orchestrator):
  - `git init -b main`
  - write `package.json` (`private`, `"scripts":{"test":"node --check defTroopsCounter.js && node --test 'tests/*.test.js'"}`, devDependency `jsdom` 30.1.3), `.gitignore` (node_modules/), and `CLAUDE.md`
  - initial commit on main (without spec/plan), then `git checkout -b feature/def-troops-counter`, then `npm install`
  - there is no remote yet: creating the GitHub repo and turning on Pages happen at the push step, after the user's yes.

## Dependencies
- jsdom 30.1.3 (devDependency only, for tests). Node v24.22.1 is installed.

## Risks
- Live markup differs from the fixtures (scavenge JSON on one line, header img naming): the errors are explicit (no wrong numbers), and the first live run verifies it.
- `page=-1` is ignored by a world: handled by T9 step 7, which follows the paged nav (GETs only) with every page fetched, or an error.
- TW script rules (unapproved script): the user's call, noted in the README.
- Number formatting in cells: parseCount strips the separators; anything else is flagged unreadable, never NaN.

## Build notes
- B1a: exports so far include format; api has no parse/summarize/run yet and no browser branch (B2 adds 'else run(browserDeps(root))'). escapeHtml is internal.
- B1b: api now exports parseUnitsTable, parseScavengePage, summarize (internal helpers emptyCounts, cellAtColumn, villageIdFromRow, UNIT_IMG). Nothing else deviates.
