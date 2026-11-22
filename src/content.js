/*
 * Adds a "Chaos Value" column to the Wealthy Exile stash table.
 *
 * The site is a single-page app with a virtualised table: rows are created, reused and
 * removed as you scroll, sort, filter or change tab. A debounced MutationObserver re-checks
 * the table after every change, so the column is always present, never duplicated and
 * never left with stale values.
 */
(function () {
  'use strict';

  const P = globalThis.ChaosValueParse;
  const ext = typeof browser !== 'undefined' && browser.storage ? browser : null;

  const MARK = 'data-chaos-value';
  const COPY_ATTR = 'data-chaos-copy';
  const TOAST_MS = 1200;
  const HEADER_LABEL = 'Chaos Value';
  const DEBOUNCE_MS = 60;
  const MAX_WAIT_MS = 250;
  const ROUTE_POLL_MS = 500;
  const MAX_SAMPLES = 2000;

  const settings = { enabled: true, rateOverride: null };

  // Divine rate samples keyed by row content. Rows are virtualised, so this keeps samples
  // from rows that have scrolled out of view. Cleared when leaving the stash page.
  const rateSamples = new Map();
  let published = { rate: undefined, samples: undefined };

  let observer = null;
  let timer = null;
  let firstScheduledAt = 0;
  let lastPath = null;
  let injected = false;

  // The test page sets this to pretend it is on /stash. In the extension the page cannot
  // reach this value, because content scripts run in their own isolated scope.
  function currentPath() {
    return globalThis.chaosValueTestPath || location.pathname;
  }

  function validRate(value) {
    const n = Number(value);
    return value !== null && value !== '' && Number.isFinite(n) && n > 0 ? n : null;
  }

  function isCell(el) {
    return el.tagName === 'TD' || el.tagName === 'TH';
  }

  /** The row's own cells, without the ones this extension added. */
  function siteCells(row) {
    return Array.from(row.children).filter((c) => isCell(c) && !c.hasAttribute(MARK));
  }

  function ourCells(row) {
    return Array.from(row.children).filter((c) => c.hasAttribute(MARK));
  }

  function headerRowOf(table) {
    if (table.tHead && table.tHead.rows.length) return table.tHead.rows[0];
    const first = table.querySelector('tr');
    return first && first.querySelector('th') ? first : null;
  }

  function findStashTables() {
    const found = [];
    for (const table of document.querySelectorAll('table')) {
      const headerRow = headerRowOf(table);
      if (!headerRow) continue;
      const headerCells = siteCells(headerRow);
      const cols = P.findColumns(headerCells.map((c) => c.textContent));
      if (cols) found.push({ table, headerRow, headerCells, cols });
    }
    return found;
  }

  function bodyRows(info) {
    const rows = [];
    for (const tbody of info.table.tBodies) {
      for (const row of tbody.rows) rows.push(row);
    }
    return rows;
  }

  /** Reads an item row. Returns null for spacer rows, which have fewer cells than the header. */
  function readRow(row, info) {
    const cells = siteCells(row);
    if (cells.length !== info.headerCells.length) return null;
    const priceText = cells[info.cols.price].textContent.trim();
    return {
      row,
      cells,
      key: cells.map((c) => c.textContent.trim()).join('␟'),
      priceText,
      quantity: P.parseQuantity(cells[info.cols.quantity].textContent),
      price: P.parsePrice(priceText),
      total: P.parsePrice(cells[info.cols.total].textContent),
    };
  }

  function buildHeader(totalTh) {
    const th = totalTh.cloneNode(true);
    th.setAttribute(MARK, 'header');
    th.removeAttribute('id');
    th.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

    // Swap the label text, keeping the site's own markup around it.
    const label = totalTh.textContent.trim();
    const labelEl = Array.from(th.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && el.textContent.trim() === label,
    );
    if (labelEl) {
      labelEl.textContent = HEADER_LABEL;
      if (labelEl.hasAttribute('title')) labelEl.setAttribute('title', HEADER_LABEL);
    } else {
      th.textContent = HEADER_LABEL;
    }

    // Hide the sort arrow: sorting is handled by the site and does not apply to this column.
    th.querySelectorAll('svg').forEach((svg) => {
      const wrapper = svg.parentElement;
      svg.remove();
      if (wrapper && wrapper !== th && !wrapper.children.length && !wrapper.textContent.trim()) {
        wrapper.remove();
      }
    });
    th.querySelectorAll('button').forEach((button) => {
      button.tabIndex = -1;
      button.setAttribute('aria-disabled', 'true');
      button.style.cursor = 'default';
    });

    th.title = 'Quantity × Price, in chaos. Divine prices are converted with the divine rate.';
    return th;
  }

  function ensureHeader(info) {
    const existing = ourCells(info.headerRow);
    existing.slice(1).forEach((el) => el.remove());
    const totalTh = info.headerCells[info.cols.total];
    const th = existing[0] || buildHeader(totalTh);
    if (th.previousElementSibling !== totalTh) totalTh.after(th);
  }

  function copyLook(from, to, extraStyle) {
    for (const attr of Array.from(from.attributes)) {
      if (attr.name === 'id' || attr.name === 'title' || attr.name.startsWith('data-chaos')) continue;
      let value = attr.value;
      if (attr.name === 'style' && extraStyle) value = `${value.replace(/;?\s*$/, ';')} ${extraStyle}`;
      if (to.getAttribute(attr.name) !== value) to.setAttribute(attr.name, value);
    }
  }

  function cellContent(data, rate, rateSource) {
    if (!data.priceText) return { text: '', title: 'This item has no price.', copy: null };
    const result = P.computeChaosValue(data.quantity, data.price, rate, data.total);
    let title = result.title;
    const usedRate = data.price.unit === 'd' && !(data.total && data.total.unit === 'c');
    if (result.value !== null && usedRate) title += ` ${rateSource}`;
    const copy = P.copyText(result.value);
    if (copy !== null) title += '\nClick to copy.';
    return { text: result.text, title, copy };
  }

  function ensureCell(data, rate, rateSource, info) {
    const totalTd = data.cells[info.cols.total];
    const existing = ourCells(data.row);
    existing.slice(1).forEach((el) => el.remove());

    let td = existing[0];
    if (!td || td.tagName !== totalTd.tagName) {
      if (td) td.remove();
      td = document.createElement(totalTd.tagName);
      td.setAttribute(MARK, 'cell');
    }
    const { text, title, copy } = cellContent(data, rate, rateSource);
    copyLook(totalTd, td, copy === null ? '' : 'cursor: pointer;');
    if (copy === null) td.removeAttribute(COPY_ATTR);
    else if (td.getAttribute(COPY_ATTR) !== copy) td.setAttribute(COPY_ATTR, copy);
    if (td.textContent !== text) td.textContent = text;
    if (td.title !== title) td.title = title;
    if (td.previousElementSibling !== totalTd) totalTd.after(td);
  }

  function removeAll() {
    document.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove());
    injected = false;
  }

  function recordSamples(rowsData) {
    for (const data of rowsData) {
      const { rate } = P.inferDivineRate([data]);
      if (rate === null) continue;
      rateSamples.delete(data.key);
      rateSamples.set(data.key, rate);
      if (rateSamples.size > MAX_SAMPLES) rateSamples.delete(rateSamples.keys().next().value);
    }
  }

  /** The Divine Orb price shown on the page (sidebar or table row), or null. */
  function pageDivinePrice() {
    const links = Array.from(document.querySelectorAll('a[href*="/economy/Divine"]'), (a) => ({
      href: a.getAttribute('href'),
      text: a.textContent,
    }));
    return P.divinePriceFromLinks(links);
  }

  /** The rate found on the page, without any manual override. */
  function detectedRate() {
    const values = Array.from(rateSamples.values());
    return P.pickDivineRate({
      manual: null,
      pagePrice: pageDivinePrice(),
      rows: { rate: P.median(values), samples: values.length },
    });
  }

  function describeSource(choice) {
    if (choice.source === 'manual') return 'The divine rate was set by you in the popup.';
    if (choice.source === 'page') return 'The divine rate is the Divine Orb price shown on the page.';
    const n = choice.samples;
    return `The divine rate was worked out from ${n} row${n === 1 ? '' : 's'}.`;
  }

  function publishDetected(detected) {
    const rate = detected.rate === null ? null : Math.round(detected.rate * 100) / 100;
    const samples = detected.samples || 0;
    const { source } = detected;
    if (published.rate === rate && published.samples === samples && published.source === source) return;
    published = { rate, samples, source };
    if (ext) {
      ext.storage.local
        .set({ detectedRate: rate, detectedSamples: samples, detectedSource: source })
        .catch(() => {});
    }
  }

  function update() {
    timer = null;
    firstScheduledAt = 0;
    const path = currentPath();
    if (path !== lastPath) {
      if (lastPath !== null && !P.isStashPath(path)) rateSamples.clear();
      lastPath = path;
    }

    pauseObserver();
    try {
      if (!settings.enabled || !P.isStashPath(path)) {
        if (injected) removeAll();
        return;
      }

      const tables = findStashTables();
      const perTable = tables.map((info) => {
        const items = [];
        const spacers = [];
        for (const row of bodyRows(info)) {
          const data = readRow(row, info);
          if (data) items.push(data);
          else spacers.push(row);
        }
        return { info, items, spacers };
      });

      perTable.forEach(({ items }) => recordSamples(items));
      const detected = detectedRate();
      publishDetected(detected);

      const manual = validRate(settings.rateOverride);
      const choice = manual ? P.pickDivineRate({ manual }) : detected;
      const rate = choice.rate;
      const rateSource = describeSource(choice);

      for (const { info, items, spacers } of perTable) {
        ensureHeader(info);
        for (const data of items) ensureCell(data, rate, rateSource, info);
        // A reused row can turn into a spacer; make sure it does not keep an old cell.
        for (const row of spacers) ourCells(row).forEach((el) => el.remove());
      }
      injected = injected || tables.length > 0;
    } finally {
      resumeObserver();
    }
  }

  function schedule() {
    const now = Date.now();
    if (!firstScheduledAt) firstScheduledAt = now;
    if (timer) clearTimeout(timer);
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, firstScheduledAt + MAX_WAIT_MS - now));
    timer = setTimeout(update, wait);
  }

  function pauseObserver() {
    if (observer) observer.disconnect();
  }

  function resumeObserver() {
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function applySettings(values) {
    if ('enabled' in values) settings.enabled = values.enabled !== false;
    if ('rateOverride' in values) settings.rateOverride = validRate(values.rateOverride);
  }

  /** A small note by the cursor that fades out, so the table itself is never changed. */
  function showToast(message, x, y) {
    document.querySelectorAll(`[${MARK}="toast"]`).forEach((el) => el.remove());
    const toast = document.createElement('div');
    toast.setAttribute(MARK, 'toast');
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      left: `${x + 12}px`,
      top: `${y - 32}px`,
      zIndex: '2147483647',
      padding: '4px 8px',
      borderRadius: '4px',
      background: 'rgba(20, 21, 23, 0.92)',
      color: '#ffffff',
      font: '12px/1.4 system-ui, sans-serif',
      pointerEvents: 'none',
      transition: 'opacity 200ms ease',
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
    }, TOAST_MS - 200);
    setTimeout(() => toast.remove(), TOAST_MS);
  }

  function onClick(event) {
    const cell = event.target instanceof Element ? event.target.closest(`[${MARK}="cell"]`) : null;
    if (!cell) return;
    // Keep the click away from the site, so it does not also act on the row.
    event.stopPropagation();
    const value = cell.getAttribute(COPY_ATTR);
    if (!value) return;
    const { clientX: x, clientY: y } = event;
    const done = (ok) => showToast(ok ? `Copied ${value}` : 'Could not copy', x, y);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(() => done(true), () => done(copyWithSelection(value)));
    } else {
      done(copyWithSelection(value));
    }
  }

  /** Older way to copy, used if the clipboard API is not available. */
  function copyWithSelection(value) {
    const area = document.createElement('textarea');
    area.setAttribute(MARK, 'copy');
    area.value = value;
    area.setAttribute('readonly', '');
    Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0' });
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function start() {
    document.addEventListener('click', onClick, true);
    resumeObserver();
    window.addEventListener('popstate', schedule);
    setInterval(() => {
      if (currentPath() !== lastPath) schedule();
    }, ROUTE_POLL_MS);

    if (ext) {
      ext.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const values = {};
        if (changes.enabled) values.enabled = changes.enabled.newValue;
        if (changes.rateOverride) values.rateOverride = changes.rateOverride.newValue;
        if (Object.keys(values).length) {
          applySettings(values);
          update();
        }
      });
      ext.storage.local
        .get({ enabled: true, rateOverride: null })
        .then(applySettings, () => {})
        .then(update);
    } else {
      update();
    }
  }

  start();
})();
