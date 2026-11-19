'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'amo-metadata.json'), 'utf8'));

test('AMO summary fits the 250 character limit', () => {
  const summary = metadata.summary['en-US'];
  assert.ok(summary.length > 0 && summary.length <= 250, `summary is ${summary.length} characters`);
});

test('AMO metadata has a licence, category and reviewer notes', () => {
  assert.equal(metadata.version.license, 'MIT');
  assert.ok(Array.isArray(metadata.categories) && metadata.categories.length > 0);
  assert.ok(metadata.version.approval_notes.includes('test/fixture.html'));
});
