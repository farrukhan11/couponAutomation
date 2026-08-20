const path = require('path');
const { connectToLocalChrome } = require('./browser');
const { generateKeywords, normalizeDomain } = require('./keywords');
const { searchOne } = require('./search');
const { collectSites, brandTokens } = require('./collector');
const { scrapeSite, withTimeout } = require('./scraper');
const { writeCsvFiles, discountType } = require('./csv');
const { fetchHtml, extractCodesFromHtml } = require('./htmlfetch');

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(v => v.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function getFlag(name) {
  return process.argv.includes(`--${name}`);
}

const REGION_LABEL = { us: 'US', uk: 'UK' };
const t0 = Date.now();
const ts = () => `[T+${Math.round((Date.now() - t0) / 1000)}s]`;

(async () => {
  const brand = getArg('brand', '');
  const domain = getArg('domain', '');
  const regions = (getArg('regions', 'us,uk') || '').split(',').map(r => r.trim().toLowerCase()).filter(r => REGION_LABEL[r]);
  const pages = Number(getArg('pages', '2'));
  const delayMs = Number(getArg('delay', '2500'));
  const maxSites = Number(getArg('limit', '15'));
  const useAi = !getFlag('no-ai');
  const includeOther = getFlag('include-other');
  const includeUnrelated = getFlag('include-unrelated');
  const cdpUrl = getArg('cdp', process.env.CDP_URL || 'http://127.0.0.1:9222');
  const outDir = getArg('out', 'output');
  const engines = (getArg('engines', 'google') || '').split(',').map(e => e.trim().toLowerCase()).filter(e => e === 'google' || e === 'bing' || e === 'ddg');
  const revealCap = Number(getArg('reveal-cap', '20'));
  const htmlFirst = getFlag('html-first');

  if (!domain && !brand) {
    console.error('Usage: node src/discover.js --brand="Flags Connections" --domain=flagsconnections.com [--regions=us,uk] [--pages=2] [--limit=15] [--delay=2500] [--engines=google,bing] [--no-ai] [--out=output]');
    process.exit(1);
  }

  const brandName = brand || domain;
  const keywordOverride = getArg('keyword', '');
  const keywords = keywordOverride ? [keywordOverride] : generateKeywords(brand, domain);
  const discoveredAt = new Date().toISOString();
  console.log(`${ts()} [START]`, { brand: brandName, domain, regions, pages, keywords: keywords.length, useAi, cdpUrl });

  const { context } = await connectToLocalChrome(cdpUrl);

  const allSearchResults = [];
  const searchPages = {};
  for (const region of regions) {
    searchPages[region] = await context.newPage();
  }

  try {
    for (const region of regions) {
      const page = searchPages[region];
      let consecutiveBlocks = 0;
      let stopRegion = false;
      for (const keyword of keywords) {
        for (let p = 0; p < pages; p++) {
          let res = null;
          for (const engine of engines) {
            res = await searchOne({ page, keyword, region, pageNumber: p, engine, log: (msg) => console.log(ts(), msg) });
            allSearchResults.push(res);
            if (!res.blocked) break;
          }
          if (res.blocked) {
            consecutiveBlocks += 1;
            if (consecutiveBlocks >= 3) {
              console.log(`${ts()} [SEARCH] ${region}: too many blocks (${consecutiveBlocks}), stopping this region`);
              stopRegion = true;
              break;
            }
          } else {
            consecutiveBlocks = 0;
          }
          const jitter = Math.round(Math.random() * 1200);
          await page.waitForTimeout(delayMs + jitter);
        }
        if (stopRegion) break;
      }
    }
  } finally {
    for (const region of regions) {
      await searchPages[region].close().catch(() => {});
    }
  }

  const tokens = brandTokens(brandName, domain);
  const sitesByRegion = collectSites(allSearchResults, domain, brandName);
  for (const region of regions) {
    const sites = sitesByRegion[region] || [];
    console.log(`\n[SITES] ${region.toUpperCase()} -> ${sites.length} unique sites (brand-matched=${sites.filter(s => s.brandMatch).length})`);
    for (const s of sites.slice(0, maxSites)) {
      console.log(`  [${s.kind}]${s.brandMatch ? ' [brand]' : ''} ${s.host} (hits=${s.hits}, ranks=${s.ranks.join(',')})`);
    }
  }

  const rows = [];
  const seenCodes = new Map();
  const skipped = { blocked: 0, other: 0, unrelated: 0 };

  for (const region of regions) {
    const sites = (sitesByRegion[region] || []).slice(0, maxSites);
    for (const site of sites) {
      if (site.kind === 'blocked') { skipped.blocked += 1; continue; }
      if (site.kind === 'other' && !includeOther) { skipped.other += 1; continue; }
      if (!site.brandMatch && site.kind !== 'coupon-site' && !includeUnrelated) { skipped.unrelated += 1; continue; }
      let scraped = null;
      if (htmlFirst && site.kind !== 'store') {
        const html = await withTimeout(fetchHtml(site.url), 20000, null);
        const htmlCodes = html ? extractCodesFromHtml(html) : [];
        if (htmlCodes.length > 0) {
          scraped = {
            coupons: htmlCodes.map(code => ({ code, offer: '', verified: false, expiry: '', contextBrand: site.brandMatch, siteUrl: site.url })),
            unmaskMethod: 'html'
          };
          console.log(`${ts()} [HTML] ${site.url} -> ${htmlCodes.length} codes (no browser)`);
        }
      }
      if (!scraped) {
        const scrapePage = await withTimeout(context.newPage(), 15000, null);
        if (!scrapePage) continue;
        try {
          scraped = await withTimeout(
            scrapeSite(scrapePage, site.url, { useAi, log: (msg) => console.log(ts(), msg), brandTokens: tokens, assumeBrand: site.brandMatch, revealCap }),
            90000,
            null
          );
          if (!scraped) {
            console.log(`${ts()} [SCRAPE] TIMED OUT ${site.url}`);
            continue;
          }
        } catch (err) {
          console.log(`${ts()} [SCRAPE] FAILED ${site.url}: ${err.message}`);
        } finally {
          await withTimeout(scrapePage.close(), 10000, null).catch(() => {});
        }
        if (!scraped) continue;
      }
      for (const c of scraped.coupons) {
          const key = `${region}:${c.code}`;
          if (!seenCodes.has(key)) seenCodes.set(key, []);
          seenCodes.get(key).push(site.name);
          const row = {
            brand: brandName,
            region: REGION_LABEL[region],
            query: site.queries.join(' | '),
            site_name: site.name,
            site_url: c.siteUrl,
            coupon_code: c.code,
            offer: c.offer,
            discount_type: discountType(c.offer),
            verified: c.verified ? 'yes' : '',
            last_verified: '',
            expiry: c.expiry,
            unmask_method: scraped.unmaskMethod,
            relevance: c.contextBrand ? 'brand' : 'unrelated',
            site_brand: site.brandMatch ? 'yes' : '',
            engine: site.engines.join('|'),
            discovered_at: discoveredAt
          };
          rows.push(row);
        }
      await new Promise(r => setTimeout(r, Math.min(delayMs, 1200)));
    }
  }
  console.log(`${ts()} [SCRAPE] skipped: ${JSON.stringify(skipped)}`);

  const files = writeCsvFiles({ brand: brandName, rows, outDir, discoveredAt });
  console.log('\n[SUMMARY]');
  console.log(`Codes found: ${seenCodes.size} (${rows.length} rows)`);
  for (const [key, sources] of seenCodes) {
    console.log(`  ${key}  (${sources.length}x)`);
  }
  for (const f of files) console.log(`Wrote: ${f}`);
  process.exit(0);
})().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});