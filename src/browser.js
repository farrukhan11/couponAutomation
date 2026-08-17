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

async function waitForPageSettle(page, timeout = 12000) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });
  } catch (_) {}
  await page.waitForTimeout(900);
}

module.exports = { connectToLocalChrome, waitForPageSettle };
