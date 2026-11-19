'use strict';

// Prints the CHANGELOG.md section for a version, plus install notes, for the GitHub release.
// Usage: node scripts/release-notes.js 1.0.0

const fs = require('node:fs');
const path = require('node:path');

function sectionFor(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return '';
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

function releaseNotes(changelog, version) {
  const changes = sectionFor(changelog, version) || 'See CHANGELOG.md.';
  return `${changes}

## Install

The easiest way is from Firefox Add-ons, which installs a signed copy and keeps it up to date:
https://addons.mozilla.org/firefox/addon/chaos-value-for-wealthy-exile/

The zip attached below is unsigned. Release versions of Firefox only install signed add-ons, so use it for a temporary install from about:debugging, or in Firefox Developer Edition or Nightly. See the README for step by step instructions.`;
}

if (require.main === module) {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/release-notes.js <version>');
    process.exit(1);
  }
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  process.stdout.write(releaseNotes(changelog, version));
}

module.exports = { sectionFor, releaseNotes };
