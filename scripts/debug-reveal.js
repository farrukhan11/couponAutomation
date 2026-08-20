const { connectToLocalChrome, waitForPageSettle } = require('../src/browser');
const { clickRevealByIndex } = require('../src/scraper');

(async () => {
  const url = 'https://www.dealdrop.com/flags-connections';
  const { context, browser } = await connectToLocalChrome('http://127.0.0.1:9223');
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(e => console.log('nav err', e.message));
  await waitForPageSettle(page);

  const before = context.pages().length;
  const clicked = await clickRevealByIndex(page, 0);
  console.log('clicked:', JSON.stringify(clicked));
  await page.waitForTimeout(2500);
  console.log('page.url() after click:', page.url());
  console.log('page count before/after:', before, '->', context.pages().length);
  const otherPages = context.pages().filter(p => p !== page);
  for (const p of otherPages) {
    console.log('other page:', p.url());
    const body = await p.evaluate(() => (document.body ? document.body.innerText.slice(0, 500) : '')).catch(e => 'ERR ' + e.message);
    console.log('  body:', JSON.stringify(body.slice(0, 400)));
    await p.close().catch(() => {});
  }
  await page.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });