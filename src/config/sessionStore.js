const { Store } = require('express-session');
const { logger } = require('./logger');

/**
 * express-session store backed by the app's ioredis client.
 *
 * Replaces connect-redis, which only supports the `redis` (node-redis) v4/v5
 * client and passes incompatible option syntax to ioredis (`ERR syntax error`).
 */
class RedisSessionStore extends Store {
  constructor(options = {}) {
    super(options);
    this.prefix = options.prefix || 'sess:';
    this.ttl = options.ttl || 86400; // seconds
    this.client = options.client;
  }

  get(sid, cb) {
    const client = this.client;
    if (!client) return cb(null, null);

    client
      .get(this.prefix + sid)
      .then((data) => {
        if (!data) return cb(null, null);
        try {
          return cb(null, JSON.parse(data));
        } catch (err) {
          return cb(err);
        }
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, cb) {
    const client = this.client;
    if (!client) return cb(null);

    const ttl = this._getTTL(sess);
    const data = JSON.stringify(sess);

    const done = (err) => {
      if (err) logger.error(`sessionStore.set("${sid}"): ${err.message}`);
      cb(null);
    };

    if (ttl > 0) {
      client.set(this.prefix + sid, data, 'EX', ttl).then(() => done(), done);
    } else {
      client.del(this.prefix + sid).then(() => done(), done);
    }
  }

  touch(sid, sess, cb) {
    const client = this.client;
    if (!client) return cb(null);

    client.expire(this.prefix + sid, this._getTTL(sess)).then(() => cb(null), (err) => cb(err));
  }

  destroy(sid, cb) {
    const client = this.client;
    if (!client) return cb(null);

    client.del(this.prefix + sid).then(() => cb(null), (err) => cb(err));
  }

  _getTTL(sess) {
    if (sess?.cookie?.expires) {
      const ms = Number(new Date(sess.cookie.expires)) - Date.now();
      if (ms > 0) return Math.ceil(ms / 1000);
    }
    return this.ttl;
  }
}

module.exports = RedisSessionStore;
