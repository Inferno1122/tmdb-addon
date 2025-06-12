const { Redis } = require('@upstash/redis');

const PREFIX = 'tmdb-addon';
const META_TTL = Number(process.env.META_TTL ?? 7 * 24 * 60 * 60);      // 7 days
const CATALOG_TTL = Number(process.env.CATALOG_TTL ?? 1 * 24 * 60 * 60); // 1 day
const RPDB_TTL = Number(process.env.RPDB_TTL ?? 7 * 24 * 60 * 60);      // 7 days

const redis = Redis.fromEnv();

async function cacheWrap(key, ttl, fn) {
  try {
    const cached = await redis.get(key);
    if (typeof cached === 'string') {
      try {
        const parsed = JSON.parse(cached);
        console.log(`[Redis] HIT: ${key}`);
        return parsed;
      } catch (e) {
        console.warn(`[Redis] Invalid JSON in cache for ${key}, ignoring`);
      }
    }
    console.log(`[Redis] MISS: ${key}`);
    const result = await fn();
    await redis.set(key, JSON.stringify(result), { ex: ttl });
    return result;
  } catch (err) {
    console.warn(`[Redis] Cache error for ${key}:`, err);
    return fn();
  }
}

module.exports = {
  cacheWrapMeta: (id, fn) => cacheWrap(`${PREFIX}:meta:${id}`, META_TTL, fn),
  cacheWrapCatalog: (id, fn) => cacheWrap(`${PREFIX}:catalog:${id}`, CATALOG_TTL, fn),
  cacheWrapRpdb: (id, fn) => cacheWrap(`${PREFIX}:rpdb:${id}`, RPDB_TTL, fn),
};
