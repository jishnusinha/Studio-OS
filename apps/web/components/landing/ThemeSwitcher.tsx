'use client';

import { useLandingTheme } from './LandingThemeProvider';
import type { LandingThemeId } from '@/lib/landing-themes';

export function ThemeSwitcher({ className = '' }: { className?: string }) {
  const { theme, setTheme, themes } = useLandingTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Landing theme"
      className={`inline-flex items-center gap-0.5 rounded-md border border-cinema-border bg-cinema-panel/80 p-0.5 ${className}`}
    >
      {themes.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(t.id as LandingThemeId)}
            className={`rounded px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase transition-theme duration-300 ${
              active
                ? 'bg-cinema-accent/15 text-cinema-accent'
                : 'text-cinema-muted hover:text-cinema-text'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
