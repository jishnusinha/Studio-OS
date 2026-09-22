'use client';

import Link from 'next/link';
import { Film } from 'lucide-react';
import { PrimaryCta, SecondaryCta } from './AuthCta';
import { Reveal } from './Reveal';

export function LandingFooter() {
  return (
    <footer className="border-t border-cinema-border">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-cinema-accent">
              Enter
            </p>
            <h2 className="mt-3 text-[clamp(1.75rem,3.5vw,2.75rem)] font-semibold tracking-tight">
              Open the studio. Keep the memory.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-cinema-muted">
              Demo workspace seeds Cinema, Commercial, and Pro paths — same foundations, different
              doors.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryCta size="lg" />
              <SecondaryCta className="px-5 py-3 text-[14px]" />
            </div>
            <p className="mt-6 font-mono text-[12px] text-cinema-muted">
              demo@studioos.local · studioos-demo
            </p>
          </div>
        </Reveal>
      </div>

      <div className="border-t border-cinema-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2 text-cinema-muted">
            <Film size={14} className="text-cinema-accent" />
            <span className="text-[12px] font-semibold tracking-[0.12em] uppercase text-cinema-text">
              StudioOS
            </span>
            <span className="text-[12px]">Creative Production OS</span>
          </div>
          <div className="flex gap-5 text-[12px] text-cinema-muted">
            <Link href="/login" className="hover:text-cinema-text">
              Sign in
            </Link>
            <a href="#foundations" className="hover:text-cinema-text">
              Foundations
            </a>
            <a href="#modes" className="hover:text-cinema-text">
              Modes
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
