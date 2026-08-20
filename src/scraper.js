const { waitForPageSettle } = require('./browser');
const { chooseElement } = require('./ollama');
const { getVisibleInteractiveSnapshot, clickAgentElement } = require('./snapshot');

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
  /tap to reveal/i
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

async function scrollThrough(page, steps = 4) {
  for (let i = 0; i < steps; i++) {
    await withTimeout(page.mouse.wheel(0, 900), 3000, null).catch(() => {});
    await page.waitForTimeout(500);
  }
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
        if (!/(show|reveal|unlock|see|get|view|click|tap).*(code|coupon|voucher|promo)|show code/i.test(lower)) continue;
        if (/(copy|close)/i.test(lower)) continue;
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
        if (!/(show|reveal|unlock|see|get|view|click|tap).*(code|coupon|voucher|promo)|show code/i.test(lower)) continue;
        if (/(copy|close)/i.test(lower)) continue;
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
      const { brandTokens, filterTokens } = args || {};
      const brandRe = Array.isArray(brandTokens) && brandTokens.length
        ? new RegExp(
            brandTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[\\- ]?')).join('|'),
            'i'
          )
        : null;

      const NOISE_SET = new Set([
        'APPLY', 'COUPON', 'PROMO', 'PROMOCODE', 'CODE', 'COPY', 'SHOW', 'HIDE', 'MORE', 'LESS',
        'SAVE', 'OFF', 'LOGIN', 'SIGN', 'SIGNUP', 'REGISTER', 'EMAIL', 'PASSWORD', 'ADDRESS',
        'SUBSCRIBE', 'NEWSLETTER', 'SEARCH', 'CLOSE', 'MENU', 'CART', 'ORDER', 'PHONE', 'NAME',
        'CITY', 'STATE', 'ZIP', 'COUNTRY', 'CARD', 'PAY', 'CHECKOUT', 'BUY', 'SHOP', 'GIFT',
        'CUSTOM', 'SUPPORT', 'HELP', 'ABOUT', 'CONTACT', 'PRIVACY', 'TERMS', 'POLICY', 'DETAILS',
        'ALL', 'TOP', 'NEW', 'SALE', 'SOLD', 'OUT', 'STOCK', 'BACK', 'PRINT', 'FAVORITE',
        'WISHLIST', 'REVIEW', 'RATE', 'RETURN', 'SHIPPING', 'TRACK', 'VIEW', 'EXPLORE', 'OFFER',
        'DEAL', 'TODAY', 'SAVINGS', 'DISCOUNT', 'VOUCHER', 'EXPIRES', 'VALID', 'USES', 'USED',
        'SHOPNOW', 'CHECKIT', 'GO', 'GETIT', 'CLICK', 'REVEAL', 'UNLOCK', 'SEE', 'GET',
        'GETCODE', 'SHOWCODE', 'VIEWCODE', 'SEECODE', 'COPYCODE', 'USECODE', 'APPLYCODE',
        'NEWCODE', 'HOTCODE', 'MYCODE', 'CODEGO', 'CLICKDEAL', 'BESTDEAL', 'TODAYDEAL',
        'HOTDEAL', 'MEGADEAL', 'TOPDEAL', 'NEWDEAL', 'CHEAP', 'GIFTCODE', 'PROMOCODE1',
        'PROMOCODE2', 'OFFERCODE', 'WYBOT', 'TWOPAGESCURTAINS', 'NEWSLETTER', 'SIGNIN',
        'LOGINNOW', 'JOINNOW', 'REGISTER', 'CREATEACCOUNT', 'TERMS', 'SHIPPINGINFO',
        'TRUE', 'FALSE', 'CUSTOMER', 'ONLY', 'SHOPPERSVOTED', 'CODESFOUND',
        'MARKETINGCALENDAR', 'SUBMITACOUPON', 'ALWAYSFREE', 'DESIGN2PLEASE',
        'LEARNING247', 'FURNITURE123', 'AIREA51TRAMPOLINE', 'VOTES', 'DEALS',
        'COUPONS', 'OFFERS', 'NONE', 'LOCALIZATION'
      ]);
      const CODE_RE = /^[a-z0-9][a-z0-9\-]{3,23}$/i;
      const DATE_RE = /^(?:\d{1,2})?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\d{4}$/i;
      const HEX_HASH_RE = /^[0-9a-f]{8,}$/i;
      const MONTHDAY_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|july)\d{1,2}(st|nd|rd|th)$/i;
      const SUBSTR_BLOCK = /(interestedusers|current|expired|verified|verification|recorded|confirmation|checkout|interested|ago$|partnersince|trusted|vape|printing|printer|product|stores?|days$|shipping|codes?$|scout|undefined|items|comments|alloffers|offers?\d|couponcodes|promotions?|printables|proofshot|within24|savenow|getoffer|sendto|myemail|paystoshare|reviews|readall|updated|facebook|twitter|timesused|expires|codes\d|deals\d|lumens|watts?|battery|batteries|usb|mah|ampere|voltage|singapore|servers?|logins?|allowed|needed|required|similar)/i;
      const START_WORD_BLOCK = /^(seeless|seemore|readmore|getdeal|getcode|showcode|viewcode|seecode|submit|submitcoupon|navbar|activate|display|soon|storewide|limitedtime|flexible|financing|interestfree|timeless|premium|craftsmanship|flagsconnections|flags-connections|peak|motel|amazon|bissell|dhgate|athome|shopjura|dyson|ecoflow|pharmacy|sports|contact|viewall|periodic|popular|reviews|rule|heibk|interest)/i;
      const DIGIT_PLURAL_RE = /^\d+(shares|items|offers?|comments|stars?)$/i;
      const LABEL_COUNT_RE = /^(all|codes|deals)\d+$/i;
      const USERNAME_RE = /^[A-Z][a-z]+[A-Z][a-zA-Z]*\d{3,}$/;
      const RANGE_RE = /^\d{1,3}-\d{1,3}$/;
      const NOISE_WORD_RE = /^(lifetime|onetime|monthly|recurring|referral)$/i;
      const DURATION_RE = /^\d+[- ]?(day|month|year|hour)s?$/i;
      const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
      const YEAR_RANGE_RE = /^\d{4}-\d{4}$/;
      const YEAR_DECADE_RE = /^\d{4}s$/i;
      const ORDINAL_RE = /^\d+th$/i;
      const BIT_RE = /^\d+-bit$/i;
      const PHONE_RE = /^\d{2,3}-\d{7,}$/;
      const TOLLFREE_RE = /^1-\d{3}-?[A-Za-z]|^8\d{2}-?[A-Za-z]/;
      const PHONE_MULTI_RE = /^(?:\d{1,4}-){2,}\d{1,4}$/;
      const UI_COUNTER_RE = /^\d+(days?left|usestoday|offersvalidated)$/i;
      const WELCOME_SUFFIX_RE = /^welcome\d+[a-z0-9]{6,}$/i;
      const rejectTokens = (Array.isArray(filterTokens) && filterTokens.length ? filterTokens : brandTokens) || [];
      const rejectSet = new Set(
        rejectTokens
          .map(t => String(t || '').trim().toUpperCase())
          .filter(t => t.length >= 3)
      );

      const codeOk = rawCode => {
        const s = String(rawCode || '').trim().replace(/\s+/g, '');
        const base = s.replace(/^\d+/, '');
        if (!s || s.length < 4 || s.length > 17 || !CODE_RE.test(s)) return false;
        if (NOISE_SET.has(s.toUpperCase()) || NOISE_SET.has(base.toUpperCase())) return false;
        if (/^\d+$/.test(s)) return false;
        if (DATE_RE.test(s)) return false;
        if (HEX_HASH_RE.test(s)) return false;
        if (/^(used|lastused)\d/i.test(s)) return false;
        if (/(deals|coupons|offers)$/i.test(s)) return false;
        if (/show|reveal|unlock|copy|click|tap/i.test(s)) return false;
        if (SUBSTR_BLOCK.test(s)) return false;
        if (DIGIT_PLURAL_RE.test(s)) return false;
        if (LABEL_COUNT_RE.test(s)) return false;
        if (USERNAME_RE.test(s)) return false;
        if (RANGE_RE.test(s)) return false;
        if (NOISE_WORD_RE.test(s)) return false;
        if (DURATION_RE.test(s)) return false;
        if (DATE_ISO_RE.test(s) || YEAR_RANGE_RE.test(s) || YEAR_DECADE_RE.test(s) || ORDINAL_RE.test(s) || BIT_RE.test(s) || PHONE_RE.test(s)) return false;
        if (TOLLFREE_RE.test(s) || PHONE_MULTI_RE.test(s) || UI_COUNTER_RE.test(s)) return false;
        if (WELCOME_SUFFIX_RE.test(s)) return false;
        if (/share$/i.test(s)) return false;
        if (/^(last|undefined)$/i.test(s)) return false;
        if (/^for/i.test(s)) return false;
        if (/^see[a-z0-9]/i.test(s)) return false;
        if (START_WORD_BLOCK.test(s)) return false;
        if (MONTHDAY_RE.test(s)) return false;
        const upper = s.toUpperCase();
        const baseUpper = base.toUpperCase();
        if (rejectSet.has(upper) || rejectSet.has(baseUpper)) return false;
        for (const tok of rejectSet) {
          if (upper.startsWith(tok) && /^\d{1,4}$/.test(upper.slice(tok.length))) return false;
        }
        return true;
      };

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

      return collect;
    },
    20000,
    { brandTokens, filterTokens }
  );
  return data || [];
}

async function scrapeSite(page, siteUrl, opts = {}) {
  const { useAi = true, log = () => {}, brandTokens = [], filterTokens = null, revealCap = 20, noProgressLimit = 3 } = opts;
  log(`[SCRAPE] ${siteUrl}`);
  await withTimeout(page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }), 40000, null).catch(() => {});
  await waitForPageSettle(page);
  await dismissOverlays(page);
  await scrollThrough(page, 4);

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

module.exports = { scrapeSite, findRevealCandidates, clickRevealByIndex, extractCoupons, withTimeout };