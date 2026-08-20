const { connectToLocalChrome, waitForPageSettle } = require('../src/browser');
const { extractCoupons } = require('../src/scraper');
const { brandTokens } = require('../src/collector');

(async () => {
  const url = 'https://www.couponupto.com/coupons/flags-connections';
  const { context } = await connectToLocalChrome('http://127.0.0.1:9223');
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(e => console.log('nav err', e.message));
  await waitForPageSettle(page);
  console.log('TITLE:', await page.title(), '| URL:', page.url());

  const info = await page.evaluate(() => ({
    dataCode: document.querySelectorAll('[data-code]').length,
    dataCoupon: document.querySelectorAll('[data-coupon]').length,
    dataPromo: document.querySelectorAll('[data-promo-code]').length,
    dataClip: document.querySelectorAll('[data-clipboard-text]').length,
    inputs: document.querySelectorAll('input[type=text],input[type=hidden][value]').length,
    couponEls: document.querySelectorAll('[class*="coupon" i],[class*="code" i],[class*="promo" i],[class*="deal" i]').length
  }));
  console.log('DOM counts:', JSON.stringify(info));

  const tokens = brandTokens('Flags Connections', 'flagsconnections.com');
  const coupons = await extractCoupons(page, tokens);
  console.log('extractCoupons ->', coupons.length);
  console.log('codes:', coupons.map(c => c.code).join(', '));

  // what code-like texts exist in DOM (pre-filter)?
  const raw = await page.evaluate(() => {
    const out = [];
    const add = el => {
      const t = (el.innerText || el.getAttribute('data-code') || el.value || '').trim().replace(/\s+/g, '');
      if (t && t.length >= 3 && t.length <= 20 && /^[a-z0-9-]+$/i.test(t)) out.push(t);
    };
    document.querySelectorAll('[data-code],[class*="coupon" i],[class*="code" i],[class*="promo" i]').forEach(add);
    document.querySelectorAll('span,strong,b,button,a,td').forEach(add);
    return [...new Set(out)].slice(0, 80);
  });
  console.log('raw code-like tokens:', JSON.stringify(raw));

  await page.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });