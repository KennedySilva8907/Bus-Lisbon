import { Redis } from '@upstash/redis';

/**
 * Shared Redis client. Auto-resolves env vars from Upstash integration
 * (UPSTASH_REDIS_REST_URL/TOKEN) or legacy Vercel KV (KV_REST_API_URL/TOKEN).
 */
function makeClient(): Redis {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Redis env vars missing. Expected UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN).',
    );
  }
  return new Redis({ url, token });
}

export const kv = makeClient();
