const { isLikelyCode } = require('./clean');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchHtml(url, timeoutMs = 15000) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
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

const ATTR_RES = [
  /data-code="([^"]+)"/gi,
  /data-coupon="([^"]+)"/gi,
  /data-promo-code="([^"]+)"/gi,
  /data-promocode="([^"]+)"/gi,
  /data-clipboard-text="([^"]+)"/gi,
  /data-clipboard="([^"]+)"/gi
];

function extractCodesFromHtml(html) {
  const seen = new Set();
  const codes = [];
  const push = raw => {
    let m = String(raw || '').trim().replace(/\s+/g, '');
    m = m.replace(/(show|reveal|get|view|see|unlock)\s*(code|coupon)$/i, '').replace(/coupon$/i, '');
    if (!m || !isLikelyCode(m)) return;
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
    if (!m || !isLikelyCode(m)) continue;
    if (!/\d/.test(m)) continue;
    push(m);
  }

  return codes.slice(0, 200);
}

module.exports = { fetchHtml, extractCodesFromHtml };