'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { cx, tokens } from './tokens';

export type ModelPreset = 'auto' | 'fast' | 'cinematic' | 'economy' | 'manual';

export interface ModelSelectorReason {
  title?: string;
  modelLabel?: string;
  bullets?: string[];
  estimatedUsd?: number;
}

export interface ManualModelOption {
  id: string;
  label: string;
}

export interface ModelSelectorProps {
  value: ModelPreset;
  onChange: (value: ModelPreset) => void;
  reason?: ModelSelectorReason | null;
  showReasonPopover?: boolean;
  manualModels?: ManualModelOption[];
  manualModelId?: string;
  onManualModelChange?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}

const PRESETS: Array<{ value: ModelPreset; label: string; blurb: string }> = [
  { value: 'auto', label: 'Auto', blurb: 'Recommended for this shot' },
  { value: 'fast', label: 'Fast', blurb: 'Lower latency' },
  { value: 'cinematic', label: 'Cinematic', blurb: 'Highest visual fidelity' },
  { value: 'economy', label: 'Economy', blurb: 'Minimize spend' },
  { value: 'manual', label: 'Manual', blurb: 'Pick a specific model' },
];

/** Map internal mock ids to friendly Studio labels — never expose vendor names in Auto. */
export function friendlyModelLabel(modelId: string | null | undefined): string {
  if (!modelId) return 'Studio Model';
  const id = modelId.toLowerCase();
  if (id.includes('mock-image') || id === 'mock-image') return 'Studio Image';
  if (id.includes('mock-video') || id === 'mock-video') return 'Studio Video';
  if (id.includes('mock-llm') || id === 'mock-llm') return 'Studio Text';
  if (id.includes('mock-voice') || id === 'mock-voice') return 'Studio Voice';
  if (id.includes('mock-music') || id === 'mock-music') return 'Studio Music';
  if (id.includes('mock')) return 'Studio Model';
  return modelId;
}

export function ModelSelector({
  value,
  onChange,
  reason,
  showReasonPopover = true,
  manualModels = [],
  manualModelId,
  onManualModelChange,
  className,
  style,
}: ModelSelectorProps) {
  const [hover, setHover] = useState(false);
  const popoverId = useId();
  const showPopover = showReasonPopover && value === 'auto' && hover && reason;

  return (
    <div className={cx('studio-model-selector', className)} style={{ display: 'grid', gap: 10, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: '0.06em', color: tokens.muted, textTransform: 'uppercase' }}>
        Model
      </div>
      <div style={{ display: 'grid', gap: 4 }} role="radiogroup" aria-label="Model preset">
        {PRESETS.map((preset) => {
          const active = preset.value === value;
          return (
            <label
              key={preset.value}
              onMouseEnter={() => preset.value === 'auto' && setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: tokens.radiusSm,
                border: `1px solid ${active ? tokens.accentStrong : tokens.border}`,
                background: active ? tokens.accentDim : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name={popoverId}
                checked={active}
                onChange={() => onChange(preset.value)}
                style={{ accentColor: tokens.accent }}
              />
              <span style={{ display: 'grid', gap: 2, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: active ? tokens.accent : tokens.text }}>
                  {preset.label}
                  {preset.value === 'auto' && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: tokens.muted, fontWeight: 500 }}>Recommended</span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: tokens.muted }}>{preset.blurb}</span>
              </span>
              {showPopover && preset.value === 'auto' && (
                <ReasonPopover reason={reason} />
              )}
            </label>
          );
        })}
      </div>

      {value === 'manual' && manualModels.length > 0 && (
        <select
          value={manualModelId ?? ''}
          onChange={(e) => onManualModelChange?.(e.target.value)}
          style={{
            height: 34,
            borderRadius: tokens.radiusSm,
            border: `1px solid ${tokens.border}`,
            background: tokens.bg,
            color: tokens.text,
            padding: '0 10px',
            fontSize: 13,
          }}
        >
          {manualModels.map((m) => (
            <option key={m.id} value={m.id}>
              {friendlyModelLabel(m.id) !== m.id && m.id.includes('mock')
                ? friendlyModelLabel(m.id)
                : m.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ReasonPopover({ reason }: { reason: ModelSelectorReason }): ReactNode {
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        left: 'calc(100% + 10px)',
        top: 0,
        width: 240,
        zIndex: 20,
        padding: 12,
        borderRadius: tokens.radius,
        background: tokens.panelRaised,
        border: `1px solid ${tokens.borderStrong}`,
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 11, color: tokens.muted, marginBottom: 4 }}>{reason.title ?? 'Recommended model'}</div>
      <div style={{ fontSize: 13, fontWeight: 650, color: tokens.accent, marginBottom: 8 }}>
        {reason.modelLabel ?? 'Studio Model'}
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'grid', gap: 4 }}>
        {(reason.bullets ?? []).map((b) => (
          <li key={b} style={{ fontSize: 11, color: tokens.text, lineHeight: 1.35 }}>
            {b}
          </li>
        ))}
      </ul>
      {reason.estimatedUsd != null && (
        <div style={{ marginTop: 10, fontSize: 11, color: tokens.muted, fontVariantNumeric: 'tabular-nums' }}>
          Estimated: ${reason.estimatedUsd.toFixed(2)}
        </div>
      )}
    </div>
  );
}
