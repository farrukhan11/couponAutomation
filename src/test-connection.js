const { connectToLocalChrome } = require('./browser');

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(v => v.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

(async () => {
  const cdpUrl = getArg('cdp', process.env.CDP_URL || 'http://127.0.0.1:9222');
  const { context } = await connectToLocalChrome(cdpUrl);
  const pages = context.pages();
  console.log('Connected!', cdpUrl);
  console.log('Contexts: 1');
  for (const page of pages) {
    console.log('Page:', await page.title(), page.url());
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
