'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView } from 'motion/react';

/** Animates a whole number from what is currently shown (0 on first view) to `value`. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // What the user currently sees — survives a cancelled animation (e.g. React strict-mode re-run).
  const shown = useRef(0);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    const node = ref.current;
    if (!inView || !node) return;
    const controls = animate(shown.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = Math.round(v).toLocaleString();
      },
    });
    return () => controls.stop();
  }, [value, inView]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
