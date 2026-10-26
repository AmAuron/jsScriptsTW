(function (root) {
  'use strict';

  const DEF_UNITS = ['spear', 'sword', 'heavy', 'archer'];
  const MAX_X = 10000000, MAX_SCAV_PAGES = 100, MAX_OVERVIEW_PAGES = 100, GAP_MS = 200;

  const USAGE_EXAMPLE = "javascript:var MIN_TROOPS=5000;$.getScript('https://amauron.github.io/jsScriptsTW/defTroopsCounter.js');";

  const I18N = {
    en_US: {
      title: 'Defensive troops counter',
      summary: '{q} of {n} villages have more than {x} def troops',
      home: 'Home',
      scavenging: 'Scavenging',
      total: 'Total',
      spear: 'Spear',
      sword: 'Sword',
      heavy: 'Heavy cav.',
      archer: 'Archer',
      sum: 'Sum',
      na: 'n/a',
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
      summary: '{q} de {n} aldeias têm mais de {x} tropas defensivas',
      home: 'Em casa',
      scavenging: 'Recolha',
      total: 'Total',
      spear: 'Lanceiro',
      sword: 'Espadachim',
      heavy: 'Cav. pesada',
      archer: 'Arqueiro',
      sum: 'Soma',
      na: 'n/d',
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

  function renderHtml(summary, strings, x) {
    const e = escapeHtml;
    const cell = (tag, v) => `<${tag}>${e(v)}</${tag}>`;
    const row = (label, r) => '<tr>' + cell('td', label) +
      DEF_UNITS.map((u) => cell('td', u === 'archer' && !summary.hasArcher ? strings.na : String(r[u]))).join('') +
      cell('td', String(r.sum)) + '</tr>';
    const head = '<tr>' + cell('th', '') + DEF_UNITS.map((u) => cell('th', strings[u])).join('') +
      cell('th', strings.sum) + '</tr>';
    const line = format(strings.summary, { q: summary.villagesQualifying, n: summary.villagesTotal, x });
    const warn = summary.unreadable > 0
      ? `<p>${e(format(strings.unreadable, { n: summary.unreadable }))}</p>` : '';
    return `<h2>${e(strings.title)}</h2><p>${e(line)}</p>` +
      `<table class="vis">${head}${row(strings.home, summary.home)}${row(strings.scavenging, summary.scavenging)}` +
      `${row(strings.total, summary.total)}</table>${warn}`;
  }

  const UNIT_IMG = /\/unit_([a-z]+)[^/]*\.(?:png|webp|gif)(?:\?|$)/i;

  function emptyCounts() {
    return { spear: 0, sword: 0, heavy: 0, archer: 0 };
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
    const cols = {};
    let pos = 0;
    for (const cell of Array.from(headerRow.children)) {
      for (const img of Array.from(cell.querySelectorAll('img'))) {
        const m = UNIT_IMG.exec(img.getAttribute('src') || '');
        if (m && !(m[1].toLowerCase() in cols)) cols[m[1].toLowerCase()] = pos;
      }
      pos += cell.colSpan || 1;
    }
    for (const u of ['spear', 'sword', 'heavy']) {
      if (!(u in cols)) return { ok: false, error: 'missingColumn', unit: u };
    }
    const hasArcher = 'archer' in cols;
    const villages = [];
    let unreadable = 0;
    for (const tbody of Array.from(table.querySelectorAll('tbody'))) {
      const tr = tbody.querySelector('tr');
      if (!tr || tbody.contains(headerRow) || !tr.querySelector('td')) continue;
      const counts = emptyCounts();
      for (const u of DEF_UNITS) {
        if (!(u in cols)) continue; // no archer column: 0, not unreadable
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
    return { ok: true, villages, unreadable, hasArcher, pages: Array.from(pages).sort((a, b) => a - b) };
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
      const counts = emptyCounts();
      for (const opt of Object.values(el.options || {})) {
        const squad = opt && opt.scavenging_squad;
        if (!squad || typeof squad !== 'object' || !squad.unit_counts || typeof squad.unit_counts !== 'object') continue;
        for (const u of DEF_UNITS) {
          if (!(u in squad.unit_counts)) continue;
          // Strict: Number() would turn '', null, true, '1e3' into numbers without a warning.
          const raw = squad.unit_counts[u];
          const okRaw = (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) ||
            (typeof raw === 'string' && /^\d+$/.test(raw));
          if (okRaw) counts[u] += Number(raw);
          else unreadable++;
        }
      }
      villages.push({ id: String(vid), counts });
    }
    return { ok: true, villages, unreadable };
  }

  function summarize(homeVillages, scavVillages, x, hasArcher) {
    const map = new Map();
    let unreadable = 0;
    homeVillages.forEach((v, i) => {
      let key;
      if (v.id === null || v.id === undefined) { key = 'noid:' + i; unreadable++; } else key = String(v.id);
      if (!map.has(key)) map.set(key, { home: Object.assign(emptyCounts(), v.counts), scav: emptyCounts() });
    });
    for (const v of scavVillages) {
      const key = String(v.id);
      if (!map.has(key)) map.set(key, { home: emptyCounts(), scav: emptyCounts() });
      const e = map.get(key);
      for (const u of DEF_UNITS) e.scav[u] += v.counts[u] || 0;
    }
    const mkRow = () => Object.assign(emptyCounts(), { sum: 0 });
    const home = mkRow(), scavenging = mkRow(), total = mkRow();
    let qualifying = 0;
    for (const e of map.values()) {
      let s = 0;
      for (const u of DEF_UNITS) s += e.home[u] + e.scav[u];
      if (!(s > x)) continue;
      qualifying++;
      for (const u of DEF_UNITS) {
        home[u] += e.home[u]; scavenging[u] += e.scav[u]; total[u] += e.home[u] + e.scav[u];
        home.sum += e.home[u]; scavenging.sum += e.scav[u]; total.sum += e.home[u] + e.scav[u];
      }
    }
    return { villagesTotal: map.size, villagesQualifying: qualifying, home, scavenging, total, unreadable, hasArcher };
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

      const readOverview = async (url) => {
        await deps.wait(GAP_MS);
        const parsed = parseUnitsTable(deps.parseHtml(await fetchText(url)));
        if (!parsed.ok) {
          if (parsed.error === 'missingColumn') fail('errMissingColumn', { unit: parsed.unit, url });
          fail('errNoTable', { url });
        }
        return parsed;
      };
      const base = `/game.php?village=${gd.village.id}&screen=overview_villages&mode=units&group=0`;
      const first = await readOverview(`${base}&page=-1`);
      let homeVillages = first.villages, hasArcher = first.hasArcher, unreadable = first.unreadable;
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
          hasArcher = hasArcher && p.hasArcher;
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

      const summary = summarize(homeVillages, scavVillages, px.x, hasArcher);
      summary.unreadable += unreadable;
      deps.showDialog('def_troops_counter', renderHtml(summary, strings, px.x));
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
    };
  }

  const api = { DEF_UNITS, MAX_X, MAX_SCAV_PAGES, MAX_OVERVIEW_PAGES, GAP_MS, I18N, pickStrings, format, parseX, parseCount,
    parseUnitsTable, parseScavengePage, scavengingEnabled, summarize, renderHtml, run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    run(browserDeps(root)).catch((e) => {
      try { root.UI.ErrorMessage(String(e && e.message || e)); } catch (e2) { /* nothing left to report to */ }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
