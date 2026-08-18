# CouponTest Extension — Phase 1

A Chrome/Chromium Manifest V3 extension for manually prepared carts/checkouts.

## What Phase 1 does

1. The user manually opens a store, adds a product, and reaches a cart or checkout page.
2. The coupon/promo/discount field must be visible on the current page.
3. Open **CouponTest** and paste coupon codes.
4. The extension detects the coupon input and a safe Apply/Redeem button.
5. It tests codes one by one.
6. For each code it records status, response text, before/after totals, discount amount, and calculated percentage when measurable.
7. It ranks the best working code.
8. Optionally it removes the last tested working coupon and re-applies the best coupon.
9. Results can be exported to CSV.

The extension explicitly blocks buttons that look like `Place Order`, `Pay Now`, `Submit Order`, `Complete Purchase`, or `Buy Now`.

## Supported result statuses

- `WORKING`
- `WORKING_UNMEASURED`
- `INVALID`
- `EXPIRED`
- `MINIMUM_SPEND_NOT_MET`
- `PRODUCT_NOT_ELIGIBLE`
- `ALREADY_USED`
- `LOGIN_REQUIRED`
- `NOT_STACKABLE`
- `UNKNOWN`
- `RESET_REQUIRED`

`RESET_REQUIRED` means a coupon worked but the extension could not safely remove it before the next test. The run stops instead of producing potentially stacked/incorrect results.

## Install locally

1. Download/clone this repository.
2. Open Chrome/Edge/Brave/Opera extension management.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository's `extension` folder.
6. Pin **CouponTest**.

## Test

1. Go to a store and manually add a product to cart.
2. Go to the cart/checkout page.
3. If the coupon section is collapsed, open it so the field is visible.
4. Open CouponTest.
5. Paste codes, for example:

```text
SAVE10
WELCOME20
SUMMER15
```

6. Press **Start testing**.
7. Review working/invalid statuses and the best discount.
8. Use **Export CSV** if needed.

## Phase 1 boundaries

This version intentionally does **not**:

- discover products,
- select product variants,
- navigate from cart to checkout,
- open deeply custom/cross-origin coupon widgets,
- use AI,
- click payment/order submission buttons.

These belong to later phases. Phase 1 is focused on making coupon testing reliable once the user has already reached the correct cart/checkout page.

## Notes

Coupon implementations vary. The detector uses visible DOM labels, placeholders, names, IDs, nearby text, safe Apply/Redeem controls, response messages, and order-total changes. Domain-specific adapters and an AI fallback can be layered on later without changing the popup workflow.
