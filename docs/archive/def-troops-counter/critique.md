# Critique: defTroopsCounter

## Plan review
12 findings (2 high, 6 medium, 4 low), all patched into architecture-plan.md:
1. HIGH `page=-1` unverified → T9 step 7 follows a paged nav (GETs only); test added. (fixed)
2. HIGH scav 100-page cap gave silent partial data → errScavengeCap, no dialog; spec AC-11 reworded to pages 0..99. (fixed)
3. MED header parsing (no thead, colspan, header tbody counted as a village) → header = first tr with a unit img, colspan-aware, header tbody skipped. (fixed)
4. MED id source / duplicate home ids → `.quickedit-vn[data-id]` first; a duplicate home id is kept once. (fixed)
5. MED AC-8 URL missing in parse errors → `{url}` in every error key; tests assert it. (fixed)
6. MED busy flag ordering, missing game_data, hung fetch → flag outside try, game_data guard, 30 s AbortController; AC-9 notes the flag. (fixed)
7. MED toLocaleString flaky → String(n). (fixed)
8. MED B1 too big → B1a / B1b. (fixed)
9. LOW undefined squads, militia → skipped/ignored, tested; a missing village_id fails on purpose. (fixed)
10. LOW config looseness / login page → scoped to `<game>`, null on non-config gives errConfig. (fixed)
11. LOW i18n through run → pt_PT / missing-locale run tests. (fixed)
12. LOW pre-flight facts → jsdom 30.1.3 verified with npm view; Node v24 glob quoting is fine. `unit_x@2x` covered. (fixed)

## Code audit
Scope: defTroopsCounter.js, tests/*, package files. 4 findings (1 high, 1 medium, 2 low). No security hole found: output is HTML-escaped, only GETs go through `deps.get`, the village id comes from `game_data`.

- HIGH (fixed) `fix` defTroopsCounter.js:216-221 (parseScavengePage, AC-6): the scavenging counts are read with `Number(squad.unit_counts[u])`. `''`, `null`, `[]` and `false` become 0, and `true` becomes 1, with no unreadable warning. Likewise `'1e3'` becomes 1000 and `'0x10'` becomes 16. AC-6 says an empty or non-numeric value counts as 0 and adds to the warning, never silently. Failure: `{"spear": ""}` or `{"spear": true}` is absorbed into the totals and the dialog shows no warning. Fix: accept only a non-negative integer number or a `/^\d+$/` string, and otherwise do `unreadable++`. Add a test with `''`, `null` and `true`.
- MEDIUM (fixed, option a) `ask` defTroopsCounter.js:187-190, 295-304 (AC-3 fallback, can lose data): if the world ignores `page=-1`, the script fetches only the page numbers it finds in `.paged-nav-item a`. A nav that shows a window of pages (for example 1 2 3 ... or a next arrow) leaves the later pages unread. The dialog then shows partial numbers with no warning, and the village total is wrong too. The spec says "every listed page", so this matches the text, but the failure is silent. Options: (a) fetch the pages found, then keep following the highest page number plus one until a page repeats or is empty, like the scavenging loop; (b) raise an error if the nav has a next link or a gap in the page numbers; (c) keep it as is and note it in the spec as a known limit.
- LOW (fixed) `todo` package.json: jsdom 30.1.3 needs Node ^22.22.2 or ^24.15 (see package-lock `engines`), but package.json has no `engines` field. On an older Node `npm test` fails with an unclear error. Fix: add `"engines": {"node": ">=22.22.2"}`.
- LOW `todo` tests/run.test.js:1406-1417 (AC-10, AC-12): `browserDeps` is never exercised. The "only GET" test checks the dependency key names and that the URLs contain no `page_size` or `action=`. The real fetch call (default GET, 30 s abort, `credentials`) has no test. A change to `fetch(url, {method: 'POST'})` would pass `npm test`. Fix: export `browserDeps`, stub `globalThis.fetch`, and assert `method` is undefined or `'GET'` and that the abort signal is passed.

## Re-audit
Scope: parseScavengePage strict counts and the overview pagination follow-until-empty/repeat with MAX_OVERVIEW_PAGES=100 / errOverviewCap. The strict scavenging counts are correct (integer number or `/^\d+$/` string, otherwise `unreadable++`). 2 findings (1 high, 1 low).

- (fixed) HIGH `fix` defTroopsCounter.js:300-310 (AC-3 fallback, data loss): when `first.pages.length > 0` the code resets `homeVillages = []` and takes only the pages listed in the nav, so the villages of the `page=-1` response are thrown away. If the world ignored `page=-1`, that response is page 0. Tribal Wars normally renders the current page in the nav as plain text, not a link, so page 0 is not in `first.pages` and is never fetched. Failure: a world with 3 pages and nav links only to `page=1` and `page=2` drops every village on page 0 with no warning, and the totals and the "q of n" line are wrong. The tests (tests/run.test.js:159-160, 175-176, 190) always list `page=0` as a link, so they cannot catch this. Fix: start with `first.villages`, `first.hasArcher` and `first.unreadable` instead of resetting them, and add `String(first.villages[0].id)` to `seenFirst`. `summarize` already dedupes by id, but add the unreadable count only for pages not already seen. Add a test where the nav has no `page=0` link.
- LOW `todo` spec.md:12-13 and defTroopsCounter.js:311-319: the follow-until-empty loop and the 100-page overview cap (errOverviewCap, no dialog) are not in spec.md. AC-3 still says "every listed page" and only AC-11 mentions a cap, for scavenging. Also a home village without an id gets the key `'null'` in `seenFirst`, so a second page whose first row has no id ends the loop early, and `noid:` villages are never deduped across pages. Fix: add one sentence on the follow loop and the cap to AC-3, and skip null ids when filling `seenFirst`.
