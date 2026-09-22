'use client';

import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { Button } from './Button';
import { tokens } from './tokens';

export interface SmartGenerateButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  takeCount?: number;
  costMinUsd?: number | null;
  costMaxUsd?: number | null;
  etaMinSec?: number | null;
  etaMaxSec?: number | null;
  estimating?: boolean;
  generating?: boolean;
  label?: string;
}

function formatCost(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return 'Estimate…';
  if (min != null && max != null && Math.abs(min - max) < 0.005) return `$${min.toFixed(2)}`;
  if (min != null && max != null) return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
  return `$${(min ?? max ?? 0).toFixed(2)}`;
}

function formatEta(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return '—';
  const a = min ?? max ?? 0;
  const b = max ?? min ?? 0;
  if (a === b) return `~${a}s`;
  return `~${a}–${b}s`;
}

export function SmartGenerateButton({
  takeCount = 1,
  costMinUsd,
  costMaxUsd,
  etaMinSec,
  etaMaxSec,
  estimating = false,
  generating = false,
  label = 'Generate',
  disabled,
  style,
  ...rest
}: SmartGenerateButtonProps) {
  const meta: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    lineHeight: 1.2,
  };

  return (
    <Button
      variant="primary"
      size="lg"
      loading={generating || estimating}
      disabled={disabled || estimating}
      style={{
        width: '100%',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 16,
        ...style,
      }}
      {...rest}
    >
      <span style={meta}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{estimating ? 'Estimating…' : generating ? 'Generating…' : label}</span>
        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>
          {takeCount} take{takeCount === 1 ? '' : 's'} · {formatCost(costMinUsd, costMaxUsd)} · {formatEta(etaMinSec, etaMaxSec)}
        </span>
      </span>
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: 'rgba(4,20,14,0.18)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#04140e',
          fontWeight: 700,
          border: `1px solid ${tokens.accentStrong}`,
        }}
      >
        ▶
      </span>
    </Button>
  );
}
