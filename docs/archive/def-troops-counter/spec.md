# Spec: defTroopsCounter (Tribal Wars quickbar script)

## Goal
A script of our own, loaded with `javascript:var MIN_TROOPS=5000;$.getScript('<url>/defTroopsCounter.js');`.
It reads the player's units overview and reports the total spear, sword, heavy and archer counts,
but only from villages that hold more than X of those troops. X is passed as a parameter.

## Acceptance criteria
- AC-1 Parameter: X comes from `window.MIN_TROOPS`. It must be a whole number >= 0; a numeric string like "5000" is accepted.
  If it is missing, negative, non-integer, NaN, Infinity or above 10,000,000: show `UI.ErrorMessage` with a usage example, make no requests, stop.
- AC-2 Premium: if `game_data.features.Premium.active` is false, show an error, make no requests, stop.
- AC-3 Home data: one GET to `/game.php?village=<id>&screen=overview_villages&mode=units&group=0&page=-1` If the world ignores page=-1 and shows a paged nav, the script also fetches the nav-linked pages, then follows highest page+1 until an empty or repeated page (cap 100 pages, then an error); villages are deduped by id.
  (every village, one page; if the world still paginates, every listed page is fetched, GETs only). Per village it reads the first row ("your own" troops at home) and its village id
  (`[data-id]` in the tbody, else `village=(\d+)` in its first link).
- AC-11 Scavenging: GET `/interface.php?func=get_config`; if `config>game>scavenging` is "1", page through
  `screen=place&mode=scavenge_mass&page=N` (N=0..) until the villages array is empty or its first village_id repeats. If page N=99 (the 100th) is still new, it shows an error with no partial result (cap).
  Per village, it adds every `options[*].scavenging_squad.unit_counts` (a null squad is skipped). If the world has no scavenging, scavenging is 0.
  If the ScavengeMassScreen array is missing or not valid JSON: error, no partial result (AC-8).
- AC-12 Rate: requests run one at a time, at least 200 ms apart (TW rule: max 5 req/s).
- AC-4 Columns: unit columns come from the header icons (`unit_<name>`), never from a fixed position.
  If the spear, sword or heavy column is missing: show an error, no partial result.
  Archer is counted only when the world has archers; otherwise it is treated as 0 and labelled "n/a".
- AC-5 Rule: village def = (home + scavenging) spear + sword + heavy + archer, merged by village id (plain unit counts, not population).
  A village seen only in scavenging data still counts. A home village with no readable id adds to the warning and gets home only.
  A village qualifies when def > X (strictly greater). Report per-unit totals and the grand total over qualifying villages only.
- AC-6 Unreadable cells: an empty or non-numeric cell counts as 0 and adds to a "cells unreadable" warning.
  It is never silently dropped and never yields NaN.
- AC-7 Output: one `Dialog.show` showing X, qualifying villages / all villages, a table with
  rows Home / Scavenging / Total and columns spear | sword | heavy | archer | sum (qualifying villages only), and the unreadable-cells warning when > 0.
  Strings in en_US and pt_PT, picked by `game_data.locale`, falling back to en_US.
- AC-8 Failure: if any request fails, the config is unreadable, or the table (`#units_table`) is missing, show an error with the URL.
  No dialog with partial numbers, and the page is untouched.
- AC-9 Re-run: loading the script again (another X) runs fresh. No state is kept from the previous run, and nothing goes to localStorage. The one exception is a running flag on window that blocks a second run while one is in flight; it is cleared when the run ends.
- AC-10 Read-only: the script makes only GET requests. It changes no game setting (unlike upstream's page_size POST) and takes no game action.

## Non-goals
- Troops away or in transit (other than scavenging), support from others, militia.
- Group selection UI, CSV export, per-village listing.
- Changing or copying the upstream script.

## Decisions
- Clean-room rewrite: upstream's header forbids cloning or modifying without the author's permission.
  We write our own code from the public page structure and copy none of upstream's code.
- World config is fetched on every run (AC-9: no localStorage cache); it costs one extra GET.
- `page=-1` with `group=0` gives one overview request and stays under the 5 req/s rule; it needs no page_size change.
- A per-village threshold (AC-5) is the reading of "with more than X"; it can be changed at approval.
- Pure core (`parseUnitsTable(doc)`, `summarize(villages, x, units)`, `parseX(raw)`) is exported for Node tests.
  The browser entry (`run()`) handles only I/O and UI.
- Tests: `node --test` plus `jsdom` (devDependency only) for HTML fixtures. Nothing is shipped to the browser except the one file.

## UI
A dialog with a title, a summary line, a 5-column totals table using TW's `vis` table class, and an optional warning line.
Errors use `UI.ErrorMessage`.

- Hosting: GitHub Pages on public repo AmAuron/jsScriptsTW, URL https://amauron.github.io/jsScriptsTW/defTroopsCounter.js.

## Open questions
- Scavenge page markup is known only from upstream's parser; the fixtures copy that shape. The first live run is the real test.
- Script legality: TW worlds allow only approved scripts. Running an unapproved personal script is the user's call.
