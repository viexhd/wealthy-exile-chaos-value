'use strict';

const storage = browser.storage.local;

const els = {
  enabled: document.getElementById('enabled'),
  detected: document.getElementById('detected'),
  detectedNote: document.getElementById('detected-note'),
  override: document.getElementById('override'),
  overrideNote: document.getElementById('override-note'),
  clear: document.getElementById('clear'),
};

const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

function validRate(value) {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

function showDetected(rate, samples) {
  if (validRate(rate)) {
    els.detected.textContent = `${numberFormat.format(rate)}c`;
    els.detectedNote.textContent = `Median of ${samples} row${samples === 1 ? '' : 's'} priced in chaos with a total in divines.`;
  } else {
    els.detected.textContent = 'Not detected yet';
    els.detectedNote.textContent = 'Open your stash page to work it out.';
  }
}

function showOverride(rate) {
  const valid = validRate(rate);
  if (document.activeElement !== els.override) els.override.value = valid ? String(valid) : '';
  els.overrideNote.textContent = valid
    ? 'Using your rate instead of the detected one.'
    : 'Leave empty to use the detected rate.';
}

function showEnabled(enabled) {
  els.enabled.checked = enabled !== false;
  document.body.classList.toggle('disabled', enabled === false);
}

async function load() {
  const values = await storage.get({ enabled: true, rateOverride: null, detectedRate: null, detectedSamples: 0 });
  showEnabled(values.enabled);
  showDetected(values.detectedRate, values.detectedSamples);
  showOverride(values.rateOverride);
}

els.enabled.addEventListener('change', () => {
  storage.set({ enabled: els.enabled.checked });
});

els.override.addEventListener('input', () => {
  const raw = els.override.value.trim();
  if (raw === '') {
    storage.set({ rateOverride: null });
  } else if (validRate(raw)) {
    storage.set({ rateOverride: Number(raw) });
  }
});

els.clear.addEventListener('click', () => {
  els.override.value = '';
  storage.set({ rateOverride: null });
  els.override.focus();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) showEnabled(changes.enabled.newValue);
  if (changes.rateOverride) showOverride(changes.rateOverride.newValue);
  if (changes.detectedRate || changes.detectedSamples) {
    storage.get({ detectedRate: null, detectedSamples: 0 }).then((v) => showDetected(v.detectedRate, v.detectedSamples));
  }
});

load();
