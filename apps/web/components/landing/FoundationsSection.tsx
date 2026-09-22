'use client';

import { GitBranch, Layers, Receipt } from 'lucide-react';
import { Reveal } from './Reveal';

const FOUNDATIONS = [
  {
    icon: GitBranch,
    title: 'Project Graph',
    body: 'Stories, shots, assets, and lineage stay connected. Change a canon detail and StudioOS knows what to invalidate — selectively, not blindly.',
  },
  {
    icon: Layers,
    title: 'Model Hub + AI Gateway',
    body: 'Call capabilities, not vendors. Image, video, voice, music, and LLM adapters sit behind one router with estimates before you spend.',
  },
  {
    icon: Receipt,
    title: 'Usage Ledger',
    body: 'Every generation is estimated, recorded, and compared. Project budgets and variance live next to the creative work — not in a separate spreadsheet.',
  },
];

export function FoundationsSection() {
  return (
    <section id="foundations" className="scroll-mt-20 border-t border-cinema-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-cinema-accent">
            Foundations
          </p>
          <h2 className="mt-3 max-w-2xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-tight">
            Three systems that never leave the room
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-cinema-muted">
            StudioOS is not a generation screen. It is the memory, routing, and metering layer every
            creative decision rides on.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {FOUNDATIONS.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delayMs={i * 90}>
                <div className="h-full border-t border-cinema-border pt-6 transition-theme duration-500">
                  <div className="mb-4 inline-flex text-cinema-accent">
                    <Icon size={22} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-[17px] font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-cinema-muted">{item.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
