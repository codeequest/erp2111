import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ERP', template: '%s · ERP' },
  description: 'Inventory, purchasing, sales and invoicing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (Grammarly, Dark Reader, translators…)
    // inject attributes on <html>/<body> before React hydrates. Only affects these two
    // elements' own attributes, not their children.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
