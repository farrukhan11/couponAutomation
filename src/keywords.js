function normalizeDomain(domain) {
  return String(domain || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .trim();
}

function domainToName(domain) {
  const bare = normalizeDomain(domain);
  const parts = bare.split('.');
  if (parts.length > 2 && parts[0] !== 'www') return parts[0];
  return parts[0] || bare;
}

function generateKeywords(brand, domain) {
  const names = [];
  if (brand && brand.trim()) names.push(brand.trim());
  if (domain) {
    const bare = domainToName(domain);
    if (bare && !names.includes(bare)) names.push(bare);
    const noUnderscore = bare.replace(/[-_]/g, ' ');
    if (noUnderscore && !names.includes(noUnderscore)) names.push(noUnderscore);
  }
  const uniqueNames = [...new Set(names.map(n => n.replace(/\s+/g, ' ').trim()))];

  const year = new Date().getFullYear();
  const patterns = [
    n => `${n} coupon code`,
    n => `coupon code ${n}`,
    n => `${n} coupon code ${year}`,
    n => `${n} working coupon code`,
    n => `${n} promo code`,
    n => `${n} discount code`,
    n => `${n} coupon`
  ];

  const keywords = [];
  for (const name of uniqueNames) {
    for (const pattern of patterns) {
      keywords.push(pattern(name));
    }
  }

  if (domain) {
    const bare = domainToName(domain);
    keywords.push(`${bare} coupon code`);
    keywords.push(`${bare} promo code`);
  }

  return [...new Set(keywords.map(k => k.replace(/\s+/g, ' ').trim()))];
}

module.exports = { generateKeywords, normalizeDomain, domainToName };