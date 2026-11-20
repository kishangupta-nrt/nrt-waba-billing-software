import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import { env } from './config';
import { requireAuth, type AppEnv } from './auth';
import { rateLimit } from './rateLimit';
import { health } from './routes/health';
import { settings } from './routes/settings';
import { clients } from './routes/clients';
import { invoices } from './routes/invoices';
import { usage } from './routes/usage';

const app = new Hono<AppEnv>();

if (!env.isProduction) {
  app.use('*', logger());
}

app.use('*', secureHeaders());

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (env.corsOrigins.includes('*')) return origin;
      return env.corsOrigins.includes(origin) ? origin : undefined;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.get('/', (c) => c.json({ service: env.serviceName, status: 'ok' }));

app.route('/health', health);

// Every data route requires a Supabase access token when AUTH_REQUIRED is on.
app.use('/api/*', requireAuth);
app.use('/api/*', rateLimit);

app.use(
  '/api/*',
  bodyLimit({
    maxSize: env.requestBodyLimit,
    onError: (c) => c.json({ success: false, error: 'Payload too large' }, 413),
  })
);
app.route('/api/settings', settings);
app.route('/api/clients', clients);
app.route('/api/invoices', invoices);
app.route('/api/usage', usage);

app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

app.onError((error, c) => {
  console.error('[unhandled]', error);
  const message = env.isProduction ? 'Internal server error' : error.message;
  return c.json({ success: false, error: message }, 500);
});

if (env.nodeEnv !== 'test') {
  serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`[${env.serviceName}] listening on http://localhost:${info.port}`);
  });
}

export default app;
