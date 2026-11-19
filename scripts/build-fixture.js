'use strict';

// Copies fixtures/stash-table.html into test/fixture-data.js so test/fixture.html can load it
// from disk (browsers block fetch() on file:// pages, but allow <script src>).

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'fixtures', 'stash-table.html');
const target = path.join(root, 'test', 'fixture-data.js');

function render(html) {
  return `// Generated from fixtures/stash-table.html by scripts/build-fixture.js. Do not edit.\nwindow.STASH_TABLE_HTML = ${JSON.stringify(html)};\n`;
}

if (require.main === module) {
  fs.writeFileSync(target, render(fs.readFileSync(source, 'utf8')));
  console.log(`Wrote ${path.relative(root, target)}`);
}

module.exports = { render, source, target };
