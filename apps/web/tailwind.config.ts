import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cinema: {
          bg: '#0b0d10',
          panel: '#12151a',
          raised: '#161a21',
          accent: '#6ee7b7',
          text: '#e8eaed',
          muted: '#8b929a',
          border: '#1f2430',
          'border-strong': '#2a3140',
          danger: '#f87171',
          warning: '#fbbf24',
          info: '#7dd3fc',
        },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        cinema: '0 12px 40px rgba(0,0,0,0.45)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
