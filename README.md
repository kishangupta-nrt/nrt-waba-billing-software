# WABA Billing System

A static Next.js frontend and a Hono API for generating WABA (WhatsApp Business API) proforma and tax invoices for single clients or batches, with monthly usage history, GST breakdowns, and PDF export.

## Stack

- Next.js 15.5 (App Router, static export to `out/`)
- React 18.3, Tailwind CSS 3.4
- Hono 4 API (`server/`)
- Supabase (Postgres + Auth)
- jsPDF + html2canvas for PDFs, JSZip for batch archives

## Features

- Single invoice editor with live preview and A4 PDF download.
- Batch billing from a CSV or editable table, with ZIP download and per-invoice print.
- CGST/SGST or IGST calculations, per-line tax totals, round-off, and Indian currency words.
- Monthly history with usage totals, tax breakdowns, search, account/status filters, JSON backup, and invoice reprint/edit.
- Cancel one invoice or several in bulk; every cancellation stores a mandatory reason, keeps the PI as void in records, and releases linked monthly usage so the same account can be billed again.
- Delete a PI generated in error (or a pending credit-usage row) with a mandatory reason; the reason is written to the `billing_audit_log` table.
- Mark a PI as Paid with an optional payment screenshot/receipt (drag & drop or local file picker) and optional UTR/payment notes.
- Set pending credit usage to Paid Directly, Refused to Pay, Cancelled, or back to Pending; refusal/cancellation require a reason and paid entries accept the same drag-and-drop proof upload.
- Repeat an existing invoice or use "Same Client" to start a fresh invoice for the current account.
- Client directory, company/bank settings, and validation for GSTIN, PAN, IFSC, PIN, and state codes.
- Mobile-first layout; tax breakdowns remain visible on small screens and in print.
- Voucher numbers are assigned by the database per Indian financial year; client-supplied numbers are ignored.
- Usage rows are reconciled by database triggers (one linked row per invoice, month/year taken from `billing_month` when valid, otherwise derived from `invoice_date`).

## Security model

- The browser never writes directly to Supabase in production. All reads/writes go through the Render API via `NEXT_PUBLIC_API_URL`.
- Supabase RLS is enabled and read-only for authenticated users. The Render API uses the server-only secret/service-role key for writes.
- The API owns IDs, timestamps, totals, tax amounts, billing month, and voucher numbers. Zod schemas validate and whitelist every payload.
- Production fails closed: `AUTH_REQUIRED` is forced to true and the API requires a valid Supabase JWT.
- CSV exports are sanitized against spreadsheet formula injection.
- There is no LocalStorage fallback in production. It is only available in development when `NEXT_PUBLIC_API_URL` is empty.

## Prerequisites

- Node.js 20.9+ (tested with Node 24)
- pnpm 9.12.0 (pinned in `package.json`)

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in the values.

Public browser variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_AUTH_ENABLED=true
```

Legacy projects can use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead of the publishable key.

Server-only variables (Render / `.env.local` for the API):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
CORS_ALLOWED_ORIGINS=http://localhost:3000
AUTH_REQUIRED=true
PORT=8787
```

`SUPABASE_SERVICE_ROLE_KEY` is also supported in place of `SUPABASE_SECRET_KEY`. Never prefix either key with `NEXT_PUBLIC_`.

### 3. Set up the database

- New project: run `supabase/schema.sql` in the Supabase SQL Editor.
- Existing project: run every file in `supabase/migrations/` in order (`0001` through `0006`).
- Enable Email/Password auth and disable public sign-ups. Create users from the Supabase dashboard.

`public/schema.sql` is a byte-identical copy used by the Settings modal's "Copy schema" helper.

### 4. Run locally

```bash
pnpm dev:server   # API on http://localhost:8787
pnpm dev          # frontend on http://localhost:3000
```

Leave `NEXT_PUBLIC_API_URL` empty to use the development-only LocalStorage fallback.

## Scripts

```bash
pnpm dev           # Next.js dev server
pnpm build         # static export to out/
pnpm start         # serve out/ locally
pnpm lint          # ESLint via next lint
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest
pnpm dev:server    # Hono API with watch
pnpm build:server  # bundle API to server/dist/
pnpm start:server  # run bundled API
pnpm deploy:frontend
```

## Construction setup

Use this sequence to build and verify the application locally:

1. Install deterministic dependencies with `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env.local` and set the browser and server values.
3. Construct the database:
   - New project: run `supabase/schema.sql`.
   - Existing project: run `supabase/migrations/0001` through `0006` in order.
   - Migration `0005` adds safe invoice cancellation and usage release.
   - Migration `0006` adds cancellation/payment-reason and proof columns, credit-usage status fields, and the `billing_audit_log` table.
4. Start the API with `pnpm dev:server`, then the frontend with `pnpm dev`.
5. Run the full verification gate before deployment:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   pnpm build:server
   pnpm audit --prod
   ```

6. Deploy the API first (`render.yaml`), then the static frontend. Set `NEXT_PUBLIC_API_URL` to the deployed API URL.

## Deployment

### Render (API)

`render.yaml` defines the `waba-billing-api` service. Set these secrets:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
- `CORS_ALLOWED_ORIGINS` (comma-separated Cloudflare Workers URL + localhost)
- `AUTH_REQUIRED=true`

### Cloudflare Workers (frontend)

- Worker name: `nrt-waba-billing-software`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Deploy command: `pnpm exec wrangler deploy`
- Asset directory: `out`
- Environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_AUTH_ENABLED=true`, `NODE_VERSION=20`

These variables are needed at build time because `NEXT_PUBLIC_*` values are compiled into the static export. `public/_headers` adds security headers (including CSP) and immutable caching for `/_next/static/*`.

## Project layout

```text
app/                     Next.js App Router pages and styles
components/              Invoice, batch, history, client, settings, nav, auth UI
lib/                     Types, config, API client, Supabase client, tax/PDF/CSV utilities
server/src/              Hono API (config, auth, rate limiting, routes, validation)
server/dist/             Built API bundle (generated)
supabase/schema.sql      Canonical schema (RLS read-only, triggers, indexes)
supabase/migrations/     Incremental migrations 0001-0006
public/schema.sql        Copy of the canonical schema for the UI helper
public/_headers          Cloudflare Workers static-asset security and cache headers
render.yaml              Render backend blueprint
wrangler.jsonc           Cloudflare Workers static-asset config
tests/                   Vitest unit tests
```
