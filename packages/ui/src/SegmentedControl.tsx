'use client';

import type { CSSProperties } from 'react';
import { cx, tokens } from './tokens';

export type DepthMode = 'quick' | 'director' | 'pro';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

const DEFAULT_DEPTH: SegmentedControlOption<DepthMode>[] = [
  { value: 'quick', label: 'Quick', hint: 'Prompt + essentials' },
  { value: 'director', label: 'Director', hint: 'Shot DNA controls' },
  { value: 'pro', label: 'Pro', hint: 'Full parameter surface' },
];

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  style,
  ...rest
}: SegmentedControlProps<T>) {
  const height = size === 'sm' ? 28 : 32;
  return (
    <div
      role="tablist"
      className={cx('studio-segmented', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: 3,
        gap: 2,
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
        borderRadius: tokens.radius,
        ...style,
      }}
      {...rest}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            style={{
              height,
              padding: size === 'sm' ? '0 10px' : '0 12px',
              border: 'none',
              borderRadius: tokens.radiusSm,
              background: active ? tokens.accentDim : 'transparent',
              color: active ? tokens.accent : tokens.muted,
              fontSize: size === 'sm' ? 11 : 12,
              fontWeight: active ? 650 : 500,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function DepthSegmentedControl({
  value,
  onChange,
  ...rest
}: Omit<SegmentedControlProps<DepthMode>, 'options'> & { options?: SegmentedControlOption<DepthMode>[] }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={rest.options ?? DEFAULT_DEPTH}
      aria-label="Generation depth"
      {...rest}
    />
  );
}
