'use client';

import { Atmosphere } from './Atmosphere';
import { PrimaryCta, SecondaryCta } from './AuthCta';
import { useLandingTheme } from './LandingThemeProvider';

export function LandingHero() {
  const { meta } = useLandingTheme();

  return (
    <section className="relative min-h-[calc(100svh-3.5rem)] overflow-hidden">
      <Atmosphere />
      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 lg:py-20">
        <p className="mb-5 text-[12px] font-semibold tracking-[0.2em] uppercase text-cinema-accent transition-theme duration-500">
          StudioOS
        </p>
        <h1 className="max-w-3xl text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1.05] tracking-tight text-cinema-text">
          Creative Production
          <span className="block text-cinema-accent transition-theme duration-500">Operating System</span>
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-cinema-muted sm:text-[17px]">
          Any model. One project. One creative memory. One timeline. One bill.
        </p>
        <p className="mt-3 max-w-lg text-[13px] text-cinema-muted/80">
          {meta.description}
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <PrimaryCta size="lg" />
          <SecondaryCta className="px-5 py-3 text-[14px]" />
        </div>
        <p className="mt-8 text-[12px] tracking-wide text-cinema-muted">
          Simple when you enter. Powerful when you dig deeper.
        </p>
      </div>
    </section>
  );
}
