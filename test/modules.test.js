const { test } = require('node:test');
const assert = require('node:assert');

const SAFE_MODULES = ['keywords', 'collector', 'csv', 'search', 'scraper', 'browser', 'snapshot', 'ollama'];

for (const mod of SAFE_MODULES) {
  test(`module src/${mod}.js loads without throwing`, () => {
    assert.doesNotThrow(() => {
      require(`../src/${mod}`);
    });
  });
}

test('keywords generates variation 3 = {name} coupon code {year}', () => {
  const { generateKeywords } = require('../src/keywords');
  const keywords = generateKeywords('Flags Connections', 'flagsconnections.com');
  const year = new Date().getFullYear();
  assert.ok(keywords.includes(`Flags Connections coupon code ${year}`), 'variation 3 missing');
  assert.ok(keywords.includes('Flags Connections coupon code'), 'base coupon code missing');
  assert.ok(keywords.includes('Flags Connections promo code'), 'promo code missing');
  assert.ok(keywords.includes('Flags Connections working coupon code'), 'working coupon code missing');
});