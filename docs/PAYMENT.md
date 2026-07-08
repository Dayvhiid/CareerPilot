# Payment Integration — PayStack

## Overview

CareerPilot uses **PayStack** as its payment provider. Premium upgrades go through a PayStack shop link, and payment confirmation is handled by a callback endpoint and a server-to-server webhook.

## Flow

```
User clicks "Upgrade to Premium"
  → Frontend fetches GET /api/config/upgrade-url
  → Browser redirects to PayStack checkout page
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
    → User looked up by customer.email
    → premium.active set to true
    → Success/failure page rendered
```

## Endpoints

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

### `GET /api/config/upgrade-url`
- **Purpose**: Returns the PayStack checkout URL for the frontend
- **Response**: `{ "url": "https://paystack.shop/pay/..." }`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PAYSTACK_UPGRADE_URL` | Yes | PayStack shop link for premium checkout |
| `PAYSTACK_SECRET_KEY` | Yes | PayStack secret key (for API calls + webhook verification) |
| `PAYSTACK_PUBLIC_KEY` | No | PayStack public key (for future embedded checkout) |
| `PAYSTACK_CALLBACK_URL` | Yes | Where PayStack redirects after payment (`http://localhost:4000/api/payments/verify`) |

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

## Local Development

PayStack requires a **public HTTPS URL** for both the callback and webhook. `localhost` will be rejected.

Use **ngrok** to expose your local server:

```bash
npx ngrok http 4000
```

Then set these environment variables:

```
PAYSTACK_CALLBACK_URL=https://your-ngrok-id.ngrok.io/api/payments/verify
PAYSTACK_UPGRADE_URL=<your paystack payment link>
```

And use the same ngrok URLs in the PayStack dashboard (see below).

## PayStack Dashboard Configuration

1. **Payment Link**: Create a payment link in PayStack and set its callback URL to `https://yourdomain.com/api/payments/verify` (use the ngrok URL for local testing)
2. **Webhook URL**: Add `https://yourdomain.com/api/payments/webhook` in PayStack Settings → Webhooks (use the ngrok URL for local testing)

## Key Files

| File | Purpose |
|---|---|
| `src/services/paystack.js` | PayStack API client (verify transaction, verify webhook signature) |
| `src/routes/paymentRoutes.js` | Verify callback and webhook handler |
| `src/models/User.js` | User schema with `premium` fields |
| `src/app.js` | Route registration (webhook before `express.json`) |
| `.env` | PayStack secret keys and URLs |

## Edge Cases Handled

- **Webhook arrives before callback**: Both paths are idempotent — `paystackReference` is checked before re-activating
- **Callback arrives but webhook didn't**: The callback calls the PayStack verify API directly, so it still works
- **Duplicate webhooks**: PayStack may retry; checking `paystackReference` prevents double-activation
- **User not found**: If the customer email doesn't match any user, the payment is logged as orphaned and no activation occurs
- **Expired subscriptions**: Not yet handled — add a cron job or login check to deactivate expired `premium`
