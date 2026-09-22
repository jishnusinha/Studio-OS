export const tokens = {
  bg: '#0b0d10',
  panel: '#12151a',
  panelRaised: '#161a21',
  accent: '#6ee7b7',
  accentDim: 'rgba(110, 231, 183, 0.14)',
  accentStrong: 'rgba(110, 231, 183, 0.28)',
  text: '#e8eaed',
  muted: '#8b929a',
  border: '#1f2430',
  borderStrong: '#2a3140',
  danger: '#f87171',
  warning: '#fbbf24',
  info: '#7dd3fc',
  radius: 6,
  radiusSm: 4,
} as const;

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
