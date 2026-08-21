function buildRejectSet(brandTokens) {
  const arr = Array.isArray(brandTokens) ? brandTokens : [];
  return [...new Set(
    arr
      .map(t => String(t || '').trim().toUpperCase())
      .filter(t => t.length >= 3)
  )];
}

// Self-contained on purpose: this function is stringified and re-created inside
// page.evaluate (see scraper.js). It must NOT reference any outer-scope variable.
function makeCodeOk(rejectArr) {
  const rejectSet = new Set(Array.isArray(rejectArr) ? rejectArr : []);

  const NOISE_SET = new Set([
    'APPLY', 'COUPON', 'PROMO', 'PROMOCODE', 'CODE', 'COPY', 'SHOW', 'HIDE', 'MORE', 'LESS',
    'SAVE', 'OFF', 'LOGIN', 'SIGN', 'SIGNUP', 'REGISTER', 'EMAIL', 'PASSWORD', 'ADDRESS',
    'SUBSCRIBE', 'NEWSLETTER', 'SEARCH', 'CLOSE', 'MENU', 'CART', 'ORDER', 'PHONE', 'NAME',
    'CITY', 'STATE', 'ZIP', 'COUNTRY', 'CARD', 'PAY', 'CHECKOUT', 'BUY', 'SHOP', 'GIFT',
    'CUSTOM', 'SUPPORT', 'HELP', 'ABOUT', 'CONTACT', 'PRIVACY', 'TERMS', 'POLICY', 'DETAILS',
    'ALL', 'TOP', 'NEW', 'SALE', 'SOLD', 'OUT', 'STOCK', 'BACK', 'PRINT', 'FAVORITE',
    'WISHLIST', 'REVIEW', 'RATE', 'RETURN', 'SHIPPING', 'TRACK', 'VIEW', 'EXPLORE', 'OFFER',
    'DEAL', 'TODAY', 'SAVINGS', 'DISCOUNT', 'VOUCHER', 'EXPIRES', 'VALID', 'USES', 'USED',
    'SHOPNOW', 'CHECKIT', 'GO', 'GETIT', 'CLICK', 'REVEAL', 'UNLOCK', 'SEE', 'GET',
    'GETCODE', 'SHOWCODE', 'VIEWCODE', 'SEECODE', 'COPYCODE', 'USECODE', 'APPLYCODE',
    'NEWCODE', 'HOTCODE', 'MYCODE', 'CODEGO', 'CLICKDEAL', 'BESTDEAL', 'TODAYDEAL',
    'HOTDEAL', 'MEGADEAL', 'TOPDEAL', 'NEWDEAL', 'CHEAP', 'GIFTCODE', 'PROMOCODE1',
    'PROMOCODE2', 'OFFERCODE', 'WYBOT', 'TWOPAGESCURTAINS', 'NEWSLETTER', 'SIGNIN',
    'LOGINNOW', 'JOINNOW', 'REGISTER', 'CREATEACCOUNT', 'TERMS', 'SHIPPINGINFO',
    'TRUE', 'FALSE', 'CUSTOMER', 'ONLY', 'SHOPPERSVOTED', 'CODESFOUND',
    'MARKETINGCALENDAR', 'SUBMITACOUPON', 'ALWAYSFREE', 'DESIGN2PLEASE',
    'LEARNING247', 'FURNITURE123', 'AIREA51TRAMPOLINE', 'VOTES', 'DEALS',
    'COUPONS', 'OFFERS', 'NONE', 'LOCALIZATION',
    'LIST', 'LEFT', 'MAPBOX', 'VIEWOFFER'
  ]);
  const CODE_RE = /^[a-z0-9][a-z0-9\-]{3,23}$/i;
  const DATE_RE = /^(?:\d{1,2})?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\d{4}$/i;
  const HEX_HASH_RE = /^[0-9a-f]{8,}$/i;
  const MONTHDAY_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|july)\d{1,2}(st|nd|rd|th)$/i;
  const DIGIT_PLURAL_RE = /^\d+(shares|items|offers?|comments|stars?|views)$/i;
  const LABEL_COUNT_RE = /^(all|codes|deals|coupons)\d+$/i;
  const USERNAME_RE = /^[A-Z][a-z]+[A-Z][a-zA-Z]*\d{3,}$/;
  const RANGE_RE = /^\d{1,3}-\d{1,3}$/;
  const NOISE_WORD_RE = /^(lifetime|onetime|monthly|recurring|referral)$/i;
  const DURATION_RE = /^\d+[- ]?(day|month|year|hour)s?$/i;
  const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const YEAR_RANGE_RE = /^\d{4}-\d{4}$/;
  const YEAR_DECADE_RE = /^\d{4}s$/i;
  const ORDINAL_RE = /^\d+th$/i;
  const BIT_RE = /^\d+-bit$/i;
  const PHONE_RE = /^\d{2,3}-\d{7,}$/;
  const TOLLFREE_RE = /^1-\d{3}-?[A-Za-z]|^8\d{2}-?[A-Za-z]/;
  const PHONE_MULTI_RE = /^(?:\d{1,4}-){2,}\d{1,4}$/;
  const UI_COUNTER_RE = /^\d+(days?left|usestoday|offersvalidated)$/i;
  const WELCOME_SUFFIX_RE = /^welcome\d+[a-z0-9]{6,}$/i;
  const SUBSTR_BLOCK = /(interestedusers|current|expired|verified|verification|recorded|confirmation|checkout|interested|ago$|partnersince|trusted|vape|printing|printer|product|stores?|days$|shipping|codes?$|scout|undefined|items|comments|alloffers|offers?\d|couponcodes|promotions?|printables|proofshot|within24|savenow|getoffer|sendto|myemail|paystoshare|reviews|readall|updated|facebook|twitter|timesused|expires|codes\d|deals\d|lumens|watts?|battery|batteries|usb|mah|ampere|voltage|singapore|servers?|logins?|allowed|needed|required|similar|personused|peopleused)/i;
  const START_WORD_BLOCK = /^(seeless|seemore|readmore|getdeal|getcode|showcode|viewcode|seecode|submit|submitcoupon|navbar|activate|display|soon|storewide|limitedtime|flexible|financing|interestfree|timeless|premium|craftsmanship|flagsconnections|flags-connections|peak|motel|amazon|bissell|dhgate|athome|shopjura|dyson|ecoflow|pharmacy|sports|contact|viewall|periodic|popular|reviews|rule|heibk|interest)/i;

  const brandRejected = (m, base) => {
    const upper = m.toUpperCase();
    const baseUpper = base.toUpperCase();
    if (rejectSet.has(upper) || rejectSet.has(baseUpper)) return true;
    for (const tok of rejectSet) {
      if (upper.startsWith(tok) && /^\d{1,4}$/.test(upper.slice(tok.length))) return true;
    }
    return false;
  };

  return function codeOk(rawCode) {
    const s = String(rawCode || '').trim().replace(/\s+/g, '');
    const base = s.replace(/^\d+/, '');
    if (!s || s.length < 4 || s.length > 17 || !CODE_RE.test(s)) return false;
    if (NOISE_SET.has(s.toUpperCase()) || NOISE_SET.has(base.toUpperCase())) return false;
    if (/^\d+$/.test(s)) return false;
    if (DATE_RE.test(s)) return false;
    if (HEX_HASH_RE.test(s)) return false;
    if (/^(used|lastused)\d/i.test(s)) return false;
    if (/(deals|coupons|offers)$/i.test(s)) return false;
    if (/show|reveal|unlock|copy|click|tap/i.test(s)) return false;
    if (SUBSTR_BLOCK.test(s)) return false;
    if (DIGIT_PLURAL_RE.test(s)) return false;
    if (LABEL_COUNT_RE.test(s)) return false;
    if (USERNAME_RE.test(s)) return false;
    if (RANGE_RE.test(s)) return false;
    if (NOISE_WORD_RE.test(s)) return false;
    if (DURATION_RE.test(s)) return false;
    if (DATE_ISO_RE.test(s) || YEAR_RANGE_RE.test(s) || YEAR_DECADE_RE.test(s) || ORDINAL_RE.test(s) || BIT_RE.test(s) || PHONE_RE.test(s)) return false;
    if (TOLLFREE_RE.test(s) || PHONE_MULTI_RE.test(s) || UI_COUNTER_RE.test(s)) return false;
    if (WELCOME_SUFFIX_RE.test(s)) return false;
    if (/share$/i.test(s)) return false;
    if (/^(last|undefined)$/i.test(s)) return false;
    if (/^for/i.test(s)) return false;
    if (/^see[a-z0-9]/i.test(s)) return false;
    if (START_WORD_BLOCK.test(s)) return false;
    if (MONTHDAY_RE.test(s)) return false;
    if (brandRejected(s, base)) return false;
    return true;
  };
}

const filterCache = new Map();

function cachedCodeOk(brandTokens) {
  const reject = buildRejectSet(brandTokens);
  const key = reject.join('\u0000');
  let ok = filterCache.get(key);
  if (!ok) {
    ok = makeCodeOk(reject);
    filterCache.set(key, ok);
  }
  return ok;
}

function isLikelyCode(code, brandTokens = []) {
  return cachedCodeOk(brandTokens)(code);
}

module.exports = { isLikelyCode, makeCodeOk, buildRejectSet };
