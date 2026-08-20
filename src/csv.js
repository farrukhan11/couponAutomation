const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isLockError = err => {
  const code = err && err.code;
  const msg = String((err && err.message) || '');
  return code === 'EBUSY' || code === 'EPERM' || /EBUSY|resource busy|being used by another process/i.test(msg);
};

async function writeWorkbook({ brand, rows, searchRows, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const slug = slugify(brand || 'brand');
  const wb = new ExcelJS.Workbook();

  const wsSearch = wb.addWorksheet('Search Results');
  wsSearch.columns = [
    { header: 'region', key: 'region', width: 6 },
    { header: 'page', key: 'page', width: 6 },
    { header: 'rank', key: 'rank', width: 6 },
    { header: 'keyword', key: 'keyword', width: 34 },
    { header: 'engine', key: 'engine', width: 8 },
    { header: 'title', key: 'title', width: 55 },
    { header: 'url', key: 'url', width: 70 },
    { header: 'host', key: 'host', width: 32 },
    { header: 'kind', key: 'kind', width: 12 },
    { header: 'brand_match', key: 'brand_match', width: 12 },
    { header: 'snippet', key: 'snippet', width: 60 }
  ];
  wsSearch.getRow(1).font = { bold: true };
  wsSearch.addRows(searchRows || []);

  const wsCodes = wb.addWorksheet('Coupon Codes');
  wsCodes.columns = COLUMNS.map(c => ({ header: c, key: c, width: 24 }));
  wsCodes.getRow(1).font = { bold: true };
  const codeRows = (rows || []).map(r => COLUMNS.reduce((o, c) => { o[c] = r[c] === undefined ? '' : r[c]; return o; }, {}));
  wsCodes.addRows(codeRows);

  const filePath = path.join(outDir, `${slug}_results.xlsx`);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await wb.xlsx.writeFile(filePath);
      return filePath;
    } catch (err) {
      lastErr = err;
      if (isLockError(err) && attempt < 2) {
        await sleep(2000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = { COLUMNS, toCsv, discountType, writeCsvFiles, writeWorkbook, slugify };