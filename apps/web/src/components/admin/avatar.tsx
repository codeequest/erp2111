import clsx from 'clsx';

const GRADIENTS = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-emerald-600',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
  xl: 'size-20 text-2xl',
};

/** Initials on a gradient picked from the id, so a person keeps their colour everywhere. */
export function Avatar({
  id,
  name,
  size = 'md',
  muted = false,
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ring-2 ring-white',
        SIZES[size],
        muted ? 'from-slate-300 to-slate-400' : GRADIENTS[hash(id) % GRADIENTS.length],
      )}
    >
      {initials(name)}
    </span>
  );
}
