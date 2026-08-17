const { chooseElement } = require('./ollama');
const {
  getVisibleInteractiveSnapshot,
  clickAgentElement,
  fillAgentElement
} = require('./snapshot');
const { waitForPageSettle } = require('./browser');

async function aiFind(page, task, extra = '') {
  const snapshot = await getVisibleInteractiveSnapshot(page);
  const decision = await chooseElement(task, snapshot, extra);
  console.log(`[AI] ${task}:`, decision);
  return { snapshot, decision };
}

async function aiClick(page, task, extra = '') {
  const { decision } = await aiFind(page, task, extra);
  if (!decision.found || !decision.elementId) return false;
  await clickAgentElement(page, decision.elementId);
  await waitForPageSettle(page);
  return true;
}

async function findCouponField(page) {
  return aiFind(
    page,
    'Find the visible input where a shopper can enter a coupon, promo, discount, voucher, or offer code. Do not choose email/search fields.'
  );
}

async function tryCouponAtCurrentStep(page, couponCode, locationName) {
  console.log(`\n[STATE] CHECK_COUPON_FIELD @ ${locationName}`);
  const { decision } = await findCouponField(page);
  if (!decision.found || !decision.elementId) {
    console.log(`[FLOW] No coupon field visible at ${locationName}`);
    return { found: false };
  }

  await fillAgentElement(page, decision.elementId, couponCode);

  const apply = await aiFind(
    page,
    'Find the visible button that applies/submits the coupon or promo code currently entered. Prefer Apply, Redeem, Add, Submit, or similar coupon action.'
  );

  if (!apply.decision.found || !apply.decision.elementId) {
    console.log('[FLOW] Coupon field found but apply button not found.');
    return { found: true, applied: false, location: locationName };
  }

  await clickAgentElement(page, apply.decision.elementId);
  await page.waitForTimeout(2500);

  return {
    found: true,
    applied: true,
    location: locationName,
    message: await collectLikelyCouponMessages(page)
  };
}

async function collectLikelyCouponMessages(page) {
  return page.evaluate(() => {
    const keywords = /coupon|promo|discount|code|invalid|expired|applied|eligible|minimum|cannot|can't|success|saving|off/i;
    return [...document.querySelectorAll('body *')]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const text = (el.innerText || '').trim();
        return rect.width > 1 && rect.height > 1 && text && text.length < 240 && keywords.test(text);
      })
      .map(el => (el.innerText || '').trim().replace(/\s+/g, ' '))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 20);
  });
}

async function runCouponFlow(page, { storeUrl, couponCode }) {
  console.log('\n[STATE] OPEN_STORE');
  await page.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForPageSettle(page);

  console.log('\n[STATE] FIND_PRODUCT');
  const productOpened = await aiClick(
    page,
    'Choose one visible, normal, in-stock product link/card to open for a coupon test. Avoid navigation categories, support pages, subscriptions, gift cards, bundles requiring complex configuration, and sold-out products.'
  );
  if (!productOpened) throw new Error('AI could not identify a product to open.');

  console.log('\n[STATE] ADD_TO_CART');
  let added = await aiClick(
    page,
    'Find the main visible Add to Cart / Add to Bag / Buy button for the current product.'
  );

  if (!added) {
    console.log('[FLOW] Add to cart not immediately available. Trying a required variant/option first.');
    const variantChosen = await aiClick(
      page,
      'Find one required visible product option/variant such as size, color, pack, or configuration that must be selected before Add to Cart. Choose a normal available option.'
    );
    if (variantChosen) {
      added = await aiClick(
        page,
        'Find the main visible Add to Cart / Add to Bag / Buy button for the current product.'
      );
    }
  }
  if (!added) throw new Error('Could not add product to cart.');

  // Some stores open a cart drawer automatically. Check it first.
  let result = await tryCouponAtCurrentStep(page, couponCode, 'cart/drawer');
  if (result.found) return result;

  console.log('\n[STATE] OPEN_CART');
  await aiClick(
    page,
    'Find the visible cart/bag/basket control that opens the shopping cart. It may be an icon, link, View Cart button, or cart drawer action.'
  );

  result = await tryCouponAtCurrentStep(page, couponCode, 'cart');
  if (result.found) return result;

  console.log('\n[STATE] CHECKOUT');
  const checkoutOpened = await aiClick(
    page,
    'Find the visible Checkout / Proceed to Checkout / Secure Checkout button that continues from cart toward checkout.'
  );
  if (!checkoutOpened) {
    return { found: false, status: 'CHECKOUT_NOT_FOUND' };
  }

  result = await tryCouponAtCurrentStep(page, couponCode, 'checkout');
  if (result.found) return result;

  console.log('\n[STATE] NEXT_CHECKOUT_STEP');
  const nextOpened = await aiClick(
    page,
    'Find the visible button that continues to the next checkout/payment step, such as Continue, Continue to payment, Payment, Next, or Review order. Do not place/submit the final order.'
  );

  if (nextOpened) {
    result = await tryCouponAtCurrentStep(page, couponCode, 'payment/next-step');
    if (result.found) return result;
  }

  return { found: false, status: 'COUPON_FIELD_NOT_FOUND' };
}

module.exports = { runCouponFlow, aiFind, aiClick, tryCouponAtCurrentStep };
