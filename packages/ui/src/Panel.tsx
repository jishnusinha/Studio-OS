'use client';

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx, tokens } from './tokens';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  padded?: boolean;
  flush?: boolean;
  children?: ReactNode;
}

export function Panel({
  title,
  subtitle,
  actions,
  padded = true,
  flush = false,
  children,
  style,
  className,
  ...rest
}: PanelProps) {
  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: flush ? '10px 12px' : '10px 14px',
    borderBottom: `1px solid ${tokens.border}`,
    minHeight: 40,
  };

  return (
    <div
      className={cx('studio-panel', className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: tokens.panel,
        border: `1px solid ${tokens.border}`,
        borderRadius: tokens.radius,
        overflow: 'hidden',
        minHeight: 0,
        ...style,
      }}
      {...rest}
    >
      {(title || actions) && (
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            {title && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 650,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: tokens.text,
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: 11, color: tokens.muted, marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{actions}</div>}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, padding: padded ? (flush ? 10 : 14) : 0 }}>{children}</div>
    </div>
  );
}
