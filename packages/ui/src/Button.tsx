'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cx, tokens } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: { height: 28, padding: '0 10px', fontSize: 12, gap: 6 },
  md: { height: 34, padding: '0 14px', fontSize: 13, gap: 8 },
  lg: { height: 40, padding: '0 18px', fontSize: 14, gap: 8 },
};

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: tokens.accent,
    color: '#04140e',
    border: `1px solid ${tokens.accent}`,
    fontWeight: 600,
  },
  secondary: {
    background: tokens.panelRaised,
    color: tokens.text,
    border: `1px solid ${tokens.borderStrong}`,
    fontWeight: 500,
  },
  ghost: {
    background: 'transparent',
    color: tokens.muted,
    border: '1px solid transparent',
    fontWeight: 500,
  },
  danger: {
    background: 'rgba(248, 113, 113, 0.12)',
    color: tokens.danger,
    border: `1px solid rgba(248, 113, 113, 0.35)`,
    fontWeight: 600,
  },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  style,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('studio-btn', className)}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radius,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.55 : 1,
        letterSpacing: '0.01em',
        transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
        whiteSpace: 'nowrap',
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            animation: 'studio-spin 0.7s linear infinite',
          }}
        />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
