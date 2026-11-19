/*
 * Pure helpers for reading the Wealthy Exile stash table and working out chaos values.
 * No DOM access here, so the same file runs in the content script and in Node tests.
 */
(function (root) {
  'use strict';

  const QUANTITY_RE = /^(?:\d{1,3}(?:,\d{3})+|\d+)$/;
  const PRICE_RE = /^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([cd])$/i;

  function clean(text) {
    return typeof text === 'string' ? text.replace(/[\s ]+/g, ' ').trim() : '';
  }

  /** "1,234" -> 1234. Returns null for anything that is not a whole number. */
  function parseQuantity(text) {
    const t = clean(text);
    if (!QUANTITY_RE.test(t)) return null;
    return Number(t.replace(/,/g, ''));
  }

  /** "5.7c" -> { value: 5.7, unit: 'c' }, "1.2d" -> { value: 1.2, unit: 'd' }. */
  function parsePrice(text) {
    const m = PRICE_RE.exec(clean(text));
    if (!m) return null;
    return { value: Number(m[1].replace(/,/g, '')), unit: m[2].toLowerCase() };
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Works out chaos per divine from rows where the price is in chaos and the total is in divines.
   * Totals are rounded to 1 decimal place, so the median of all samples is used.
   * rows: [{ quantity, price: {value, unit}, total: {value, unit} }]
   */
  function inferDivineRate(rows) {
    const samples = [];
    for (const row of rows) {
      const { quantity, price, total } = row;
      if (quantity == null || !price || !total) continue;
      if (price.unit !== 'c' || total.unit !== 'd' || !(total.value > 0)) continue;
      const rate = (quantity * price.value) / total.value;
      if (Number.isFinite(rate) && rate > 0) samples.push(rate);
    }
    return { rate: median(samples), samples: samples.length };
  }

  const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const wholeFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

  function formatNumber(n) {
    return numberFormat.format(n);
  }

  /** Whole chaos with separators; 1 decimal place under 10c. */
  function formatChaos(value) {
    const oneDp = Math.round(value * 10) / 10;
    if (Math.abs(oneDp) < 10) return `${oneDp.toFixed(1)}c`;
    return `${wholeFormat.format(Math.round(value))}c`;
  }

  /**
   * Returns { value, text, title }. value is null when it cannot be worked out,
   * in which case text is "?" and title explains why.
   */
  function computeChaosValue(quantity, price, divineRate) {
    if (quantity == null) {
      return { value: null, text: '?', title: 'Could not read the quantity for this row.' };
    }
    if (!price) {
      return { value: null, text: '?', title: 'Could not read the price for this row.' };
    }
    const qty = formatNumber(quantity);
    const unitPrice = `${formatNumber(price.value)}${price.unit}`;
    if (price.unit === 'c') {
      const value = quantity * price.value;
      const text = formatChaos(value);
      return { value, text, title: `${qty} × ${unitPrice} = ${text}` };
    }
    if (!(divineRate > 0)) {
      return {
        value: null,
        text: '?',
        title:
          'This price is in divines but no divine rate is available. ' +
          'No row on the page has a chaos price with a total in divines. ' +
          'You can set a rate in the extension popup.',
      };
    }
    const value = quantity * price.value * divineRate;
    const text = formatChaos(value);
    return {
      value,
      text,
      title: `${qty} × ${unitPrice} (${formatNumber(divineRate)}c per divine) = ${text}`,
    };
  }

  function normaliseLabel(text) {
    return clean(text).toLowerCase();
  }

  /** Finds the Quantity, Price and Total columns from header labels. Null if any is missing. */
  function findColumns(labels) {
    const wanted = { quantity: 'quantity', price: 'price', total: 'total' };
    const found = {};
    labels.forEach((label, index) => {
      const l = normaliseLabel(label);
      for (const [key, name] of Object.entries(wanted)) {
        if (l === name && found[key] === undefined) found[key] = index;
      }
    });
    if (found.quantity === undefined || found.price === undefined || found.total === undefined) return null;
    return { quantity: found.quantity, price: found.price, total: found.total };
  }

  /**
   * True for the stash page: any path starting with /stash. Signed-in users also get the
   * stash on the home page, so "/" counts too. The column is only added if a table with
   * Quantity, Price and Total headers is found, so other pages are never changed.
   */
  function isStashPath(pathname) {
    if (pathname === '/') return true;
    return /^\/stash(?:[/?#]|$)/.test(pathname || '');
  }

  const api = {
    parseQuantity,
    parsePrice,
    median,
    inferDivineRate,
    computeChaosValue,
    formatChaos,
    formatNumber,
    findColumns,
    isStashPath,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ChaosValueParse = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
