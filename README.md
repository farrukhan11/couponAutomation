# couponAutomation

Coupon discovery + scraping + CSV export pipeline for any brand. It searches Google (US by default, UK optional), finds coupon sites for a brand, opens each site in your real Chrome, reveals "Show Code" coupons, and writes brand-wise + region-wise CSVs plus a 2-sheet Excel workbook.

Also contains a legacy **V1 checkout tester** (store → add-to-cart → checkout) that is not the active focus.

---

## Table of contents

- [V2 coupon discovery pipeline (active)](#v2-coupon-discovery-pipeline-active)
  - [How it works](#how-it-works)
  - [Requirements](#requirements)
  - [Quick start (any brand)](#quick-start-any-brand)
  - [Run for a specific brand](#run-for-a-specific-brand)
  - [CLI flags](#cli-flags)
  - [Output files & CSV columns](#output-files--csv-columns)
  - [Code noise filter](#code-noise-filter)
  - [Tests](#tests)
  - [Project structure](#project-structure)
  - [Troubleshooting](#troubleshooting)
- [V1 checkout tester (legacy)](#v1-checkout-tester-legacy)
- [Phase status: completed & remaining](#phase-status-completed--remaining)

---

## V2 coupon discovery pipeline (active)

### How it works

1. **Search** — Google search for the brand (US `gl=us` and/or UK `gl=uk`), top N pages, organic results only (ads/sponsored dropped, consent walls dismissed, CAPTCHA detected). Default engine is **Google only**; DuckDuckGo (`ddg`) is available as a fallback if you opt in.
2. **Collect** — aggregate unique sites per region, classify them (`store` / `coupon-site` / `other` / `blocked`), and match them against the brand (hostname **or** URL path).
3. **Scrape** — for each site:
   - **HTML fast path** (`--html-first`): download the page HTML directly over HTTP and extract codes from `data-code`/`data-coupon`/clipboard attributes plus text tokens. No browser needed → much faster. Works on sites that embed codes in the HTML.
   - **Browser fallback** (CDP): open the page in your real Chrome, scan the DOM for code-like tokens, and run an **adaptive reveal loop** — click "Show Code"/"Reveal"/"Unlock" buttons, re-extract, compare new codes, stop after no-progress or the reveal cap. Guards: per-iteration timeout, navigation-drift recovery back to the original URL, closing of popup tabs.
4. **Filter** — every extracted token passes through `isLikelyCode()` (see [filter](#code-noise-filter)).
5. **Output** — write a combined CSV, per-region CSVs, and an Excel workbook (`Search Results` + `Coupon Codes` sheets) into `output/`.

### Requirements

- Windows PC
- Node.js **20+** (uses global `fetch`; developed on v22)
- Google Chrome (real browser, launched with `--remote-debugging-port`)

### Quick start (any brand)

```powershell
# 1. Start Chrome with CDP (keep it open)
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  -ArgumentList '--remote-debugging-port=9223','--user-data-dir=C:\coupon-agent\chrome-profile-4',`
  '--no-first-run','--disable-background-networking','--disable-component-update',`
  '--disable-sync','--no-default-browser-check','--disable-gpu','about:blank'

# 2. Verify CDP is up (expect 200)
(Invoke-WebRequest -Uri 'http://127.0.0.1:9223/json/version' -UseBasicParsing -TimeoutSec 5).StatusCode

# 3. Run discovery (US only, Google, HTML fast path, no AI)
node src/discover.js --brand="FastestVPN" --domain=fastestvpn.com `
  --regions=us --pages=2 --limit=15 --engines=google `
  --keyword="FastestVPN coupon code" --delay=4000 `
  --include-other --html-first --no-ai --cdp=http://127.0.0.1:9223
```

Output lands in `output\fastestvpn_coupons.csv` (combined), `output\fastestvpn_US.csv`. Add `--regions=us,uk` to also get `output\fastestvpn_UK.csv`.

### Run for a specific brand

| Parameter | How to set |
|---|---|
| `--brand` | Display name, e.g. `--brand="iMalent Store"` |
| `--domain` | Store domain, e.g. `--domain=imalentstore.com` |
| `--keyword` | Search phrase(s). Use 1–2 keywords (comma-separated, e.g. `<Brand> coupon code,<Brand> promo code`) — generating all 14 auto variants × 2 pages triggers Google rate-limiting |

Example for a new brand:

```powershell
node src/discover.js --brand="Flags Connections" --domain=flagsconnections.com `
  --regions=us --pages=2 --limit=15 --engines=google `
  --keyword="Flags Connections coupon code" --delay=4000 `
  --include-other --html-first --no-ai --cdp=http://127.0.0.1:9223
```

### CLI flags

| Flag | Default | Description |
|---|---|---|
| `--brand=` | – | Brand display name (required) |
| `--domain=` | – | Store domain (required) |
| `--regions=` | `us` | Comma-separated regions (`us`, `uk`). Default is **US only**; add `uk` for both (`us,uk`) |
| `--pages=` | `2` | Search result pages per keyword |
| `--limit=` | `15` | Max sites scraped per region |
| `--engines=` | `google` | Search engines: `google`, `ddg`, `bing` (comma-separated) |
| `--keyword=` | auto | Search phrase override. Comma-separate for multiple keywords, e.g. `--keyword="Monument Grills coupon code,Monument Grills promo code"`. ⚠️ Each keyword × page runs a Google search — keep it to 1–2 keywords (`--delay=4000`) to avoid rate-limiting |
| `--delay=` | `2500` | ms between searches (4000 recommended to avoid Google blocks) |
| `--reveal-cap=` | `20` | Max reveal-button clicks per page |
| `--include-other` | off | Also scrape brand-matched aggregator/review sites (`other` kind) |
| `--include-unrelated` | off | Also scrape non-brand-matched sites |
| `--html-first` | off | Try fast HTTP/HTML extraction before opening the browser |
| `--no-ai` | off | Disable AI-based reveal-button selection. Without it, the scraper asks local Ollama (`qwen2.5:3b-instruct`) to pick the best reveal button and auto-falls back to regex selection if Ollama isn't reachable on `127.0.0.1:11434` |
| `--out=` | `output` | Output directory |
| `--cdp=` | `http://127.0.0.1:9222` | Chrome DevTools endpoint (use `http://127.0.0.1:9223`) |

> **Coupon sites are always scraped**, even without an exact brand match in the URL (e.g. `dealszo.com/imalent-coupons`). Brand matching only gates `other`-kind sites.

### Output files & CSV columns

Files: `output\{brand}_coupons.csv` (combined), `output\{brand}_US.csv`. Add `--regions=us,uk` to also get `output\{brand}_UK.csv`.

**Workbook:** `output\{brand}_results.xlsx` — Excel file with 2 sheets:
- **Sheet 1 `Search Results`** — every Google result from page 1 & 2: `region, page, rank, keyword, engine, title, url, host, kind, brand_match, snippet`
- **Sheet 2 `Coupon Codes`** — the 16 coupon columns below (one row per extracted code)

The `_coupons.csv` / `_US.csv` files still use the 16 columns below; if a CSV is locked in Excel/editor the run no longer crashes — it logs a `[WARN]` and the workbook is still written.

Columns (16):

`brand, region, query, site_name, site_url, coupon_code, offer, discount_type, verified, last_verified, expiry, unmask_method, relevance, site_brand, engine, discovered_at`

- `unmask_method`: `none` (DOM extract), `reveal_click` (clicked a Show Code button), `html` (fast HTML path)
- `relevance`: `brand` (code appeared near brand context) / `unrelated`
- `site_brand`: `yes` when the site matched the brand

### Code noise filter

`src/clean.js` exposes `isLikelyCode()`, used by both the browser DOM scanner and the HTML fast path. It rejects:

- UI/noise words: `COUPON`, `SHOW`, `REVEAL`, `SAVE`, `OFF`, `SUBSCRIBE`, `NAVBAR`, `FREESHIPPING`, `NONE`, `LIFETIME`, `ONETIME`, `MONTHLY`, `RECURRING`, `REFERRAL`, … (exact-match set)
- Dates/ordinals/ranges: `10OCTOBER2026`, `2026-08-20`, `2006-2026`, `2000S`, `20TH`, `15-DAY`, `2YEARS`, `256-BIT`, `08-11`, `91-7997443334` (phone)
- Label counters: `COMMENTS1`, `ALL2`, `CODES1`, `DEALS1`, `1STAR`, `5STARS`, `0SHARES`, `0ITEMS`
- Feature/spec text: `10GBPSFASTSERVERS`, `15MULTILOGINS`, `P2PALLOWED`, `32000LUMENS`, `NOCODENEEDED`, `NOCUPONREQUIRED`, `3SIMILARDISCOUNTS`
- Reviewer usernames: `SilverElite5336`, `FrugalElite775` (CamelCase + 3+ trailing digits)
- Junk prefixes: `SEELESS`, `SEEMORE`, `GETDEAL`, `SUBMIT`, `POPULAR`, `REVIEWS`, `FLAGSCONNECTIONS`, …

Real codes like `BFCM25`, `DPF17`, `NEWYEAR2025`, `SAVE10`, `SHARE10`, `BLACKFRIDAY13`, `FALL2015A`, `SUBSCRIBE20` are preserved (rules are tuned to avoid false positives, e.g. digit-prefixed plural rules only, and `share` blocked only as a suffix so `SHARE10` survives).

### Tests

```powershell
npm test        # node --test "test/*.test.js"  →  25 passing
```

- `test/clean.test.js` — good/bad corpus for `isLikelyCode`
- `test/collector.test.js` — brand token generation + site classification
- `test/csv.test.js` — CSV escaping / columns / region files
- `test/modules.test.js` — module loading smoke tests
- `test/fixtures/flags_connections_coupons.csv` — 250-row fixture

### Project structure

```
src/
  keywords.js    # keyword variants + domain normalization
  search.js      # Google/DuckDuckGo search, organic results, CAPTCHA detection
  collector.js   # brand tokens, site classification, per-region aggregation
  scraper.js     # browser scrape: DOM scan + adaptive reveal loop (+ optional AI pick)
  htmlfetch.js   # fast HTTP/HTML extraction (no browser)
  clean.js       # isLikelyCode noise filter (Node side)
  csv.js         # CSV write (EBUSY retry) + xlsx workbook (2 sheets) + discount_type
  discover.js    # pipeline orchestrator (CLI entrypoint)
  browser.js     # CDP connect to local Chrome + page-load wait
  snapshot.js    # (legacy V1) visible-element snapshot engine
  ollama.js      # Ollama/Qwen element chooser (V1 + optional V2 AI reveal)
  flow.js        # (legacy V1) checkout helper
  index.js       # (legacy V1) single-store coupon tester entrypoint
  test-connection.js # CDP connection check (npm run test:connection -- --cdp=...)
scripts/
  test-scrape-site.js   # scrape a single URL directly
  debug-site.js         # debug one site: title, DOM counts, extracted codes
  debug-reveal.js       # debug reveal candidates on a page
  debug-dom.js          # raw DOM scan on a page
  debug-clean.js        # run a list of codes through isLikelyCode
test/
  clean.test.js, collector.test.js, csv.test.js, modules.test.js
output/
  {brand}_coupons.csv, {brand}_US.csv, {brand}_results.xlsx (2 sheets)
```

### Troubleshooting

| Problem | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:9223` | Chrome not running — start it (see Quick start). If it "died", it exited because all windows closed; keep the `about:blank` tab. |
| `BLOCKED google for ...` | Google rate-limited the IP. Wait 5–10 min, use `--delay=4000`, **one keyword** (`--keyword=`), and a fresh profile (`chrome-profile-4`). Do not run all 14 auto keywords × 2 pages. |
| `EBUSY: resource busy or locked` writing CSV | The CSV is open in Excel/VS Code — close it. `csv.js` retries 6× over ~12s and the failure is non-fatal: it logs `[WARN]` and the run still writes `{brand}_results.xlsx` |
| `{brand}_results.xlsx` locked | Same story — close it in Excel. The workbook write retries 3× (~4s) and a failure only logs `[WARN]`; the run never crashes at write time |
| Codes missing on a site | Try without `--html-first` (some sites need the browser/JS), or raise `--limit` so more sites are scraped. |

---

## V1 checkout tester (legacy)

> Not the active focus. Kept for reference.

Store → product → add to cart → cart/checkout → find coupon field, driven by code with Ollama/Qwen only to identify visible interactive elements. Does **not** place the final order.

```powershell
node src/index.js --store=https://www.x-sense.com/ --code=TESTCODE123
```

Requires Ollama + `qwen2.5:3b-instruct` for V1 only. V2 discovery does **not** need Ollama (`--no-ai`).

---

## Phase status: completed & remaining

### Completed

| Phase | Description | Status |
|---|---|---|
| **Phase 0 — Test harness** | `npm test` runner (`node --test`), `test/` suite, fixture CSV, 22 passing tests | ✅ Done |
| **Phase 1 — Core extraction fix** | Fixed `isLikelyCode` running in Node scope but not inside `page.evaluate` (caused silent 0-code results); inlined filter in browser; brand detection (`brandTokens`) fixed; `site_brand` + `relevance` columns; reveal-loop suffix stripping (`Spring2016ShowCode` → `Spring2016`); adaptive reveal loop (click → extract → compare → cap 20, no-progress bail, URL-drift recovery, popup-tab cleanup) | ✅ Done |
| **Phase 2 — Rate-limit & engine fixes** | Google-only default (DDG removed per user preference); fresh Chrome profile to dodge Google blocks; single-keyword + `--delay=4000` strategy; verified 0 blocks | ✅ Done |
| **Phase 3 — HTML fast path + filter hardening** | `src/htmlfetch.js` (`--html-first`): HTTP fetch + attribute/text code extraction without a browser; filter tuned across brands (dates, durations, usernames, specs, label counters, ranges, ordinals, phone numbers, plans); `csv.js` EBUSY write retry; forum sites blocked; **22/22 tests** | ✅ Done |
| **Phase 4 — Live brand runs** | **iMalent Store** → US 92 codes / 118 rows + UK 63 / 71 (merged 189). **FastestVPN** → 189 codes / 250 rows (final CSV overwrite blocked only by the file being open in Excel — run itself succeeded with the new filter) | 🟡 Mostly done |
| **Phase 5 — US default, AI reveal, xlsx, hardening** | US-only default (`--regions`); comma-separated multi-keyword `--keyword`; Ollama AI reveal selection with startup auto-detect + regex fallback; `{brand}_results.xlsx` 2-sheet workbook (+ regression test); blocked sites code-scraped via HTML; page-load wait (`load` event + content polling); filter: multi-hyphen phones, UI counters, brand-name codes | ✅ Done |

### Remaining

| Item | Notes |
|---|---|
| **Re-run Flags Connections** (the original brand) with the new pipeline | Current `output/flags_connections_coupons.csv` is a stale 250-row snapshot from before the fixes. Re-run: `node src/discover.js --brand="Flags Connections" --domain=flagsconnections.com --regions=us --pages=2 --limit=15 --engines=google --keyword="Flags Connections coupon code" --delay=4000 --include-other --html-first --no-ai --cdp=http://127.0.0.1:9223` |
| **Close CSV files before re-running** | FastestVPN final write needs the files closed in Excel/VS Code (retry now waits ~12s) |
| **Filter tuning for new brands** | Each new brand may expose new noise patterns — run, review the summary, add targeted rules to `clean.js` + the inlined copy in `scraper.js`, extend `test/clean.test.js`, keep `npm test` green |
| **Optional: V1 integration** | Feed scraped codes into the V1 checkout tester — currently out of scope |
| **Optional: more engines** | DuckDuckGo fallback is implemented but disabled by default (`--engines=google,ddg`) |
