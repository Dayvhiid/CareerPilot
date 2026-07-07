const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;

let client = null;

function getClient() {
  if (!client && REDIS_URL) {
    client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on('error', (err) => {
      console.error(`redis: ${err.message}`);
    });
  }
  return client;
}

async function get(key) {
  try {
    const r = getClient();
    if (!r) return null;
    const val = await r.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.error(`redis.get("${key}"): ${err.message}`);
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  try {
    const r = getClient();
    if (!r) return;
    const str = JSON.stringify(value);
    if (ttlSeconds) {
      await r.setex(key, ttlSeconds, str);
    } else {
      await r.set(key, str);
    }
  } catch (err) {
    console.error(`redis.set("${key}"): ${err.message}`);
  }
}

async function del(pattern) {
  try {
    const r = getClient();
    if (!r) return;
    let cursor = '0';
    do {
      const result = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        await r.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error(`redis.del("${pattern}"): ${err.message}`);
  }
}

async function quit() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = { get, set, del, quit };
