const { connectToLocalChrome } = require('../src/browser');
const { brandTokens } = require('../src/collector');
const { scrapeSite } = require('../src/scraper');

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(v => v.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}
const getFlag = name => process.argv.includes(`--${name}`);

(async () => {
  const url = getArg('url', '');
  const brand = getArg('brand', 'Flags Connections');
  const domain = getArg('domain', 'flagsconnections.com');
  const cdpUrl = getArg('cdp', 'http://127.0.0.1:9223');
  const cap = Number(getArg('cap', '20'));
  const useAi = !getFlag('no-ai');
  if (!url) {
    console.error('Usage: node scripts/test-scrape-site.js --url=https://www.dealdrop.com/flags-connections [--cdp=...] [--cap=20] [--no-ai]');
    process.exit(1);
  }

  const { context } = await connectToLocalChrome(cdpUrl);
  const page = await context.newPage();
  const tokens = brandTokens(brand, domain);

  console.log(`Testing ${url}\n  brand tokens: ${tokens.join(', ')}\n`);
  const t0 = Date.now();
  const result = await scrapeSite(page, url, {
    useAi,
    log: msg => console.log(`  ${msg}`),
    brandTokens: tokens,
    revealCap: cap
  });
  const secs = Math.round((Date.now() - t0) / 1000);

  console.log(`\nRESULT: ${result.coupons.length} codes (method=${result.unmaskMethod}, ${secs}s)`);
  for (const c of result.coupons) {
    const rel = c.contextBrand ? 'brand' : 'ctx?';
    console.log(`  [${rel}] ${c.code}${c.offer ? '  - ' + c.offer : ''}${c.verified ? '  [verified]' : ''}${c.expiry ? '  exp:' + c.expiry : ''}`);
  }
  await page.close().catch(() => {});
  process.exit(0);
})().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});