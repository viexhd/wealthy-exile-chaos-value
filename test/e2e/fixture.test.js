'use strict';

// Drives test/fixture.html in headless Firefox and checks the column the way a user would.
// Needs a Firefox install: set FIREFOX_PATH, or it uses the default Windows/macOS/Linux location.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

const FIXTURE_URL = pathToFileURL(path.join(__dirname, '..', 'fixture.html')).href;

function firefoxPath() {
  const candidates = [
    process.env.FIREFOX_PATH,
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
    '/Applications/Firefox.app/Contents/MacOS/firefox',
    '/usr/bin/firefox',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Firefox not found. Set FIREFOX_PATH to the Firefox executable.');
  return found;
}

let browser;

test.before(async () => {
  browser = await puppeteer.launch({ browser: 'firefox', executablePath: firefoxPath(), headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
});

/** Opens the test page with the clipboard replaced by a recorder. */
async function openPage() {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text) => (window.copied.push(text), Promise.resolve()) },
    });
  });
  await page.goto(FIXTURE_URL);
  await page.waitForSelector('td[data-chaos-value="cell"]');
  return page;
}

/** A summary of the table: chaos value per item name, plus layout checks. */
function snapshot(page) {
  return page.evaluate(() => {
    const table = document.querySelector('table');
    const headerCells = Array.from(table.tHead.rows[0].cells);
    const totalTh = headerCells.find((c) => c.textContent.trim() === 'Total');
    const ourHeaders = headerCells.filter((c) => c.hasAttribute('data-chaos-value'));
    const rows = Array.from(table.tBodies[0].rows);
    const items = rows.filter((r) => r.cells.length > 2);
    const values = {};
    let misplaced = 0;
    let duplicated = 0;
    for (const row of items) {
      const ours = Array.from(row.cells).filter((c) => c.hasAttribute('data-chaos-value'));
      if (ours.length > 1) duplicated++;
      const site = Array.from(row.cells).filter((c) => !c.hasAttribute('data-chaos-value'));
      if (ours[0] && ours[0].previousElementSibling !== site[5]) misplaced++;
      values[site[1].textContent.trim()] = ours[0] ? ours[0].textContent : null;
    }
    return {
      headers: ourHeaders.length,
      headerText: ourHeaders[0] ? ourHeaders[0].textContent.trim() : null,
      headerAfterTotal: ourHeaders[0] ? ourHeaders[0].previousElementSibling === totalTh : false,
      headerHasArrow: ourHeaders[0] ? !!ourHeaders[0].querySelector('svg') : false,
      cells: document.querySelectorAll('td[data-chaos-value="cell"]').length,
      spacerCells: rows.filter((r) => r.cells.length <= 2 && r.querySelector('[data-chaos-value]')).length,
      items: items.length,
      misplaced,
      duplicated,
      values,
    };
  });
}

function titleOf(page, name) {
  return page.evaluate((itemName) => {
    const row = Array.from(document.querySelectorAll('tbody tr')).find(
      (r) => r.cells.length > 2 && r.cells[1].textContent.trim() === itemName,
    );
    return row.querySelector('[data-chaos-value]').title;
  }, name);
}

/** Waits until the named item shows the expected chaos value (or none, for null). */
function waitForValue(page, name, expected) {
  return page.waitForFunction(
    (itemName, want) => {
      const row = Array.from(document.querySelectorAll('tbody tr')).find(
        (r) => r.cells.length > 2 && r.cells[1].textContent.trim() === itemName,
      );
      const cell = row && row.querySelector('[data-chaos-value]');
      return want === null ? !cell : !!cell && cell.textContent === want;
    },
    { timeout: 5000 },
    name,
    expected,
  );
}

test('adds one Chaos Value column right of Total', async () => {
  const page = await openPage();
  const s = await snapshot(page);
  assert.equal(s.headers, 1);
  assert.equal(s.headerText, 'Chaos Value');
  assert.equal(s.headerAfterTotal, true);
  assert.equal(s.headerHasArrow, false, 'sort arrow should be hidden');
  assert.equal(s.cells, s.items);
  assert.equal(s.misplaced, 0);
  assert.equal(s.duplicated, 0);
  assert.equal(s.spacerCells, 0, 'spacer rows must not get a cell');
  await page.close();
});

test('shows the right values', async () => {
  const page = await openPage();
  const { values } = await snapshot(page);
  assert.equal(values['Chaos Orb'], '3,681c'); // 3,681 × 1c, Total in divines
  assert.equal(values['Divine Orb'], '1,944c'); // 9 × 216c
  assert.equal(values['Fracturing Orb'], '778c'); // 3 × 1.2d × 216c
  assert.equal(values['Breach Thread'], '57c'); // site Total, as 272 × "0.2c" is rounded
  assert.equal(values['Enlighten Support - 1/0'], '67c'); // site Total, not 2 × 34c
  assert.equal(values['Vaal Orb'], '48c');
  assert.match(await titleOf(page, 'Fracturing Orb'), /Divine Orb price shown on the page/);
  assert.match(await titleOf(page, 'Breach Thread'), /rounded/);
  await page.close();
});

test('keeps up with sorting, reused rows and re-rendering', async () => {
  const page = await openPage();

  await page.click('#sort');
  await page.waitForFunction(() => document.querySelector('tbody').rows[1].cells[1].textContent.includes('Vaal'));
  let s = await snapshot(page);
  assert.equal(s.misplaced, 0);
  assert.equal(s.duplicated, 0);
  assert.equal(s.values['Chaos Orb'], '3,681c');

  await page.click('#recycle');
  await waitForValue(page, 'Recycled Row', '2,500c');

  await page.click('#rerender');
  await waitForValue(page, 'Chaos Orb', '3,681c');
  s = await snapshot(page);
  assert.equal(s.cells, s.items);
  assert.equal(s.headers, 1);
  await page.close();
});

test('removes the column when leaving the stash page and adds it back on return', async () => {
  const page = await openPage();
  await page.click('#route');
  await page.waitForFunction(() => !document.querySelector('[data-chaos-value]'));
  await page.click('#route');
  await waitForValue(page, 'Chaos Orb', '3,681c');
  const s = await snapshot(page);
  assert.equal(s.headers, 1);
  assert.equal(s.cells, s.items);
  await page.close();
});

test('the on/off toggle and manual rate apply without a reload', async () => {
  const page = await openPage();

  await page.click('#enabled');
  await page.waitForFunction(() => !document.querySelector('[data-chaos-value]'));
  await page.click('#enabled');
  await waitForValue(page, 'Fracturing Orb', '778c');

  await page.type('#override', '200');
  await waitForValue(page, 'Fracturing Orb', '720c');
  assert.match(await titleOf(page, 'Fracturing Orb'), /set by you/);

  await page.click('#clear');
  await waitForValue(page, 'Fracturing Orb', '778c');
  await page.close();
});

test('clicking a value copies plain digits and does not reach the site', async () => {
  const page = await openPage();
  await page.evaluate(() => {
    window.rowClicks = 0;
    document.querySelector('tbody').addEventListener('click', () => window.rowClicks++);
  });

  const cellFor = (name) =>
    page.evaluateHandle((itemName) => {
      const row = Array.from(document.querySelectorAll('tbody tr')).find(
        (r) => r.cells.length > 2 && r.cells[1].textContent.trim() === itemName,
      );
      return row.querySelector('[data-chaos-value]');
    }, name);

  await (await cellFor('Chaos Orb')).click();
  await (await cellFor('Fracturing Orb')).click();
  await page.waitForFunction(() => window.copied.length === 2);

  const result = await page.evaluate(() => ({
    copied: window.copied,
    rowClicks: window.rowClicks,
    toast: document.querySelector('[data-chaos-value="toast"]')?.textContent,
  }));
  assert.deepEqual(result.copied, ['3681', '778']);
  for (const text of result.copied) assert.match(text, /^\d+(\.\d)?$/);
  assert.equal(result.rowClicks, 0);
  assert.equal(result.toast, 'Copied 778');
  await page.close();
});
