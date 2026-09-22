'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cx, tokens } from './tokens';

export interface ContextRibbonSegment {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  muted?: boolean;
}

export interface ContextRibbonProps {
  segments: ContextRibbonSegment[];
  trailing?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function ContextRibbon({ segments, trailing, className, style }: ContextRibbonProps) {
  return (
    <nav
      aria-label="Context"
      className={cx('studio-context-ribbon', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        flex: 1,
        ...style,
      }}
    >
      <ol
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {segments.map((seg, i) => {
          const interactive = Boolean(seg.href || seg.onClick);
          const content = (
            <span
              style={{
                fontSize: 12,
                fontWeight: i === segments.length - 1 ? 650 : 500,
                color: seg.muted ? tokens.muted : i === segments.length - 1 ? tokens.text : tokens.muted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 180,
              }}
            >
              {seg.label}
            </span>
          );

          return (
            <li key={seg.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {i > 0 && (
                <span aria-hidden style={{ color: tokens.borderStrong, fontSize: 12, padding: '0 2px' }}>
                  /
                </span>
              )}
              {interactive ? (
                <button
                  type="button"
                  onClick={seg.onClick}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 4px',
                    borderRadius: tokens.radiusSm,
                    cursor: 'pointer',
                  }}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
      {trailing}
    </nav>
  );
}
