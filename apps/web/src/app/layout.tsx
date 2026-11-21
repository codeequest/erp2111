import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import { CompanyProvider } from '@/lib/company';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ERP', template: '%s · ERP' },
  description: 'Inventory, purchasing, sales and invoicing',
  // The app has its own FR / EN translations. Browser auto-translation rewrites
  // the page behind React's back and crashes it, so it is turned off.
  other: { google: 'notranslate' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" translate="no" className="notranslate">
      <body>
        <I18nProvider>
          <AuthProvider>
            <CompanyProvider>
              <ToastProvider>{children}</ToastProvider>
            </CompanyProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
