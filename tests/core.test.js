'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../defTroopsCounter.js');
const { unitsHtml, scavHtml, doc, DEFAULT_UNITS } = require('./fixtures.js');

const { parseX, pickStrings, I18N, parseCount, parseUnitsTable, parseScavengePage,
  scavengingEnabled, summarize, renderHtml, renderTable, safeIconSrc, parseGroupMenu, VERSION, MAX_X } = api;

const U4 = ['spear', 'sword', 'heavy', 'archer'];
const U3 = ['spear', 'sword', 'heavy'];
// zero-filled counts over `units` with overrides (spread so prototype differences never matter)
const Z = (units, o = {}) => Object.fromEntries(units.map((u) => [u, o[u] || 0]));
const C = (spear = 0, sword = 0, heavy = 0, archer = 0) => ({ spear, sword, heavy, archer });
const P = (o) => ({ ...o });
const n = (c, u) => (c && c[u]) || 0;

describe('parseX', () => {
  const good = [[0, 0], [MAX_X, MAX_X], ['5000', 5000], [' 7 ', 7], [12, 12]];
  for (const [raw, x] of good) {
    it(`AC-1 accepts ${JSON.stringify(raw)}`, () => assert.deepEqual(parseX(raw), { ok: true, x }));
  }
  const bad = [undefined, null, '', '5k', '5.5', 5.5, -1, '-1', NaN, Infinity, MAX_X + 1, true, false];
  for (const raw of bad) {
    it(`AC-1 rejects ${String(raw)}`, () => assert.deepEqual(parseX(raw), { ok: false }));
  }
});

describe('i18n', () => {
  it('AC-12 key parity between locales, incl. unit names', () => {
    assert.deepEqual(Object.keys(I18N.pt_PT).sort(), Object.keys(I18N.en_US).sort());
    assert.deepEqual(Object.keys(I18N.pt_PT.units).sort(), Object.keys(I18N.en_US.units).sort());
  });
  it('AC-12 all 12 unit names and "all" exist; removed keys are gone', () => {
    const want = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob'];
    for (const l of ['en_US', 'pt_PT']) {
      assert.deepEqual(Object.keys(I18N[l].units).sort(), want.slice().sort());
      assert.equal(typeof I18N[l].all, 'string');
      for (const k of ['sum', 'na', 'summary', 'spear', 'sword', 'heavy', 'archer']) assert.ok(!(k in I18N[l]), `${l}.${k}`);
    }
    assert.equal(I18N.en_US.all, 'All');
    assert.equal(I18N.pt_PT.all, 'Todas');
  });
  it('AC-4 pt_PT labels', () => {
    assert.equal(I18N.pt_PT.home, 'Em casa');
    assert.equal(I18N.pt_PT.scavenging, 'Em busca');
    assert.equal(I18N.pt_PT.total, 'Total');
  });
  it('AC-7 unknown locale falls back to en_US', () => {
    assert.deepEqual(pickStrings('xx_XX'), I18N.en_US);
    assert.deepEqual(pickStrings('pt_PT'), I18N.pt_PT);
  });
  it('AC-1 errUsage contains MIN_TROOPS in both locales', () => {
    assert.match(I18N.en_US.errUsage, /MIN_TROOPS/);
    assert.match(I18N.pt_PT.errUsage, /MIN_TROOPS/);
  });
});

describe('parseCount', () => {
  const cases = [['12', 12], ['1.234', 1234], ['1 234', 1234], ['1 234', 1234], ['1,234', 1234],
    ['', null], ['abc', null], ['-3', null]];
  for (const [t, want] of cases) {
    it(`AC-6 ${JSON.stringify(t)} -> ${want}`, () => assert.equal(parseCount(t), want));
  }
});

describe('parseUnitsTable', () => {
  const V = [
    { id: 11, idVia: 'data-id', counts: { spear: '10', sword: '20', heavy: '30' } },
    { id: 22, idVia: 'href', counts: { spear: '1', sword: '2', heavy: '3' } },
  ];
  it('AC-1 units in header order, second row ignored, ids both ways, no hasArcher', () => {
    const r = parseUnitsTable(doc(unitsHtml({ villages: V })));
    assert.equal(r.ok, true);
    assert.deepEqual(r.units, DEFAULT_UNITS);
    assert.ok(!('hasArcher' in r));
    assert.equal(r.unreadable, 0);
    assert.deepEqual(r.villages.map((v) => [v.id, P(v.counts)]), [
      ['11', Z(DEFAULT_UNITS, { spear: 10, sword: 20, heavy: 30 })],
      ['22', Z(DEFAULT_UNITS, { spear: 1, sword: 2, heavy: 3 })],
    ]);
    assert.deepEqual(r.pages, []);
  });
  it('AC-1 axe and spy counts are read', () => {
    const r = parseUnitsTable(doc(unitsHtml({ villages: [{ id: 5, counts: { spear: '1', axe: '40', spy: '7' } }] })));
    assert.equal(r.villages[0].counts.axe, 40);
    assert.equal(r.villages[0].counts.spy, 7);
  });
  it('AC-1 militia column is excluded (E1)', () => {
    const units = ['spear', 'sword', 'militia', 'heavy'];
    const r = parseUnitsTable(doc(unitsHtml({ units, villages: [{ id: 5, counts: { spear: '1', militia: '9', heavy: '3' } }] })));
    assert.deepEqual(r.units, ['spear', 'sword', 'heavy']);
    assert.ok(!('militia' in r.icons));
    assert.ok(!('militia' in r.villages[0].counts));
    assert.equal(r.villages[0].counts.heavy, 3);
  });
  it('AC-1 archer world lists archer', () => {
    const units = ['spear', 'sword', 'archer', 'heavy'];
    const r = parseUnitsTable(doc(unitsHtml({ units, villages: [{ id: 5, counts: { spear: '1', sword: '2', archer: '4', heavy: '3' } }] })));
    assert.deepEqual(r.units, units);
    assert.deepEqual(P(r.villages[0].counts), { spear: 1, sword: 2, archer: 4, heavy: 3 });
  });
  it('AC-1 unknown unit is kept (E2)', () => {
    const units = ['spear', 'sword', 'xyz', 'heavy'];
    const r = parseUnitsTable(doc(unitsHtml({ units, villages: [{ id: 5, counts: { xyz: '8' } }] })));
    assert.ok(r.units.includes('xyz'));
    assert.equal(r.villages[0].counts.xyz, 8);
  });
  it('AC-3 icons map holds the raw header src per unit', () => {
    // Unit identity comes from the /unit_<name>.png pattern, so even the hostile src must contain it.
    const icons = { spear: 'https://cdn.x/unit_spear.png', sword: 'javascript:alert(1)//unit_sword.png' };
    const r = parseUnitsTable(doc(unitsHtml({ icons, villages: V })));
    assert.equal(r.icons.spear, 'https://cdn.x/unit_spear.png');
    assert.equal(r.icons.sword, 'javascript:alert(1)//unit_sword.png');
    assert.equal(r.icons.heavy, '/graphic/unit/unit_heavy.png');
  });
  it('AC-1 an unreadable axe cell counts as unreadable', () => {
    const r = parseUnitsTable(doc(unitsHtml({ villages: [{ id: 5, counts: { spear: '1', axe: 'abc' } }] })));
    assert.equal(r.unreadable, 1);
    assert.equal(r.villages[0].counts.axe, 0);
  });
  it('E11 a header unit named constructor is just another unit', () => {
    const units = ['spear', 'sword', 'constructor', 'heavy'];
    const r = parseUnitsTable(doc(unitsHtml({ units, villages: [{ id: 5, counts: { spear: '1', constructor: '6' } }] })));
    assert.equal(r.ok, true);
    assert.ok(r.units.includes('constructor'));
    assert.equal(r.villages[0].counts.constructor, 6);
  });
  it('AC-3 columns reordered', () => {
    const r = parseUnitsTable(doc(unitsHtml({ units: ['heavy', 'sword', 'spear'], villages: [{ id: 5, counts: { spear: '1', sword: '2', heavy: '3' } }] })));
    assert.deepEqual(r.units, ['heavy', 'sword', 'spear']);
    assert.deepEqual(P(r.villages[0].counts), { spear: 1, sword: 2, heavy: 3 });
  });
  it('AC-3 header without thead, colspan header, @2x img', () => {
    const html = '<table id="units_table"><tbody><tr><th colspan="2">V</th>' +
      '<th><img src="/g/unit_spear@2x.png"></th><th><img src="/g/unit_sword_2.png?x=1"></th><th><img src="/g/unit_heavy.webp"></th></tr></tbody>' +
      '<tbody><tr><td><span class="quickedit-vn" data-id="9">v</span></td><td>own</td><td>1</td><td>2</td><td>3</td></tr></tbody></table>';
    const r = parseUnitsTable(doc(html));
    assert.equal(r.ok, true);
    assert.deepEqual(r.villages.map((v) => [v.id, P(v.counts)]), [['9', { spear: 1, sword: 2, heavy: 3 }]]);
  });
  it('AC-3 quickedit-vn data-id wins over an earlier data-id', () => {
    const html = unitsHtml({ villages: [{ id: 5, counts: {} }] })
      .replace('<td><span class="quickedit-vn" data-id="5">', '<td><b data-id="77"></b><span class="quickedit-vn" data-id="5">');
    assert.equal(parseUnitsTable(doc(html)).villages[0].id, '5');
  });
  it('AC-3 pages from a nav, empty without one', () => {
    const nav = '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=1">2</a></div>' +
      '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=0">1</a></div>' +
      '<div class="paged-nav-item"><a href="/game.php?screen=overview_villages&page=1">2</a></div>';
    const r = parseUnitsTable(doc(unitsHtml({ villages: V }).replace('<table', nav + '<table')));
    assert.deepEqual(r.pages, [0, 1]);
  });
  it('AC-3 heavy missing gives missingColumn heavy', () => {
    const r = parseUnitsTable(doc(unitsHtml({ units: ['spear', 'sword'], villages: V })));
    assert.deepEqual(r, { ok: false, error: 'missingColumn', unit: 'heavy' });
  });
  it('AC-3 no table gives noTable', () => {
    assert.deepEqual(parseUnitsTable(doc('<html><body>nope</body></html>')), { ok: false, error: 'noTable' });
  });
  it('AC-6 bad cell and short row give unreadable 2 and no NaN', () => {
    const html = '<table id="units_table"><thead><tr><th>V</th>' +
      ['spear', 'sword', 'heavy'].map((u) => `<th><img src="/g/unit_${u}.png"></th>`).join('') + '</tr></thead>' +
      '<tbody><tr><td><span class="quickedit-vn" data-id="1">a</span></td><td>abc</td><td>2</td><td>3</td></tr></tbody>' +
      '<tbody><tr><td><span class="quickedit-vn" data-id="2">b</span></td><td>1</td><td>2</td></tr></tbody></table>';
    const r = parseUnitsTable(doc(html));
    assert.equal(r.unreadable, 2);
    for (const v of r.villages) for (const x of Object.values(v.counts)) assert.ok(Number.isInteger(x));
    assert.equal(r.villages[0].counts.spear, 0);
  });
  it('AC-3 a tbody with no tr is skipped', () => {
    const html = unitsHtml({ villages: V }).replace('</table>', '<tbody></tbody></table>');
    assert.equal(parseUnitsTable(doc(html)).villages.length, 2);
  });
});

describe('parseScavengePage', () => {
  const sq = (o) => ({ scavenging_squad: o });
  it('AC-1 valid page: 2 squads, null squad, undefined squad, every unit key counted', () => {
    const arr = [
      { village_id: 1, options: [sq({ unit_counts: { spear: 5, sword: 1, spy: 9 } }), sq({ unit_counts: { heavy: 2, archer: 3 } })] },
      { village_id: '2', options: [sq(null), { other: 1 }, sq({ unit_counts: { spear: 7 } })] },
    ];
    const r = parseScavengePage(scavHtml(arr));
    assert.equal(r.ok, true);
    assert.equal(r.unreadable, 0);
    assert.deepEqual(r.villages.map((v) => [v.id, P(v.counts)]), [
      ['1', { spear: 5, sword: 1, spy: 9, heavy: 2, archer: 3 }],
      ['2', { spear: 7 }],
    ]);
  });
  it('AC-1 axe is counted and summed across squads (E8)', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: [sq({ unit_counts: { axe: 5 } }), sq({ unit_counts: { axe: 2 } })] }]));
    assert.equal(r.villages[0].counts.axe, 7);
  });
  it('AC-1 options as an object', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: { 1: sq({ unit_counts: { spear: 4 } }), 2: sq({ unit_counts: { spear: 1 } }) } }]));
    assert.deepEqual(r.villages.map((v) => [v.id, P(v.counts)]), [['1', { spear: 5 }]]);
  });
  it('AC-11 empty array gives villages []', () => {
    assert.deepEqual(parseScavengePage(scavHtml([])), { ok: true, villages: [], unreadable: 0 });
  });
  const failing = {
    'no marker': '<script>var y = [1];</script>',
    'malformed JSON': '<script>\n new ScavengeMassScreen(\n {"a":1},\n [{"village_id": ],\n 5\n );</script>',
  };
  for (const [name, html] of Object.entries(failing)) {
    it(`AC-11 ${name} fails`, () => assert.deepEqual(parseScavengePage(html), { ok: false }));
  }
  it('AC-11 no village_id fails the whole page (intentional)', () => {
    assert.deepEqual(parseScavengePage(scavHtml([{ options: [] }])), { ok: false });
  });
  it('AC-6 a squad value "x" gives unreadable 1 (E9)', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: [sq({ unit_counts: { spear: 'x', sword: 2 } })] }]));
    assert.equal(r.unreadable, 1);
    assert.equal(n(r.villages[0].counts, 'spear'), 0);
    assert.equal(r.villages[0].counts.sword, 2);
  });
  it('AC-6 axe "x" gives unreadable 1 (E9)', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: [sq({ unit_counts: { axe: 'x', spear: 1 } })] }]));
    assert.equal(r.unreadable, 1);
    assert.equal(n(r.villages[0].counts, 'axe'), 0);
  });
  it('AC-6 HIGH: "", null and true count 0 and add to unreadable', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: [sq({ unit_counts: { spear: '', sword: null, heavy: true } })] }]));
    assert.equal(r.unreadable, 3);
    for (const u of U3) assert.equal(n(r.villages[0].counts, u), 0);
  });
});

describe('scavengingEnabled', () => {
  const cases = [
    ['<config><game><scavenging>1</scavenging></game></config>', true],
    ['<config><game><scavenging>0</scavenging></game></config>', false],
    ['<config><game></game></config>', false],
    ['<config><game></game><scavenging>1</scavenging></config>', false],
    ['<html>login</html>', null],
  ];
  for (const [xml, want] of cases) {
    it(`AC-11 ${xml} -> ${want}`, () => assert.equal(scavengingEnabled(xml), want));
  }
});

describe('summarize', () => {
  const h = (id, c) => ({ id, counts: c });
  it('AC-2 threshold: == x not counted, x+1 counted, x=0 all-zero not counted', () => {
    const r = summarize([h('1', C(100)), h('2', C(101)), h('3', C())], [], 100, U4);
    assert.equal(r.villagesTotal, 3);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(P(r.home), C(101));
    assert.deepEqual(r.units, U4);
    assert.ok(!('hasArcher' in r));
    const z = summarize([h('3', C())], [], 0, U4);
    assert.equal(z.villagesQualifying, 0);
  });
  it('AC-2 threshold uses def units only: axe 10000 with spear 0 does not qualify', () => {
    const units = ['spear', 'sword', 'axe', 'heavy'];
    const r = summarize([h('1', { spear: 0, sword: 0, axe: 10000, heavy: 0 })], [], 100, units);
    assert.equal(r.villagesQualifying, 0);
    assert.equal(r.total.axe, 0);
  });
  it('AC-2 qualifying village is summed for every unit, a non-qualifying one is not', () => {
    const units = ['spear', 'sword', 'axe', 'spy', 'heavy'];
    const r = summarize([h('1', { spear: 101, axe: 5, spy: 2 }), h('2', { spear: 1, axe: 10000, spy: 50 })],
      [h('1', { axe: 3 })], 100, units);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(P(r.home), Z(units, { spear: 101, axe: 5, spy: 2 }));
    assert.deepEqual(P(r.scavenging), Z(units, { axe: 3 }));
    assert.deepEqual(P(r.total), Z(units, { spear: 101, axe: 8, spy: 2 }));
  });
  it('E10 archer absent from units: def still counts spear/sword/heavy, no archer key', () => {
    const r = summarize([h('1', { spear: 60, sword: 0, heavy: 50 })], [], 100, U3);
    assert.equal(r.villagesQualifying, 1);
    assert.ok(!('archer' in r.home));
  });
  it('E8 keys outside units are ignored', () => {
    const r = summarize([h('1', { spear: 200, zzz: 4 })], [h('1', { xyz: 3, spear: 1 })], 100, U3);
    assert.deepEqual(Object.keys(r.home).sort(), U3.slice().sort());
    assert.deepEqual(Object.keys(r.scavenging).sort(), U3.slice().sort());
    assert.deepEqual(Object.keys(r.total).sort(), U3.slice().sort());
    assert.equal(r.total.spear, 201);
  });
  it('AC-2 merges by id incl. "12"/12 and totals equal home+scav, no sum key', () => {
    const r = summarize([h('12', C(5, 0, 0, 1))], [h(12, C(0, 4, 2, 0))], 10, U4);
    assert.equal(r.villagesTotal, 1);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(P(r.home), C(5, 0, 0, 1));
    assert.deepEqual(P(r.scavenging), C(0, 4, 2, 0));
    assert.deepEqual(P(r.total), C(5, 4, 2, 1));
    assert.ok(!('sum' in r.total));
  });
  it('AC-2 scav-only village counts, home 0', () => {
    const r = summarize([], [h('9', C(50))], 10, U3);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(P(r.home), Z(U3));
    assert.deepEqual(P(r.scavenging), Z(U3, { spear: 50 }));
  });
  it('AC-2 duplicate scav id is summed', () => {
    const r = summarize([], [h('9', C(6)), h('9', C(6))], 10, U3);
    assert.equal(r.villagesTotal, 1);
    assert.deepEqual(P(r.scavenging), Z(U3, { spear: 12 }));
  });
  it('AC-2 null id gives unreadable 1 and home counted', () => {
    const r = summarize([h(null, C(20))], [], 10, U4);
    assert.equal(r.unreadable, 1);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(P(r.home), C(20));
  });
  it('AC-2 duplicate home id is kept once without warning', () => {
    const r = summarize([h('1', C(20)), h('1', C(20))], [], 10, U4);
    assert.equal(r.villagesTotal, 1);
    assert.equal(r.unreadable, 0);
    assert.deepEqual(P(r.home), C(20));
  });
});

describe('safeIconSrc', () => {
  const ok = ['/g/a.png', 'https://x/a.png', 'HTTP://x'];
  for (const s of ok) it(`AC-3 accepts ${s}`, () => assert.equal(safeIconSrc(s), s));
  const bad = ['//x', 'javascript:alert(1)', 'data:image/png;base64,AA', '', null, 5, undefined];
  for (const s of bad) it(`AC-3 rejects ${String(s)}`, () => assert.equal(safeIconSrc(s), null));
});

describe('parseGroupMenu', () => {
  const ALL = { id: '0', name: 'All' };
  const menu = (list) => JSON.stringify({ result: list });
  it('AC-5 failures give only All', () => {
    for (const t of ['not json', '{}', '{"result":{}}', '{"result":"x"}', '[]', 'null', '', null, undefined, 5]) {
      assert.deepEqual(parseGroupMenu(t, 'All'), [ALL], String(t));
    }
  });
  it('AC-5 the All label is the one passed in', () => {
    assert.deepEqual(parseGroupMenu(null, 'Todas'), [{ id: '0', name: 'Todas' }]);
  });
  it('AC-5 keeps order, ids as strings, names trimmed', () => {
    const r = parseGroupMenu(menu([{ group_id: 7, name: ' K46 ' }, { group_id: '5', name: 'K45' }]), 'All');
    assert.deepEqual(r, [ALL, { id: '7', name: 'K46' }, { id: '5', name: 'K45' }]);
  });
  it('AC-5 skips separators, bad ids, non-objects (E5)', () => {
    const r = parseGroupMenu(menu([
      { group_id: 1, name: 'sep', type: 'separator' },
      { group_id: -1, name: 'neg' }, { group_id: 1.5, name: 'frac' }, { group_id: 'abc', name: 'abc' },
      { group_id: null, name: 'null' }, { name: 'missing' }, null, 5, 'str',
      { group_id: 2, name: 'good' },
    ]), 'All');
    assert.deepEqual(r, [ALL, { id: '2', name: 'good' }]);
  });
  it('AC-5 id 0 listed is skipped (All stays first)', () => {
    const r = parseGroupMenu(menu([{ group_id: 0, name: 'Zero' }, { group_id: '0', name: 'Zero2' }, { group_id: 3, name: 'x' }]), 'All');
    assert.deepEqual(r, [ALL, { id: '3', name: 'x' }]);
  });
  it('AC-5 duplicate id: first wins; 12 and "12" dedupe (E6)', () => {
    const r = parseGroupMenu(menu([{ group_id: 12, name: 'first' }, { group_id: '12', name: 'second' }, { group_id: 12, name: 'third' }]), 'All');
    assert.deepEqual(r, [ALL, { id: '12', name: 'first' }]);
  });
  it('AC-5 empty or blank name falls back to #id', () => {
    const r = parseGroupMenu(menu([{ group_id: 7, name: '' }, { group_id: 8, name: '   ' }, { group_id: 9 }]), 'All');
    assert.deepEqual(r, [ALL, { id: '7', name: '#7' }, { id: '8', name: '#8' }, { id: '9', name: '#9' }]);
  });
  it('AC-5 markup in a name is kept raw (escaped at render)', () => {
    const r = parseGroupMenu(menu([{ group_id: 4, name: '<script>x</script>' }]), 'All');
    assert.equal(r[1].name, '<script>x</script>');
  });
});

describe('renderTable', () => {
  const S = pickStrings('en_US');
  const units = ['spear', 'sword', 'heavy', 'xyz'];
  const view = () => summarize([{ id: '1', counts: { spear: 12345, sword: 3, heavy: 0, xyz: 9 } }], [], 5, units);
  const icons = { spear: '/g/spear.png', sword: 'javascript:alert(1)', heavy: '/g/h"x.png', xyz: '//evil/x.png' };
  const render = (ic = icons) => renderTable(view(), S, units, ic);
  const tbl = (html) => doc(`<body>${html}</body>`);
  it('AC-3 header has an img per unit with translated title/alt; bad src and unknown unit show text (E2, E3)', () => {
    const d = tbl(render());
    assert.equal(d.querySelectorAll('table.vis').length, 1);
    const ths = [...d.querySelectorAll('table.vis tr:first-child th')];
    assert.equal(ths.length, units.length + 1);
    const img = ths[1].querySelector('img');
    assert.equal(img.getAttribute('src'), '/g/spear.png');
    assert.equal(img.getAttribute('title'), S.units.spear);
    assert.equal(img.getAttribute('alt'), S.units.spear);
    assert.equal(ths[2].querySelector('img'), null);
    assert.equal(ths[2].textContent.trim(), S.units.sword);
    assert.equal(ths[4].querySelector('img'), null);
    assert.equal(ths[4].textContent.trim(), 'xyz');
    assert.ok(!render().includes('javascript:'));
  });
  it('AC-3 a double quote in src is escaped (E4)', () => {
    const out = render();
    assert.ok(!out.includes('h"x'));
    assert.equal(tbl(out).querySelectorAll('table.vis tr:first-child th')[3].querySelector('img').getAttribute('src'), '/g/h"x.png');
  });
  it('AC-4 4 rows, labels, numbers, centred cells, no Sum', () => {
    const out = render();
    const d = tbl(out);
    const rows = [...d.querySelectorAll('table.vis tr')];
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.slice(1).map((r) => r.children[0].textContent.trim()), [S.home, S.scavenging, S.total]);
    assert.deepEqual([...rows[1].children].slice(1).map((c) => c.textContent.trim()), ['12345', '3', '0', '9']);
    for (const r of rows.slice(1)) {
      assert.ok(!/center/.test(r.children[0].getAttribute('style') || ''));
      for (const c of [...r.children].slice(1)) assert.match(c.getAttribute('style') || '', /text-align:\s*center/);
    }
    assert.ok(!out.includes('Sum'));
  });
});

describe('renderHtml', () => {
  const S = pickStrings('en_US');
  const units = ['spear', 'sword', 'heavy'];
  const ids = { select: 'dtc_group_3', table: 'dtc_table_3' };
  const groups = [{ id: '0', name: 'All' }, { id: '5', name: '<b>K45</b>' }, { id: '6', name: 'K46' }];
  const view = (extra = {}) => ({ ...summarize([{ id: '1', counts: C(12345) }], [], 5, units), ...extra });
  const html = (v = view(), st = S) => renderHtml(v, st, groups, units, {}, ids);
  const body = (v, st) => doc(`<body>${html(v, st)}</body>`);
  it('AC-6 title, select with ids.select, option 0 selected, order kept, names escaped', () => {
    const d = body();
    assert.equal(d.querySelector('h2').textContent, S.title);
    const sel = d.querySelector('select#dtc_group_3');
    assert.ok(sel);
    const opts = [...sel.querySelectorAll('option')];
    assert.deepEqual(opts.map((o) => o.getAttribute('value')), ['0', '5', '6']);
    assert.equal(opts[0].hasAttribute('selected'), true);
    assert.equal(opts[1].hasAttribute('selected'), false);
    assert.equal(opts[1].textContent, '<b>K45</b>');
    assert.ok(!html().includes('<b>K45'));
  });
  it('AC-6 table lives in div#ids.table', () => {
    const d = body();
    assert.ok(d.querySelector('div#dtc_table_3 table.vis'));
    assert.ok(d.body.innerHTML.includes('12345'));
  });
  it('AC-11 footer shows title and v2.0.0', () => {
    assert.equal(VERSION, '2.0.0');
    const d = body();
    const b = d.querySelector('p small b');
    assert.ok(b);
    assert.equal(b.textContent, `${S.title} v2.0.0`);
  });
  it('AC-11 warning only when unreadable > 0', () => {
    const count = (v) => body(v).querySelectorAll('p').length;
    assert.equal(count(view({ unreadable: 3 })), count(view({ unreadable: 0 })) + 1);
  });
  it('AC-11 title is escaped', () => {
    const out = html(view(), { ...S, title: '<b>x</b>' });
    assert.ok(!out.includes('<b>x'));
    assert.ok(out.includes('&lt;b&gt;'));
  });
});
