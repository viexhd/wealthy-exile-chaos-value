'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sectionFor, releaseNotes } = require('../scripts/release-notes.js');

const sample = `# Changelog

## [1.1.0] - 2027-01-01

### Fixed

- Something.

## [1.0.0] - 2026-11-19

### Added

- First release.
`;

test('sectionFor returns only the requested version', () => {
  assert.equal(sectionFor(sample, '1.1.0'), '### Fixed\n\n- Something.');
  assert.equal(sectionFor(sample, '1.0.0'), '### Added\n\n- First release.');
  assert.equal(sectionFor(sample, '9.9.9'), '');
});

test('releaseNotes adds install notes', () => {
  const notes = releaseNotes(sample, '1.0.0');
  assert.match(notes, /First release/);
  assert.match(notes, /addons\.mozilla\.org/);
});

test('CHANGELOG.md has an entry for the manifest version', () => {
  const root = path.join(__dirname, '..');
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.notEqual(sectionFor(changelog, version), '', `CHANGELOG.md needs a "## [${version}]" section`);
});

test('package.json and manifest.json versions match', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, manifest.version);
});
