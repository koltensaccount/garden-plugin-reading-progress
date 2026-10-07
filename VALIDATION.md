# Validation

Validated on 2026-10-07, Node 22.23.3 and Google Chrome 154 (Playwright).

## Standalone

`npm ci`, `npm run check`, `npm test`: 7 tests passed, none skipped. Tests include real Chromium interactions on focused fixtures, syntax/manifest checks and Node unit coverage. Reading-time traversal counts verify caching across repeated scroll/geometry updates, batched text invalidation and excluded UI changes. Native printing is stubbed; no OS print dialog opens.

## 1.0.1 focused integration

`DG_TEST_INCLUDE_NOTE_LOCK=1 DG_NOTE_LOCK_SOURCE=<clean-note-lock-release-checkout> DG_TEST_GARDEN=<existing-upstream-test-garden> CHROME_PATH=<installed-Chromium-executable> npm run test:integration` passed against upstream commit `80a33ffa6cb198ecf733e5944b4a60510970e3b0`. The existing `/reading-lab/` fixture was used. One seven-plugin build succeeded; the emitted assets were selected for four focused browser cases: Reading Progress alone, with Heading Folding, with Resizable Panes, and with all seven plugins including Note Lock. Without the optional Note Lock flag, the harness retains its six-plugin reading/layout test set.

Checks passed for scroll-time traversal caching, folded/unfolded geometry, live reading-width/reset changes, text insertion/edit/removal, image decoding and height changes, desktop/intermediate/mobile resizing, repeated initialization and full-document navigation. Progress matched current content geometry, estimates invalidated on text changes without observing their own UI updates, and no console or uncaught page errors occurred. The previous 63-subset matrix was not rerun for this focused patch.

The all-seven case also used the synthetic `/locked-demonstration/` fixture: password unlock completed, progress matched content geometry afterward, and the cached estimate retained one traversal. Note Lock came from its clean public release checkout at `337e9460021999c4559a225e5833148c55eb21cc`; no local unfinished Note Lock work was modified. These fixtures use synthetic passwords only.

The runtime fix was already published at `086b2fef2df37e75f43727389fe27738c695d0c0`. Local main, public main and `v1.0.1` runtime files were compared byte-for-byte through their identical Git blob hash (`f6e6e498519e6b687a808f1b33dd213f03d41120`). Public manifest/package versions were both `1.0.1`. This verification adds test coverage only; it does not replace the existing release tag or change runtime code.

Firefox and WebKit smoke passes were unavailable: the existing Playwright tooling had neither browser binary installed. No additional browser stack was installed. The local Chromium suites used the existing `CHROME_PATH` override because Chrome was installed outside the harness's default search paths. Initial concurrent browser attempts exposed timing-sensitive assertions in unchanged suites; isolated reruns passed without changing those tests.

## Previous upstream integration

Initial release validation used upstream Digital Garden commit `80a33ffa6cb198ecf733e5944b4a60510970e3b0` and registry commit `ed1b497a4cd584721edf51e7c1a3ef9481229818`. Each of the six reading/layout plugins was installed and built individually on Node 22. No core source modifications were required.

Every nonempty subset of the six reading/layout plugins (63) was browser-tested against the actual compiled upstream page at 1800, 1100 and 390 px widths. The harness selects emitted runtime scripts/styles while preserving current core markup and configuration slots; it does not rebuild all 63 combinations separately. Checks cover responsive overflow, native right-sheet compatibility, single footer ownership, repeated initialization, folded-target navigation and complete print visibility. Six permutations of Appearance, Print and Resizable initialization passed; removing the Appearance contribution left the other controls usable.

Eight separate stress scenarios passed: left-only, right-only, no panes, both collapsed across reading-width classes; reversible mouse snap and synthetic browser TouchEvents with preferred-width restoration; fold/TOC/progress/print cancellation; canvas; no headings. Console errors and uncaught page errors were asserted absent in final subset and stress runs.

`TZ=UTC npm test` in upstream: 390 tests passed. Without UTC, upstream's two date expectations fail in America/Chicago (388 pass); core was not changed to hide this timezone issue.

## Screenshot

`screenshot.png` is a real screenshot captured from this current upstream test garden with synthetic public demonstration notes, not a generated/mock illustration.

## Limits

Chromium/Edge was exercised, not Firefox/WebKit or physical touch hardware. Native browser `dialog`, modern layout CSS and optional relative OKLCH are used; unsupported relative colors fall back to the theme accent. Accent contrast is checked against the primary background, not every possible third-party theme surface. Current core uses full-document navigation; disabling/uninstalling is supported through rebuild and page reload, not a hot-unload API. Third-party navigation replacements may require integration checks.
