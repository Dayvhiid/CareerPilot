# Payment Integration — PayStack

## Overview

CareerPilot uses **PayStack** as its payment provider. The flow uses PayStack's **Initialize Transaction API** to create a dynamic checkout session per user. This avoids the need for static payment links or public callback URLs — the redirect happens in the user's browser, so `localhost` works during development.

## Flow

```
User clicks "Upgrade to Premium"
  → Frontend calls POST /api/payments/initialize { billing }
  → Backend calls PayStack /transaction/initialize with:
      - user email
      - amount in kobo
      - callback_url (browser redirect — localhost OK)
      - metadata: { userId, billing }
  → PayStack returns authorization_url
  → Frontend redirects browser to authorization_url
  → User completes payment on PayStack
  ──────────────────────────────────────────────
  TWO paths confirm payment:
  ──────────────────────────────────────────────
  Path A — Webhook (source of truth)
    PayStack POSTs to /api/payments/webhook
    → Signature verified via x-paystack-signature header
    → Transaction verified via PayStack API
    → User looked up by customer.email
    → premium.active set to true

  Path B — Callback (user-facing)
    PayStack redirects user to /api/payments/verify?reference=xxx
    → Transaction verified via PayStack API
    → Billing period extracted from metadata (set at initialization)
    → User looked up by customer.email
    → premium.active set to true
    → Success/failure page rendered
```

## Endpoints

### `POST /api/payments/initialize`
- **Auth**: Required (JWT)
- **Body**: `{ "billing": "monthly" | "annual" }`
- **Response**: `{ "success": true, "url": "https://checkout.paystack.com/..." }`
- **Purpose**: Creates a PayStack checkout session and returns the redirect URL

### `POST /api/payments/webhook`
- **Purpose**: Receives payment events from PayStack
- **Body**: Raw JSON with `x-paystack-signature` header
- **Signature**: HMAC-SHA512 of raw body using `PAYSTACK_SECRET_KEY`
- **Handles**: `charge.success` events only; other events return 200 silently
- **Security**: Route is registered **before** `express.json()` to capture raw body; signature verified before parsing

### `GET /api/payments/verify`
- **Purpose**: Landing page after PayStack checkout
- **Query params**: `?reference=xxx&trxref=xxx`
- **Response**: Renders an inline HTML success or failure page

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | Yes | — | PayStack secret key (for API calls + webhook verification) |
| `PAYSTACK_PUBLIC_KEY` | No | — | PayStack public key (for future embedded checkout) |
| `PAYSTACK_CALLBACK_URL` | No | `http://localhost:4000/api/payments/verify` | Where the user's browser is redirected after payment. Localhost is fine — this is a client-side redirect |
| `PREMIUM_MONTHLY_KOBO` | No | `1900000` | Monthly premium price in kobo (₦19,000) |
| `PREMIUM_ANNUAL_KOBO` | No | `18000000` | Annual premium price in kobo (₦180,000) |

## User Model — Premium Fields

```js
premium: {
  active:              Boolean,   // Whether the user has active premium
  billing:             String,    // "monthly" | "annual" | null
  paystackReference:   String,    // PayStack transaction reference
  activatedAt:         Date,      // When premium was activated
  expiresAt:           Date       // When premium expires
}
```

## Verified Transaction Status

A payment is only considered valid when:
1. The webhook signature matches `PAYSTACK_SECRET_KEY`
2. The PayStack `/transaction/verify/:reference` API returns `status: true` and `data.status: "success"`
3. The customer email matches an existing user

## PayStack Dashboard Configuration

1. **Webhook URL**: Add `http://localhost:4000/api/payments/webhook` in PayStack Settings → Webhooks (use your production URL in production). The callback URL is set per-transaction via the initialize API, so no dashboard config needed for that.
2. **Secret Key**: Get your test/live secret key from PayStack Settings → API Keys & Webhooks.

## Key Files

| File | Purpose |
|---|---|
| `src/services/paystack.js` | PayStack API client (initialize, verify transaction, verify webhook signature) |
| `src/routes/paymentRoutes.js` | Initialize, verify callback, and webhook handler |
| `src/models/User.js` | User schema with `premium` fields |
| `src/app.js` | Route registration (webhook before `express.json`) |
| `.env` | PayStack secret keys and amount config |

## Edge Cases Handled

- **Webhook arrives before callback**: Both paths are idempotent — `paystackReference` is checked before re-activating
- **Callback arrives but webhook didn't**: The callback calls the PayStack verify API directly, so it still works
- **Duplicate webhooks**: PayStack may retry; checking `paystackReference` prevents double-activation
- **User not found**: If the customer email doesn't match any user, the payment is logged as orphaned and no activation occurs
- **Auth missing on initialize**: Returns 401 with a login prompt
- **Expired subscriptions**: Not yet handled — add a cron job or login check to deactivate expired `premium`
