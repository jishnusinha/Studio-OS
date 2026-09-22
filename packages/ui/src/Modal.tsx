'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { tokens } from './tokens';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
}

export function Modal({ open, onClose, title, description, children, footer, width = 480 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const overlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 7, 10, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
  };

  return createPortal(
    <div style={overlay} role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: '100%',
          background: tokens.panel,
          border: `1px solid ${tokens.borderStrong}`,
          borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 18px',
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>{title}</div>
            {description && (
              <div style={{ fontSize: 12, color: tokens.muted, marginTop: 4, lineHeight: 1.4 }}>{description}</div>
            )}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
              ×
            </span>
          </IconButton>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        {footer !== undefined ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '12px 18px',
              borderTop: `1px solid ${tokens.border}`,
              background: tokens.panelRaised,
            }}
          >
            {footer}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '12px 18px',
              borderTop: `1px solid ${tokens.border}`,
              background: tokens.panelRaised,
            }}
          >
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
