'use client';

import { useEffect, useRef, useState } from 'react';

/** Animates from the previous value (0 at first) to `target` with an ease-out curve. */
export function useCountUp(target: number, ms = 700): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || ms <= 0) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(origin + (target - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return value;
}
