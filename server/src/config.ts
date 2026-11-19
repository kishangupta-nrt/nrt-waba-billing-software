import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Local development: load .env.local first, then .env (Render injects real env vars).
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  AUTH_REQUIRED: booleanString.optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[config] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;
const corsOrigins = raw.CORS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  port: raw.PORT,
  supabaseUrl: raw.SUPABASE_URL,
  supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
  corsOrigins,
  // Default to requiring auth in production, bypassable for local development.
  authRequired: raw.AUTH_REQUIRED ?? raw.NODE_ENV === 'production',
  appVersion: '1.1.0',
  serviceName: 'waba-billing-api',
};
