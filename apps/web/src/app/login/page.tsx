'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { LOCALES, useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

function LoginForm() {
  const { status, login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, router, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          {t('login.email')}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          {t('login.password')}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {/* Icon and label each sit in a stable wrapper so browser translation
            (which rewrites text nodes) can't break React's DOM updates. */}
        <span className="contents">
          {submitting ? (
            <Loader2 key="loading" className="size-4 animate-spin" />
          ) : (
            <LogIn key="idle" className="size-4" />
          )}
        </span>
        <span>{t('login.submit')}</span>
      </button>
    </form>
  );
}

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-blue-600 font-bold">E</div>
          <span className="text-xl font-semibold">ERP</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold">{t('login.tagline')}</h1>
          <p className="mt-3 max-w-md text-slate-400">{t('login.taglineSub')}</p>
        </div>
        <p className="text-sm text-slate-500">v0.2.0</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-end">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as typeof locale)}
              aria-label={t('topbar.language')}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600"
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">{t('login.title')}</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">{t('login.subtitle')}</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
