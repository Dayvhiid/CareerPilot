const express = require('express');
const User = require('../models/User');
const { initializeTransaction, verifyTransaction, verifyWebhookSignature } = require('../services/paystack');
const auth = require('../middleware/auth');

const router = express.Router();

// Amounts in kobo (PayStack's smallest currency unit)
const PREMIUM_AMOUNTS = {
  monthly: parseInt(process.env.PREMIUM_MONTHLY_KOBO || '500000', 10),
  annual:  parseInt(process.env.PREMIUM_ANNUAL_KOBO  || '5000000', 10)
};

const CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:4000/api/payments/verify';

// ── Initialize a PayStack transaction (called from frontend) ──
router.post('/initialize', auth, async (req, res) => {
  try {
    const { billing } = req.body;
    const plan = billing === 'annual' ? 'annual' : 'monthly';
    const amount = PREMIUM_AMOUNTS[plan];

    if (!amount) {
      return res.status(400).json({ success: false, message: 'Invalid billing plan' });
    }

    const result = await initializeTransaction(
      req.user.email,
      amount,
      CALLBACK_URL,
      { userId: req.user._id.toString(), billing: plan }
    );

    if (!result.status) {
      return res.status(502).json({ success: false, message: 'Failed to initialize payment' });
    }

    res.json({ success: true, url: result.data.authorization_url });
  } catch (err) {
    console.error('paystack initialize error:', err);
    res.status(500).json({ success: false, message: 'Payment initialization failed' });
  }
});

// ── PayStack webhook handler ──
// This function is mounted separately in app.js with express.raw() so we
// can verify the HMAC signature before the body gets parsed by express.json().
async function webhookHandler(req, res) {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
      return res.status(400).send('Missing signature');
    }

    const rawBody = req.body.toString();
    if (!verifyWebhookSignature(signature, rawBody)) {
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(rawBody);

    if (event.event !== 'charge.success') {
      return res.sendStatus(200);
    }

    const data = event.data;
    const reference = data.reference;
    const customerEmail = data.customer?.email;

    if (!reference || !customerEmail) {
      return res.status(400).send('Missing reference or customer email');
    }

    const user = await User.findOne({ email: customerEmail });
    if (!user) {
      return res.status(200).send('User not found — payment orphaned');
    }

    if (user.premium?.active && user.premium?.paystackReference === reference) {
      return res.sendStatus(200);
    }

    const metadata = data.metadata || {};
    const billing = metadata.billing || 'monthly';
    const expiresAt = new Date();
    if (billing === 'annual') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    user.premium = {
      active: true,
      billing,
      paystackReference: reference,
      activatedAt: new Date(),
      expiresAt
    };

    await user.save();
    res.sendStatus(200);
  } catch (err) {
    console.error('paystack webhook error:', err);
    res.sendStatus(500);
  }
}

// ── Verify callback (user lands here after PayStack checkout) ──
router.get('/verify', async (req, res) => {
  const { reference, trxref } = req.query;
  const ref = reference || trxref;

  if (!ref) {
    return res.status(400).send(renderPage(
      'Missing Parameters',
      'No transaction reference was provided. Please contact support.'
    ));
  }

  try {
    const result = await verifyTransaction(ref);

    if (!result.status || result.data.status !== 'success') {
      return res.status(200).send(renderPage(
        'Payment Failed',
        `Your payment could not be verified (${result.data.status || 'unknown'}). If your card was charged, please contact support.`
      ));
    }

    const customerEmail = result.data.customer?.email;
    if (!customerEmail) {
      return res.status(200).send(renderPage(
        'Verification Error',
        'Could not identify the customer from this transaction. Please contact support.'
      ));
    }

    const user = await User.findOne({ email: customerEmail });
    if (!user) {
      return res.status(200).send(renderPage(
        'Account Not Found',
        `No CareerPilot account was found for ${customerEmail}. Your payment was received but could not be linked. Please contact support.`
      ));
    }

    if (!user.premium?.active) {
      const metadata = result.data.metadata || {};
      const billing = metadata.billing || 'monthly';
      const expiresAt = new Date();
      if (billing === 'annual') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setDate(expiresAt.getDate() + 30);
      }

      user.premium = {
        active: true,
        billing,
        paystackReference: ref,
        activatedAt: new Date(),
        expiresAt
      };

      await user.save();
    }

    return res.status(200).send(renderPage(
      'Payment Successful!',
      `Your CareerPilot Premium plan is now active. Welcome aboard!`,
      true
    ));
  } catch (err) {
    console.error('paystack verify error:', err);
    return res.status(200).send(renderPage(
      'Verification Error',
      'We could not verify your payment right now. If your card was charged, please contact support.'
    ));
  }
});

// ── Simple HTML page renderer for the callback response ──
function renderPage(title, message, success = false) {
  const color = success ? '#E8B45A' : '#e74c3c';
  const icon = success ? '✓' : '✕';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — CareerPilot</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Sans:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #08080E;
    color: #F0EDE6;
    font-family: 'DM Sans', sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 2rem;
    background-image: linear-gradient(rgba(201,151,58,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(201,151,58,0.06) 1px, transparent 1px);
    background-size: 60px 60px;
  }
  .card {
    background: #0F0F18;
    border: 1px solid rgba(201,151,58,0.28);
    border-radius: 24px;
    padding: 3rem 2.5rem;
    max-width: 480px;
    width: 100%;
    text-align: center;
    box-shadow: 0 0 60px rgba(201,151,58,0.1);
  }
  .icon {
    font-size: 3rem; color: ${color}; margin-bottom: 1.25rem;
  }
  h1 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300; font-size: 2rem; margin-bottom: 0.75rem;
  }
  p {
    color: #8A8580; font-weight: 300; line-height: 1.7; font-size: 0.95rem;
  }
  .btn {
    display: inline-block; margin-top: 2rem;
    background: ${color}; color: #08080E; text-decoration: none;
    font-family: 'DM Sans', sans-serif;
    padding: 0.85rem 2rem; border-radius: 8px;
    font-weight: 500; font-size: 0.9rem;
    transition: all 0.25s ease;
  }
  .btn:hover { filter: brightness(1.15); transform: translateY(-2px); }
  .btn-secondary {
    background: transparent; border: 1px solid rgba(201,151,58,0.28);
    color: #8A8580; margin-left: 0.75rem;
  }
</style>
</head>
<body>
<div class="card">
  <div class="icon">${icon}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  <div>
    <a href="/" class="btn">Go to Dashboard</a>
    <a href="/upgrade/upgrade.html" class="btn btn-secondary">Back to Upgrade</a>
  </div>
</div>
</body>
</html>`;
}

module.exports = { router, webhookHandler };
