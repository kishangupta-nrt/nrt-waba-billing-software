import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WABA Billing System - Newrise Technosys',
  description: 'WhatsApp Business API Proforma & Tax Invoice Generator with Bulk Processing, GST (IGST/CGST), and Monthly Credits History',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16', type: 'image/x-icon' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
