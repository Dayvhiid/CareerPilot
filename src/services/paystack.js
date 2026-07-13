const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://api.paystack.co';

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY is not set');
  }
  return key;
}

async function initializeTransaction(email, amountKobo, callbackUrl, metadata = {}) {
  const res = await axios.post(
    `${BASE_URL}/transaction/initialize`,
    {
      email,
      amount: amountKobo,
      callback_url: callbackUrl,
      metadata,
    },
    {
      headers: { Authorization: `Bearer ${getSecretKey()}` },
    }
  );
  return res.data;
}

async function verifyTransaction(reference) {
  const res = await axios.get(`${BASE_URL}/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  });
  return res.data;
}

function verifyWebhookSignature(signature, body) {
  const hash = crypto.createHmac('sha512', getSecretKey()).update(body).digest('hex');
  return hash === signature;
}

module.exports = { initializeTransaction, verifyTransaction, verifyWebhookSignature };
