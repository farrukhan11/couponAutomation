const { waitForPageSettle } = require('./browser');

function buildSearchUrl({ keyword, region, pageNumber = 0, engine = 'google' }) {
  const gl = region === 'uk' ? 'uk' : 'us';
  if (engine === 'ddg') {
    const kl = region === 'uk' ? 'uk-en' : 'us-en';
    const params = new URLSearchParams({ q: keyword, kl });
    if (pageNumber > 0) params.set('s', String(pageNumber * 20));
    return `https://html.duckduckgo.com/html/?${params.toString()}`;
  }
  if (engine === 'bing') {
    const params = new URLSearchParams({ q: keyword, setlang: 'en', cc: gl, count: '20' });
    if (pageNumber > 0) params.set('first', String(pageNumber * 20 + 1));
    return `https://www.bing.com/search?${params.toString()}`;
  }
  const params = new URLSearchParams({ q: keyword, gl, hl: 'en', num: '20', pws: '0' });
  if (pageNumber > 0) params.set('start', String(pageNumber * 20));
  return `https://www.google.com/search?${params.toString()}`;
}

async function dismissConsent(page) {
  try {
    if (page.url().includes('consent.google.com')) {
      for (const label of ['Accept all', 'I agree', 'Agree']) {
        const btn = page.locator(`button:has-text("${label}")`).first();
        if (await btn.count()) {
          await btn.click({ timeout: 5000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1200);
          return true;
        }
      }
    }
    for (const sel of ['#L2AGLb', 'button:has-text("Accept all")', 'button:has-text("I agree")']) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        return true;
      }
    }
    if (page.url().includes('bing.com')) {
      for (const sel of ['#bnp_btn_accept', '#bnp_btn_reject', 'button:has-text("Accept")']) {
        const el = page.locator(sel).first();
        if (await el.count()) {
          await el.click({ timeout: 5000 });
          await page.waitForTimeout(1000);
          break;
        }
      }
    }
  } catch (_) {}
  return false;
}

async function isBlocked(page, engine = 'google') {
  const url = page.url();
  if (url.includes('sorry.google.com') || url.includes('/sorry/')) return true;
  return page.evaluate(engine => {
    if (engine === 'ddg') {
      const t = (document.body ? document.body.innerText : '').slice(0, 1200);
      return /anomaly|captcha|unusual traffic/i.test(t) || document.title.toLowerCase().includes('anomaly');
    }
    if (engine === 'bing') {
      if (document.querySelector('#b_captcha, .captcha')) return true;
      const t = (document.body ? document.body.innerText : '').slice(0, 1500);
      return /confirm you are not a robot|captcha/i.test(t);
    }
    const t = (document.body ? document.body.innerText : '').slice(0, 2000);
    return /unusual traffic|captcha|verify you are human|enable javascript and cookies/i.test(t);
  }, engine);
}

async function extractDdgOrganic(page) {
  return page.evaluate(() => {
    const decodeUrl = raw => {
      try {
        const u = new URL(raw);
        if (u.hostname.includes('duckduckgo.com')) {
          const uddg = u.searchParams.get('uddg');
          if (uddg) return decodeURIComponent(uddg);
          const vqd = u.searchParams.get('uddg');
          if (vqd) return vqd;
        }
        return raw;
      } catch {
        return raw;
      }
    };
    const results = [];
    const items = document.querySelectorAll('.result');
    for (const item of items) {
      const a = item.querySelector('a.result__a, h2 a');
      if (!a) continue;
      const title = (a.innerText || '').trim().replace(/\s+/g, ' ');
      if (!title) continue;
      const url = decodeUrl(a.href);
      if (!url) continue;
      const snip = item.querySelector('.result__snippet, .result__snippet p');
      const snippet = (snip ? snip.innerText : '').trim().replace(/\s+/g, ' ').slice(0, 300);
      results.push({ title, url, snippet });
    }
    return results;
  });
}

async function extractGoogleOrganic(page) {
  return page.evaluate(() => {
    const blockedZones = Array.from(
      document.querySelectorAll('#tads, #tadsb, #taw, .ads-ad, [data-text-ad], .pla-unit, .commercial, .uEierd, [data-snc="ad"], [aria-label="Ads"]')
    );
    const links = Array.from(document.querySelectorAll('a[href^="http"]')).filter(a => a.querySelector('h3'));

    const isAd = a => {
      if (blockedZones.some(z => z.contains(a))) return true;
      let cur = a;
      for (let i = 0; i < 8 && cur; i++) {
        const t = (cur.innerText || '').trim().slice(0, 160);
        if (/^sponsored\b/i.test(t) || /\bsponsored\b/i.test(t)) return true;
        cur = cur.parentElement;
      }
      return false;
    };

    const results = [];
    for (const a of links) {
      if (isAd(a)) continue;
      const h3 = a.querySelector('h3');
      const title = (h3 ? h3.innerText : a.innerText || '').trim().replace(/\s+/g, ' ');
      if (!title) continue;
      let snippet = '';
      let p = a.parentElement;
      for (let i = 0; i < 5 && p; i++) {
        const t = (p.innerText || '')
          .replace(title, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 300);
        if (t.length > 25) {
          snippet = t;
          break;
        }
        p = p.parentElement;
      }
      results.push({ title, url: a.href, snippet });
    }
    return results;
  });
}

async function extractBingOrganic(page) {
  return page.evaluate(() => {
    const cleanUrl = raw => {
      try {
        const u = new URL(raw);
        if (u.hostname.includes('bing.com') && u.pathname.startsWith('/ck')) return null;
        return raw;
      } catch (_) {
        return raw;
      }
    };
    const results = [];
    const items = document.querySelectorAll('li.b_algo');
    for (const li of items) {
      if (li.closest('.b_ad') || li.classList.contains('b_ad')) continue;
      const a = li.querySelector('h2 a, a[href^="http"]');
      if (!a) continue;
      const title = (a.innerText || '').trim().replace(/\s+/g, ' ');
      if (!title) continue;
      const url = cleanUrl(a.href);
      if (!url) continue;
      const snipEl = li.querySelector('.b_caption p, .b_snippet, .b_lineclamp2, p');
      const snippet = (snipEl ? snipEl.innerText : '').trim().replace(/\s+/g, ' ').slice(0, 300);
      results.push({ title, url, snippet });
    }
    return results;
  });
}

async function extractOrganic(page, engine) {
  if (engine === 'ddg') return extractDdgOrganic(page);
  if (engine === 'bing') return extractBingOrganic(page);
  return extractGoogleOrganic(page);
}

async function searchOne({ page, keyword, region, pageNumber = 0, engine = 'google', log = () => {} }) {
  const url = buildSearchUrl({ keyword, region, pageNumber, engine });
  log(`[SEARCH] ${engine} ${region} | page ${pageNumber + 1} | "${keyword}"`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    log(`[SEARCH] NAV-ERROR ${engine} for "${keyword}": ${err.message}`);
    return { keyword, region, page: pageNumber + 1, engine, blocked: true, results: [], error: err.message };
  }
  await waitForPageSettle(page);
  await dismissConsent(page);

  const blocked = await isBlocked(page, engine);
  if (blocked) {
    log(`[SEARCH] BLOCKED ${engine} for "${keyword}"`);
    return { keyword, region, page: pageNumber + 1, engine, blocked: true, results: [] };
  }

  const results = await extractOrganic(page, engine);
  log(`[SEARCH] ${engine} ${region} | "${keyword}" -> ${results.length} organic results`);
  return {
    keyword,
    region,
    page: pageNumber + 1,
    engine,
    blocked: false,
    results: results.map((r, i) => ({ rank: pageNumber * 20 + i + 1, ...r }))
  };
}

module.exports = { searchOne, buildSearchUrl, extractOrganic, isBlocked };