require('dotenv').config();
const { createClient } = require('redis');

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error('REDIS_URL not set in .env');
    process.exit(1);
  }

  console.log('Connecting to Redis at', url.replace(/:(?:[^@]+)@/, ':<redacted>@'));

  const client = createClient({ url, socket: { connectTimeout: 5000 } });
  client.on('error', err => console.error('Redis Client Error', err));

  try {
    await client.connect();
    console.log('Connected');

    await client.set('careerpilot:connect_test', 'ok', { EX: 60 });
    const v = await client.get('careerpilot:connect_test');
    console.log('GET careerpilot:connect_test ->', v);

    await client.disconnect();
    console.log('Disconnected');
    process.exit(0);
  } catch (err) {
    console.error('Connection test failed:', err);
    try { await client.disconnect(); } catch (e) {}
    process.exit(2);
  }
}

main();
