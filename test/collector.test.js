const { test } = require('node:test');
const assert = require('node:assert');
const { brandTokens, collectSites } = require('../src/collector');

test('brandTokens for flagsconnections.com includes all slug forms', () => {
  const tokens = brandTokens('Flags Connections', 'flagsconnections.com');
  for (const expected of ['flagsconnections', 'flags-connections', 'flagsconnections.com', 'flagsconnectionscom']) {
    assert.ok(tokens.includes(expected), `missing token: ${expected}`);
  }
});

test('brandTokens for hyphenated domain keeps hyphenated + compact forms', () => {
  const tokens = brandTokens('My Store', 'my-store.com');
  for (const expected of ['my-store', 'mystore']) {
    assert.ok(tokens.includes(expected), `missing token: ${expected}`);
  }
});

test('brandTokens drops very short tokens', () => {
  const tokens = brandTokens('X', 'x.com');
  assert.ok(tokens.every(t => t.length >= 3), `short token slipped through: ${tokens.join(',')}`);
});

test('collectSites flags brand-matched site when URL contains brand slug', () => {
  const results = [{
    keyword: 'Flags Connections coupon code 2026',
    region: 'us',
    engine: 'ddg',
    blocked: false,
    results: [
      { rank: 1, title: 'DealDrop', url: 'https://www.dealdrop.com/flags-connections', snippet: '' },
      { rank: 2, title: 'CouponSolver', url: 'https://www.couponsolver.com/promo-codes/flagsconnections.com', snippet: '' }
    ]
  }];
  const sites = collectSites(results, 'flagsconnections.com', 'Flags Connections');
  assert.ok(sites.us.length === 2, `expected 2 sites, got ${sites.us.length}`);
  assert.ok(sites.us.every(s => s.brandMatch), 'all URLs contain a brand slug; brandMatch should be true');
});

test('collectSites does NOT brand-match unrelated host', () => {
  const results = [{
    keyword: 'k',
    region: 'uk',
    engine: 'ddg',
    blocked: false,
    results: [
      { rank: 1, title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Flag', snippet: '' }
    ]
  }];
  const sites = collectSites(results, 'flagsconnections.com', 'Flags Connections');
  assert.strictEqual(sites.uk[0].brandMatch, false);
  assert.strictEqual(sites.uk[0].kind, 'blocked');
});

test('collectSites keeps all results without hostname deduplication', () => {
  const results = [
    { keyword: 'k1', region: 'us', engine: 'ddg', blocked: false, results: [{ rank: 1, title: 'a', url: 'https://www.dealdrop.com/x', snippet: '' }] },
    { keyword: 'k2', region: 'us', engine: 'google', blocked: false, results: [{ rank: 3, title: 'a', url: 'https://dealdrop.com/y', snippet: '' }] }
  ];
  const sites = collectSites(results, 'flagsconnections.com', 'Flags Connections');
  // Same host (dealdrop.com) appears twice with different keywords/ranks -> both kept
  assert.strictEqual(sites.us.length, 2);
  assert.strictEqual(sites.us[0].rank, 1);
  assert.strictEqual(sites.us[1].rank, 3);
  assert.strictEqual(sites.us[0].engine, 'ddg');
  assert.strictEqual(sites.us[1].engine, 'google');
});