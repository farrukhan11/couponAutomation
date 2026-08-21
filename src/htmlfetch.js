const { isLikelyCode } = require('./clean');

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'
];
let uaIdx = 0;
const nextUa = () => UA_LIST[uaIdx++ % UA_LIST.length];

async function fetchHtml(url, timeoutMs = 15000, referer = 'https://www.google.com/') {
  try {
    const headers = {
      'User-Agent': nextUa(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    if (referer) headers.Referer = referer;
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 500) return null;
    return html;
  } catch (_) {
    return null;
  }
}

async function fetchViaWayback(url, timeoutMs = 20000) {
  try {
    const res = await fetch(`https://web.archive.org/web/2id_/${url}`, {
      headers: { 'User-Agent': nextUa() },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 500) return null;
    return html;
  } catch (_) {
    return null;
  }
}

async function fetchViaJina(url, timeoutMs = 25000) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'User-Agent': nextUa(), Accept: 'text/plain' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 300) return null;
    return text;
  } catch (_) {
    return null;
  }
}

const ATTR_RES = [
  /data-code="([^"]+)"/gi,
  /data-coupon="([^"]+)"/gi,
  /data-promo-code="([^"]+)"/gi,
  /data-promocode="([^"]+)"/gi,
  /data-clipboard-text="([^"]+)"/gi,
  /data-clipboard="([^"]+)"/gi
];

function extractCodesFromHtml(html, brandTokens = []) {
  const seen = new Set();
  const codes = [];
  const push = raw => {
    let m = String(raw || '').trim().replace(/\s+/g, '');
    m = m.replace(/(show|reveal|get|view|see|unlock)\s*(code|coupon)$/i, '').replace(/coupon$/i, '');
    if (!m || !isLikelyCode(m, brandTokens)) return;
    if (seen.has(m.toUpperCase())) return;
    seen.add(m.toUpperCase());
    codes.push(m);
  };

  for (const re of ATTR_RES) {
    for (const m of html.matchAll(re)) push(m[1]);
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&amp;|&#38;/gi, ' ');

  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9\-]{3,16}/g) || [];
  for (const t of tokens) {
    let m = t.trim().replace(/\s+/g, '');
    m = m.replace(/(show|reveal|get|view|see|unlock)\s*(code|coupon)$/i, '').replace(/coupon$/i, '');
    if (!m || !isLikelyCode(m, brandTokens)) continue;
    if (!/\d/.test(m)) continue;
    push(m);
  }

  return codes.slice(0, 200);
}

module.exports = { fetchHtml, fetchViaWayback, fetchViaJina, extractCodesFromHtml };