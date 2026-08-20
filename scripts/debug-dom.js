const { connectToLocalChrome, waitForPageSettle } = require('../src/browser');
const { isLikelyCode } = require('../src/clean');

(async () => {
  const { context } = await connectToLocalChrome('http://127.0.0.1:9223');
  const page = await context.newPage();
  await page.goto('https://www.couponupto.com/coupons/flags-connections', { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
  await waitForPageSettle(page);

  const els = await page.evaluate(() => {
    const out = [];
    const sel = '[class*="code" i],[id*="code" i],[class*="coupon" i],[id*="coupon" i],[class*="promo" i]';
    document.querySelectorAll(sel).forEach((el, i) => {
      if (i >= 20) return;
      const t = (el.innerText || '').trim();
      if (t && t.length < 40) out.push({ i, tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), text: t });
    });
    return out;
  });
  for (const e of els) console.log(JSON.stringify(e));

  console.log('--- strip + isLikelyCode chain ---');
  for (const t of ['Spring2016ShowCode', 'Spring2016 Show Code', 'MARCH12ShowCode', '10offAShowCode']) {
    let m = t.replace(/\s+/g, '');
    const stripped = m.replace(/(show|reveal|get|view|see|unlock)\s*(code|coupon)$/i, '');
    console.log(JSON.stringify({ orig: t, m, stripped, pass: isLikelyCode(stripped) }));
  }
  await page.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });