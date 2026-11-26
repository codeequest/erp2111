import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('shimmer rounded-md', className)} />;
}

/** Placeholder rows for a table while it loads. */
export function SkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-b border-slate-100">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-3.5">
              <Skeleton className={clsx('h-4', c === 0 ? 'w-40' : c % 2 ? 'w-24' : 'w-16')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
