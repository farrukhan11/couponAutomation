(() => {
  if (window.__couponTestPhase1Loaded) return;
  window.__couponTestPhase1Loaded = true;

  const COUPON_RE = /coupon|promo(?:tional)?|discount|voucher|offer\s*code|gift\s*code/i;
  const APPLY_RE = /apply|redeem|submit|add|use/i;
  const REMOVE_RE = /remove|delete|clear|cancel|×|✕|✖/i;
  const DANGER_RE = /place\s*order|submit\s*order|pay\s*now|complete\s*(purchase|order)|buy\s*now|confirm\s*order/i;
  const SUCCESS_RE = /applied|success|accepted|you\s+saved|discount\s+(?:has\s+been\s+)?applied|promo(?:tional)?\s+code\s+applied/i;
  const INVALID_RE = /invalid|not\s+valid|doesn['’]?t\s+exist|does\s+not\s+exist|unrecognized|not\s+recognized|incorrect|couldn['’]?t\s+find|cannot\s+be\s+found/i;
  const EXPIRED_RE = /expired|no\s+longer\s+valid|has\s+ended/i;
  const MIN_RE = /minimum|min\.\s*(?:order|spend)|spend\s+.*(?:more|at\s+least)|requires?\s+.*(?:minimum|order)/i;
  const ELIGIBLE_RE = /not\s+eligible|doesn['’]?t\s+apply|does\s+not\s+apply|not\s+applicable|excluded|eligible\s+items|specific\s+(?:item|product)/i;
  const USED_RE = /already\s+used|used\s+this\s+code|one\s+use|usage\s+limit/i;
  const LOGIN_RE = /sign\s*in|log\s*in|login|required\s+account|members?\s+only/i;
  const STACK_RE = /cannot\s+combine|can['’]?t\s+combine|not\s+combinable|not\s+stackable|one\s+(?:promo|coupon|discount)/i;

  let running = false;
  let abortRequested = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function textOf(el) {
    return [
      el?.getAttribute?.('aria-label'), el?.getAttribute?.('placeholder'),
      el?.getAttribute?.('name'), el?.getAttribute?.('id'), el?.getAttribute?.('title'),
      el?.textContent
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function nearbyText(el) {
    const parts = [textOf(el)];
    let node = el?.parentElement;
    for (let i = 0; i < 3 && node; i += 1, node = node.parentElement) {
      const value = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (value && value.length < 500) parts.push(value);
    }
    const id = el?.id;
    if (id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) parts.push(label.innerText || label.textContent || '');
      } catch {}
    }
    return parts.join(' ');
  }

  function findCouponInput() {
    const inputs = [...document.querySelectorAll('input:not([type="hidden"]), textarea')].filter(visible);
    const scored = inputs.map((el) => {
      const own = textOf(el);
      const context = nearbyText(el);
      let score = 0;
      if (COUPON_RE.test(own)) score += 12;
      if (COUPON_RE.test(context)) score += 5;
      if (/code/i.test(own)) score += 2;
      if (['email','password','tel','search','number'].includes((el.getAttribute('type') || '').toLowerCase())) score -= 10;
      if (/email|phone|postal|zip|address|search/i.test(own)) score -= 8;
      return { el, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.score >= 5 ? scored[0].el : null;
  }

  function findApplyButton(input) {
    const candidates = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a')]
      .filter(visible)
      .map((el) => {
        const text = textOf(el);
        if (DANGER_RE.test(text)) return { el, score: -100 };
        let score = 0;
        if (APPLY_RE.test(text)) score += 6;
        if (COUPON_RE.test(text)) score += 4;
        if (input?.form && el.closest('form') === input.form) score += 8;
        const parent = input?.parentElement;
        if (parent && parent.contains(el)) score += 7;
        if (input && el.parentElement === input.parentElement) score += 5;
        return { el, score };
      })
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.score >= 6 ? candidates[0].el : null;
  }

  function setInputValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickSafe(el) {
    if (!el) throw new Error('Required button was not found.');
    const label = textOf(el);
    if (DANGER_RE.test(label)) throw new Error(`Blocked unsafe checkout action: ${label}`);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
  }

  function normalizeMoney(raw) {
    if (!raw) return null;
    let value = raw.replace(/[^0-9.,-]/g, '');
    if (!value) return null;
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    if (lastComma > lastDot) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
    const num = Number.parseFloat(value);
    return Number.isFinite(num) ? Math.abs(num) : null;
  }

  function moneyFromText(text) {
    const matches = [...String(text || '').matchAll(/(?:[$€£¥₹]|USD|EUR|GBP|CAD|AUD)\s*[-+]?\s*\d[\d.,]*|\d[\d.,]*\s*(?:USD|EUR|GBP|CAD|AUD)/gi)];
    if (!matches.length) return null;
    return normalizeMoney(matches[matches.length - 1][0]);
  }

  function currencyFromText(text) {
    const value = String(text || '');
    if (value.includes('$')) return '$';
    if (value.includes('€')) return '€';
    if (value.includes('£')) return '£';
    if (value.includes('¥')) return '¥';
    if (value.includes('₹')) return '₹';
    const code = value.match(/\b(USD|EUR|GBP|CAD|AUD)\b/i)?.[1];
    return code ? `${code.toUpperCase()} ` : '';
  }

  function amountByLabel(kind) {
    const nodes = [...document.querySelectorAll('div, span, p, li, dt, dd, tr, td, th, strong, b')].filter(visible);
    const tests = kind === 'subtotal'
      ? [/\bsub\s*total\b/i, /\bitems?\s+total\b/i]
      : kind === 'discount'
        ? [/\bdiscount\b/i, /\bcoupon\b/i, /\bpromo(?:tion)?\b/i, /\bsavings?\b/i]
        : [/\bgrand\s+total\b/i, /\border\s+total\b/i, /^\s*total\b/i];

    const candidates = [];
    for (const node of nodes) {
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 180) continue;
      if (kind === 'total' && /sub\s*total/i.test(text)) continue;
      if (!tests.some((re) => re.test(text))) continue;
      const amount = moneyFromText(text);
      if (amount === null) continue;
      let score = 1;
      if (text.length < 80) score += 2;
      if (tests[0].test(text)) score += 2;
      candidates.push({ amount, currency: currencyFromText(text), score, text });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function snapshotTotals() {
    const subtotal = amountByLabel('subtotal');
    const total = amountByLabel('total');
    const discount = amountByLabel('discount');
    const currency = subtotal?.currency || total?.currency || discount?.currency || '';
    return {
      subtotal: subtotal?.amount ?? null,
      total: total?.amount ?? null,
      discount: discount?.amount ?? null,
      currencySymbol: currency
    };
  }

  function collectMessages(code = '') {
    const selectors = [
      '[role="alert"]','[aria-live]','.error','.errors','.success','.notice','.message',
      '[class*="error"]','[class*="success"]','[class*="message"]','[class*="notice"]',
      '[class*="coupon"]','[class*="promo"]','[class*="discount"]'
    ];
    const values = new Set();
    for (const node of document.querySelectorAll(selectors.join(','))) {
      if (!visible(node)) continue;
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && text.length <= 500) values.add(text);
    }
    if (code) {
      for (const node of document.querySelectorAll('div,span,p,li')) {
        if (!visible(node)) continue;
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && text.length <= 220 && text.toLowerCase().includes(code.toLowerCase())) values.add(text);
      }
    }
    return [...values].slice(0, 30).join(' | ');
  }

  function classify(message, before, after) {
    const msg = message || '';
    if (EXPIRED_RE.test(msg)) return 'EXPIRED';
    if (MIN_RE.test(msg)) return 'MINIMUM_SPEND_NOT_MET';
    if (ELIGIBLE_RE.test(msg)) return 'PRODUCT_NOT_ELIGIBLE';
    if (USED_RE.test(msg)) return 'ALREADY_USED';
    if (LOGIN_RE.test(msg)) return 'LOGIN_REQUIRED';
    if (STACK_RE.test(msg)) return 'NOT_STACKABLE';
    if (INVALID_RE.test(msg)) return 'INVALID';

    const totalSaved = Number.isFinite(before.total) && Number.isFinite(after.total) && before.total - after.total > 0.005;
    const discountRaised = Number.isFinite(after.discount) && ((after.discount || 0) - (before.discount || 0) > 0.005);
    if (totalSaved || discountRaised) return 'WORKING';
    if (SUCCESS_RE.test(msg)) return 'WORKING_UNMEASURED';
    return 'UNKNOWN';
  }

  function computeDiscount(before, after) {
    let amount = null;
    if (Number.isFinite(before.total) && Number.isFinite(after.total) && before.total > after.total) {
      amount = before.total - after.total;
    } else if (Number.isFinite(after.discount)) {
      const prior = Number.isFinite(before.discount) ? before.discount : 0;
      if (after.discount > prior) amount = after.discount - prior;
    }
    const base = Number.isFinite(before.subtotal) && before.subtotal > 0
      ? before.subtotal
      : (Number.isFinite(before.total) && before.total > 0 ? before.total : null);
    const percent = amount !== null && base ? (amount / base) * 100 : null;
    return {
      amount: amount !== null ? Math.round(amount * 100) / 100 : null,
      percent: percent !== null ? Math.round(percent * 100) / 100 : null
    };
  }

  async function waitForUi() {
    await sleep(800);
    let previous = document.body?.innerText?.length || 0;
    for (let i = 0; i < 5; i += 1) {
      await sleep(400);
      const now = document.body?.innerText?.length || 0;
      if (now === previous) return;
      previous = now;
    }
  }

  function findRemoveButton(code) {
    const controls = [...document.querySelectorAll('button, a, [role="button"]')].filter(visible);
    const candidates = controls.map((el) => {
      const own = textOf(el);
      if (DANGER_RE.test(own)) return { el, score: -100 };
      let score = REMOVE_RE.test(own) ? 5 : 0;
      let parent = el.parentElement;
      for (let depth = 0; depth < 4 && parent; depth += 1, parent = parent.parentElement) {
        const context = (parent.innerText || '').replace(/\s+/g, ' ').trim();
        if (code && context.toLowerCase().includes(code.toLowerCase())) score += 12;
        if (COUPON_RE.test(context) && context.length < 350) score += 4;
      }
      return { el, score };
    }).sort((a, b) => b.score - a.score);
    return candidates[0]?.score >= 9 ? candidates[0].el : null;
  }

  async function removeAppliedCode(code, baseline) {
    const button = findRemoveButton(code);
    if (button) {
      clickSafe(button);
      await waitForUi();
      const state = snapshotTotals();
      const message = collectMessages(code);
      const codeGone = !message.toLowerCase().includes(code.toLowerCase());
      const totalReset = !Number.isFinite(baseline.total) || !Number.isFinite(state.total) || Math.abs(state.total - baseline.total) < 0.02;
      if (codeGone || totalReset) return true;
    }

    const input = findCouponInput();
    if (input && String(input.value || '').toLowerCase() === code.toLowerCase()) {
      setInputValue(input, '');
    }
    return false;
  }

  function chooseBest(results) {
    const working = results.filter((r) => r.status === 'WORKING' || r.status === 'WORKING_UNMEASURED');
    if (!working.length) return null;
    return working.sort((a, b) => {
      const ap = Number.isFinite(a.discountPercent) ? a.discountPercent : -1;
      const bp = Number.isFinite(b.discountPercent) ? b.discountPercent : -1;
      if (bp !== ap) return bp - ap;
      const aa = Number.isFinite(a.discountAmount) ? a.discountAmount : -1;
      const ba = Number.isFinite(b.discountAmount) ? b.discountAmount : -1;
      return ba - aa;
    })[0];
  }

  function notify(summary, run = null) {
    chrome.runtime.sendMessage({ type: 'COUPON_TEST_PROGRESS', payload: { summary, run } }).catch(() => {});
  }

  async function applyOne(code, baseline) {
    const input = findCouponInput();
    if (!input) throw new Error('Coupon/discount field not found on this page. Phase 1 expects the field to be visible.');
    const apply = findApplyButton(input);
    if (!apply) throw new Error('Coupon field found, but a safe Apply/Redeem button could not be identified.');

    setInputValue(input, '');
    setInputValue(input, code);
    input.focus();
    clickSafe(apply);
    await waitForUi();

    const after = snapshotTotals();
    const message = collectMessages(code);
    const status = classify(message, baseline, after);
    const discount = computeDiscount(baseline, after);

    return {
      code,
      status,
      discountPercent: discount.percent,
      discountAmount: discount.amount,
      currencySymbol: after.currencySymbol || baseline.currencySymbol || '',
      baselineSubtotal: baseline.subtotal,
      baselineTotal: baseline.total,
      afterTotal: after.total,
      message: message || 'No explicit coupon response text detected.',
      testedAt: new Date().toISOString()
    };
  }

  async function runTests(payload) {
    if (running) throw new Error('A coupon test is already running in this tab.');
    running = true;
    abortRequested = false;

    const codes = [...new Set((payload?.codes || []).map((c) => String(c).trim()).filter(Boolean))];
    const run = {
      host: location.hostname,
      url: location.href,
      startedAt: new Date().toISOString(),
      completedAt: null,
      baseline: null,
      results: [],
      best: null,
      summary: ''
    };

    try {
      const couponInput = findCouponInput();
      if (!couponInput) throw new Error('Coupon/discount field not found. Open the coupon section on cart/checkout and try again.');
      if (!findApplyButton(couponInput)) throw new Error('Coupon field was found, but no safe Apply/Redeem button was detected.');

      const baseline = snapshotTotals();
      run.baseline = baseline;
      notify(`Coupon field found. Testing ${codes.length} code(s)…`, run);

      let previousWorkingCode = null;
      for (let index = 0; index < codes.length; index += 1) {
        if (abortRequested) break;
        const code = codes[index];

        if (previousWorkingCode) {
          notify(`Removing ${previousWorkingCode} before testing ${code}…`, run);
          const removed = await removeAppliedCode(previousWorkingCode, baseline);
          if (!removed) {
            const resetResult = {
              code,
              status: 'RESET_REQUIRED',
              discountPercent: null,
              discountAmount: null,
              currencySymbol: baseline.currencySymbol || '',
              baselineSubtotal: baseline.subtotal,
              baselineTotal: baseline.total,
              afterTotal: snapshotTotals().total,
              message: `Could not safely remove previously working code ${previousWorkingCode}. Testing stopped to avoid stacked/incorrect results.`,
              testedAt: new Date().toISOString()
            };
            run.results.push(resetResult);
            notify(resetResult.message, run);
            break;
          }
          previousWorkingCode = null;
        }

        notify(`Testing ${code} (${index + 1}/${codes.length})…`, run);
        const result = await applyOne(code, baseline);
        run.results.push(result);
        if (result.status === 'WORKING' || result.status === 'WORKING_UNMEASURED') previousWorkingCode = code;
        run.best = chooseBest(run.results);
        notify(`${code}: ${result.status}${result.discountPercent ? ` · ${result.discountPercent.toFixed(2)}%` : ''}`, run);
      }

      if (previousWorkingCode) {
        await removeAppliedCode(previousWorkingCode, baseline);
      }

      run.best = chooseBest(run.results);
      if (!abortRequested && payload?.reapplyBest && run.best) {
        notify(`Re-applying best code ${run.best.code}…`, run);
        const reapplied = await applyOne(run.best.code, baseline);
        run.best.reapplied = reapplied.status === 'WORKING' || reapplied.status === 'WORKING_UNMEASURED';
      }

      run.completedAt = new Date().toISOString();
      const working = run.results.filter((r) => r.status === 'WORKING' || r.status === 'WORKING_UNMEASURED').length;
      run.summary = abortRequested
        ? `Stopped. Tested ${run.results.length}/${codes.length} code(s); ${working} working.`
        : `Done. Tested ${run.results.length} code(s); ${working} working.${run.best ? ` Best: ${run.best.code}.` : ''}`;

      await chrome.storage.local.set({ 'couponTest:last': run });
      notify(run.summary, run);
      return run;
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'STOP_COUPON_TESTS') {
      abortRequested = true;
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type !== 'START_COUPON_TESTS') return false;
    runTests(message.payload)
      .then((run) => sendResponse({ ok: true, run }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });
})();
