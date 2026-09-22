'use client';

import type { HTMLAttributes } from 'react';
import { cx, tokens } from './tokens';

export interface CostChipProps extends HTMLAttributes<HTMLSpanElement> {
  amountUsd: number;
  label?: string;
  budgetUsd?: number | null;
  compact?: boolean;
}

function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function CostChip({
  amountUsd,
  label = 'Spend',
  budgetUsd,
  compact = false,
  style,
  className,
  ...rest
}: CostChipProps) {
  const over = budgetUsd != null && amountUsd > budgetUsd;
  return (
    <span
      className={cx('studio-cost-chip', className)}
      title={budgetUsd != null ? `${label}: ${formatUsd(amountUsd)} / ${formatUsd(budgetUsd)}` : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: compact ? 24 : 28,
        padding: compact ? '0 8px' : '0 10px',
        borderRadius: tokens.radius,
        background: over ? 'rgba(248,113,113,0.1)' : tokens.panelRaised,
        border: `1px solid ${over ? 'rgba(248,113,113,0.35)' : tokens.border}`,
        color: over ? tokens.danger : tokens.text,
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
      {...rest}
    >
      <span style={{ color: tokens.accent, fontWeight: 700 }}>⚡</span>
      {!compact && (
        <span style={{ color: tokens.muted, fontWeight: 500 }}>{label}</span>
      )}
      <strong style={{ fontWeight: 650 }}>{formatUsd(amountUsd)}</strong>
      {budgetUsd != null && (
        <span style={{ color: tokens.muted }}>/ {formatUsd(budgetUsd)}</span>
      )}
    </span>
  );
}
