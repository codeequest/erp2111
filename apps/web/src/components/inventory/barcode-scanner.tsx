'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanLine, X } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { inputBase } from './ui';

/**
 * Scans a barcode with the camera, or reads one typed / sent by a USB scanner
 * (USB scanners behave like a keyboard that types the code then presses Enter).
 * Calls onCode once with the first code read.
 */
export function BarcodeScanner({
  title = 'Scan a barcode',
  onCode,
  onClose,
}: {
  title?: string;
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const doneRef = useRef(false);
  const [manual, setManual] = useState('');
  const [cameraState, setCameraState] = useState<'starting' | 'on' | 'off' | 'error'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [useCamera, setUseCamera] = useState(true);

  const finish = (code: string) => {
    const value = code.trim();
    if (!value || doneRef.current) return;
    doneRef.current = true;
    controlsRef.current?.stop();
    onCode(value);
  };

  useEffect(() => {
    if (!useCamera) {
      setCameraState('off');
      return;
    }
    let cancelled = false;
    setCameraState('starting');
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraError(
          'The camera needs a secure connection (https or localhost). Use a USB scanner or type the code.',
        );
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current!,
          (result) => {
            if (result) {
              navigator.vibrate?.(80);
              finish(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
        else {
          controlsRef.current = controls;
          setCameraState('on');
        }
      } catch (e) {
        if (cancelled) return;
        const name = (e as Error).name;
        setCameraState('error');
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was refused. Allow it in the browser, or use a USB scanner.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera found on this device. Use a USB scanner or type the code.'
              : `The camera could not start (${(e as Error).message}).`,
        );
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCamera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <ScanLine className="size-5 text-mod-inventory" /> {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        {useCamera && (
          <div className="relative aspect-[4/3] bg-slate-900">
            <video ref={videoRef} className="size-full object-cover" muted playsInline />
            {cameraState === 'on' && (
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.35)]">
                <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-red-500" />
              </div>
            )}
            {cameraState === 'starting' && (
              <p className="absolute inset-0 grid place-items-center text-sm text-slate-300">
                Starting camera…
              </p>
            )}
            {cameraState === 'error' && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-200">
                <div>
                  <CameraOff className="mx-auto mb-2 size-7 text-slate-400" />
                  {cameraError}
                </div>
              </div>
            )}
          </div>
        )}

        <form
          className="space-y-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            finish(manual);
          }}
        >
          <label className="block text-sm font-medium text-slate-700" htmlFor="scan-manual">
            <Keyboard className="mr-1 inline size-4 text-slate-400" />
            USB scanner or keyboard
          </label>
          <div className="flex gap-2">
            <input
              id="scan-manual"
              autoFocus
              autoComplete="off"
              className={`${inputBase} w-full font-mono`}
              placeholder="Scan or type the code, then Enter"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <button
              type="submit"
              disabled={!manual.trim()}
              className="rounded-md bg-mod-inventory px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              OK
            </button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            onClick={() => setUseCamera((v) => !v)}
          >
            {useCamera ? <CameraOff className="size-3.5" /> : <Camera className="size-3.5" />}
            {useCamera ? 'Turn the camera off' : 'Use the camera'}
          </button>
        </form>
      </div>
    </div>
  );
}
