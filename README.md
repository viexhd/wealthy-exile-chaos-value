# Chaos Value for Wealthy Exile

A small Firefox extension that adds a **Chaos Value** column to the stash table on [Wealthy Exile](https://wealthyexile.com).

The site shows each item's Quantity, Price and Total, but the Total is often in divines. This extension adds a column to the right of Total that shows the same value in chaos, so you can compare items at a glance.

## Screenshot

> Screenshot placeholder. Add an image at `docs/screenshot.png` and link it here.

## What it does

- Adds a **Chaos Value** column directly to the right of the **Total** column, in the header and in every item row.
- Chaos Value is **Quantity × Price**, shown in chaos.
- Prices in divines (for example `1.2d`) are converted to chaos with the divine rate.
- Values are shown as whole chaos with thousands separators (`780c`, `1,234c`). Values under 10c show 1 decimal place (`5.7c`).
- Hover over a value to see the working, for example `65 × 12c = 780c`.
- The column copies the look of the Total column, so it fits in with the site.
- The column keeps up with the site as you sort, filter, search, switch tabs, re-sync or scroll. It is removed when you leave the stash page and added again when you come back.
- Columns are found by their header text (Quantity, Price, Total), so the extension keeps working if the site moves columns around.

### Sorting

The Chaos Value header cannot be clicked to sort. The stash table is a virtualised list owned by the site: only the rows on screen exist in the page, and the site rebuilds them as you scroll. Sorting those rows from outside would only reorder what is on screen and would fight with the site's own sorting, so it is left out on purpose. The sort arrow is hidden in the Chaos Value header for the same reason.

## The popup

On Wealthy Exile an icon appears in the address bar. It is hidden on every other website. Click it to open the popup, which has:

- **Show the Chaos Value column**: turn the column on or off.
- **Detected divine rate**: the rate worked out from your stash page (read only).
- **Manual divine rate**: type your own rate in chaos to use instead. Click **Clear** to go back to the detected rate.

Changes take effect on the open page straight away. You do not need to reload.

## How the divine rate is worked out

Wealthy Exile does not label the divine rate in the table, so the extension works it out from the rows themselves:

1. It looks at every row where the **Price** is in chaos (for example `12c`) and the **Total** is in divines (for example `3.1d`).
2. For each of those rows, the rate is `(Quantity × Price) / Total`.
3. Totals are rounded to 1 decimal place, so a single row can be a little off. The extension takes the **median** of all the rows, which ignores the odd outlier.

The stash table only shows the rows on screen, so the extension remembers rows it has already seen while you are on the stash page. Scrolling therefore improves the estimate rather than changing it.

If no row has a chaos price and a divine total, items priced in divines show **?** with a tooltip explaining why. You can set a rate by hand in the popup to fix this.

A note on accuracy: prices on the site are rounded (for example `0.2c`), so very cheap items held in large numbers can differ a little from the site's own Total.

## Install

### Temporary install (for testing)

1. Download or clone this repository.
2. In Firefox, go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Pick the `manifest.json` file in the repository folder.

The extension stays installed until you restart Firefox.

### Install from a release

1. Go to the [Releases](https://github.com/viexhd/wealthy-exile-chaos-value/releases) page.
2. If a signed `.xpi` file is attached, open it in Firefox (or drag it onto a Firefox window) and click **Add**.
3. If only a `.zip` file is attached, it is unsigned. Release versions of Firefox only install signed add-ons, so either use the temporary install above (pick the `.zip` file instead of `manifest.json`), or use Firefox Developer Edition or Nightly with `xpinstall.signatures.required` set to `false` in `about:config`.

Firefox 109 or newer is needed.

## Privacy

- The extension collects **no data** at all.
- Nothing leaves your browser. It makes no network requests and has no analytics.
- The only thing it stores is your settings (column on or off, and your manual rate) plus the last detected rate, in Firefox's local extension storage on your own computer.

## Where it runs

The extension **only runs on wealthyexile.com** (including `www.wealthyexile.com`). Its only site access is `*://*.wealthyexile.com/*`, and its only other permission is `storage`. It **cannot read or change any other website**.

On Wealthy Exile it only changes the stash page (any address starting with `/stash`). When you are signed in, the site also shows your stash on its home page, so the column appears there too. On every other Wealthy Exile page it does nothing.

## Development

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm test        # unit tests for the parsing code (node --test)
npm run lint    # web-ext lint
npm start       # open Firefox with the extension loaded, at wealthyexile.com/stash
npm run build   # build a zip into dist/
```

To check the column by eye without signing in, open `test/fixture.html` in Firefox. It loads a saved copy of the stash table (`fixtures/stash-table.html`) and the real content script, with buttons that copy what the site does (sorting, reusing rows, re-rendering, leaving the page). If you change the fixture, run `npm run fixture` to update `test/fixture-data.js`.

The code is plain JavaScript with no frameworks and no build step:

- `src/parse.js`: reading prices and quantities, working out the divine rate, formatting.
- `src/content.js`: adds and updates the column on the page.
- `popup/`: the address bar popup.

## Disclaimer

This is an unofficial extension. It is not affiliated with, endorsed by or connected to Wealthy Exile or Grinding Gear Games. Path of Exile is a trademark of Grinding Gear Games.

## Licence

[MIT](LICENSE)
