'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';
import { Modal } from './modal';
import { btnDanger, btnPrimary, btnSecondary, inputClass } from './buttons';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  /** Ask for a reason (optional or required). */
  reason?: { label: string; required?: boolean; placeholder?: string };
  /** The user must type this exact text to enable the button. */
  typeToConfirm?: string;
  busy?: boolean;
  /** Keeps the confirm button disabled (e.g. a required choice is missing). */
  confirmDisabled?: boolean;
  /** Extra content between the description and the inputs. */
  children?: React.ReactNode;
  onConfirm: (reason?: string) => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  reason,
  typeToConfirm,
  busy = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [text, setText] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) {
      setText('');
      setTyped('');
    }
  }, [open]);

  const reasonOk = !reason?.required || text.trim().length > 0;
  const typedOk = !typeToConfirm || typed.trim() === typeToConfirm;
  const danger = tone === 'danger';

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      icon={
        <div
          className={clsx(
            'grid size-10 shrink-0 place-items-center rounded-full',
            danger ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600',
          )}
        >
          {danger ? <AlertTriangle className="size-5" /> : <HelpCircle className="size-5" />}
        </div>
      }
      description={description}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={danger ? btnDanger : btnPrimary}
            disabled={busy || confirmDisabled || !reasonOk || !typedOk}
            onClick={() => onConfirm(reason ? text.trim() || undefined : undefined)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {(children || reason || typeToConfirm) && (
        <div className="space-y-4">
          {children}
          {reason && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">
                {reason.label}
                {!reason.required && (
                  <span className="font-normal text-slate-400"> (optional)</span>
                )}
              </span>
              <textarea
                rows={3}
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={reason.placeholder}
                className={inputClass}
              />
            </label>
          )}
          {typeToConfirm && (
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-600">
                Type <span className="font-mono font-semibold text-slate-900">{typeToConfirm}</span>{' '}
                to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className={clsx(inputClass, typed && !typedOk && 'border-rose-300')}
                autoComplete="off"
                data-autofocus
              />
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}
