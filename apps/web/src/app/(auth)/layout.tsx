import type { Metadata } from 'next';

// Links carry their token in the fragment; never leak the page URL to other sites either.
export const metadata: Metadata = { referrer: 'no-referrer' };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
