const { waitForPageSettle } = require('./browser');
const { chooseElement } = require('./ollama');
const { getVisibleInteractiveSnapshot, clickAgentElement } = require('./snapshot');
const { makeCodeOk, buildRejectSet } = require('./clean');

const REVEAL_PATTERNS = [
  /show code/i,
  /show coupon/i,
  /reveal code/i,
  /reveal coupon/i,
  /unlock code/i,
  /see code/i,
  /get code/i,
  /view code/i,
  /show voucher/i,
  /click to copy/i,
  /tap to reveal/i,
  /copy code/i,
  /copy coupon/i,
  /show promo/i,
  /reveal promo/i,
  /grab code/i,
  /view offer/i,
  /show deal/i
];

function withTimeout(promise, ms, fallback) {
  const guarded = Promise.resolve(promise).catch(() => fallback);
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer));
}

async function safeEvaluate(page, fn, timeout = 15000, arg) {
  const result = await withTimeout(page.evaluate(fn, arg), timeout, null);
  return result === null || result === undefined ? null : result;
}

async function dismissOverlays(page) {
  const tryClick = async (sel) => {
    const el = page.locator(sel).first();
    const present = await withTimeout(el.count().then(c => c > 0), 3000, false);
    if (!present) return;
    await withTimeout(el.click({ timeout: 3000 }).catch(() => {}), 4000, null);
    await page.waitForTimeout(300);
  };

  try {
    for (const sel of ['#onetrust-accept-btn-handler', '#cmpbntesthtml', '.cc-accept', 'button.cc-btn--accept-all']) {
      await tryClick(sel);
    }
    await tryClick('button:has-text("Accept all")');
    await tryClick('button:has-text("I agree")');
  } catch (_) {}
}

async function scrollThrough(page, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await withTimeout(page.mouse.wheel(0, 900), 3000, null).catch(() => {});
    await page.waitForTimeout(500);
  }
  await withTimeout(page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {}), 3000, null);
  await page.waitForTimeout(900);
  await withTimeout(page.evaluate(() => window.scrollTo(0, 0)).catch(() => {}), 3000, null);
  await page.waitForTimeout(400);
}

async function interstitialState(page, allowClick) {
  return safeEvaluate(
    page,
    (clickable) => {
      const text = (((document.body ? document.body.innerText : '') + ' ' + (document.title || ''))).slice(0, 4000);
      const re = /(just a moment|verifying (you are|you're) human|verify you are human|checking (your|the) browser|attention required|are you (18|over ?18|an adult)|confirm your age|age verification|age gate|press (&|and) hold|unusual activity)/i;
      if (!re.test(text)) return { blocked: false };
      if (!clickable) return { blocked: true, clicked: false };
      const els = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="checkbox"], input[type="submit"], input[type="button"]'));
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const t = ((el.innerText || el.value || el.getAttribute('aria-label') || '') + ' ' + (el.id || '') + ' ' + String(el.className || '')).toLowerCase();
        if (/(i am 18|i'm 18|over 18|over18|yes,? i('| a)?m|continue|enter (site|here|now)|verify|confirm|accept|agree|let me in|proceed|start browsing|close|dismiss|submit|challenge)/.test(t)) {
          try {
            el.scrollIntoView({ block: 'center' });
            el.click();
          } catch (_) {}
          return { blocked: true, clicked: true };
        }
      }
      return { blocked: true, clicked: false };
    },
    10000,
    allowClick
  );
}

async function handleInterstitials(page, log, autoMs = 20000, manualMs = 120000) {
  const check = async (allowClick) => {
    const st = await interstitialState(page, allowClick);
    if (st === null) return null;
    return st.blocked;
  };

  let blocked = await check(true);
  if (blocked === null || !blocked) return;

  log('[SCRAPE]   verification/interstitial detected — trying to dismiss it');
  const autoDeadline = Date.now() + autoMs;
  while (Date.now() < autoDeadline) {
    await page.waitForTimeout(1600);
    blocked = await check(true);
    if (blocked === null || !blocked) {
      log('[SCRAPE]   interstitial cleared');
      return;
    }
  }

  log(`[SCRAPE]   interstitial still present — solve it manually in the browser (waiting up to ${Math.round(manualMs / 1000)}s)`);
  const manualDeadline = Date.now() + manualMs;
  while (Date.now() < manualDeadline) {
    await page.waitForTimeout(4000);
    blocked = await check(false);
    if (blocked === null || !blocked) {
      log('[SCRAPE]   interstitial cleared (manual)');
      return;
    }
  }
  log('[SCRAPE]   interstitial not cleared — continuing with whatever is visible');
}

async function findRevealCandidates(page) {
  const data = await safeEvaluate(
    page,
    () => {
      const text = el =>
        (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40);
      const out = [];
      let scanned = 0;
      const all = document.querySelectorAll('button, a, [role="button"], span, div');
      for (const el of all) {
        if (++scanned > 4000) break;
        if (el.disabled) continue;
        if (el.hasAttribute('data-coupon-revealed')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const t = text(el);
        if (!t || t.length < 4 || t.length > 40) continue;
        const lower = t.toLowerCase();
        if (!/(show|reveal|unlock|see|get|view|click|tap|copy).*(code|coupon|voucher|promo)|show code/i.test(lower)) continue;
        if (/close/i.test(lower)) continue;
        if (/copy/i.test(lower) && !/copy (code|coupon|promo)/i.test(lower)) continue;
        if (out.some(o => o.text === t)) continue;
        out.push({ text: t, tag: el.tagName.toLowerCase() });
      }
      return out;
    },
    15000
  );
  return data || [];
}

async function clickRevealByIndex(page, index) {
  const clicked = await safeEvaluate(
    page,
    (idx) => {
      const text = el =>
        (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40);
      let scanned = 0;
      let current = -1;
      const all = document.querySelectorAll('button, a, [role="button"], span, div');
      for (const el of all) {
        if (++scanned > 4000) break;
        if (el.disabled) continue;
        if (el.hasAttribute('data-coupon-revealed')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const t = text(el);
        if (!t || t.length < 4 || t.length > 40) continue;
        const lower = t.toLowerCase();
        if (!/(show|reveal|unlock|see|get|view|click|tap|copy).*(code|coupon|voucher|promo)|show code/i.test(lower)) continue;
        if (/close/i.test(lower)) continue;
        if (/copy/i.test(lower) && !/copy (code|coupon|promo)/i.test(lower)) continue;
        current += 1;
        if (current === idx) {
          el.setAttribute('data-coupon-revealed', '1');
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { text: t, tag: el.tagName.toLowerCase() };
        }
      }
      return null;
    },
    15000,
    index
  );
  return clicked;
}

async function aiPickReveal(page) {
  const snapshot = await withTimeout(getVisibleInteractiveSnapshot(page), 10000, null);
  if (!snapshot || !snapshot.elements || !snapshot.elements.length) return { ok: false, broken: false };
  const candidates = snapshot.elements.filter(el =>
    /show|reveal|unlock|see|get|view|click|tap|code|coupon|promo|voucher/i.test(
      `${el.text} ${el.ariaLabel} ${el.title}`.toLowerCase()
    )
  ).slice(0, 40);
  if (!candidates.length) return { ok: false, broken: false };
  let decision = null;
  try {
    decision = await withTimeout(
      chooseElement(
        'Find the best visible button or link that reveals a hidden coupon/promo code. Look for text like "Show Code", "Reveal Code", "Get Code", "See Promo Code", "Unlock Code", "Click to copy". Do NOT pick close buttons, header nav, or unrelated links.',
        { url: snapshot.url, title: snapshot.title, elements: candidates }
      ),
      8000,
      null
    );
  } catch (_) {
    return { ok: false, broken: true };
  }
  if (!decision || decision.found !== true || !decision.elementId) return { ok: false, broken: false };
  try {
    await clickAgentElement(page, decision.elementId);
  } catch (_) {
    return { ok: false, broken: false };
  }
  return { ok: true, text: String(decision.reason || 'AI reveal').replace(/\s+/g, ' ').slice(0, 40) };
}

async function extractCoupons(page, brandTokens = [], filterTokens = []) {
  const data = await safeEvaluate(
    page,
    (args) => {
      const { brandTokens, codeOkSrc, rejectArr } = args || {};
      const codeOk = new Function('return ' + codeOkSrc)()(rejectArr || []);
      const brandRe = Array.isArray(brandTokens) && brandTokens.length
        ? new RegExp(
            brandTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[\\- ]?')).join('|'),
            'i'
          )
        : null;

      const collect = [];
      const seen = new Set();

      const push = (code, el, source) => {
        let m = String(code || '').trim().replace(/\s+/g, '');
        m = m.replace(/(show|reveal|get|view|see|unlock)\s*(code|coupon)$/i, '').replace(/coupon$/i, '');
        if (!codeOk(m)) return;
        if (source === 'leaf' && !/\d/.test(m)) return;
        if (seen.has(m.toUpperCase())) return;
        seen.add(m.toUpperCase());
        const block =
          el.closest('[class*="coupon" i],[class*="deal" i],[class*="offer" i],[class*="promo" i],[class*="code" i]') ||
          el.parentElement ||
          el;
        const blockText = (block ? block.innerText || '' : '').replace(/\s+/g, ' ').trim().slice(0, 600);
        const offerMatch = blockText.match(/(\d{1,3}\s?%|%\s?off|\$\s?\d+|£\s?\d+|\d+\s?percent|save\s+\d+)/i);
        const expiryMatch = blockText.match(/expires?\s*:?\s*([\w\s,.\/-]{4,40}?)(?=\s+(for|valid|order|when|use|at|$)|$)/i);
        const verified = /verified|100%\s*suc|worked|tested/i.test(blockText);
        const contextBrand = brandRe ? brandRe.test(blockText) : false;
        collect.push({
          code: m,
          offer: offerMatch ? offerMatch[0].trim() : '',
          verified,
          expiry: expiryMatch ? expiryMatch[1].trim().slice(0, 60) : '',
          contextBrand
        });
      };

      const add = (el, source) => {
        const fromAttr =
          el.getAttribute('data-code') ||
          el.getAttribute('data-coupon') ||
          el.getAttribute('data-promo-code') ||
          el.getAttribute('data-clipboard-text');
        if (fromAttr) push(fromAttr, el, source);
        const val = el.value;
        if (val && typeof val === 'string') push(val, el, source);
        const ownText = (el.innerText || '').trim();
        if (ownText && ownText.length <= 30) push(ownText, el, source);
      };

      document.querySelectorAll('[data-code],[data-coupon],[data-promo-code],[data-clipboard-text]').forEach(el => add(el, 'attr'));
      document.querySelectorAll('input[type="text"],input[type="hidden"][value]').forEach(el => add(el, 'container'));
      document.querySelectorAll(
        '[class*="code" i],[id*="code" i],[class*="coupon" i],[id*="coupon" i],[class*="promo" i]'
      ).forEach(el => add(el, 'container'));

      let scanned = 0;
      for (const el of document.querySelectorAll('span,strong,b,p,button,a,td')) {
        if (++scanned > 2000) break;
        add(el, 'leaf');
      }

      document.querySelectorAll('script[type="application/ld+json"]').forEach(sc => {
        const raw = sc.textContent || '';
        if (!raw || raw.length > 200000) return;
        const re = /"(?:couponcode|promocode|discountcode|vouchercode|offercode|code)"\s*:\s*"([^"]{3,20})"/gi;
        let m;
        while ((m = re.exec(raw))) push(m[1], sc, 'jsonld');
      });

      return collect;
    },
    20000,
    {
      brandTokens,
      codeOkSrc: makeCodeOk.toString(),
      rejectArr: buildRejectSet(Array.isArray(filterTokens) && filterTokens.length ? filterTokens : brandTokens)
    }
  );
  return data || [];
}

async function scrapeSite(page, siteUrl, opts = {}) {
  const { useAi = true, log = () => {}, brandTokens = [], filterTokens = null, revealCap = 20, noProgressLimit = 3 } = opts;
  log(`[SCRAPE] ${siteUrl}`);
  await withTimeout(page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }), 40000, null).catch(() => {});
  await waitForPageSettle(page);
  await dismissOverlays(page);
  await handleInterstitials(page, log);
  await withTimeout(
    page.waitForSelector('[class*="coupon" i],[id*="coupon" i],[data-code],[data-coupon],[class*="promo" i]', { timeout: 8000 }).catch(() => {}),
    10000,
    null
  );
  await scrollThrough(page, 6);

  const collected = [];
  const seen = new Set();
  const initialPages = new Set(page.context().pages());
  const closeExtraPages = async () => {
    try {
      const pages = page.context().pages();
      for (const p of pages) {
        if (p !== page && !initialPages.has(p)) await withTimeout(p.close().catch(() => {}), 5000, null);
      }
    } catch (_) {}
  };
  const addAll = list => {
    for (const c of list || []) {
      if (seen.has(c.code.toUpperCase())) continue;
      seen.add(c.code.toUpperCase());
      collected.push(c);
    }
  };

  addAll(await extractCoupons(page, brandTokens, filterTokens));

  let unmaskMethod = 'none';
  let revealed = 0;
  let noProgress = 0;
  let aiBroken = false;
  // If the baseline already surfaced a very rich set, the site exposes codes in the
  // DOM (e.g. couponupto embeds the code inside the button label) and additional
  // reveal clicks add little. Otherwise, run the reveal loop.
  const richBaseline = collected.length >= 30;
  for (let i = 0; i < revealCap && !richBaseline; i++) {
    const iterDone = await withTimeout((async () => {
      let clicked = null;

      if (useAi && !aiBroken) {
        const ai = await aiPickReveal(page);
        if (ai.ok) {
          clicked = { text: ai.text };
        } else if (ai.broken) {
          aiBroken = true;
          log('[SCRAPE]   AI reveal selection unavailable, falling back to regex');
        }
      }

      if (!clicked) {
        const candidates = await findRevealCandidates(page);
        if (!candidates.length) return true;

        let target = null;
        for (const pattern of REVEAL_PATTERNS) {
          target = candidates.find(c => pattern.test(c.text));
          if (target) break;
        }
        target = target || candidates[0];

        const index = candidates.indexOf(target);
        clicked = await clickRevealByIndex(page, index);
      }

      if (!clicked) {
        noProgress += 1;
        return noProgress >= noProgressLimit;
      }

      revealed += 1;
      unmaskMethod = 'reveal_click';
      log(`[SCRAPE] reveal #${revealed} via "${clicked.text}"`);
      await page.waitForTimeout(800);

      if (page.url() !== siteUrl) {
        log(`[SCRAPE]   navigation drift, returning to ${siteUrl}`);
        await withTimeout(page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }), 25000, null).catch(() => {});
        await withTimeout(page.waitForLoadState('domcontentloaded', { timeout: 5000 }), 8000, null).catch(() => {});
        await page.waitForTimeout(500);
      }
      await closeExtraPages();
      await withTimeout(page.keyboard.press('Escape').catch(() => {}), 2000, null);
      await page.waitForTimeout(300);

      const beforeSize = seen.size;
  addAll(await extractCoupons(page, brandTokens, filterTokens));
      const gained = seen.size - beforeSize;
      if (gained === 0) noProgress += 1;
      else noProgress = 0;
      return noProgress >= noProgressLimit;
    })(), 25000, true);
    if (iterDone) {
      if (revealed > 0) log(`[SCRAPE]   stopping reveal loop (no progress or cap reached)`);
      break;
    }
    if (revealed % 5 === 0) await scrollThrough(page, 1);
  }
  await closeExtraPages();

  log(`[SCRAPE] ${siteUrl} -> ${collected.length} codes (method=${unmaskMethod}, reveals=${revealed})`);
  return {
    url: siteUrl,
    unmaskMethod,
    coupons: collected.map(c => ({ ...c, siteUrl }))
  };
}

module.exports = { scrapeSite, findRevealCandidates, clickRevealByIndex, extractCoupons, withTimeout, handleInterstitials, interstitialState };