const Redis = require('ioredis-mock');
const RedisSessionStore = require('../../../src/config/sessionStore');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storeSet(store, sid, sess) {
  return new Promise((resolve, reject) => {
    store.set(sid, sess, (err) => (err ? reject(err) : resolve()));
  });
}

function storeGet(store, sid) {
  return new Promise((resolve, reject) => {
    store.get(sid, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function storeDestroy(store, sid) {
  return new Promise((resolve, reject) => {
    store.destroy(sid, (err) => (err ? reject(err) : resolve()));
  });
}

describe('RedisSessionStore (ioredis-backed)', () => {
  let store;
  let client;

  beforeEach(() => {
    client = new Redis();
    store = new RedisSessionStore({ client, prefix: 'sess:' });
  });

  afterEach(() => {
    client.flushall();
  });

  it('should set and get a session via ioredis-compatible set options', async () => {
    const sess = { cookie: { expires: new Date(Date.now() + 60000) }, foo: 'bar' };

    await storeSet(store, 'abc123', sess);
    const fetched = await storeGet(store, 'abc123');

    expect(fetched).not.toBeNull();
    expect(fetched.foo).toBe('bar');
  });

  it('should use the EX TTL option (not an incompatible options object)', async () => {
    const sess = { cookie: { expires: new Date(Date.now() + 5000) } };

    await storeSet(store, 'ttl-test', sess);
    const ttl = await client.ttl('sess:ttl-test');

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
  });

  it('should delete the session when TTL is zero/expired', async () => {
    const expired = { cookie: { expires: new Date(Date.now() - 1000) } };

    await storeSet(store, 'expired', expired);
    const exists = await client.exists('sess:expired');

    expect(exists).toBe(0);
  });

  it('should destroy a session', async () => {
    await storeSet(store, 'delme', { cookie: { expires: new Date(Date.now() + 60000) } });
    await storeDestroy(store, 'delme');

    const exists = await client.exists('sess:delme');
    expect(exists).toBe(0);
  });

  it('should persist and load the OAuth state shape (oauth2:provider.state)', async () => {
    const sess = {
      cookie: { expires: new Date(Date.now() + 60000) },
      'oauth2:accounts.google.com': { state: 'ioVjsswR1vOoUFX5IpxkxkOW' },
    };

    await storeSet(store, 'oauth-sess', sess);
    const fetched = await storeGet(store, 'oauth-sess');

    expect(fetched['oauth2:accounts.google.com'].state).toBe('ioVjsswR1vOoUFX5IpxkxkOW');
  });

  it('should touch (extend) an existing session TTL', async () => {
    await storeSet(store, 'touchme', { cookie: { expires: new Date(Date.now() + 60000) } });

    await new Promise((resolve, reject) => {
      store.touch('touchme', { cookie: { expires: new Date(Date.now() + 120000) } }, (err) =>
        err ? reject(err) : resolve()
      );
    });

    const ttl = await client.ttl('sess:touchme');
    expect(ttl).toBeGreaterThan(60);
  });
});
