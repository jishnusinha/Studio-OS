'use client';

import { Clapperboard, Megaphone, SlidersHorizontal } from 'lucide-react';
import { Reveal } from './Reveal';
import { useLandingTheme } from './LandingThemeProvider';
import type { LandingThemeId } from '@/lib/landing-themes';

const MODES: {
  id: LandingThemeId;
  icon: typeof Clapperboard;
  title: string;
  points: string[];
}[] = [
  {
    id: 'cinema',
    icon: Clapperboard,
    title: 'Cinema',
    points: [
      'Script → bible → shot board with continuity anchors',
      'Lineage from take to deliverable',
      'Compare, version, and invalidate with intent',
    ],
  },
  {
    id: 'commercial',
    icon: Megaphone,
    title: 'Commercial',
    points: [
      'Brand DNA and campaign structure in the graph',
      'Variant factories across formats and markets',
      'Creative memory that survives the next briefing',
    ],
  },
  {
    id: 'pro',
    icon: SlidersHorizontal,
    title: 'Pro Studio',
    points: [
      'Audio, music, color, and multicam surfaces',
      'Workflows that stitch labs into delivery',
      'Console precision without leaving the project',
    ],
  },
];

export function ModesSection() {
  const { theme, setTheme } = useLandingTheme();

  return (
    <section id="modes" className="scroll-mt-20 border-t border-cinema-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-cinema-accent">
            Modes
          </p>
          <h2 className="mt-3 max-w-2xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-tight">
            One OS. Three ways in.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-cinema-muted">
            Switch the mood above — or select a mode here. Each path shares the same graph, gateway,
            and ledger.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {MODES.map((mode, i) => {
            const Icon = mode.icon;
            const active = theme === mode.id;
            return (
              <Reveal key={mode.id} delayMs={i * 80}>
                <button
                  type="button"
                  onClick={() => setTheme(mode.id)}
                  aria-pressed={active}
                  className={`w-full rounded-lg border p-6 text-left transition-theme duration-300 ${
                    active
                      ? 'border-cinema-accent/50 bg-cinema-accent/10 shadow-cinema'
                      : 'border-cinema-border bg-cinema-panel/40 hover:border-cinema-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-md p-2 ${
                        active ? 'bg-cinema-accent/20 text-cinema-accent' : 'bg-cinema-raised text-cinema-muted'
                      }`}
                    >
                      <Icon size={18} strokeWidth={1.5} />
                    </span>
                    <h3 className="text-[17px] font-semibold">{mode.title}</h3>
                  </div>
                  <ul className="mt-5 space-y-2.5">
                    {mode.points.map((point) => (
                      <li key={point} className="flex gap-2 text-[13px] leading-snug text-cinema-muted">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cinema-accent" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
