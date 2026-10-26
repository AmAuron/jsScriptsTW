'use strict';
const { JSDOM } = require('jsdom');

const DEFAULT_UNITS = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy', 'ram', 'catapult', 'snob'];

function villageRows(v, units) {
  let name;
  if (v.idVia === 'href') name = `<a href="/game.php?village=${v.id}&screen=overview">V${v.id}</a>`;
  else if (v.idVia === null) name = 'NoId';
  else name = `<span class="quickedit-vn" data-id="${v.id}">V${v.id}</span>`;
  const own = units.map((u) => `<td>${v.counts && v.counts[u] !== undefined ? v.counts[u] : '0'}</td>`).join('');
  const other = units.map(() => '<td>999</td>').join('');
  return `<tbody><tr><td>${name}</td><td>your own</td>${own}</tr>` +
    `<tr><td></td><td>in village</td>${other}</tr></tbody>`;
}

function unitsHtml({ units = DEFAULT_UNITS, villages = [] } = {}) {
  const head = units.map((u) => `<th><img src="/graphic/unit/unit_${u}.png"></th>`).join('');
  return '<html><body><table id="units_table"><thead><tr><th>Village</th><th></th>' + head +
    '</tr></thead>' + villages.map((v) => villageRows(v, units)).join('') + '</table></body></html>';
}

function scavHtml(arr) {
  return `<script>\n var x = new ScavengeMassScreen(\n {"a":1},\n ${JSON.stringify(arr)},\n 5\n );</script>`;
}

function doc(html) {
  return new JSDOM(html).window.document;
}

module.exports = { unitsHtml, scavHtml, doc, DEFAULT_UNITS };
