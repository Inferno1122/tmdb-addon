const { Redis } = require('@upstash/redis');

const PREFIX = 'tmdb-addon';
const META_TTL = Number(process.env.META_TTL ?? 7 * 24 * 60 * 60); // 7 days
const CATALOG_TTL = Number(process.env.CATALOG_TTL ?? 1 * 24 * 60 * 60); // 1 day

const redis = Redis.fromEnv();

async function cacheWrap(key, ttl, fn) {
  try {
    const data = await redis.get(key);
    if (data != null) {
      console.log(`[Redis] HIT: ${key}`);
      return JSON.parse(data);
    }

    console.log(`[Redis] MISS: ${key}`);
    const result = await fn();
    await redis.set(key, JSON.stringify(result), { ex: ttl });
    return result;
  } catch (e) {
    console.warn('[Redis] Cache error:', e);
    return fn();
  }
}

module.exports = {
  cacheWrapMeta: (id, fn) => cacheWrap(`${PREFIX}:meta:${id}`, META_TTL, fn),
  cacheWrapCatalog: (id, fn) => cacheWrap(`${PREFIX}:catalog:${id}`, CATALOG_TTL, fn),
};
