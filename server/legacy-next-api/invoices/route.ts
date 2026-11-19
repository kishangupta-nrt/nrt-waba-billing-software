// Legacy Next.js API route. Superseded by server/src/routes/invoices.ts and
// intentionally kept out of app/ so the frontend can be statically exported.
import { NextResponse } from 'next/server';
import { getCorsHeaders, handleOptions } from '../cors';
import { db } from '@/lib/db';
import { Invoice } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);

  try {
    const invoices = await db.getInvoices();
    return NextResponse.json({ success: true, data: invoices }, { headers });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch invoices' },
      { status: 500, headers }
    );
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);

  try {
    const body = await request.json();

    if (Array.isArray(body)) {
      // Batch invoices save
      const invoices = body as Invoice[];
      await db.saveInvoicesBatch(invoices);
      return NextResponse.json({ success: true, count: invoices.length }, { headers });
    } else {
      // Single invoice save
      const invoice = body as Invoice;
      if (!invoice.voucher_no || !invoice.buyer_name) {
        return NextResponse.json(
          { success: false, error: 'voucher_no and buyer_name are required' },
          { status: 400, headers }
        );
      }
      await db.saveInvoice(invoice);
      return NextResponse.json({ success: true, data: invoice }, { headers });
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to save invoice' },
      { status: 500, headers }
    );
  }
}
