'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeChaosValue, copyText, divinePriceFromLinks, pickDivineRate } = require('../src/parse.js');

const c = (value) => ({ value, unit: 'c' });
const d = (value) => ({ value, unit: 'd' });

test('uses the site Total when it is in chaos, because prices are rounded', () => {
  // 960 × 0.04c = 38.4c, but the site's Total uses the unrounded price.
  const r = computeChaosValue(960, c(0.04), null, c(43));
  assert.equal(r.value, 43);
  assert.equal(r.text, '43c');
  assert.match(r.title, /960 × 0\.04c/);
  assert.match(r.title, /43c/);
  assert.match(r.title, /rounded/i);
});

test('keeps the plain working when the Total agrees with Quantity × Price', () => {
  const r = computeChaosValue(2, c(34), null, c(68));
  assert.equal(r.value, 68);
  assert.equal(r.title, '2 × 34c = 68c');
});

test('works it out from Quantity × Price when the Total is in divines', () => {
  const r = computeChaosValue(3681, c(1), 216, d(17));
  assert.equal(r.value, 3681);
  assert.equal(r.text, '3,681c');
});

test('divine prices still use the rate when the Total is in divines', () => {
  const r = computeChaosValue(3, d(1.2), 216, d(3.6));
  assert.ok(Math.abs(r.value - 777.6) < 1e-9);
  assert.equal(r.text, '778c');
});

test('a missing Total falls back to Quantity × Price', () => {
  assert.equal(computeChaosValue(65, c(12), null, null).value, 780);
  assert.equal(computeChaosValue(65, c(12), null).value, 780);
});

test('copied values are digits only, with a decimal point only under 10c', () => {
  for (const v of [0.04, 5.74, 9.96, 43, 780, 1234.4, 3681, 999999, 1234567.6, 98765432.1]) {
    const text = copyText(v);
    assert.match(text, /^\d+(\.\d)?$/, `${v} copied as ${JSON.stringify(text)}`);
    assert.doesNotMatch(text, /[\s,c]/);
  }
  assert.equal(copyText(98765432.1), '98765432');
});

test('divinePriceFromLinks reads the Divine Orb economy link', () => {
  const links = [
    { href: '/economy/Chaos%20Orb', text: '1c' },
    { href: '/economy/Divine%20Orb', text: '216c' },
  ];
  assert.equal(divinePriceFromLinks(links), 216);
  assert.equal(divinePriceFromLinks([{ href: 'https://wealthyexile.com/economy/Divine%20Orb', text: ' 215.5c ' }]), 215.5);
});

test('divinePriceFromLinks ignores other items and unreadable prices', () => {
  assert.equal(divinePriceFromLinks([]), null);
  assert.equal(divinePriceFromLinks([{ href: '/economy/Divine%20Vessel', text: '2c' }]), null);
  assert.equal(divinePriceFromLinks([{ href: '/economy/Divine%20Orb', text: '' }]), null);
  assert.equal(divinePriceFromLinks([{ href: '/economy/Divine%20Orb', text: '1d' }]), null);
  assert.equal(divinePriceFromLinks([{ href: '/economy/Divine%20Orb', text: 'Divine Orb' }]), null);
  assert.equal(divinePriceFromLinks([{ href: '/economy/%E0%A4%A', text: '5c' }]), null);
});

test('pickDivineRate prefers manual, then the page price, then the row estimate', () => {
  const rows = { rate: 216.4, samples: 13 };
  assert.deepEqual(pickDivineRate({ manual: 200, pagePrice: 216, rows }), { rate: 200, source: 'manual' });
  assert.deepEqual(pickDivineRate({ manual: null, pagePrice: 216, rows }), { rate: 216, source: 'page' });
  assert.deepEqual(pickDivineRate({ manual: null, pagePrice: null, rows }), { rate: 216.4, source: 'rows', samples: 13 });
  assert.deepEqual(pickDivineRate({ manual: null, pagePrice: null, rows: { rate: null, samples: 0 } }), {
    rate: null,
    source: 'none',
  });
});
