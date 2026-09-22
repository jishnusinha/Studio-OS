'use client';

import type { CSSProperties, HTMLAttributes } from 'react';
import { cx, tokens } from './tokens';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  label?: string;
}

export function Spinner({ size = 16, label, style, className, ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className={cx('studio-spinner', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        color: tokens.muted,
        fontSize: 12,
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `2px solid ${tokens.borderStrong}`,
          borderTopColor: tokens.accent,
          animation: 'studio-spin 0.7s linear infinite',
          display: 'inline-block',
        }}
      />
      {label}
      <style>{`@keyframes studio-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  tone?: 'accent' | 'warning' | 'danger' | 'info';
}

const toneMap: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  accent: tokens.accent,
  warning: tokens.warning,
  danger: tokens.danger,
  info: tokens.info,
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  tone = 'accent',
  style,
  className,
  ...rest
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const track: CSSProperties = {
    height: 6,
    borderRadius: 999,
    background: tokens.bg,
    border: `1px solid ${tokens.border}`,
    overflow: 'hidden',
  };

  return (
    <div className={cx('studio-progress', className)} style={{ display: 'grid', gap: 6, ...style }} {...rest}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: tokens.muted }}>
          <span>{label}</span>
          {showValue && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: toneMap[tone],
            boxShadow: `0 0 12px ${toneMap[tone]}55`,
            transition: 'width 180ms ease',
          }}
        />
      </div>
    </div>
  );
}
