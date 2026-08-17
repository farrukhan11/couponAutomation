# couponAutomation

Local coupon verification automation using your real Windows Chrome session, Playwright/CDP, and a local Ollama/Qwen model.

## V1 architecture

- **Code controls the process:** store → product → add to cart → cart → checkout → next/payment step.
- **AI only identifies visible elements:** product, add-to-cart, cart, coupon input, apply, checkout, next/payment.
- **Real local Chrome:** Playwright attaches over CDP to Chrome running on your PC.
- **Local AI:** Ollama + `qwen2.5:3b-instruct` by default. No paid AI API is required.
- **Compact page data:** only visible interactive elements are sent to Qwen, not the full page HTML.

## Requirements

- Windows PC
- Node.js 24+
- Ollama
- `qwen2.5:3b-instruct`
- Google Chrome

## 1. Start Ollama

Make sure this works:

```powershell
ollama run qwen2.5:3b-instruct
```

You can exit the interactive chat after confirming the model is installed; Ollama's local service should remain available on port `11434`.

## 2. Start real Chrome with CDP

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\coupon-agent\chrome-profile"
```

This launches a normal headed Chrome profile. Keep it open while the agent runs.

## 3. Install project

```powershell
git clone https://github.com/farrukhan11/couponAutomation.git C:\coupon-agent\couponAutomation
cd C:\coupon-agent\couponAutomation
npm install
```

## 4. Test Chrome connection

```powershell
npm run test:connection
```

## 5. Run one coupon test

```powershell
node src/index.js --store=https://www.x-sense.com/ --code=TESTCODE123
```

The flow will:

1. Open the store.
2. Ask Qwen to identify a visible suitable product.
3. Code clicks the product.
4. Ask Qwen to identify Add to Cart.
5. Code adds it to cart.
6. Check the current cart/drawer for a coupon field.
7. If not present, open cart and check again.
8. If not present, continue to checkout and check again.
9. If needed, continue toward the next/payment step, but it will not place the final order.
10. Save the result to `results/results.jsonl`.

## Environment overrides

```powershell
$env:OLLAMA_MODEL="qwen2.5:3b-instruct"
$env:OLLAMA_URL="http://127.0.0.1:11434/api/generate"
$env:CDP_URL="http://127.0.0.1:9222"
```

## Current V1 limitations

- One store/coupon per CLI run.
- Variant selection is a basic fallback.
- Result classification/discount percentage calculation will be added next.
- CSV import/export and coupon discovery are not wired yet.
- Some checkouts require email/address data before reaching the payment step; form-filling will be a separate deterministic module.

## Safety

The agent may continue through checkout navigation to locate coupon fields, but it should never click the final Place Order / Pay / Submit Order action.
