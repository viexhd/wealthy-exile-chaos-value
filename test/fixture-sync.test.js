'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { render, source, target } = require('../scripts/build-fixture.js');

test('test/fixture-data.js matches fixtures/stash-table.html', () => {
  const expected = render(fs.readFileSync(source, 'utf8'));
  const actual = fs.readFileSync(target, 'utf8');
  assert.equal(actual, expected, 'Run "npm run fixture" to regenerate test/fixture-data.js');
});
