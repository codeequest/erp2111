'use client';

import { useEffect, useRef, useState } from 'react';
import { Keyboard, ScanLine, X } from 'lucide-react';

/**
 * Barcode / QR scanner dialog.
 *  - camera: decoded live with ZXing (EAN, UPC, Code 128, QR…)
 *  - USB / Bluetooth handheld scanners: they "type" the code and press Enter, so the
 *    input below (auto-focused) works with them too
 *  - manual typing as a fallback
 */
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | undefined;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not available in this browser');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (result && !stopped) {
            stopped = true;
            controls?.stop();
            onDetected(result.getText().trim());
          }
        });
        if (stopped) controls.stop();
        else setStatus('scanning');
      } catch (e) {
        setStatus('error');
        setMessage(
          e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message)
            ? 'Camera access was denied. Allow it in the browser, or type / scan the code below.'
            : 'No camera found. Type or scan the code below.',
        );
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manual.trim()) onDetected(manual.trim());
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ScanLine className="size-5" /> Scan a barcode
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
          <video ref={videoRef} className="size-full object-cover" muted playsInline />
          {status === 'scanning' && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_8px_2px_rgba(239,68,68,0.6)]" />
          )}
          {status !== 'scanning' && (
            <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-slate-300">
              {status === 'starting' ? 'Starting the camera…' : message}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Point the camera at the barcode. A handheld scanner also works: just scan into the field
          below.
        </p>

        <form onSubmit={submitManual} className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Keyboard className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Type or scan a code, then Enter"
              className="w-full rounded-md border border-slate-300 py-1.5 pr-3 pl-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
            OK
          </button>
        </form>
      </div>
    </div>
  );
}
