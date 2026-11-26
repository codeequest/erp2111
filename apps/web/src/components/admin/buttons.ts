/** Admin-area button and field styles (indigo → violet accent on the slate admin module colour). */

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-1';

export const btnPrimary = `${base} bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/20 hover:from-indigo-500 hover:to-violet-500 hover:shadow-md hover:shadow-indigo-600/25`;

export const btnSecondary = `${base} border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50`;

export const btnDanger = `${base} bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-sm shadow-rose-600/20 hover:from-rose-500 hover:to-red-500`;

export const btnDangerSoft = `${base} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`;

export const btnGhost = `${base} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;

export const iconBtn =
  'inline-grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-40';

export const fieldClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500';

export const inputClass = `w-full ${fieldClass}`;

export const cardClass = 'rounded-xl border border-slate-200/80 bg-white shadow-sm';
