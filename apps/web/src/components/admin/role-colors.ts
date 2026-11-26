import type { RoleColor } from '@erp/shared';

/** Literal class names per role colour (Tailwind only generates classes it can see). */
export const ROLE_COLOR_CLASSES: Record<
  RoleColor,
  { chip: string; dot: string; stripe: string; ring: string; soft: string; text: string }
> = {
  slate: {
    chip: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-500',
    stripe: 'from-slate-400 to-slate-600',
    ring: 'ring-slate-300',
    soft: 'bg-slate-50',
    text: 'text-slate-700',
  },
  blue: {
    chip: 'bg-blue-50 text-blue-700 ring-blue-200',
    dot: 'bg-blue-500',
    stripe: 'from-sky-400 to-blue-600',
    ring: 'ring-blue-300',
    soft: 'bg-blue-50',
    text: 'text-blue-700',
  },
  emerald: {
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    stripe: 'from-teal-400 to-emerald-600',
    ring: 'ring-emerald-300',
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
    stripe: 'from-yellow-400 to-amber-600',
    ring: 'ring-amber-300',
    soft: 'bg-amber-50',
    text: 'text-amber-800',
  },
  rose: {
    chip: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
    stripe: 'from-pink-400 to-rose-600',
    ring: 'ring-rose-300',
    soft: 'bg-rose-50',
    text: 'text-rose-700',
  },
  violet: {
    chip: 'bg-violet-50 text-violet-700 ring-violet-200',
    dot: 'bg-violet-500',
    stripe: 'from-fuchsia-400 to-violet-600',
    ring: 'ring-violet-300',
    soft: 'bg-violet-50',
    text: 'text-violet-700',
  },
  cyan: {
    chip: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
    dot: 'bg-cyan-500',
    stripe: 'from-cyan-300 to-cyan-600',
    ring: 'ring-cyan-300',
    soft: 'bg-cyan-50',
    text: 'text-cyan-800',
  },
  orange: {
    chip: 'bg-orange-50 text-orange-700 ring-orange-200',
    dot: 'bg-orange-500',
    stripe: 'from-amber-400 to-orange-600',
    ring: 'ring-orange-300',
    soft: 'bg-orange-50',
    text: 'text-orange-700',
  },
};

export function roleColor(c: string | undefined) {
  return ROLE_COLOR_CLASSES[(c as RoleColor) in ROLE_COLOR_CLASSES ? (c as RoleColor) : 'slate'];
}
