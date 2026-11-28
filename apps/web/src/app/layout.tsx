import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AuthProvider } from '@/lib/auth';
import { dirOf, LANG_COOKIE, parseLang } from '@/lib/i18n';
import { LangInit } from '@/components/lang-init';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ERP', template: '%s · ERP' },
  description: 'Inventory, purchasing, sales and invoicing',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <body>
        <LangInit lang={lang} />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
