(function (root) {
  'use strict';

  const DEF_UNITS = ['spear', 'sword', 'heavy', 'archer'];
  const VERSION = '2.0.0';
  const SKIP_UNITS = ['militia'];
  const MAX_X =10000000, MAX_SCAV_PAGES = 100, MAX_OVERVIEW_PAGES = 100, GAP_MS = 200;

  const USAGE_EXAMPLE = "javascript:var MIN_TROOPS=5000;$.getScript('https://amauron.github.io/jsScriptsTW/defTroopsCounter.js');";

  const I18N = {
    en_US: {
      title: 'Defensive troops counter',
      home: 'Home',
      scavenging: 'Scavenging',
      total: 'Total',
      all: 'All',
      units: {
        spear: 'Spearman', sword: 'Swordsman', axe: 'Axeman', archer: 'Archer', spy: 'Scout',
        light: 'Light cavalry', marcher: 'Mounted archer', heavy: 'Heavy cavalry', ram: 'Ram',
        catapult: 'Catapult', knight: 'Paladin', snob: 'Nobleman',
      },
      unreadable: '{n} unreadable values were counted as 0',
      loading: 'Reading troops, please wait...',
      errUsage: 'Set MIN_TROOPS to a whole number from 0 to 10000000 before loading the script, e.g. ' + USAGE_EXAMPLE,
      errPremium: 'This script needs an active Premium Account (and the game page).',
      errFetch: 'Request failed: {url}',
      errConfig: 'Could not read the world config: {url}',
      errNoTable: 'Troops table not found: {url}',
      errMissingColumn: 'Column "{unit}" not found in the troops table: {url}',
      errScavenge: 'Could not read the scavenging data: {url}',
      errScavengeCap: 'Too many scavenging pages, stopped without a result: {url}',
      errOverviewCap: 'Too many overview pages, stopped without a result: {url}',
      errBusy: 'The script is already running.',
    },
    pt_PT: {
      title: 'Contador de tropas defensivas',
      home: 'Em casa',
      scavenging: 'Em busca',
      total: 'Total',
      all: 'Todas',
      units: {
        spear: 'Lanceiro', sword: 'Espadachim', axe: 'Viking', archer: 'Arqueiro', spy: 'Explorador',
        light: 'Cavalaria leve', marcher: 'Arqueiro a cavalo', heavy: 'Cavalaria pesada', ram: 'Aríete',
        catapult: 'Catapulta', knight: 'Paladino', snob: 'Nobre',
      },
      unreadable: '{n} valores ilegíveis foram contados como 0',
      loading: 'A ler as tropas, aguarde...',
      errUsage: 'Defina MIN_TROOPS como um número inteiro de 0 a 10000000 antes de carregar o script, p. ex. ' + USAGE_EXAMPLE,
      errPremium: 'Este script precisa de uma Conta Premium ativa (e da página do jogo).',
      errFetch: 'O pedido falhou: {url}',
      errConfig: 'Não foi possível ler a configuração do mundo: {url}',
      errNoTable: 'Tabela de tropas não encontrada: {url}',
      errMissingColumn: 'Coluna "{unit}" não encontrada na tabela de tropas: {url}',
      errScavenge: 'Não foi possível ler os dados de recolha: {url}',
      errScavengeCap: 'Demasiadas páginas de recolha, parou sem resultado: {url}',
      errOverviewCap: 'Demasiadas páginas de resumo, parou sem resultado: {url}',
      errBusy: 'O script já está a correr.',
    },
  };

  function pickStrings(locale) {
    return Object.prototype.hasOwnProperty.call(I18N, locale) ? I18N[locale] : I18N.en_US;
  }

  // Own-property lookup so a unit named e.g. "constructor" falls back to its key.
  function unitName(strings, u) {
    const names = strings && strings.units;
    return names && Object.prototype.hasOwnProperty.call(names, u) ? names[u] : u;
  }

  function format(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) =>
      (vars && Object.prototype.hasOwnProperty.call(vars, k)) ? String(vars[k]) : m);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Accepts a number or a digit string; anything else (booleans, floats, junk) is rejected.
  function parseX(raw) {
    let n;
    if (typeof raw === 'number') n = raw;
    else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) n = Number(raw.trim());
    else return { ok: false };
    if (!Number.isInteger(n) || n < 0 || n > MAX_X) return { ok: false };
    return { ok: true, x: n };
  }

  // Strips thousands separators (dot, comma, spaces, NBSP); anything non-numeric is null.
  function parseCount(text) {
    const t = String(text == null ? '' : text).trim().replace(/[.,\s ]/g, '');
    return /^\d+$/.test(t) ? Number(t) : null;
  }

  // Regex instead of DOMParser so it stays pure for Node; scoped to <game> like config>game>scavenging.
  function scavengingEnabled(xmlText) {
    const text = String(xmlText == null ? '' : xmlText);
    if (!/<config[\s>]/.test(text) && !/<\/config>/.test(text)) return null;
    const game = /<game[\s>][\s\S]*?<\/game>/.exec(text);
    if (!game) return false;
    const m = /<scavenging>\s*(\d+)\s*<\/scavenging>/.exec(game[0]);
    return !!m && m[1] === '1';
  }

  // Only http(s) or single-slash paths: blocks javascript:, data: and protocol-relative URLs in icon src.
  function safeIconSrc(src) {
    return typeof src === 'string' && /^(?:https?:\/\/|\/(?!\/))/i.test(src) ? src : null;
  }

  // Group menu JSON -> [{id, name}], "All" (id 0) always first; any malformed input yields just "All".
  function parseGroupMenu(text, allLabel) {
    const out = [{ id: '0', name: allLabel }];
    let data;
    try { data = JSON.parse(text); } catch (err) { return out; }
    if (!data || typeof data !== 'object' || !Array.isArray(data.result)) return out;
    const seen = new Set(['0']);
    for (const entry of data.result) {
      if (!entry || typeof entry !== 'object' || entry.type === 'separator') continue;
      const raw = entry.group_id;
      const okId = (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) ||
        (typeof raw === 'string' && /^\d+$/.test(raw));
      if (!okId) continue;
      const id = String(Number(raw));
      if (seen.has(id)) continue;
      seen.add(id);
      const name = String(entry.name == null ? '' : entry.name).trim();
      out.push({ id, name: name || '#' + id });
    }
    return out;
  }

  function renderTable(view, strings, units, icons) {
    const e = escapeHtml;
    const centre = ' style="text-align:center"';
    const head = '<tr><th></th>' + units.map((u) => {
      const name = unitName(strings, u);
      const src = safeIconSrc(icons && Object.prototype.hasOwnProperty.call(icons, u) ? icons[u] : null);
      const inner = src ? `<img src="${e(src)}" alt="${e(name)}" title="${e(name)}">` : e(name);
      return `<th${centre}>${inner}</th>`;
    }).join('') + '</tr>';
    const row = (label, r) => `<tr><td>${e(label)}</td>` +
      units.map((u) => `<td${centre}>${e(r[u])}</td>`).join('') + '</tr>';
    return `<table class="vis">${head}${row(strings.home, view.home)}${row(strings.scavenging, view.scavenging)}` +
      `${row(strings.total, view.total)}</table>`;
  }

  function renderHtml(view, strings, groups, units, icons, ids) {
    const e = escapeHtml;
    const options = groups.map((g) =>
      `<option value="${e(g.id)}"${g.id === '0' ? ' selected' : ''}>${e(g.name)}</option>`).join('');
    const warn = view.unreadable > 0
      ? `<p>${e(format(strings.unreadable, { n: view.unreadable }))}</p>` : '';
    return `<h2>${e(strings.title)}</h2><p><select id="${e(ids.select)}">${options}</select></p>` +
      `<div id="${e(ids.table)}">${renderTable(view, strings, units, icons)}</div>${warn}` +
      `<p><small><b>${e(strings.title)} v${VERSION}</b></small></p>`;
  }

  const UNIT_IMG = /\/unit_([a-z]+)[^/]*\.(?:png|webp|gif)(?:\?|$)/i;

  function emptyCounts(units) {
    const o = {};
    for (const u of units) o[u] = 0;
    return o;
  }

  // Cell at a visual column: walk the cells summing colSpan, like the header index was built.
  function cellAtColumn(tr, col) {
    let pos = 0;
    for (const c of Array.from(tr.cells || tr.children)) {
      if (pos === col) return c;
      if (pos > col) return null;
      pos += c.colSpan || 1;
    }
    return null;
  }

  function villageIdFromRow(tr) {
    const q = tr.querySelector('.quickedit-vn[data-id]') || tr.querySelector('[data-id]');
    if (q) return q.getAttribute('data-id');
    const a = tr.querySelector('a[href]');
    const m = a && /[?&]village=(\d+)/.exec(a.getAttribute('href'));
    return m ? m[1] : null;
  }

  function parseUnitsTable(doc) {
    const table = doc.querySelector('#units_table');
    if (!table) return { ok: false, error: 'noTable' };
    let headerRow = null;
    for (const tr of Array.from(table.querySelectorAll('tr'))) {
      if (Array.from(tr.querySelectorAll('img')).some((img) => UNIT_IMG.test(img.getAttribute('src') || ''))) {
        headerRow = tr;
        break;
      }
    }
    if (!headerRow) return { ok: false, error: 'missingColumn', unit: 'spear' };
    const cols = Object.create(null);
    const icons = Object.create(null);
    const units = [];
    let pos = 0;
    for (const cell of Array.from(headerRow.children)) {
      for (const img of Array.from(cell.querySelectorAll('img'))) {
        const src = img.getAttribute('src') || '';
        const m = UNIT_IMG.exec(src);
        if (!m) continue;
        const u = m[1].toLowerCase();
        if (SKIP_UNITS.includes(u) || u in cols) continue;
        cols[u] = pos;
        icons[u] = src;
        units.push(u);
      }
      pos += cell.colSpan || 1;
    }
    for (const u of ['spear', 'sword', 'heavy']) {
      if (!(u in cols)) return { ok: false, error: 'missingColumn', unit: u };
    }
    const villages = [];
    let unreadable = 0;
    for (const tbody of Array.from(table.querySelectorAll('tbody'))) {
      const tr = tbody.querySelector('tr');
      if (!tr || tbody.contains(headerRow) || !tr.querySelector('td')) continue;
      const counts = emptyCounts(units);
      for (const u of units) {
        const cell = cellAtColumn(tr, cols[u]);
        const n = cell ? parseCount(cell.textContent) : null;
        if (n === null) unreadable++;
        else counts[u] = n;
      }
      villages.push({ id: villageIdFromRow(tr), counts });
    }
    const pages = new Set();
    for (const a of Array.from(doc.querySelectorAll('.paged-nav-item a[href]'))) {
      const m = /[?&]page=(\d+)/.exec(a.getAttribute('href'));
      if (m) pages.add(Number(m[1]));
    }
    return { ok: true, villages, unreadable, units, icons, pages: Array.from(pages).sort((a, b) => a - b) };
  }

  function parseScavengePage(html) {
    const text = String(html == null ? '' : html);
    const at = text.indexOf('ScavengeMassScreen');
    if (at < 0) return { ok: false };
    const lines = text.slice(at).split('\n').slice(1);
    const line = lines.map((l) => l.trim()).find((l) => l.startsWith('[') && /\],?$/.test(l));
    if (!line) return { ok: false };
    let arr;
    try { arr = JSON.parse(line.replace(/,$/, '')); } catch (e) { return { ok: false }; }
    if (!Array.isArray(arr)) return { ok: false };
    const villages = [];
    let unreadable = 0;
    for (const el of arr) {
      if (!el || typeof el !== 'object') return { ok: false };
      const vid = el.village_id;
      if (!((typeof vid === 'number' && Number.isFinite(vid)) || (typeof vid === 'string' && /^\d+$/.test(vid)))) {
        return { ok: false }; // unknown shape: no numbers rather than wrong numbers
      }
      const counts = {};
      for (const opt of Object.values(el.options || {})) {
        const squad = opt && opt.scavenging_squad;
        if (!squad || typeof squad !== 'object' || !squad.unit_counts || typeof squad.unit_counts !== 'object') continue;
        for (const u of Object.keys(squad.unit_counts)) {
          if (!/^[a-z]+$/.test(u)) continue;
          // Strict: Number() would turn '', null, true, '1e3' into numbers without a warning.
          const raw = squad.unit_counts[u];
          const okRaw = (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) ||
            (typeof raw === 'string' && /^\d+$/.test(raw));
          if (okRaw) counts[u] = (counts[u] || 0) + Number(raw);
          else unreadable++;
        }
      }
      villages.push({ id: String(vid), counts });
    }
    return { ok: true, villages, unreadable };
  }

  function summarize(homeVillages, scavVillages, x, units) {
    const map = new Map();
    let unreadable = 0;
    // Only keys in `units` are copied; anything else in the counts is ignored.
    const copyInto = (target, counts) => {
      for (const u of units) {
        if (counts && Object.prototype.hasOwnProperty.call(counts, u)) target[u] += counts[u] || 0;
      }
    };
    homeVillages.forEach((v, i) => {
      let key;
      if (v.id === null || v.id === undefined) { key = 'noid:' + i; unreadable++; } else key = String(v.id);
      if (!map.has(key)) {
        const e = { home: emptyCounts(units), scav: emptyCounts(units) };
        copyInto(e.home, v.counts);
        map.set(key, e);
      }
    });
    for (const v of scavVillages) {
      const key = String(v.id);
      if (!map.has(key)) map.set(key, { home: emptyCounts(units), scav: emptyCounts(units) });
      copyInto(map.get(key).scav, v.counts);
    }
    const home = emptyCounts(units), scavenging = emptyCounts(units), total = emptyCounts(units);
    let qualifying = 0;
    for (const e of map.values()) {
      let s = 0;
      for (const u of DEF_UNITS) s += (e.home[u] || 0) + (e.scav[u] || 0);
      if (!(s > x)) continue;
      qualifying++;
      for (const u of units) {
        home[u] += e.home[u]; scavenging[u] += e.scav[u]; total[u] += e.home[u] + e.scav[u];
      }
    }
    return { villagesTotal: map.size, villagesQualifying: qualifying, home, scavenging, total, unreadable, units };
  }

  // Thrown inside run() to unwind to the single error exit; carries the message to show.
  function RunFailure(message) { this.message = message; }

  async function run(deps) {
    const root = deps.root;
    const gd = root.game_data;
    const strings = pickStrings(gd && gd.locale);
    if (!gd) { deps.showError(strings.errPremium); return 'error'; }
    // Busy check sits outside the try so a rejected re-entry never clears the running run's flag.
    if (root.__defTroopsCounterRunning) { deps.showError(strings.errBusy); return 'busy'; }
    root.__defTroopsCounterRunning = true;
    try {
      // Per-run ids so a second run's dialog never shares elements with an older one.
      const rid = (root.__defTroopsCounterRuns = (root.__defTroopsCounterRuns || 0) + 1);
      const ids = { select: 'dtc_group_' + rid, table: 'dtc_table_' + rid };
      const fail = (key, vars) => { throw new RunFailure(format(strings[key], vars)); };
      const fetchText = async (url) => {
        try { return await deps.get(url); } catch (e) { return fail('errFetch', { url }); }
      };
      const px = parseX(root.MIN_TROOPS);
      if (!px.ok) fail('errUsage');
      if (!(gd.features && gd.features.Premium && gd.features.Premium.active)) fail('errPremium');
      deps.showInfo(strings.loading);

      const configUrl = '/interface.php?func=get_config';
      const scavenging = scavengingEnabled(await fetchText(configUrl));
      if (scavenging === null) fail('errConfig', { url: configUrl });

      // The group menu is cosmetic: any failure leaves only "All" and never fails the run.
      await deps.wait(GAP_MS);
      let menuText = null;
      try { menuText = await deps.get(`/game.php?village=${gd.village.id}&screen=groups&mode=overview&ajax=load_group_menu`); } catch (e) { menuText = null; }
      const groups = parseGroupMenu(typeof menuText === 'string' && menuText ? menuText : null, strings.all);

      const readOverview = async (url) => {
        await deps.wait(GAP_MS);
        const parsed = parseUnitsTable(deps.parseHtml(await fetchText(url)));
        if (!parsed.ok) {
          if (parsed.error === 'missingColumn') fail('errMissingColumn', { unit: parsed.unit, url });
          fail('errNoTable', { url });
        }
        return parsed;
      };
      const readGroup = async (group) => {
      const base = `/game.php?village=${gd.village.id}&screen=overview_villages&mode=units&group=${group}`;
      const first = await readOverview(`${base}&page=-1`);
      let homeVillages = first.villages, unreadable = first.unreadable;
      if (first.pages.length > 0) {
        // The world ignored page=-1 and paginated: use the listed pages instead.
        // That response is page 0 and the nav shows the current page as plain text, so keep its
        // villages; summarize dedupes by id and a page already seen adds no unreadable count.
        const seenFirst = new Set();
        const firstKey = (p) => (p.villages.length > 0 && p.villages[0].id != null ? String(p.villages[0].id) : null);
        if (firstKey(first) !== null) seenFirst.add(firstKey(first));
        const take = (p) => {
          const key = firstKey(p);
          homeVillages = homeVillages.concat(p.villages);
          if (key === null || !seenFirst.has(key)) unreadable += p.unreadable;
          if (key !== null) seenFirst.add(key);
        };
        for (const n of first.pages) take(await readOverview(`${base}&page=${n}`));
        // A windowed nav lists only some pages: keep following highest + 1 until a page is
        // empty or repeats a known first village, so later pages are never dropped silently.
        for (let n = Math.max(...first.pages) + 1, fetched = first.pages.length; ; n++, fetched++) {
          const url = `${base}&page=${n}`;
          if (fetched >= MAX_OVERVIEW_PAGES) fail('errOverviewCap', { url });
          const p = await readOverview(url);
          if (p.villages.length === 0 || seenFirst.has(firstKey(p))) break;
          take(p);
        }
      }
      return { villages: homeVillages, units: first.units, icons: first.icons, unreadable };
      };
      const home0 = await readGroup('0');
      const { units, icons } = home0;
      let unreadable = home0.unreadable;

      let scavVillages = [];
      if (scavenging) {
        let prevFirst = null;
        for (let n = 0; n < MAX_SCAV_PAGES; n++) {
          const url = `/game.php?village=${gd.village.id}&screen=place&mode=scavenge_mass&page=${n}`;
          await deps.wait(GAP_MS);
          const p = parseScavengePage(await fetchText(url));
          if (!p.ok) fail('errScavenge', { url });
          if (p.villages.length === 0) break;
          const firstId = p.villages[0].id;
          if (prevFirst !== null && firstId === prevFirst) break;
          if (n === MAX_SCAV_PAGES - 1) fail('errScavengeCap', { url });
          prevFirst = firstId;
          scavVillages = scavVillages.concat(p.villages);
          unreadable += p.unreadable;
        }
      }

      const view0 = summarize(home0.villages, scavVillages, px.x, units);
      view0.unreadable += unreadable;
      deps.showDialog('def_troops_counter', renderHtml(view0, strings, groups, units, icons, ids));

      // Group switching: results cached per group; fetches serialised so the gap holds across picks.
      const cache = new Map([['0', view0]]);
      const pending = new Map();
      let shown = '0', latest = '0', chain = Promise.resolve();
      const onChange = async (value) => {
        const g = groups.some((gr) => gr.id === String(value)) ? String(value) : '0';
        latest = g;
        try {
          let view = cache.get(g);
          if (!view) {
            // Reuse an in-flight fetch of the same group (re-pick before it finishes); dropped on failure so retry works.
            let vp = pending.get(g);
            if (!vp) {
              const p = chain.then(() => readGroup(g));
              chain = p.catch(() => {});
              vp = p.then((r) => {
                const known = new Set(r.villages.filter((v) => v.id != null).map((v) => String(v.id)));
                const v = summarize(r.villages, scavVillages.filter((x) => known.has(String(x.id))), px.x, units);
                cache.set(g, v);
                pending.delete(g);
                return v;
              }, (e) => { pending.delete(g); throw e; });
              pending.set(g, vp);
            }
            view = await vp;
          }
          if (latest !== g) return;
          if (!deps.setHtml(ids.table, renderTable(view, strings, units, icons))) return;
          shown = g;
        } catch (e) {
          if (e instanceof RunFailure) {
            if (latest === g) { deps.showError(e.message); latest = shown; deps.setValue(ids.select, shown); }
          } else deps.showError(String(e && e.message || e));
        }
      };
      try { if (typeof deps.bindChange === 'function') deps.bindChange(ids.select, onChange); } catch (e) { /* AC-10: dialog stays */ }
      return 'ok';
    } catch (e) {
      if (!(e instanceof RunFailure)) throw e;
      deps.showError(e.message);
      return 'error';
    } finally {
      root.__defTroopsCounterRunning = false;
    }
  }

  function browserDeps(rt) {
    return {
      root: rt,
      get: async (url) => {
        // Abort after 30 s so a hung request cannot keep the busy flag set forever.
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 30000);
        try {
          const res = await fetch(url, { credentials: 'same-origin', signal: ctl.signal });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return await res.text();
        } finally { clearTimeout(timer); }
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      parseHtml: (h) => new DOMParser().parseFromString(h, 'text/html'),
      showError: (m) => rt.UI.ErrorMessage(m),
      showInfo: (m) => rt.UI.InfoMessage(m),
      showDialog: (id, html) => rt.Dialog.show(id, html),
      bindChange: (id, fn) => {
        const el = rt.document.getElementById(id);
        if (!el) return false;
        el.addEventListener('change', () => { fn(el.value).catch(() => {}); });
        return true;
      },
      setHtml: (id, html) => {
        const el = rt.document.getElementById(id);
        if (!el) return false;
        el.innerHTML = html;
        return true;
      },
      setValue: (id, v) => { const el = rt.document.getElementById(id); if (el) el.value = v; },
    };
  }

  const api = { DEF_UNITS, MAX_X, MAX_SCAV_PAGES, MAX_OVERVIEW_PAGES, GAP_MS, I18N, pickStrings, format, parseX, parseCount,
    parseUnitsTable, parseScavengePage, scavengingEnabled, summarize, renderHtml, run,
    renderTable, safeIconSrc, parseGroupMenu, unitName, VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    run(browserDeps(root)).catch((e) => {
      try { root.UI.ErrorMessage(String(e && e.message || e)); } catch (e2) { /* nothing left to report to */ }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
