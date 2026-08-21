const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function defaultStatePath() {
  return path.join(process.cwd(), 'state', 'session.json');
}

async function saveSession(context, filePath = defaultStatePath()) {
  try {
    const state = await context.storageState();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

async function loadSession(context, filePath = defaultStatePath()) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (state.cookies && state.cookies.length) {
      await context.addCookies(state.cookies);
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

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

module.exports = { connectToLocalChrome, waitForPageSettle, saveSession, loadSession };
