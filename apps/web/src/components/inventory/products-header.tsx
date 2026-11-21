'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { ChevronRight, FolderTree, Package } from 'lucide-react';

const TABS = [
  { href: '/inventory/products', label: 'Products', icon: Package },
  { href: '/inventory/products/categories', label: 'Categories', icon: FolderTree },
];

interface Props {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  /** Extra breadcrumb after "Products" */
  crumb?: string;
  showTabs?: boolean;
}

export function ProductsHeader({ title, subtitle, actions, crumb, showTabs = true }: Props) {
  const pathname = usePathname();
  const active = pathname.startsWith('/inventory/products/categories')
    ? '/inventory/products/categories'
    : '/inventory/products';

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 px-5 pt-5 text-white shadow-lg shadow-emerald-900/10 sm:px-8 sm:pt-7"
    >
      {/* decorative glow */}
      <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-teal-300/20 blur-3xl" />

      <nav className="relative flex items-center gap-1 text-xs text-emerald-100/80">
        <Link href="/dashboard" className="hover:text-white">
          Home
        </Link>
        <ChevronRight className="size-3" />
        <span>Inventory</span>
        <ChevronRight className="size-3" />
        <Link href="/inventory/products" className="hover:text-white">
          Products
        </Link>
        {crumb && (
          <>
            <ChevronRight className="size-3" />
            <span className="truncate text-white">{crumb}</span>
          </>
        )}
      </nav>

      <div className="relative mt-3 flex flex-wrap items-end justify-between gap-4 pb-5 sm:pb-6">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-emerald-50/85">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {showTabs && (
        <div className="relative -mx-1 flex gap-1">
          {TABS.map((tab) => {
            const isActive = tab.href === active;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  'relative flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'text-emerald-800' : 'text-emerald-50/85 hover:text-white',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="products-tab"
                    className="absolute inset-0 rounded-t-lg bg-slate-50"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <tab.icon className="relative size-4" />
                <span className="relative">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </motion.header>
  );
}

/** White pill button that sits on the gradient header. */
export function HeaderButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-md shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-60',
        className,
      )}
    >
      {children}
    </button>
  );
}
