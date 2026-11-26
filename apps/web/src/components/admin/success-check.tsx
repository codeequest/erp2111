import clsx from 'clsx';

/** Celebratory check: the circle pops in, then the tick draws itself. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <div className={clsx('relative grid place-items-center', className ?? 'size-16')}>
      <div className="animate-pop absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30" />
      <svg viewBox="0 0 24 24" className="relative size-1/2 text-white" fill="none">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw"
        />
      </svg>
    </div>
  );
}
