'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, CSSProperties } from 'react';
import { cx, tokens } from './tokens';

const fieldBase: CSSProperties = {
  width: '100%',
  background: tokens.bg,
  color: tokens.text,
  border: `1px solid ${tokens.border}`,
  borderRadius: tokens.radiusSm,
  outline: 'none',
  fontSize: 13,
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, style, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {label && (
        <span style={{ fontSize: 11, fontWeight: 600, color: tokens.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
      )}
      <input
        id={inputId}
        className={cx('studio-input', className)}
        style={{
          ...fieldBase,
          height: 34,
          padding: '0 10px',
          borderColor: error ? tokens.danger : tokens.border,
          ...style,
        }}
        {...rest}
      />
      {(error || hint) && (
        <span style={{ fontSize: 11, color: error ? tokens.danger : tokens.muted }}>{error ?? hint}</span>
      )}
    </label>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, style, className, ...rest }: TextareaProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {label && (
        <span style={{ fontSize: 11, fontWeight: 600, color: tokens.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
      )}
      <textarea
        className={cx('studio-textarea', className)}
        style={{
          ...fieldBase,
          minHeight: 88,
          padding: '8px 10px',
          resize: 'vertical',
          lineHeight: 1.45,
          borderColor: error ? tokens.danger : tokens.border,
          ...style,
        }}
        {...rest}
      />
      {(error || hint) && (
        <span style={{ fontSize: 11, color: error ? tokens.danger : tokens.muted }}>{error ?? hint}</span>
      )}
    </label>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  style,
  className,
  ...rest
}: SelectProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {label && (
        <span style={{ fontSize: 11, fontWeight: 600, color: tokens.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
      )}
      <select
        className={cx('studio-select', className)}
        style={{
          ...fieldBase,
          height: 34,
          padding: '0 28px 0 10px',
          appearance: 'none',
          backgroundImage: `linear-gradient(45deg, transparent 50%, ${tokens.muted} 50%), linear-gradient(135deg, ${tokens.muted} 50%, transparent 50%)`,
          backgroundPosition: 'calc(100% - 14px) 14px, calc(100% - 10px) 14px',
          backgroundSize: '4px 4px, 4px 4px',
          backgroundRepeat: 'no-repeat',
          borderColor: error ? tokens.danger : tokens.border,
          ...style,
        }}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {(error || hint) && (
        <span style={{ fontSize: 11, color: error ? tokens.danger : tokens.muted }}>{error ?? hint}</span>
      )}
    </label>
  );
}
