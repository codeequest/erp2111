'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/** True for a 13-digit code with a correct EAN-13 check digit. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/**
 * Barcode drawn as SVG (sharp when printed).
 * EAN-13 when the code is a valid EAN-13, Code 128 otherwise (any text, e.g. a reference).
 */
export function Barcode({
  value,
  height = 40,
  width = 1.4,
  fontSize = 11,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svg.current) return;
    try {
      JsBarcode(svg.current, value, {
        format: isValidEan13(value) ? 'EAN13' : 'CODE128',
        height,
        width,
        fontSize,
        margin: 0,
        textMargin: 1,
        background: 'transparent',
      });
    } catch {
      // Characters Code 128 cannot encode: show nothing rather than crash.
      svg.current.innerHTML = '';
    }
  }, [value, height, width, fontSize]);

  return <svg ref={svg} className={className} role="img" aria-label={value} />;
}
