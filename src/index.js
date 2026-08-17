const fs = require('fs');
const path = require('path');
const { connectToLocalChrome } = require('./browser');
const { runCouponFlow } = require('./flow');

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(v => v.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

(async () => {
  const storeUrl = getArg('store');
  const couponCode = getArg('code', 'TESTCODE123');
  const cdpUrl = getArg('cdp', process.env.CDP_URL || 'http://127.0.0.1:9222');

  if (!storeUrl) {
    console.error('Usage: node src/index.js --store=https://example.com --code=SAVE10');
    process.exit(1);
  }

  console.log('[START]', { storeUrl, couponCode, cdpUrl });

  const { page } = await connectToLocalChrome(cdpUrl);
  const result = await runCouponFlow(page, { storeUrl, couponCode });

  const record = {
    testedAt: new Date().toISOString(),
    storeUrl,
    couponCode,
    result
  };

  const resultsDir = path.join(process.cwd(), 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const file = path.join(resultsDir, 'results.jsonl');
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');

  console.log('\n[RESULT]');
  console.log(JSON.stringify(record, null, 2));
  console.log(`\nSaved to ${file}`);
})().catch(err => {
  console.error('\n[FATAL]', err);
  process.exitCode = 1;
});
