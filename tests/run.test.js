'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../defTroopsCounter.js');
const { unitsHtml, scavHtml, groupMenu, doc } = require('./fixtures.js');

const { run, I18N, MAX_SCAV_PAGES, GAP_MS } = api;

const CONFIG = '/interface.php?func=get_config';
const GROUPS = '/game.php?village=1&screen=groups&mode=overview&ajax=load_group_menu';
const OVERVIEW = '/game.php?village=1&screen=overview_villages&mode=units&group=0&page=-1';
const ovG = (g) => `/game.php?village=1&screen=overview_villages&mode=units&group=${g}&page=-1`;
const ovGPage = (g, p) => `/game.php?village=1&screen=overview_villages&mode=units&group=${g}&page=${p}`;
const overviewPage = (n) => `/game.php?village=1&screen=overview_villages&mode=units&group=0&page=${n}`;
const scavUrl = (n) => `/game.php?village=1&screen=place&mode=scavenge_mass&page=${n}`;
const cfg = (on) => `<config><game><scavenging>${on}</scavenging></game></config>`;
const village = (id, spear) => ({ id, counts: { spear: String(spear), sword: '0', heavy: '0' } });
const scavEntry = (id, spear) => ({ village_id: id, options: [{ scavenging_squad: { unit_counts: { spear } } }] });

// routes: url -> string | Error | function(url) (may throw); unknown url rejects
function setup({ routes = {}, root = {}, noGameData = false, bindThrows = false, bindResult = true } = {}) {
  const log = [];
  const dialogs = [];
  const errors = [];
  const infos = [];
  const handlers = {};
  const html = [];
  const values = [];
  const state = { setHtmlResult: true };
  const fakeRoot = noGameData ? { MIN_TROOPS: 100, ...root } : {
    MIN_TROOPS: 100,
    game_data: { locale: 'en_US', village: { id: 1 }, features: { Premium: { active: true } } },
    ...root,
  };
  const deps = {
    root: fakeRoot,
    get: async (url) => {
      log.push(`get:${url}`);
      let r = routes[url];
      if (typeof r === 'function') r = r(url);
      if (r === undefined) throw new Error('404 ' + url);
      if (r instanceof Error) throw r;
      return r;
    },
    wait: async (ms) => { log.push(`wait:${ms}`); },
    parseHtml: (h) => doc(h),
    showError: (m) => errors.push(m),
    showInfo: (m) => infos.push(m),
    showDialog: (id, h) => dialogs.push({ id, html: h }),
    bindChange: (id, fn) => { if (bindThrows) throw new Error('bind'); handlers[id] = fn; return bindResult; },
    setHtml: (id, h) => { html.push({ id, html: h }); return state.setHtmlResult; },
    setValue: (id, v) => { values.push([id, v]); },
  };
  const gets = () => log.filter((l) => l.startsWith('get:')).map((l) => l.slice(4));
  return { deps, log, dialogs, errors, infos, root: fakeRoot, gets, handlers, html, values, state, routes };
}

const happy = (extra = {}) => ({
  [CONFIG]: cfg(0),
  [GROUPS]: groupMenu([{ group_id: 5, name: 'K45' }, { group_id: 6, name: 'K46' }]),
  [OVERVIEW]: unitsHtml({ villages: [village(1, 12345), village(2, 5)] }),
  ...extra,
});

describe('run', () => {
  it('AC-1 MIN_TROOPS missing gives error, errUsage, 0 gets', async () => {
    const t = setup({ routes: happy(), root: { MIN_TROOPS: undefined } });
    assert.equal(await run(t.deps), 'error');
    assert.equal(t.errors[0], I18N.en_US.errUsage);
    assert.equal(t.gets().length, 0);
  });

  it('AC-2 premium false gives errPremium, 0 gets', async () => {
    const t = setup({ routes: happy() });
    t.root.game_data.features.Premium.active = false;
    assert.equal(await run(t.deps), 'error');
    assert.equal(t.errors[0], I18N.en_US.errPremium);
    assert.equal(t.gets().length, 0);
  });

  it('AC-3/5/7 happy path without scavenging: 2 gets, 1 dialog with the sum', async () => {
    const t = setup({ routes: happy() });
    assert.equal(await run(t.deps), 'ok');
    assert.deepEqual(t.gets(), [CONFIG, GROUPS, OVERVIEW]);
    assert.equal(t.dialogs.length, 1);
    assert.ok(t.dialogs[0].html.includes('12345'));
    assert.equal(t.errors.length, 0);
  });

  describe('scavenging', () => {
    it('AC-11 pages 0 and 1 with data, page 2 empty: 5 gets and scav numbers added', async () => {
      const t = setup({ routes: happy({
        [CONFIG]: cfg(1),
        [scavUrl(0)]: scavHtml([scavEntry(1, 1000)]),
        [scavUrl(1)]: scavHtml([scavEntry(2, 7)]),
        [scavUrl(2)]: scavHtml([]),
      }) });
      assert.equal(await run(t.deps), 'ok');
      assert.equal(t.gets().length, 6);
      assert.ok(t.dialogs[0].html.includes('13345'));
    });

    it('AC-11 a repeated first id stops without adding that page', async () => {
      const t = setup({ routes: happy({
        [CONFIG]: cfg(1),
        [scavUrl(0)]: scavHtml([scavEntry(1, 1000)]),
        [scavUrl(1)]: scavHtml([scavEntry(1, 1000)]),
      }) });
      assert.equal(await run(t.deps), 'ok');
      assert.equal(t.gets().length, 5);
      assert.ok(t.dialogs[0].html.includes('13345'));
      assert.ok(!t.dialogs[0].html.includes('14345'));
    });

    it('AC-11/8 the 100-page cap gives error with URL, 100 scav gets, no dialog', async () => {
      const t = setup({ routes: happy({
        [CONFIG]: cfg(1),
        ...Object.fromEntries(Array.from({ length: MAX_SCAV_PAGES + 1 }, (_, n) => [scavUrl(n), scavHtml([scavEntry(1000 + n, 1)])])),
      }) });
      assert.equal(await run(t.deps), 'error');
      assert.equal(t.gets().filter((u) => u.includes('scavenge_mass')).length, MAX_SCAV_PAGES);
      assert.ok(t.errors[0].includes(scavUrl(MAX_SCAV_PAGES - 1)));
      assert.equal(t.dialogs.length, 0);
    });

    it('AC-8 scav page 1 malformed gives error with its URL, no dialog', async () => {
      const t = setup({ routes: happy({
        [CONFIG]: cfg(1),
        [scavUrl(0)]: scavHtml([scavEntry(1, 1)]),
        [scavUrl(1)]: '<html>garbage</html>',
      }) });
      assert.equal(await run(t.deps), 'error');
      assert.ok(t.errors[0].includes(scavUrl(1)));
      assert.equal(t.dialogs.length, 0);
    });
  });

  it('AC-12 wait(200) precedes every get but the first', async () => {
    const t = setup({ routes: happy({
      [CONFIG]: cfg(1),
      [scavUrl(0)]: scavHtml([scavEntry(1, 1)]),
      [scavUrl(1)]: scavHtml([]),
    }) });
    await run(t.deps);
    assert.equal(GAP_MS, 200);
    const idx = t.log.map((l, i) => (l.startsWith('get:') ? i : -1)).filter((i) => i >= 0);
    assert.ok(idx.length > 2);
    for (const i of idx.slice(1)) assert.equal(t.log[i - 1], 'wait:200');
  });

  describe('AC-8 failures', () => {
    const cases = {
      'config rejects': [{ [CONFIG]: new Error('boom') }, CONFIG],
      'config is a login page': [{ [CONFIG]: '<html>login</html>' }, CONFIG],
      'overview rejects': [{ [OVERVIEW]: new Error('boom') }, OVERVIEW],
      'overview has no table': [{ [OVERVIEW]: '<html>none</html>' }, OVERVIEW],
    };
    for (const [name, [override, url]] of Object.entries(cases)) {
      it(`AC-8 ${name}`, async () => {
        const t = setup({ routes: happy(override) });
        assert.equal(await run(t.deps), 'error');
        assert.equal(t.errors.length, 1);
        assert.ok(t.errors[0].includes(url));
        assert.equal(t.dialogs.length, 0);
      });
    }
  });

  it('AC-3 overview pagination fetches extra pages, villages deduped, one dialog', async () => {
    const nav = '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=0">1</a></div>' +
      '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=1">2</a></div>';
    const first = unitsHtml({ villages: [village(1, 12345)] }).replace('<table', nav + '<table');
    const t = setup({ routes: happy({
      [OVERVIEW]: first,
      [overviewPage(0)]: unitsHtml({ villages: [village(1, 12345), village(2, 200)] }),
      [overviewPage(1)]: unitsHtml({ villages: [village(2, 200), village(3, 300)] }),
      [overviewPage(2)]: unitsHtml({ villages: [village(1, 12345)] }), // repeats page 0: end
    }) });
    assert.equal(await run(t.deps), 'ok');
    assert.deepEqual(t.gets(), [CONFIG, GROUPS, OVERVIEW, overviewPage(0), overviewPage(1), overviewPage(2)]);
    assert.equal(t.dialogs.length, 1);
    assert.ok(t.dialogs[0].html.includes('12845'));
  });

  it('AC-3 windowed nav: follows highest page + 1 until an empty page', async () => {
    const nav = '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=0">1</a></div>' +
      '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=1">2</a></div>';
    const t = setup({ routes: happy({
      [OVERVIEW]: unitsHtml({ villages: [village(1, 1000)] }).replace('<table', nav + '<table'),
      [overviewPage(0)]: unitsHtml({ villages: [village(1, 1000)] }),
      [overviewPage(1)]: unitsHtml({ villages: [village(2, 2000)] }),
      [overviewPage(2)]: unitsHtml({ villages: [village(3, 4000)] }),
      [overviewPage(3)]: unitsHtml({ villages: [] }),
    }) });
    assert.equal(await run(t.deps), 'ok');
    assert.deepEqual(t.gets().slice(-3), [overviewPage(1), overviewPage(2), overviewPage(3)]);
    assert.ok(t.dialogs[0].html.includes('7000'));
  });

  it('AC-3 nav without a page=0 link keeps the page=-1 response villages', async () => {
    const nav = '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=1">2</a></div>';
    const t = setup({ routes: happy({
      [OVERVIEW]: unitsHtml({ villages: [village(1, 1000)] }).replace('<table', nav + '<table'),
      [overviewPage(1)]: unitsHtml({ villages: [village(2, 2000)] }),
      [overviewPage(2)]: unitsHtml({ villages: [] }),
    }) });
    assert.equal(await run(t.deps), 'ok');
    assert.ok(t.dialogs[0].html.includes('3000'));
  });

  it('AC-3 windowed nav that never ends errors at the cap', async () => {
    const nav = '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=0">1</a></div>';
    const t = setup({ routes: happy({
      [OVERVIEW]: unitsHtml({ villages: [village(1, 1)] }).replace('<table', nav + '<table'),
      ...Object.fromEntries(Array.from({ length: 101 }, (_, n) =>
        [overviewPage(n), unitsHtml({ villages: [village(1000 + n, 1)] })])),
    }) });
    assert.equal(await run(t.deps), 'error');
    assert.equal(t.dialogs.length, 0);
    assert.ok(t.errors[0].includes(overviewPage(100)));
  });

  describe('AC-7 locale', () => {
    it('pt_PT gives the pt_PT title', async () => {
      const t = setup({ routes: happy(), root: {} });
      t.root.game_data.locale = 'pt_PT';
      await run(t.deps);
      assert.ok(t.dialogs[0].html.includes(I18N.pt_PT.title));
    });
    it('undefined locale gives en_US', async () => {
      const t = setup({ routes: happy() });
      t.root.game_data.locale = undefined;
      await run(t.deps);
      assert.ok(t.dialogs[0].html.includes(I18N.en_US.title));
    });
    it('game_data missing gives error without throwing', async () => {
      const t = setup({ routes: happy(), noGameData: true });
      assert.equal(await run(t.deps), 'error');
      assert.equal(t.errors.length, 1);
    });
  });

  describe('AC-9 re-run', () => {
    it('busy flag set gives busy, 0 gets, flag stays true', async () => {
      const t = setup({ routes: happy(), root: { __defTroopsCounterRunning: true } });
      assert.equal(await run(t.deps), 'busy');
      assert.equal(t.gets().length, 0);
      assert.equal(t.root.__defTroopsCounterRunning, true);
    });
    it('flag is false after an error run and after success', async () => {
      const bad = setup({ routes: happy({ [CONFIG]: new Error('x') }) });
      assert.equal(await run(bad.deps), 'error');
      assert.equal(bad.root.__defTroopsCounterRunning, false);
      const ok = setup({ routes: happy() });
      assert.equal(await run(ok.deps), 'ok');
      assert.equal(ok.root.__defTroopsCounterRunning, false);
    });
    it('two sequential runs with different X give different summaries', async () => {
      const a = setup({ routes: happy(), root: { MIN_TROOPS: 100 } });
      const b = setup({ routes: happy(), root: { MIN_TROOPS: 20000 } });
      await run(a.deps);
      await run(b.deps);
      assert.notEqual(a.dialogs[0].html, b.dialogs[0].html);
    });
  });

  it('AC-10 only GET urls via deps.get, no page_size or action=', async () => {
    const t = setup({ routes: happy({
      [CONFIG]: cfg(1),
      [scavUrl(0)]: scavHtml([scavEntry(1, 1)]),
      [scavUrl(1)]: scavHtml([]),
    }) });
    await run(t.deps);
    assert.deepEqual(Object.keys(t.deps).sort(),
      ['bindChange', 'get', 'parseHtml', 'root', 'setHtml', 'setValue', 'showDialog', 'showError', 'showInfo', 'wait']);
    assert.ok(t.gets().length > 0);
    for (const u of t.gets()) assert.ok(!u.includes('page_size') && !u.includes('action='), u);
  });
});

const SEL = 'dtc_group_1';
const TBL = 'dtc_table_1';
const tick = () => new Promise((r) => setImmediate(r));
const defer = () => { let res; let rej; const p = new Promise((a, b) => { res = a; rej = b; }); return { p, res, rej }; };
const rows = (h) => [...doc(`<body>${h}</body>`).querySelectorAll('table.vis tr')]
  .map((tr) => [...tr.children].map((c) => c.textContent.trim()));
const group5 = () => unitsHtml({ villages: [village(1, 700)] });
const switchRoutes = (extra = {}) => happy({
  [CONFIG]: cfg(1),
  [scavUrl(0)]: scavHtml([scavEntry(1, 1000), scavEntry(2, 7)]),
  [scavUrl(1)]: scavHtml([]),
  [ovG(5)]: group5(),
  [ovG(6)]: unitsHtml({ villages: [village(2, 300)] }),
  ...extra,
});
const started = async (opts = {}) => {
  const t = setup({ routes: switchRoutes(opts.routes), ...opts.setup });
  assert.equal(await run(t.deps), 'ok');
  return t;
};

describe('group combo and switching', () => {
  it('AC-5/13 gets order config, groups, overview with wait 200 before groups', async () => {
    const t = setup({ routes: happy() });
    await run(t.deps);
    assert.deepEqual(t.gets(), [CONFIG, GROUPS, OVERVIEW]);
    const i = t.log.indexOf(`get:${GROUPS}`);
    assert.equal(t.log[i - 1], 'wait:200');
  });

  it('AC-6 dialog has the select dtc_group_1 and options from the menu, All selected', async () => {
    const t = setup({ routes: happy() });
    await run(t.deps);
    assert.ok(t.dialogs[0].html.includes('<select id="dtc_group_1"'));
    assert.ok(t.dialogs[0].html.includes(`id="${TBL}"`));
    const opts = [...doc(t.dialogs[0].html).querySelectorAll('select option')];
    assert.deepEqual(opts.map((o) => [o.getAttribute('value'), o.textContent]), [['0', 'All'], ['5', 'K45'], ['6', 'K46']]);
    assert.equal(opts[0].hasAttribute('selected'), true);
    assert.equal(typeof t.handlers[SEL], 'function');
  });

  it('F1 group menu GET rejects: only All, dialog shown, no error, overview still fetched', async () => {
    const t = setup({ routes: happy({ [GROUPS]: new Error('boom') }) });
    assert.equal(await run(t.deps), 'ok');
    assert.equal(t.errors.length, 0);
    assert.equal(t.dialogs.length, 1);
    assert.deepEqual(t.gets(), [CONFIG, GROUPS, OVERVIEW]);
    assert.equal(doc(t.dialogs[0].html).querySelectorAll('select option').length, 1);
  });

  it('F1 group menu reply that is not JSON: only All, no error', async () => {
    const t = setup({ routes: happy({ [GROUPS]: '<html>login</html>' }) });
    assert.equal(await run(t.deps), 'ok');
    assert.equal(t.errors.length, 0);
    assert.equal(doc(t.dialogs[0].html).querySelectorAll('select option').length, 1);
  });

  it('AC-7 switch fetches group page=-1 after wait 200 and redraws with its own villages incl. scavenging', async () => {
    const t = await started();
    await t.handlers[SEL]('5');
    assert.equal(t.gets().at(-1), ovG(5));
    assert.equal(t.log.at(-2), 'wait:200');
    assert.equal(t.html.length, 1);
    assert.equal(t.html[0].id, TBL);
    const r = rows(t.html[0].html);
    assert.equal(r[1][1], '700');
    assert.equal(r[2][1], '1000');
    assert.equal(r[3][1], '1700');
    assert.equal(t.errors.length, 0);
  });

  it('F13 switch with scavenging disabled shows home numbers only', async () => {
    const t = setup({ routes: switchRoutes({ [CONFIG]: cfg(0) }) });
    await run(t.deps);
    await t.handlers[SEL]('5');
    const r = rows(t.html[0].html);
    assert.equal(r[1][1], '700');
    assert.equal(r[2][1], '0');
    assert.equal(r[3][1], '700');
  });

  it('AC-7 cache: second pick of a group and pick of 0 make no new GET', async () => {
    const t = await started();
    await t.handlers[SEL]('5');
    const n0 = t.gets().length;
    await t.handlers[SEL]('5');
    await t.handlers[SEL]('0');
    assert.equal(t.gets().length, n0);
    assert.equal(t.html.length, 3);
    assert.equal(rows(t.html[2].html)[1][1], '12345');
  });

  it('E7 a value not in the list is treated as group 0 from cache, no GET', async () => {
    const t = await started();
    const n0 = t.gets().length;
    await t.handlers[SEL]('abc');
    assert.equal(t.gets().length, n0);
    assert.equal(t.html.length, 1);
    assert.equal(rows(t.html[0].html)[1][1], '12345');
  });

  it('F2 group fetch rejects: error with URL, no setHtml, select reset, not cached, retry fetches', async () => {
    const t = await started({ routes: { [ovG(5)]: new Error('boom') } });
    await t.handlers[SEL]('5');
    assert.equal(t.errors.length, 1);
    assert.ok(t.errors[0].includes(ovG(5)));
    assert.equal(t.html.length, 0);
    assert.deepEqual(t.values, [[SEL, '0']]);
    t.routes[ovG(5)] = group5();
    const n0 = t.gets().length;
    await t.handlers[SEL]('5');
    assert.equal(t.gets().filter((u) => u === ovG(5)).length, 2);
    assert.ok(t.gets().length > n0);
    assert.equal(t.html.length, 1);
  });

  describe('F11 group fetch failures leave the table untouched and uncached', () => {
    const nav = '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=0">1</a></div>';
    const cases = {
      'missing table': [{ [ovG(5)]: '<html>none</html>' }, ovG(5), null],
      'missing spear column': [{ [ovG(5)]: unitsHtml({ units: ['sword', 'heavy'], villages: [] }) }, ovG(5), 'spear'],
      'overview page cap': [{
        [ovG(5)]: unitsHtml({ villages: [village(1, 1)] }).replace('<table', nav + '<table'),
        ...Object.fromEntries(Array.from({ length: 101 }, (_, k) =>
          [ovGPage(5, k), unitsHtml({ villages: [village(1000 + k, 1)] })])),
      }, ovGPage(5, 100), null],
    };
    for (const [name, [routes, url, unit]] of Object.entries(cases)) {
      it(name, async () => {
        const t = await started({ routes });
        await t.handlers[SEL]('5');
        assert.equal(t.errors.length, 1);
        assert.ok(t.errors[0].includes(url), t.errors[0]);
        if (unit) assert.ok(t.errors[0].includes(unit));
        assert.equal(t.html.length, 0);
        assert.deepEqual(t.values, [[SEL, '0']]);
        const before = t.gets().filter((u) => u === ovG(5)).length;
        await t.handlers[SEL]('5');
        assert.equal(t.gets().filter((u) => u === ovG(5)).length, before + 1);
      });
    }
  });

  it('F12 group fetch where the world paginates: pages followed, numbers summed', async () => {
    const nav = '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=0">1</a></div>' +
      '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=1">2</a></div>';
    const t = setup({ routes: switchRoutes({
      [CONFIG]: cfg(0),
      [ovG(5)]: unitsHtml({ villages: [village(1, 1000)] }).replace('<table', nav + '<table'),
      [ovGPage(5, 0)]: unitsHtml({ villages: [village(1, 1000)] }),
      [ovGPage(5, 1)]: unitsHtml({ villages: [village(2, 2000)] }),
      [ovGPage(5, 2)]: unitsHtml({ villages: [] }),
    }) });
    await run(t.deps);
    await t.handlers[SEL]('5');
    assert.deepEqual(t.gets().slice(-4), [ovG(5), ovGPage(5, 0), ovGPage(5, 1), ovGPage(5, 2)]);
    assert.equal(rows(t.html[0].html)[1][1], '3000');
  });

  it('critique 1: re-pick of a group whose fetch is in flight reuses it (one GET)', async () => {
    const gate = defer();
    const t = await started({ routes: { [ovG(5)]: () => gate.p } });
    const pa = t.handlers[SEL]('5');
    await tick();
    const pb = t.handlers[SEL]('6');
    const pc = t.handlers[SEL]('5');
    gate.res(group5());
    await Promise.all([pa, pb, pc]);
    assert.equal(t.gets().filter((u) => u === ovG(5)).length, 1);
    assert.equal(rows(t.html[t.html.length - 1].html)[1][1], '700');
  });

  it('F3 race: only the latest pick is drawn, the earlier one is cached and reused', async () => {
    const gate = defer();
    const t = await started({ routes: { [ovG(5)]: () => gate.p } });
    const pa = t.handlers[SEL]('5');
    await tick();
    const pb = t.handlers[SEL]('6');
    gate.res(group5());
    await Promise.all([pa, pb]);
    assert.equal(t.html.length, 1);
    assert.equal(rows(t.html[0].html)[1][1], '300');
    const n0 = t.gets().length;
    await t.handlers[SEL]('5');
    assert.equal(t.gets().length, n0);
    assert.equal(t.html.length, 2);
    assert.equal(rows(t.html[1].html)[1][1], '700');
  });

  it('F4 two picks: GETs are serialised, each preceded by wait 200, A before B', async () => {
    const gate = defer();
    const t = await started({ routes: { [ovG(5)]: () => gate.p } });
    const start = t.log.length;
    const pa = t.handlers[SEL]('5');
    const pb = t.handlers[SEL]('6');
    await tick();
    assert.ok(t.gets().includes(ovG(5)));
    assert.ok(!t.gets().includes(ovG(6)));
    gate.res(group5());
    await Promise.all([pa, pb]);
    assert.deepEqual(t.log.slice(start), ['wait:200', `get:${ovG(5)}`, 'wait:200', `get:${ovG(6)}`]);
  });

  it('F5 setHtml false (dialog closed): no throw, shown stays, a later failure resets to the old group', async () => {
    const t = await started({ routes: { [ovG(6)]: new Error('boom') } });
    t.state.setHtmlResult = false;
    await t.handlers[SEL]('5');
    assert.equal(t.errors.length, 0);
    assert.equal(t.values.length, 0);
    await t.handlers[SEL]('6');
    assert.equal(t.errors.length, 1);
    assert.deepEqual(t.values, [[SEL, '0']]);
  });

  it('F6 bindChange throws: run ok, one dialog, no error', async () => {
    const t = setup({ routes: happy(), bindThrows: true });
    assert.equal(await run(t.deps), 'ok');
    assert.equal(t.dialogs.length, 1);
    assert.equal(t.errors.length, 0);
  });

  it('F14 bindChange returns false: run ok, no error', async () => {
    const t = setup({ routes: happy(), bindResult: false });
    assert.equal(await run(t.deps), 'ok');
    assert.equal(t.dialogs.length, 1);
    assert.equal(t.errors.length, 0);
  });

  it('F7 two runs get different ids and each handler draws only into its own table', async () => {
    const t = setup({ routes: switchRoutes() });
    await run(t.deps);
    await run(t.deps);
    assert.ok(t.dialogs[0].html.includes('dtc_group_1'));
    assert.ok(t.dialogs[1].html.includes('dtc_group_2'));
    assert.ok(t.dialogs[1].html.includes('dtc_table_2'));
    await t.handlers.dtc_group_1('5');
    await t.handlers.dtc_group_2('5');
    assert.deepEqual(t.html.map((h) => h.id), ['dtc_table_1', 'dtc_table_2']);
  });

  it('F8 failure in A while B is the latest pick: no error, no setValue, B drawn', async () => {
    const gate = defer();
    const t = await started({ routes: { [ovG(5)]: () => gate.p } });
    const pa = t.handlers[SEL]('5');
    await tick();
    const pb = t.handlers[SEL]('6');
    gate.rej(new Error('boom'));
    await Promise.all([pa, pb]);
    assert.equal(t.errors.length, 0);
    assert.equal(t.values.length, 0);
    assert.equal(t.html.length, 1);
    assert.equal(rows(t.html[0].html)[1][1], '300');
  });

  it('F9 busy flag is false after run ok while a switch is pending', async () => {
    const gate = defer();
    const t = await started({ routes: { [ovG(5)]: () => gate.p } });
    const p = t.handlers[SEL]('5');
    assert.equal(t.root.__defTroopsCounterRunning, false);
    gate.res(group5());
    await p;
  });

  it('F10 A pending, B fails: error and select back to 0; A is cached but not drawn', async () => {
    const gate = defer();
    const t = await started({ routes: { [ovG(5)]: () => gate.p, [ovG(6)]: new Error('boom') } });
    const pa = t.handlers[SEL]('5');
    await tick();
    const pb = t.handlers[SEL]('6');
    gate.res(group5());
    await Promise.all([pa, pb]);
    assert.equal(t.errors.length, 1);
    assert.ok(t.errors[0].includes(ovG(6)));
    assert.deepEqual(t.values, [[SEL, '0']]);
    assert.equal(t.html.length, 0);
    const n0 = t.gets().length;
    await t.handlers[SEL]('5');
    assert.equal(t.gets().length, n0);
    assert.equal(t.html.length, 1);
  });
});
