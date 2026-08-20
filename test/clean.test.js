const { test } = require('node:test');
const assert = require('node:assert');
const { isLikelyCode } = require('../src/clean');

const GOOD = [
  'ADBUW', 'ADBUO', 'ADBUI', 'ADBUU', 'ADBUT', 'ADBUY', 'ADBUE', 'ADBUR', 'ADBUP', 'ADBUQ',
  'ADBYV', 'ADBYB', 'ADBYN', 'ADBYM', 'ADBYZ', 'ADBYC', 'ADBYX', 'ADBYL', 'ADBYK',
  'SERVICE15', 'WELCOME', 'WRS10', 'BROWSE10', 'WELCOME5', 'FLAG', 'SHIPFREE', 'SAVE10',
  'MILITARY10', 'SUMMER15', 'VALENTINE15', 'STPATRICK15', 'MILITARYDISCOUNT', 'MILITARYDISCOUNTS',
  '10OFFA', '20MEMORIAL', 'BLACK20', 'CYBER20', 'MEMORIAL13', 'DEAL15', 'COLUMBUSDAY', 'EASTER15',
  'SALE50', 'FATHERS10', 'BLACKFRI1', 'FALL10', 'MEMORIAL', 'DEAL10', 'MEMORIAL10', 'LABOR50',
  'BLACKFRIDAY13', 'FALL2015', 'FALL2015A', '10VET', 'COLUMBUS', '10MILITARY', 'HOLIDAY2014',
  'BLACKFRI', '99FAB', 'WELCOME20', 'PROMOGRILL', 'SPRING2016', 'NEW2014', 'MARCH12',
  'HOLIDAY2019', 'SPRING2019', 'HOLIDAYS2012', 'JULY4', 'SAINTPATRICK', 'SHARE6', 'SHARE10',
  '10FACE', 'SAVE20NOW', 'TRY15'
];

const BAD = [
  'FORAUG2026', '47CURRENT', '58EXPIRED', '81INTERESTEDUSERS', '61INTERESTEDUSERS',
  '41INTERESTEDUSERS', '1INTERESTEDUSERS', 'TRUSTEDPARTNERSINCE2017', 'GETDEAL', 'SEELESS',
  'SEEMORE', '1-800CONTACTSPROMOCODES', '103PROMOCODES', 'SEE4CODEVERIFICATIONS',
  'DEALSCOUT59701MONTHAGO', 'DEALSCOUT5970', 'BILLYYOU1MONTHAGO', 'SEE1CODEVERIFICATION',
  'ANONIMOUSVE7DAYSAGO', 'JOSETHEIS9MONTHSAGO', 'HEIBK20110MONTHSAGO', 'HEIBK201',
  'SEEDETAILS', 'BISSELL59CODES', 'DHGATE51CODES', 'ATHOME32CODES', 'SHOPJURA28CODES',
  'DYSONUS21CODES', 'ECOFLOW21CODES', '5VERIFIED', 'RULE01', 'RULE02', 'NAVBAR', 'SUBMITCOUPON',
  'POPULAR', 'REVIEWS', 'FLAGSCONNECTIONS', 'CODECHECKOUTCONFIRMED', 'CHECKOUTCONFIRMED', 'SOON',
  '1RECORDEDCONFIRMATION', 'PREMIUMCRAFTSMANSHIP', 'DISPLAY', 'READMORE', 'ACTIVATEDEAL',
  'PREMIUMQUALITY', 'TIMELESSDISPLAY', 'INTEREST-FREE', 'FLEXIBLEPAYMENTS', 'STOREWIDEOFFER',
  'LIMITEDTIME', 'STOREWIDEDEAL', 'INTEREST-FREEFINANCING', 'FINANCING', 'FLEXIBLE', 'AMAZON',
  'FREESHIPPING', '5STORES', '0PRODUCTS', '24STATIONCOUPONCODES', 'PEAK11', '30DAYS', '90DAYS',
  '365DAYS', 'MOTEL6', 'VIEWALLMOTEL6COUPONCODES', 'T2VAPE', 'VIEWALLT2VAPECOUPONCODES',
  'SPORTSEVENTS365', 'PHARMACY2U', 'JUN20TH', 'JUN11TH', 'SEP9TH', 'JUN17TH', '3DPRINTERS',
  '3DPRINTING', '3DPRINTINGSUPPLIES', '6HOURSAGO', 'SHOW', 'COPY', 'REVEAL', 'GETCODE',
  'SHOWCODE', 'SAVE', 'OFF', 'DEAL', 'COUPON', 'CHECKOUT', 'SAVINGS', 'USED', 'VALID',
  'SENDTOMYEMAIL', 'DETAILSGETOFFER', 'PAYS-2-SHARE', '0SHARES', 'ALLOFFERS12',
  'COUPONCODES2', 'PROMOTIONS3', 'PRINTABLES1', 'COMMENTS1', 'COMMENTS0', '0ITEMS',
  'WITHIN24HOURS', 'PROOFSHOT', 'SAVENOW', '1STAR', '5STARS', 'LAST', 'UNDEFINED',
  '17REVIEWS', 'READALL17REVIEWS', 'UPDATED7AUG2026', 'ALL2CODES1DEALS1', 'FACEB00KTWITTER',
  'ALL2', 'CODES1', 'DEALS1', '4TIMESUSED-0TODAY', 'EXPIRES27JULY2032', 'EXPIRES2JUNE2032',
  '10OCTOBER2026', '24AUGUST2026', '29DECEMBER2026', '08SEPTEMBER2026', 'SilverElite5336',
  'FrugalElite775', 'CouponAce2971', 'MightyLegend6657', 'NONE',
  '32000LUMENS', '08-11', '30-90', 'SINGAPORE-199588',
  'LIFETIME', 'ONETIME', 'MONTHLY', 'RECURRING', '2YEARS', '15-DAY', '5-YEAR', '24-HOUR',
  '2026-08-20', '2006-2026', '2000S', '256-BIT', '20TH', '91-7997443334',
  '10GBPSFASTSERVERS', '15MULTILOGINS', 'P2PALLOWED', 'NOCODENEEDED', 'NOCUPONREQUIRED', '3SIMILARDISCOUNTS',
  'LOCALIZATION', '1DAYLEFT', '2DAYSLEFT', '18USESTODAY', '7OFFERSVALIDATED',
  '1-800-530-9133', '800-555-0199'
];

test('all known-good coupon codes pass isLikelyCode', () => {
  const rejected = GOOD.filter(c => !isLikelyCode(c));
  assert.deepStrictEqual(rejected, [], `good codes wrongly rejected: ${rejected.join(', ')}`);
});

test('all known-bad noise tokens are rejected', () => {
  const accepted = BAD.filter(c => isLikelyCode(c));
  assert.deepStrictEqual(accepted, [], `bad tokens wrongly accepted: ${accepted.join(', ')}`);
});

test('isLikelyCode rejects malformed inputs', () => {
  assert.strictEqual(isLikelyCode(''), false);
  assert.strictEqual(isLikelyCode('AB'), false);
  assert.strictEqual(isLikelyCode('12345678901234567890'), false, 'too long');
  assert.strictEqual(isLikelyCode('123456'), false, 'all digits');
  assert.strictEqual(isLikelyCode('SAVE%OFF'), false, 'invalid chars');
  assert.strictEqual(isLikelyCode('THIS IS A VERY LONG CODE 12345'), false, 'too long after normalize');
});

test('isLikelyCode rejects multi-hyphen phone numbers and UI counters', () => {
  for (const c of ['1-800-530-9133', '800-555-0199', '1-866-266-7442']) {
    assert.strictEqual(isLikelyCode(c), false, `should reject phone ${c}`);
  }
  for (const c of ['1DAYLEFT', '2DAYSLEFT', '18USESTODAY', '7OFFERSVALIDATED', 'LOCALIZATION']) {
    assert.strictEqual(isLikelyCode(c), false, `should reject UI label ${c}`);
  }
});

test('isLikelyCode rejects brand-name tokens when provided', () => {
  const tokens = ['monumentgrills.com', 'monumentgrills', 'monument', 'grills'];
  assert.strictEqual(isLikelyCode('MONUMENT', tokens), false, 'exact brand word');
  assert.strictEqual(isLikelyCode('Monument5', tokens), false, 'brand word + digits');
  assert.strictEqual(isLikelyCode('GRILLS', tokens), false, 'exact brand word');
  assert.strictEqual(isLikelyCode('MONUMENTGRILLS', tokens), false, 'compact brand name');
  assert.strictEqual(isLikelyCode('MGC10', tokens), true, 'real code must survive');
  assert.strictEqual(isLikelyCode('MGRILLS10', tokens), true, 'real code must survive');
  assert.strictEqual(isLikelyCode('WELCOME10', tokens), true, 'real code must survive');
  assert.strictEqual(isLikelyCode('WELCOME10'), true, 'no tokens = unchanged behavior');
});