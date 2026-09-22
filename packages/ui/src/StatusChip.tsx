'use client';

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx, tokens } from './tokens';

export type StatusTone = 'draft' | 'generating' | 'ready' | 'review' | 'changes' | 'approved' | 'locked' | 'final' | 'failed';

const toneColors: Record<StatusTone, { bg: string; fg: string; border: string }> = {
  draft: { bg: 'rgba(139,146,154,0.12)', fg: tokens.muted, border: 'rgba(139,146,154,0.28)' },
  generating: { bg: 'rgba(125,211,252,0.12)', fg: tokens.info, border: 'rgba(125,211,252,0.3)' },
  ready: { bg: tokens.accentDim, fg: tokens.accent, border: tokens.accentStrong },
  review: { bg: 'rgba(251,191,36,0.12)', fg: tokens.warning, border: 'rgba(251,191,36,0.3)' },
  changes: { bg: 'rgba(251,191,36,0.16)', fg: '#fcd34d', border: 'rgba(251,191,36,0.35)' },
  approved: { bg: tokens.accentDim, fg: tokens.accent, border: tokens.accentStrong },
  locked: { bg: 'rgba(232,234,237,0.08)', fg: tokens.text, border: tokens.borderStrong },
  final: { bg: tokens.accentStrong, fg: tokens.accent, border: tokens.accent },
  failed: { bg: 'rgba(248,113,113,0.12)', fg: tokens.danger, border: 'rgba(248,113,113,0.35)' },
};

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusTone | string;
  label?: string;
}

export function StatusChip({ status, label, style, className, ...rest }: StatusChipProps) {
  const key = (status in toneColors ? status : 'draft') as StatusTone;
  const tone = toneColors[key];
  const text = label ?? status.replace(/_/g, ' ');

  return (
    <span
      className={cx('studio-status-chip', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 22,
        padding: '0 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: tone.fg,
          boxShadow: `0 0 0 2px ${tone.bg}`,
        }}
      />
      {text}
    </span>
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}

const badgeTone: Record<NonNullable<BadgeProps['tone']>, CSSProperties> = {
  neutral: { background: tokens.panelRaised, color: tokens.muted, border: `1px solid ${tokens.border}` },
  accent: { background: tokens.accentDim, color: tokens.accent, border: `1px solid ${tokens.accentStrong}` },
  warning: { background: 'rgba(251,191,36,0.12)', color: tokens.warning, border: '1px solid rgba(251,191,36,0.3)' },
  danger: { background: 'rgba(248,113,113,0.12)', color: tokens.danger, border: '1px solid rgba(248,113,113,0.3)' },
  info: { background: 'rgba(125,211,252,0.12)', color: tokens.info, border: '1px solid rgba(125,211,252,0.3)' },
};

export function Badge({ tone = 'neutral', children, style, className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('studio-badge', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 7px',
        borderRadius: tokens.radiusSm,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        ...badgeTone[tone],
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
