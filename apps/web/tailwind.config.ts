import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cinema: {
          bg: 'var(--studio-bg)',
          panel: 'var(--studio-panel)',
          raised: 'var(--studio-panel-raised)',
          accent: 'var(--studio-accent)',
          text: 'var(--studio-text)',
          muted: 'var(--studio-muted)',
          border: 'var(--studio-border)',
          'border-strong': 'var(--studio-border-strong)',
          danger: 'var(--studio-danger)',
          warning: 'var(--studio-warning)',
          info: 'var(--studio-info)',
        },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        cinema: 'var(--studio-shadow)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'landing-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(2%, -1.5%, 0) scale(1.04)' },
        },
        'landing-fade-up': {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'landing-drift': 'landing-drift 18s ease-in-out infinite',
        'landing-fade-up': 'landing-fade-up 0.7s ease-out both',
      },
      transitionProperty: {
        theme: 'background-color, border-color, color, fill, stroke, box-shadow, opacity',
      },
    },
  },
  plugins: [],
};

export default config;
