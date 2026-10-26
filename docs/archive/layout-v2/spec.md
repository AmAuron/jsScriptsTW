# Spec: defTroopsCounter layout v2 (screenshot layout + village-group combo)

## Goal
Make the result dialog look like the reference screenshot (~/1000061692.png): a title, a combo box with the player's
in-game village groups (e.g. K45, K46), then a `vis` table whose header shows one icon per unit, with the rows
Em casa / Em busca / Total. There is no Sum column and no summary line. The MIN_TROOPS def threshold and every rule in
docs/archive/def-troops-counter/spec.md (AC-1..AC-12) stay as they are, except where this spec changes them.

## Acceptance criteria
- AC-1 Units: the table shows every unit column found in the overview header (`unit_<name>` icons), in header order,
  except `militia`. Scavenging adds every unit found in `unit_counts` (scavenge units always have an overview column on the
  same world; a scavenge unit that has none is ignored). Spear, sword and heavy are still required (archive AC-4).
- AC-2 Threshold unchanged: a village qualifies when (home + scavenging) spear+sword+heavy+archer > X. Only qualifying
  villages are summed, but they are summed for every unit (axe, spy, light, ... too). Plain unit counts.
- AC-3 Icons: each header cell is an `<img>` with the src read from that column's overview header icon, and `title`/`alt`
  set to the translated unit name (fallback: the unit key). A src that is not `http(s)://` or root-relative (`/x`, not `//x`) is
  not used, and the cell shows the name as text instead. No Sum column, no "n/a" cell (a world without archers has no archer column).
- AC-4 Rows: Home / Scavenging / Total (pt_PT "Em casa" / "Em busca" / "Total"). Cells are centred; the row label cell is left aligned.
- AC-5 Group list: one GET to `/game.php?village=<id>&screen=groups&mode=overview&ajax=load_group_menu` (after the 200 ms gap)
  before the overview fetch. Parse its JSON `result` array: keep entries whose `group_id` is a digit string or a whole number >= 0
  and whose `type` is not "separator", dedupe by id (first wins), name = `String(name)`, or "#<id>" if empty.
  Group 0 comes first with the translated "All" label. If the request fails or the JSON is unreadable, the combo holds only "All"
  and the result is still shown (no error message).
- AC-6 Combo: `<select id="dtc_group_<n>">` under the title (`<n>` = a per-run counter on window, so a late result from an older dialog never draws into a newer one), options in the order the game returned them, "All" (group 0) selected.
  Every name is escaped. Values are the group ids.
- AC-7 Switching: choosing group G fetches the units overview with `group=G` (same page=-1 + pagination rules and 200 ms gap as
  the first fetch) and redraws only `#dtc_table_<n>` with summarize(those home rows, scavenging rows of the same village ids, X).
  Scavenging data is not fetched again. Each group's summary is cached for the life of that dialog; group 0 is cached from the start.
  An unknown value (hand-edited DOM) is treated as group 0.
- AC-8 Switch failure: if the group fetch fails (request, missing table, missing column, page cap), show `UI.ErrorMessage` with the
  URL, keep the table as it was, and set the select back to the group being shown. A failed group is not cached (retry works).
- AC-9 Switch race: if the user picks another group while a fetch is in flight, only the latest choice is drawn; an earlier
  response that arrives later is cached but never drawn. If the dialog is gone (no `#dtc_table_<n>`), the result is dropped silently.
- AC-10 Binding: the change handler is bound through a new dep `bindChange(id, fn)`. If it throws, the dialog still shows group 0.
  All switch state lives in a closure made per run (no module-level state; CLAUDE.md rule).
- AC-11 Footer: `<p><small><b><title> v<VERSION></b></small></p>` under the table; VERSION is a constant (2.0.0). No upstream author.
  The unreadable-cells warning stays, above the footer, global for the first (all-villages) run.
- AC-12 i18n: unit names for spear, sword, axe, archer, spy, light, marcher, heavy, ram, catapult, knight, snob, plus "All",
  exist in en_US and pt_PT, with the same keys in both (existing i18n test). The `summary`, `sum` and `na` strings are removed.
- AC-13 Read-only and rate: still GET only; requests still at least 200 ms apart within a run and within each switch.

## Non-goals
- Creating, editing or reordering groups; remembering the last group between runs (no localStorage).
- Continents computed from coordinates; a summary line; per-village listing.
- Copying upstream's code, title or author line.

## Decisions
- Groups come from the game's own group menu endpoint, the same list the game shows in the overview.
- Group view = a fresh overview fetch for that group (home counts and membership in one GET, works for dynamic groups too).
  Scavenging is joined by village id from the first run's data.
- Default view is group 0 (all villages), so the first run costs the same requests as today plus one group-menu GET.
- `summarize(home, scav, x, units)` returns per-unit rows for `units`; `renderHtml(view, strings, groups, units, icons)`
  builds the dialog; `renderTable(view, strings, units, icons)` builds only the table (used by the switch handler).
- pt_PT `scavenging` becomes "Em busca".

## UI
Dialog `def_troops_counter`: `<h2>title</h2>`, `<select id="dtc_group_<n>">`, `<div id="dtc_table_<n>"><table class="vis">…</table></div>`,
optional warning `<p>`, footer.

## Open questions
- The group-menu JSON shape (`{result:[{group_id,name,type}]}`) is known from public scripts, not from a live capture; the parser
  fails soft (AC-5). The first live run is the real test.
