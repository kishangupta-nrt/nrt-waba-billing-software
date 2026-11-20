import type { Context, Next } from 'hono';
import { env } from './config';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
  return ip;
}

function consume(key: string, max: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + env.rateLimit.windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= max;
}

function sweep() {
  const now = Date.now();
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
}

let lastSweep = 0;

export async function rateLimit(c: Context, next: Next) {
  const now = Date.now();
  if (now - lastSweep > env.rateLimit.windowMs) {
    lastSweep = now;
    sweep();
  }

  const user = c.get('user') as { id?: string } | undefined;
  const identity = user?.id ? `user:${user.id}` : `ip:${clientKey(c)}`;
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
  const max = isWrite ? env.rateLimit.writeMax : env.rateLimit.readMax;
  const key = `${identity}:${isWrite ? 'write' : 'read'}`;

  if (!consume(key, max)) {
    return c.json({ success: false, error: 'Too many requests, please retry shortly' }, 429);
  }

  await next();
}
