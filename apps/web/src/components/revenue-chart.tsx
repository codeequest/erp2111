'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatMoney, toNum } from '@/lib/format';

/**
 * Single-series daily revenue area chart (one hue = Inventory emerald, no legend:
 * the card title names the series). 2px line, recessive baseline, crosshair + tooltip
 * on hover, and a screen-reader table with the same data.
 */
export function RevenueChart({ series }: { series: { date: string; revenue: string }[] }) {
  const W = 600;
  const H = 140;
  const PAD = { top: 12, bottom: 22, left: 4, right: 4 };
  const gid = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const values = series.map((s) => toNum(s.revenue));
  const max = Math.max(...values, 0);
  const empty = max === 0;

  const { line, area, xs, ys } = useMemo(() => {
    const n = Math.max(series.length - 1, 1);
    const xs = series.map((_, i) => PAD.left + (i / n) * (W - PAD.left - PAD.right));
    const top = empty ? 1 : max * 1.1;
    const ys = values.map((v) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom));
    const line = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const base = H - PAD.bottom;
    const area = `${line} L${xs[xs.length - 1]?.toFixed(1)},${base} L${xs[0]?.toFixed(1)},${base} Z`;
    return { line, area, xs, ys };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, max, empty]);

  const onMove = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !xs.length) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    xs.forEach((xi, i) => Math.abs(xi - x) < Math.abs(xs[best] - x) && (best = i));
    setHover(best);
  };

  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full touch-none overflow-visible"
        role="img"
        aria-label={`Daily revenue over ${series.length} days`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#e2e8f0" strokeWidth={1} />
        <motion.path
          d={area}
          fill={`url(#${gid})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={empty ? '#cbd5e1' : '#059669'}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        {series.length > 0 && (
          <>
            <text x={PAD.left} y={H - 6} fontSize={10} fill="#94a3b8">
              {fmtDay(series[0].date)}
            </text>
            <text x={W - PAD.right} y={H - 6} fontSize={10} fill="#94a3b8" textAnchor="end">
              {fmtDay(series[series.length - 1].date)}
            </text>
          </>
        )}
        {hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD.top} y2={H - PAD.bottom} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={xs[hover]} cy={ys[hover]} r={4.5} fill="#059669" stroke="white" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg backdrop-blur"
          style={{ left: `${Math.min(Math.max((xs[hover] / W) * 100, 10), 90)}%` }}
        >
          <p className="text-slate-300">{fmtDay(series[hover].date)}</p>
          <p className="font-semibold tabular-nums">{formatMoney(series[hover].revenue)}</p>
        </div>
      )}
      {empty && (
        <p className="absolute inset-x-0 top-1/3 text-center text-xs text-slate-400">
          No sales in this period yet — figures appear once sales orders are confirmed.
        </p>
      )}
      <table className="sr-only">
        <caption>Daily revenue</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.date}>
              <td>{s.date}</td>
              <td>{formatMoney(s.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
