import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Local development: load .env.local first, then .env (Render injects real env vars).
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(8787),
    SUPABASE_URL: z.string().url(),
    // Legacy service-role key name and the newer Supabase secret key name.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    AUTH_REQUIRED: booleanString.optional(),
  })
  .refine(
    (value) => Boolean(value.SUPABASE_SERVICE_ROLE_KEY || value.SUPABASE_SECRET_KEY),
    { message: 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required', path: ['SUPABASE_SERVICE_ROLE_KEY'] }
  );

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[config] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';

// Endpoint hygiene: never accept a plain-HTTP Supabase endpoint in production.
if (isProduction && !raw.SUPABASE_URL.startsWith('https://')) {
  console.error('[config] SUPABASE_URL must use HTTPS in production');
  process.exit(1);
}

const corsOrigins = raw.CORS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  port: raw.PORT,
  supabaseUrl: raw.SUPABASE_URL.replace(/\/+$/, ''),
  supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY || raw.SUPABASE_SECRET_KEY || '',
  corsOrigins,
  // Fail closed: production always requires a valid Supabase JWT.
  authRequired: isProduction ? true : raw.AUTH_REQUIRED ?? false,
  authTimeoutMs: 8000,
  // Base64 payment proofs are sent inline with the JSON payload. A 4 MB image
  // expands to roughly 5.3 MB, so leave headroom for the rest of the invoice.
  requestBodyLimit: 8 * 1024 * 1024,
  appVersion: '1.2.0',
  serviceName: 'waba-billing-api',
  rateLimit: {
    windowMs: 60_000,
    readMax: 300,
    writeMax: 60,
  },
};

if (isProduction && raw.AUTH_REQUIRED === false) {
  console.warn('[config] AUTH_REQUIRED=false is ignored in production; authentication is enforced.');
}
