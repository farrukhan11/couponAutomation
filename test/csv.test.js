const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { toCsv, discountType, writeWorkbook } = require('../src/csv');

const FIXTURE = path.join(__dirname, 'fixtures', 'flags_connections_coupons.csv');

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const cells = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      return cells;
    });
}

test('fixture CSV exists and has data', () => {
  assert.ok(fs.existsSync(FIXTURE), 'fixture file missing');
  const rows = parseCsv(fs.readFileSync(FIXTURE, 'utf8'));
  const header = rows[0];
  for (const col of ['brand', 'region', 'site_name', 'site_url', 'coupon_code', 'offer', 'relevance', 'engine', 'discovered_at']) {
    assert.ok(header.includes(col), `header missing column: ${col}`);
  }
  assert.ok(rows.length > 200, `expected >200 data rows, got ${rows.length - 1}`);
});

test('fixture rows have required fields populated', () => {
  const lines = fs.readFileSync(FIXTURE, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  const rows = lines.slice(1).map(l => {
    const cells = parseCsv(l)[0];
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
  const emptyBrand = rows.filter(r => !r.brand).length;
  const emptyRegion = rows.filter(r => !r.region).length;
  const emptyCode = rows.filter(r => !r.coupon_code).length;
  assert.strictEqual(emptyBrand, 0, `${emptyBrand} rows missing brand`);
  assert.strictEqual(emptyRegion, 0, `${emptyRegion} rows missing region`);
  assert.strictEqual(emptyCode, 0, `${emptyCode} rows missing coupon_code`);
  const regions = new Set(rows.map(r => r.region));
  assert.deepStrictEqual([...regions].sort(), ['UK', 'US']);
});

test('toCsv round-trips header and escaping', () => {
  const rows = [
    { brand: 'Flags, Connections', region: 'US', coupon_code: 'SAVE10' },
    { brand: 'x', region: 'UK', coupon_code: 'A"B' }
  ];
  const csv = toCsv(rows);
  const lines = csv.split('\r\n');
  assert.ok(lines[0].startsWith('brand,region'));
  assert.ok(lines.some(l => l.includes('"Flags, Connections"')));
  assert.ok(lines.some(l => l.includes('"A""B"')));
});

test('discountType classifies offers', () => {
  assert.strictEqual(discountType('10% off'), 'percent');
  assert.strictEqual(discountType('Save 20%'), 'percent');
  assert.strictEqual(discountType('$5 off'), 'amount');
  assert.strictEqual(discountType('£3 discount'), 'amount');
  assert.strictEqual(discountType('free shipping'), 'unknown');
});

test('writeWorkbook writes both sheets with data', async () => {
  const ExcelJS = require('exceljs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coupon-wb-'));
  try {
    const rows = [
      { brand: 'Test', region: 'US', query: 'q', site_name: 's', site_url: 'u', coupon_code: 'CODE10', offer: '10% off', discount_type: 'percent', verified: '', last_verified: '', expiry: '', unmask_method: 'html', relevance: 'brand', site_brand: 'yes', engine: 'google', discovered_at: '2026-01-01' },
      { brand: 'Test', region: 'US', query: 'q', site_name: 's', site_url: 'u', coupon_code: 'SAVE20', offer: '', discount_type: 'unknown', verified: '', last_verified: '', expiry: '', unmask_method: 'none', relevance: 'unrelated', site_brand: '', engine: 'google', discovered_at: '2026-01-01' }
    ];
    const searchRows = [
      { region: 'US', page: 1, rank: 1, keyword: 'k', engine: 'google', title: 't', url: 'http://u', host: 'u.com', kind: 'coupon-site', brand_match: 'yes', snippet: 's' }
    ];
    const file = await writeWorkbook({ brand: 'Wb Test', rows, searchRows, outDir: tmpDir });
    assert.ok(fs.existsSync(file), 'workbook file missing');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const wsSearch = wb.getWorksheet('Search Results');
    const wsCodes = wb.getWorksheet('Coupon Codes');
    assert.ok(wsSearch, 'Search Results sheet missing');
    assert.ok(wsCodes, 'Coupon Codes sheet missing');
    assert.strictEqual(wsSearch.rowCount, 2, `search sheet: expected header+1 rows, got ${wsSearch.rowCount}`);
    assert.strictEqual(wsCodes.rowCount, 3, `codes sheet: expected header+2 rows, got ${wsCodes.rowCount}`);
    assert.strictEqual(wsCodes.getRow(2).getCell(6).value, 'CODE10', 'coupon_code cell (row 2) missing');
    assert.strictEqual(wsCodes.getRow(3).getCell(6).value, 'SAVE20', 'coupon_code cell (row 3) missing');
    assert.strictEqual(wsSearch.getRow(2).getCell(4).value, 'k', 'keyword cell missing');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});