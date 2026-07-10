const AWS = require('@aws-sdk/client-ssm');

class SecretsManager {
  constructor() {
    this.cache = new Map();
    this.ssm = null;
  }

  async initialize() {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[secrets] Using .env for development');
      return;
    }

    console.log('[secrets] Loading from AWS Parameter Store');
    this.ssm = new AWS.SSM({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const params = {
      Path: '/careerpilot/production/',
      WithDecryption: true,
      Recursive: true
    };

    try {
      const response = await this.ssm.getParametersByPath(params);
      for (const param of response.Parameters || []) {
        const name = param.Name.split('/').pop();
        this.cache.set(name, param.Value);
        process.env[name] = param.Value;
      }
      console.log(`[secrets] Loaded ${this.cache.size} secrets`);
    } catch (err) {
      console.error('[secrets] Failed to load production secrets:', err);
      throw err;
    }
  }

  get(key) {
    return this.cache.get(key) || process.env[key];
  }
}

module.exports = new SecretsManager();
