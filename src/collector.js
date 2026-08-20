const { normalizeDomain } = require('./keywords');

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function rootDomain(host) {
  const parts = host.split('.');
  return parts.slice(-2).join('.');
}

const COUPON_HINTS = /coupon|promo|deal|discount|voucher|offer|savings|raise|rebate|reward|honey|retailmenot|wikibuy|couponcause|goodshop|goodsearch|reecoupons|spendmenot|joinhoney|promocodes|discountreactor|clothingric|extrabux|fanli|creaders|scancoupons/i;

const SOCIAL_BLOCK = new Set([
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
  'linkedin.com', 'pinterest.com', 'reddit.com', 'quora.com', 'trustpilot.com',
  'trustpilot.co.uk', 'yelp.com', 'glassdoor.com', 'en.wikipedia.org', 'wikipedia.org',
  'github.com', 'amazon.com', 'ebay.com', 'medium.com', 'archive.org'
]);

function classifySite(host, brandDomain) {
  if (brandDomain && host === normalizeDomain(brandDomain)) return 'store';
  if (host.startsWith('forum.') || host.includes('forum')) return 'blocked';
  const root = rootDomain(host);
  if (SOCIAL_BLOCK.has(root) || SOCIAL_BLOCK.has(host)) return 'blocked';
  if (COUPON_HINTS.test(root + '.' + host)) return 'coupon-site';
  return 'other';
}

function siteLabel(url) {
  const host = hostnameOf(url);
  const parts = host.split('.');
  const name = parts.length >= 2 ? parts.slice(0, -1).join(' ') : host;
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function brandTokens(brandName, domain) {
  const raw = String(normalizeDomain(domain) || '').toLowerCase();
  const name = String(brandName || '').toLowerCase();
  const base = raw.replace(/^www\./, '').replace(/\.(com|co\.uk|co|net|org|io|info|biz|us|uk|ca|au|de|fr)(\/.*)?$/, '');
  const plain = base.replace(/[^a-z0-9]+/g, '');
  const hyphen = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const compact = raw.replace(/[^a-z0-9]+/g, '');
  const namePlain = name.replace(/[^a-z0-9]+/g, '');
  const nameHyphen = name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const tokens = [...new Set([raw, base, plain, hyphen, compact, namePlain, nameHyphen].filter(t => t && t.length >= 3))];
  return tokens;
}

function collectSites(searchResults, brandDomain, brandName = '') {
  const sitesByRegion = {};
  const tokens = brandTokens(brandName, brandDomain);

  const matchesBrand = url => {
    const u = String(url || '').toLowerCase();
    return tokens.some(t => u.includes(t));
  };

  for (const res of searchResults) {
    if (!res || res.blocked) continue;
    const region = res.region;
    if (!sitesByRegion[region]) sitesByRegion[region] = new Map();

    for (const r of res.results) {
      if (!r.url) continue;
      const host = hostnameOf(r.url);
      if (!host) continue;
      const key = host;
      if (!sitesByRegion[region].has(key)) {
        sitesByRegion[region].set(key, {
          host,
          root: rootDomain(host),
          name: siteLabel(r.url),
          url: r.url,
          kind: classifySite(host, brandDomain),
          brandMatch: false,
          engines: new Set(),
          queries: [],
          hits: 0,
          ranks: []
        });
      }
      const site = sitesByRegion[region].get(key);
      if (matchesBrand(r.url) && !site.brandMatch) {
        site.brandMatch = true;
        site.url = r.url;
      }
      site.queries.push(res.keyword);
      site.engines.add(res.engine || 'google');
      site.hits += 1;
      site.ranks.push(r.rank);
    }
  }

  const out = {};
  for (const [region, map] of Object.entries(sitesByRegion)) {
    out[region] = [...map.values()]
      .map(s => ({ ...s, engines: [...s.engines], queries: [...new Set(s.queries)], ranks: [...new Set(s.ranks)].sort((a, b) => a - b) }))
      .sort((a, b) => b.brandMatch - a.brandMatch || b.hits - a.hits || a.ranks[0] - b.ranks[0]);
  }
  return out;
}

module.exports = { collectSites, classifySite, hostnameOf, siteLabel, brandTokens };