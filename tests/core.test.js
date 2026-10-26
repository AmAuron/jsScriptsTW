'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../defTroopsCounter.js');
const { unitsHtml, scavHtml, doc } = require('./fixtures.js');

const { parseX, pickStrings, I18N, parseCount, parseUnitsTable, parseScavengePage,
  scavengingEnabled, summarize, renderHtml, MAX_X } = api;

const C = (spear = 0, sword = 0, heavy = 0, archer = 0) => ({ spear, sword, heavy, archer });
const withSum = (c) => ({ ...c, sum: c.spear + c.sword + c.heavy + c.archer });

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
  it('AC-7 key parity between locales', () => {
    assert.deepEqual(Object.keys(I18N.pt_PT).sort(), Object.keys(I18N.en_US).sort());
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
  const cases = [['12', 12], ['1.234', 1234], ['1 234', 1234], ['1 234', 1234], ['1,234', 1234],
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
  it('AC-3 normal world without archer, second row ignored, ids both ways', () => {
    const r = parseUnitsTable(doc(unitsHtml({ villages: V })));
    assert.equal(r.ok, true);
    assert.equal(r.hasArcher, false);
    assert.equal(r.unreadable, 0);
    assert.deepEqual(r.villages, [
      { id: '11', counts: C(10, 20, 30, 0) },
      { id: '22', counts: C(1, 2, 3, 0) },
    ]);
    assert.deepEqual(r.pages, []);
  });
  it('AC-4 archer world', () => {
    const units = ['spear', 'sword', 'archer', 'heavy'];
    const r = parseUnitsTable(doc(unitsHtml({ units, villages: [{ id: 5, counts: { spear: '1', sword: '2', archer: '4', heavy: '3' } }] })));
    assert.equal(r.hasArcher, true);
    assert.deepEqual(r.villages[0].counts, C(1, 2, 3, 4));
  });
  it('AC-3 columns reordered', () => {
    const r = parseUnitsTable(doc(unitsHtml({ units: ['heavy', 'sword', 'spear'], villages: [{ id: 5, counts: { spear: '1', sword: '2', heavy: '3' } }] })));
    assert.deepEqual(r.villages[0].counts, C(1, 2, 3, 0));
  });
  it('AC-3 header without thead, colspan header, @2x img', () => {
    const html = '<table id="units_table"><tbody><tr><th colspan="2">V</th>' +
      '<th><img src="/g/unit_spear@2x.png"></th><th><img src="/g/unit_sword_2.png?x=1"></th><th><img src="/g/unit_heavy.webp"></th></tr></tbody>' +
      '<tbody><tr><td><span class="quickedit-vn" data-id="9">v</span></td><td>own</td><td>1</td><td>2</td><td>3</td></tr></tbody></table>';
    const r = parseUnitsTable(doc(html));
    assert.equal(r.ok, true);
    assert.deepEqual(r.villages, [{ id: '9', counts: C(1, 2, 3, 0) }]);
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
    for (const v of r.villages) for (const n of Object.values(v.counts)) assert.ok(Number.isInteger(n));
    assert.equal(r.villages[0].counts.spear, 0);
  });
  it('AC-3 a tbody with no tr is skipped', () => {
    const html = unitsHtml({ villages: V }).replace('</table>', '<tbody></tbody></table>');
    assert.equal(parseUnitsTable(doc(html)).villages.length, 2);
  });
});

describe('parseScavengePage', () => {
  const sq = (o) => ({ scavenging_squad: o });
  it('AC-11 valid page: 2 squads, null squad, undefined squad, extra keys ignored', () => {
    const arr = [
      { village_id: 1, options: [sq({ unit_counts: { spear: 5, sword: 1, militia: 9, spy: 9 } }), sq({ unit_counts: { heavy: 2, archer: 3 } })] },
      { village_id: '2', options: [sq(null), { other: 1 }, sq({ unit_counts: { spear: 7 } })] },
    ];
    const r = parseScavengePage(scavHtml(arr));
    assert.equal(r.ok, true);
    assert.equal(r.unreadable, 0);
    assert.deepEqual(r.villages, [{ id: '1', counts: C(5, 1, 2, 3) }, { id: '2', counts: C(7, 0, 0, 0) }]);
  });
  it('AC-11 options as an object', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: { 1: sq({ unit_counts: { spear: 4 } }), 2: sq({ unit_counts: { spear: 1 } }) } }]));
    assert.deepEqual(r.villages, [{ id: '1', counts: C(5) }]);
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
  it('AC-6 a squad value "x" gives unreadable 1', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: [sq({ unit_counts: { spear: 'x', sword: 2 } })] }]));
    assert.equal(r.unreadable, 1);
    assert.deepEqual(r.villages[0].counts, C(0, 2));
  });
  it('AC-6 HIGH: "", null and true count 0 and add to unreadable', () => {
    const r = parseScavengePage(scavHtml([{ village_id: 1, options: [sq({ unit_counts: { spear: '', sword: null, heavy: true } })] }]));
    assert.equal(r.unreadable, 3);
    assert.deepEqual(r.villages[0].counts, C(0, 0));
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
  it('AC-5 threshold: == x not counted, x+1 counted, x=0 all-zero not counted', () => {
    const r = summarize([h('1', C(100)), h('2', C(101)), h('3', C())], [], 100, true);
    assert.equal(r.villagesTotal, 3);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(r.home, withSum(C(101)));
    const z = summarize([h('3', C())], [], 0, true);
    assert.equal(z.villagesQualifying, 0);
  });
  it('AC-5 merges by id incl. "12"/12 and totals equal home+scav', () => {
    const r = summarize([h('12', C(5, 0, 0, 1))], [h(12, C(0, 4, 2, 0))], 10, true);
    assert.equal(r.villagesTotal, 1);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(r.home, withSum(C(5, 0, 0, 1)));
    assert.deepEqual(r.scavenging, withSum(C(0, 4, 2, 0)));
    assert.deepEqual(r.total, withSum(C(5, 4, 2, 1)));
  });
  it('AC-5 scav-only village counts, home 0', () => {
    const r = summarize([], [h('9', C(50))], 10, false);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(r.home, withSum(C()));
    assert.deepEqual(r.scavenging, withSum(C(50)));
  });
  it('AC-5 duplicate scav id is summed', () => {
    const r = summarize([], [h('9', C(6)), h('9', C(6))], 10, false);
    assert.equal(r.villagesTotal, 1);
    assert.deepEqual(r.scavenging, withSum(C(12)));
  });
  it('AC-5 null id gives unreadable 1 and home counted', () => {
    const r = summarize([h(null, C(20))], [], 10, true);
    assert.equal(r.unreadable, 1);
    assert.equal(r.villagesQualifying, 1);
    assert.deepEqual(r.home, withSum(C(20)));
  });
  it('AC-5 duplicate home id is kept once without warning', () => {
    const r = summarize([h('1', C(20)), h('1', C(20))], [], 10, true);
    assert.equal(r.villagesTotal, 1);
    assert.equal(r.unreadable, 0);
    assert.deepEqual(r.home, withSum(C(20)));
  });
  it('AC-5 passes hasArcher through', () => {
    assert.equal(summarize([], [], 1, false).hasArcher, false);
    assert.equal(summarize([], [], 1, true).hasArcher, true);
  });
});

describe('renderHtml', () => {
  const S = pickStrings('en_US');
  it('AC-7 holds 3 rows and sums as plain digits', () => {
    const s = summarize([{ id: '1', counts: C(12345) }], [], 5, true);
    const d = doc(`<body>${renderHtml(s, S, 5)}</body>`);
    assert.ok(d.querySelector('h2'));
    assert.ok(d.querySelector('p'));
    assert.equal(d.querySelectorAll('table.vis tr').length, 4);
    assert.ok(d.body.innerHTML.includes('12345'));
  });
  it('AC-7 n/a when no archer', () => {
    const s = summarize([{ id: '1', counts: C(10) }], [], 5, false);
    assert.ok(renderHtml(s, S, 5).includes(S.na));
    assert.ok(!renderHtml(summarize([{ id: '1', counts: C(10) }], [], 5, true), S, 5).includes(`>${S.na}<`));
  });
  it('AC-7 warning only when unreadable > 0', () => {
    const base = summarize([{ id: '1', counts: C(10) }], [], 5, true);
    const count = (s) => doc(`<body>${renderHtml(s, S, 5)}</body>`).querySelectorAll('p').length;
    assert.equal(count({ ...base, unreadable: 3 }), count({ ...base, unreadable: 0 }) + 1);
  });
  it('AC-7 escapes markup from strings', () => {
    const s = summarize([], [], 5, true);
    const out = renderHtml(s, { ...S, title: '<b>x</b>' }, 5);
    assert.ok(!out.includes('<b>x'));
    assert.ok(out.includes('&lt;b&gt;'));
  });
});
