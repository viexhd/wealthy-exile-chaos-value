# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- New coin icon, exported as PNGs at 16, 32, 48, 96 and 128 px for the toolbar, address bar and Firefox Add-ons listing. A simpler version is used at 16 and 32 px so it stays clear.
- Firefox Add-ons description is now plain text instead of HTML.
- README now has a banner, a "how it works" image and quick links.

## [1.1.0] - 2026-11-23

### Changed

- When the site's Total is in chaos, the Chaos Value now uses that Total. The site works it out from the exact price, so cheap items held in large numbers are no longer off (for example 960 × "0.04c" now shows 43c instead of 38c).
- The divine rate now comes from the Divine Orb price shown on the page when there is one. The estimate from rows is used only when the page shows no Divine Orb price. The popup and tooltips say which was used.
- Firefox 140 or newer is now needed (Firefox for Android 142 or newer). This is the current long-term support release, and it lets Firefox grant site access when the add-on is installed.

### Added

- Browser tests that drive the test page in headless Firefox, run in CI on every push.
- A test that copied values are always digits only (no spaces, commas or "c"), ready to paste into the in-game market.

## [1.0.0] - 2026-11-19

### Added

- Chaos Value column (Quantity × Price, in chaos) to the right of Total on the Wealthy Exile stash table.
- Divine prices converted with a divine rate worked out from the page (median of rows priced in chaos with a total in divines).
- Tooltips showing the working for each value, and a "?" with an explanation when no divine rate is available.
- Click a Chaos Value to copy the number to the clipboard.
- Address bar popup, shown only on Wealthy Exile, with the detected rate, a manual rate override and an on/off toggle.
- Support for the site's single-page navigation and virtualised table: the column survives sorting, filtering, searching, tab changes, re-syncs and scrolling, and is removed when leaving the stash page.
- Unit tests for the parsing code and a test page for checking the column by eye.
- GitHub Actions for tests and lint on every push, and for releases (GitHub release plus submission to Firefox Add-ons) on version tags.
