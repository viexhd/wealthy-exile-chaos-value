'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseQuantity,
  parsePrice,
  median,
  inferDivineRate,
  computeChaosValue,
  formatChaos,
  copyText,
  formatNumber,
  findColumns,
  isStashPath,
} = require('../src/parse.js');

test('parseQuantity reads plain integers', () => {
  assert.equal(parseQuantity('65'), 65);
  assert.equal(parseQuantity(' 9 '), 9);
  assert.equal(parseQuantity('0'), 0);
});

test('parseQuantity reads thousands separators', () => {
  assert.equal(parseQuantity('1,234'), 1234);
  assert.equal(parseQuantity('3,681'), 3681);
  assert.equal(parseQuantity('1,234,567'), 1234567);
});

test('parseQuantity rejects empty and malformed cells', () => {
  for (const bad of ['', '   ', null, undefined, 'abc', '12c', '1.5', '1,23', ',123', '12,', '-5', '1 234x']) {
    assert.equal(parseQuantity(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('parsePrice reads chaos prices', () => {
  assert.deepEqual(parsePrice('12c'), { value: 12, unit: 'c' });
  assert.deepEqual(parsePrice('5.7c'), { value: 5.7, unit: 'c' });
  assert.deepEqual(parsePrice('0.04c'), { value: 0.04, unit: 'c' });
  assert.deepEqual(parsePrice(' 216c '), { value: 216, unit: 'c' });
  assert.deepEqual(parsePrice('1,234c'), { value: 1234, unit: 'c' });
});

test('parsePrice reads divine prices', () => {
  assert.deepEqual(parsePrice('1.2d'), { value: 1.2, unit: 'd' });
  assert.deepEqual(parsePrice('17d'), { value: 17, unit: 'd' });
  assert.deepEqual(parsePrice('2D'), { value: 2, unit: 'd' });
});

test('parsePrice rejects empty and malformed cells', () => {
  for (const bad of ['', '  ', null, undefined, 'c', '12', '12x', 'twelve c', '1.2.3c', '12cc', '-3c', '1e3c']) {
    assert.equal(parsePrice(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('median handles odd, even and empty lists', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('inferDivineRate uses rows priced in chaos with a total in divines', () => {
  const rows = [
    { quantity: 9, price: { value: 216, unit: 'c' }, total: { value: 9, unit: 'd' } },
    { quantity: 16, price: { value: 75, unit: 'c' }, total: { value: 5.5, unit: 'd' } },
    { quantity: 67, price: { value: 8.2, unit: 'c' }, total: { value: 2.5, unit: 'd' } },
    // Ignored: total in chaos, price in divines, missing values, zero total.
    { quantity: 2, price: { value: 34, unit: 'c' }, total: { value: 67, unit: 'c' } },
    { quantity: 3, price: { value: 1.2, unit: 'd' }, total: { value: 3.6, unit: 'd' } },
    { quantity: null, price: { value: 5, unit: 'c' }, total: { value: 1, unit: 'd' } },
    { quantity: 1, price: null, total: { value: 1, unit: 'd' } },
    { quantity: 1, price: { value: 1, unit: 'c' }, total: { value: 0, unit: 'd' } },
  ];
  const result = inferDivineRate(rows);
  assert.equal(result.samples, 3);
  // Samples: 216, 218.18..., 219.76 -> median 218.18...
  assert.ok(Math.abs(result.rate - (16 * 75) / 5.5) < 1e-9);
});

test('inferDivineRate takes the median so rounding outliers do not skew it', () => {
  const rows = [
    { quantity: 3681, price: { value: 1, unit: 'c' }, total: { value: 17, unit: 'd' } }, // 216.53
    { quantity: 9, price: { value: 216, unit: 'c' }, total: { value: 9, unit: 'd' } }, // 216
    { quantity: 1, price: { value: 30, unit: 'c' }, total: { value: 0.1, unit: 'd' } }, // 300 outlier
  ];
  assert.equal(inferDivineRate(rows).rate, 3681 / 17);
});

test('inferDivineRate returns null when no row qualifies', () => {
  assert.deepEqual(inferDivineRate([]), { rate: null, samples: 0 });
  assert.deepEqual(
    inferDivineRate([{ quantity: 2, price: { value: 34, unit: 'c' }, total: { value: 67, unit: 'c' } }]),
    { rate: null, samples: 0 },
  );
});

test('computeChaosValue multiplies chaos prices directly', () => {
  const r = computeChaosValue(65, { value: 12, unit: 'c' }, null);
  assert.equal(r.value, 780);
  assert.equal(r.text, '780c');
  assert.equal(r.title, '65 × 12c = 780c');
});

test('computeChaosValue converts divine prices with the rate', () => {
  const r = computeChaosValue(3, { value: 1.2, unit: 'd' }, 216);
  assert.ok(Math.abs(r.value - 777.6) < 1e-9);
  assert.equal(r.text, '778c');
  assert.equal(r.title, '3 × 1.2d (216c per divine) = 778c');
});

test('computeChaosValue shows ? when a divine price has no rate', () => {
  const r = computeChaosValue(3, { value: 1.2, unit: 'd' }, null);
  assert.equal(r.value, null);
  assert.equal(r.text, '?');
  assert.match(r.title, /divine rate/i);
});

test('computeChaosValue shows ? for unreadable cells', () => {
  assert.equal(computeChaosValue(null, { value: 1, unit: 'c' }, 200).text, '?');
  assert.equal(computeChaosValue(5, null, 200).text, '?');
});

test('formatChaos uses whole chaos with separators, and 1 decimal under 10c', () => {
  assert.equal(formatChaos(780), '780c');
  assert.equal(formatChaos(1234), '1,234c');
  assert.equal(formatChaos(1234567.4), '1,234,567c');
  assert.equal(formatChaos(5.74), '5.7c');
  assert.equal(formatChaos(0.04), '0.0c');
  assert.equal(formatChaos(9.96), '10c');
  assert.equal(formatChaos(10), '10c');
});

test('copyText gives the shown value as a plain number', () => {
  assert.equal(copyText(780), '780');
  assert.equal(copyText(1234.4), '1234');
  assert.equal(copyText(1234567.6), '1234568');
  assert.equal(copyText(5.74), '5.7');
  assert.equal(copyText(9.96), '10');
  assert.equal(copyText(null), null);
  assert.equal(copyText(NaN), null);
});

test('formatNumber keeps up to 2 decimals and adds separators', () => {
  assert.equal(formatNumber(3681), '3,681');
  assert.equal(formatNumber(5.7), '5.7');
  assert.equal(formatNumber(216.4545), '216.45');
});

test('findColumns finds columns by header text in any order', () => {
  assert.deepEqual(findColumns(['', 'Name', 'Tab', 'Quantity', 'Price', 'Total']), { quantity: 3, price: 4, total: 5 });
  assert.deepEqual(findColumns(['Total', ' price ', 'QUANTITY']), { quantity: 2, price: 1, total: 0 });
  assert.equal(findColumns(['Name', 'Price', 'Total']), null);
});

test('isStashPath only matches the stash page', () => {
  assert.equal(isStashPath('/stash'), true);
  assert.equal(isStashPath('/stash/'), true);
  assert.equal(isStashPath('/stash?tab=1'), true);
  assert.equal(isStashPath('/stash/abc'), true);
  assert.equal(isStashPath('/stashes'), false);
  assert.equal(isStashPath('/profile/stash'), false);
  assert.equal(isStashPath('/economy'), false);
  // Signed-in users also see the stash on the home page.
  assert.equal(isStashPath('/'), true);
  assert.equal(isStashPath(''), false);
});

test('fixture headers map to the expected columns', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'stash-table.html'), 'utf8');
  const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
  const labels = thead.split('<th ').slice(1).map((th) => {
    const m = th.match(/>([^<>]*)<\/p>/);
    return m ? m[1] : '';
  });
  assert.deepEqual(findColumns(labels), { quantity: 3, price: 4, total: 5 });
});
