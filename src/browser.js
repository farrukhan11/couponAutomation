const { chromium } = require('playwright');

async function connectToLocalChrome(cdpUrl = 'http://127.0.0.1:9222') {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No Chrome context found.');

  const context = contexts[0];
  const pages = context.pages();
  const page = pages[pages.length - 1] || await context.newPage();

  return { browser, context, page };
}

async function waitForPageSettle(page, timeout = 15000) {
  try {
    await page.waitForLoadState('load', { timeout });
  } catch (_) {}
  for (let i = 0; i < 5; i++) {
    const ready = await page
      .evaluate(() => {
        const root = document.body;
        if (!root) return false;
        const text = (root.innerText || '').trim();
        const elCount = root.querySelectorAll('*').length;
        return text.length > 50 && elCount > 20;
      })
      .catch(() => false);
    if (ready) break;
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(900);
}

module.exports = { connectToLocalChrome, waitForPageSettle };
