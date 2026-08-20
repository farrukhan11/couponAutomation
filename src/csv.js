const fs = require('fs');
const path = require('path');

const COLUMNS = [
  'brand',
  'region',
  'query',
  'site_name',
  'site_url',
  'coupon_code',
  'offer',
  'discount_type',
  'verified',
  'last_verified',
  'expiry',
  'unmask_method',
  'relevance',
  'site_brand',
  'engine',
  'discovered_at'
];

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function csvEscape(value) {
  const s = String(value === null || value === undefined ? '' : value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  const header = COLUMNS.join(',');
  const lines = rows.map(row => COLUMNS.map(c => csvEscape(row[c])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

function discountType(offer) {
  const o = String(offer || '');
  if (/%|percent/i.test(o)) return 'percent';
  if (/[$£€]/.test(o)) return 'amount';
  return 'unknown';
}

function writeFileWithRetry(filePath, content) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  let lastErr = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return;
    } catch (err) {
      lastErr = err;
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        Atomics.wait(sab, 0, 0, 2000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function writeCsvFiles({ brand, rows, outDir, discoveredAt }) {
  fs.mkdirSync(outDir, { recursive: true });
  const slug = slugify(brand || 'brand');

  const combinedPath = path.join(outDir, `${slug}_coupons.csv`);
  writeFileWithRetry(combinedPath, toCsv(rows));

  const written = [combinedPath];
  const regions = [...new Set(rows.map(r => r.region))].sort();
  for (const region of regions) {
    const regionRows = rows.filter(r => r.region === region);
    const regionPath = path.join(outDir, `${slug}_${region.toUpperCase()}.csv`);
    writeFileWithRetry(regionPath, toCsv(regionRows));
    written.push(regionPath);
  }

  return written;
}

module.exports = { COLUMNS, toCsv, discountType, writeCsvFiles, slugify };