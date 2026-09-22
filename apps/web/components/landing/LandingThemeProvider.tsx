'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LANDING_THEME,
  LANDING_THEME_STORAGE_KEY,
  LANDING_THEMES,
  parseLandingTheme,
  type LandingThemeId,
  type LandingThemeMeta,
} from '@/lib/landing-themes';

interface LandingThemeContextValue {
  theme: LandingThemeId;
  setTheme: (theme: LandingThemeId) => void;
  themes: LandingThemeMeta[];
  meta: LandingThemeMeta;
}

const LandingThemeContext = createContext<LandingThemeContextValue | null>(null);

export function LandingThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<LandingThemeId>(DEFAULT_LANDING_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANDING_THEME_STORAGE_KEY);
      setThemeState(parseLandingTheme(stored));
    } catch {
      setThemeState(DEFAULT_LANDING_THEME);
    }
    setReady(true);
  }, []);

  const setTheme = useCallback((next: LandingThemeId) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(LANDING_THEME_STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const meta = useMemo(
    () => LANDING_THEMES.find((t) => t.id === theme) ?? LANDING_THEMES[0],
    [theme],
  );

  const value = useMemo(
    () => ({ theme, setTheme, themes: LANDING_THEMES, meta }),
    [theme, setTheme, meta],
  );

  return (
    <LandingThemeContext.Provider value={value}>
      <div
        className="landing-theme-root"
        data-landing-theme={theme}
        data-theme-ready={ready ? 'true' : 'false'}
      >
        {children}
      </div>
    </LandingThemeContext.Provider>
  );
}

export function useLandingTheme() {
  const ctx = useContext(LandingThemeContext);
  if (!ctx) {
    throw new Error('useLandingTheme must be used within LandingThemeProvider');
  }
  return ctx;
}
