'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../defTroopsCounter.js');
const { unitsHtml, scavHtml, doc } = require('./fixtures.js');

const { run, I18N, MAX_SCAV_PAGES, GAP_MS } = api;

const CONFIG = '/interface.php?func=get_config';
const OVERVIEW = '/game.php?village=1&screen=overview_villages&mode=units&group=0&page=-1';
const overviewPage = (n) => `/game.php?village=1&screen=overview_villages&mode=units&group=0&page=${n}`;
const scavUrl = (n) => `/game.php?village=1&screen=place&mode=scavenge_mass&page=${n}`;
const cfg = (on) => `<config><game><scavenging>${on}</scavenging></game></config>`;
const village = (id, spear) => ({ id, counts: { spear: String(spear), sword: '0', heavy: '0' } });
const scavEntry = (id, spear) => ({ village_id: id, options: [{ scavenging_squad: { unit_counts: { spear } } }] });

// routes: url -> string | Error | function(url) (may throw); unknown url rejects
function setup({ routes = {}, root = {}, noGameData = false } = {}) {
  const log = [];
  const dialogs = [];
  const errors = [];
  const infos = [];
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
    showDialog: (id, html) => dialogs.push({ id, html }),
  };
  const gets = () => log.filter((l) => l.startsWith('get:')).map((l) => l.slice(4));
  return { deps, log, dialogs, errors, infos, root: fakeRoot, gets };
}

const happy = (extra = {}) => ({
  [CONFIG]: cfg(0),
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
    assert.deepEqual(t.gets(), [CONFIG, OVERVIEW]);
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
      assert.equal(t.gets().length, 5);
      assert.ok(t.dialogs[0].html.includes('13345'));
    });

    it('AC-11 a repeated first id stops without adding that page', async () => {
      const t = setup({ routes: happy({
        [CONFIG]: cfg(1),
        [scavUrl(0)]: scavHtml([scavEntry(1, 1000)]),
        [scavUrl(1)]: scavHtml([scavEntry(1, 1000)]),
      }) });
      assert.equal(await run(t.deps), 'ok');
      assert.equal(t.gets().length, 4);
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
    assert.deepEqual(t.gets(), [CONFIG, OVERVIEW, overviewPage(0), overviewPage(1), overviewPage(2)]);
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
      ['get', 'parseHtml', 'root', 'showDialog', 'showError', 'showInfo', 'wait']);
    assert.ok(t.gets().length > 0);
    for (const u of t.gets()) assert.ok(!u.includes('page_size') && !u.includes('action='), u);
  });
});
