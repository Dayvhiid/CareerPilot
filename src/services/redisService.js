const { createClient } = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redisUrl = (process.env.REDIS_URL || '').trim();

      if (!redisUrl) {
        console.log('⚠️ Redis disabled: REDIS_URL is not set');
        this.isConnected = false;
        return false;
      }

      console.log('🔌 Attempting to connect to Redis at:', redisUrl);
      
      // Create Redis client with connection options
      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      // Error handling
      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔌 Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('✅ Redis Client Ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('🔌 Redis Client Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.disconnect();
        console.log('👋 Redis Client Disconnected');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error.message);
    }
  }

  /**
   * Get cached jobs by key
   */
  async getJobs(cacheKey) {
    try {
      console.log(`🔍 Attempting to read cache key: ${cacheKey}`);
      console.log(`🔌 Redis connection status: ${this.isConnected}`);
      
      if (!this.isConnected) {
        console.log('⚠️ Redis not connected, skipping cache read');
        return null;
      }

      const cachedData = await this.client.get(cacheKey);
      if (cachedData) {
        console.log(`✅ Cache HIT for key: ${cacheKey}`);
        console.log(`📏 Cached data length: ${cachedData.length} characters`);
        const parsed = JSON.parse(cachedData);
        console.log(`📊 Parsed jobs count: ${parsed.jobs?.length || 0}`);
        return parsed;
      } else {
        console.log(`❌ Cache MISS for key: ${cacheKey}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Error reading from Redis cache:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Cache key that failed:', cacheKey);
      return null;
    }
  }

  /**
   * Cache jobs with TTL
   */
  async setJobs(cacheKey, jobsData, ttlSeconds = 3600) {
    try {
      if (!this.isConnected) {
        console.log('⚠️ Redis not connected, skipping cache write');
        return false;
      }

      const serializedData = JSON.stringify(jobsData);
      await this.client.setEx(cacheKey, ttlSeconds, serializedData);
      
      console.log(`💾 Cached ${jobsData.jobs?.length || 0} jobs for key: ${cacheKey} (TTL: ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      console.error('❌ Error writing to Redis cache:', error.message);
      return false;
    }
  }

  /**
   * Generate cache key from resume data and search parameters
   */
  generateCacheKey(resumeData, searchParams) {
    try {
      console.log('🔑 Generating cache key with data:');
      console.log('   - resumeData:', JSON.stringify(resumeData, null, 2));
      console.log('   - searchParams:', JSON.stringify(searchParams, null, 2));
      
      const jobTitle = resumeData?.currentJobTitle || 'unknown';
      const skills = resumeData?.topSkills?.slice(0, 3).join('-') || 'noskills';
      const location = searchParams?.location || 'nigeria';
      const page = (searchParams?.page || '1').toString();
      
      console.log('🔧 Key components:');
      console.log('   - jobTitle:', jobTitle);
      console.log('   - skills:', skills);
      console.log('   - location:', location);
      console.log('   - page:', page);
      
      const keyParts = ['jobs', jobTitle, skills, location, page];
      
      const cleanedParts = keyParts.map(part => {
        const cleaned = String(part).toLowerCase().replace(/[^a-z0-9]/g, '');
        console.log(`   - "${part}" -> "${cleaned}"`);
        return cleaned;
      });
      
      const finalKey = cleanedParts.join(':');
      console.log('🎯 Final cache key:', finalKey);
      
      return finalKey;
    } catch (error) {
      console.error('❌ Error generating cache key:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ resumeData:', resumeData);
      console.error('❌ searchParams:', searchParams);
      return 'jobs:error:' + Date.now();
    }
  }

  /**
   * Clear all job cache (useful for testing)
   */
  async clearJobsCache() {
    try {
      if (!this.isConnected) {
        console.log('⚠️ Redis not connected, cannot clear cache');
        return false;
      }

      const keys = await this.client.keys('jobs:*');
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🗑️ Cleared ${keys.length} cached job entries`);
      } else {
        console.log('🗑️ No job cache entries to clear');
      }
      return true;
    } catch (error) {
      console.error('❌ Error clearing jobs cache:', error.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      if (!this.isConnected) {
        return { connected: false };
      }

      const keys = await this.client.keys('jobs:*');
      const info = await this.client.info('memory');
      
      return {
        connected: true,
        cachedJobKeys: keys.length,
        memoryInfo: info
      };
    } catch (error) {
      console.error('❌ Error getting cache stats:', error.message);
      return { connected: false, error: error.message };
    }
  }
}

// Create and export singleton instance
const redisService = new RedisService();

module.exports = redisService;