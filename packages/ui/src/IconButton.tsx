'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cx, tokens } from './tokens';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'panel' | 'accent';
  children: ReactNode;
}

const sizes: Record<NonNullable<IconButtonProps['size']>, number> = {
  sm: 28,
  md: 32,
  lg: 36,
};

const variants: Record<NonNullable<IconButtonProps['variant']>, CSSProperties> = {
  ghost: {
    background: 'transparent',
    color: tokens.muted,
    border: '1px solid transparent',
  },
  panel: {
    background: tokens.panelRaised,
    color: tokens.text,
    border: `1px solid ${tokens.border}`,
  },
  accent: {
    background: tokens.accentDim,
    color: tokens.accent,
    border: `1px solid ${tokens.accentStrong}`,
  },
};

export function IconButton({
  label,
  size = 'md',
  variant = 'ghost',
  children,
  style,
  className,
  ...rest
}: IconButtonProps) {
  const dim = sizes[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('studio-icon-btn', className)}
      style={{
        width: dim,
        height: dim,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radiusSm,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        padding: 0,
        ...variants[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
