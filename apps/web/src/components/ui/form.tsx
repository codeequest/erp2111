'use client';

import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import { Search } from 'lucide-react';

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500';

const errorInputClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';

interface FieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (id: string) => React.ReactNode;
}

/** Label + control + hint / error message. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        <span>{label}</span>
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
  containerClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, required, containerClassName, className, ...rest },
  ref,
) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      {(id) => (
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={!!error}
          className={clsx(inputClass, error && errorInputClass, className)}
          {...rest}
        />
      )}
    </Field>
  );
});

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string | null;
  hint?: string;
  containerClassName?: string;
};

export function TextAreaField({
  label,
  error,
  hint,
  required,
  containerClassName,
  className,
  ...rest
}: TextAreaProps) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      {(id) => (
        <textarea
          id={id}
          required={required}
          rows={3}
          className={clsx(inputClass, error && errorInputClass, className)}
          {...rest}
        />
      )}
    </Field>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string | null;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  containerClassName?: string;
};

export function SelectField({
  label,
  error,
  hint,
  options,
  placeholder,
  required,
  containerClassName,
  className,
  ...rest
}: SelectProps) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      {(id) => (
        <select
          id={id}
          required={required}
          className={clsx(inputClass, error && errorInputClass, className)}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Compact select for filter bars (no label above). */
export function FilterSelect({
  options,
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className={clsx(
        'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500',
        className,
      )}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SearchInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-9 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        {...rest}
      />
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label
      className={clsx(
        'flex cursor-pointer items-start gap-2.5 text-sm',
        rest.disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-blue-600"
        {...rest}
      />
      <span>
        <span className="block text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}
