# WABA Billing System - WhatsApp Business API Invoice Engine

A modern, high-precision web application built with **Next.js 14**, **Tailwind CSS**, and **Supabase** designed to generate proforma and tax invoices that **faithfully match the shared PDF format** (`DERMATOLOGY AND BEYOD.pdf`) for single or multiple clients in one go.

---

## 🌟 Key Features

### 1. Exact 1:1 Shared PDF Format Replica
- **Authentic Company Header & Logo**: NEWRISE TECHNOSYS PVT LTD, Bhopal, MP (GSTIN: `23AAECN8171A1ZT`, State Code: `23`, PAN: `AAECN8171A`).
- **Complete Two-Column Header**:
  - Left column: Company details & Buyer (Bill to) info (`DERMATOLOGY AND BEYOD`, State Code: `23`).
  - Right column: Voucher No. (`NRT/PI/26-27/00242`), Dated (`2-Nov-26`), Buyer Ref, Other References (`Health Clinic`), Destination, Terms of Delivery.
- **Service Lines & HSN/SAC**:
  - Service: `WhatsApp Business API` with subline (e.g., `Utility Message TILL 31 OCT 2026`).
  - HSN/SAC: `998314`.
  - Quantity (`756.0000 NOS`), Rate (`0.3650`), Per (`NOS`), Amount (`275.9400`).
- **Dual GST Tax Calculation**:
  - **CGST (9%) + SGST (9%)**: For intra-state transactions (e.g. Madhya Pradesh, Code 23).
  - **IGST (18%)**: For inter-state transactions (e.g. Maharashtra 27, Delhi 07, Gujarat 24, Karnataka 29).
  - Automatic detection by buyer's state code with **manual toggle button**.
- **Automated Round-Off & Words**:
  - Calculates round-off adjustment (e.g., `+0.3908`) to produce clean round totals (`₹ 326.0000`).
  - Indian currency words converter: `INR Three Hundred Twenty Six Only`.
- **Authentic Footer**:
  - Company PAN & Declaration.
  - Complete Bank Details (`ICICI Bank - 447`, A/c: `119305000447`, IFS: `ICIC0001192`, SWIFT: `ICICINBBXXX`).
  - Signature block for *for NEWRISE TECHNOSYS PVT LTD (Authorised Signatory)*.

---

### 2. Multi-Client Batch Billing in One Go
- **Generate Invoices for Multiple Clients in One Click**:
  - Select all or subset of clients.
  - Automatically issues sequential voucher numbers (`00242`, `00243`, `00244`...).
  - Calculates taxes and totals per client based on state and credits used.
- **Sample File CSV Template Download**:
  - Click **Download Sample CSV** to get pre-formatted template (`waba_billing_sample_template.csv`).
- **CSV / Batch File Upload**:
  - Upload your client data spreadsheet.
  - Real-time preview with inline editable rates, credits, and tax mode toggles.
- **Batch Export**:
  - **Download All as ZIP**: Compresses all generated PDF invoices into a single ZIP archive.
  - **Print All**: Batch print through native browser vector print.

---

### 3. Customizable Charges & Credit Preferences
- Edit billing rate per credit (default `0.3650`, customizable for utility, marketing, or client-specific rates).
- Add multiple service line items (e.g. Utility Messages + Marketing Messages + Platform Fee).
- Set custom default rates per client in the Client Directory.

---

### 4. Monthly Bill History & Credit Usage
- Filter records by Month (e.g. October, November) and Year (2025–2027).
- Track total credits consumed, billed amount, pending clients, and tax collection.
- Inline **Edit Charges** modal to modify client rates or credits on the fly.
- Historical invoices archive with instant replica preview and reprint.

---

### 5. Supabase Integration & Offline Fallback
- **Supabase Cloud PostgreSQL**: Connect via `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Automatic Fallback Mode**: If Supabase keys are not set, the app seamlessly runs using browser `LocalStorage` pre-seeded with realistic clients (including `DERMATOLOGY AND BEYOD`).
- Complete SQL schema included in `supabase/schema.sql` with permissive RLS policies.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (tested with v24.18.0)
- `pnpm` (or `npm`)

### 1. Install Dependencies
```bash
pnpm install
# or
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Add your Supabase credentials if using Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
*(Leave empty to run in zero-config offline mode with pre-loaded mock data!)*

### 3. Set Up Supabase Database (Optional)
If using Supabase, copy the contents of `supabase/schema.sql` and run it in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql).

### 4. Run Development Server
```bash
pnpm dev
# or
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Production Build
```bash
pnpm run build
pnpm start
```

---

## 📁 Project Architecture

```
d:\wababillingsystem/
├── app/
│   ├── globals.css           # Tailwind base styles and print media rules
│   ├── layout.tsx            # HTML root & metadata
│   └── page.tsx              # Main dashboard orchestrator
├── components/
│   ├── InvoiceTemplate.tsx   # Pixel-perfect replica of DERMATOLOGY AND BEYOD.pdf
│   ├── SingleInvoiceGenerator.tsx # Single invoice editor & live side-by-side preview
│   ├── BulkInvoiceGenerator.tsx   # Batch billing, CSV import/export & ZIP downloader
│   ├── MonthlyHistory.tsx    # Monthly credits usage & bill archive
│   ├── ClientManager.tsx     # Client master directory & rate preferences
│   ├── SettingsModal.tsx     # Company profile, bank info & Supabase keys
│   └── Navbar.tsx            # Navigation header & Supabase connection badge
├── lib/
│   ├── db.ts                 # Unified DB layer (Supabase + LocalStorage fallback)
│   ├── mockData.ts           # Pre-loaded clients, initial invoices & usage
│   ├── numberToWords.ts      # Indian currency word converter (INR Words Only)
│   ├── pdfGenerator.ts       # Client-side PDF export (jsPDF & html2canvas)
│   ├── supabase.ts           # Supabase client wrapper
│   ├── taxUtils.ts           # Tax calculations (CGST/SGST vs IGST, round-offs)
│   └── types.ts              # TypeScript schemas and models
├── public/
│   └── logo.png              # Authentic Newrise Technosys extracted logo
└── supabase/
    └── schema.sql            # Full PostgreSQL schema with RLS policies
```
