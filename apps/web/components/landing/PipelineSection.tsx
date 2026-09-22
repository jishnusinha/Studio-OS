'use client';

import { Reveal } from './Reveal';

const STEPS = [
  { label: 'Brief', detail: 'Capture intent and constraints' },
  { label: 'Research', detail: 'Pull canon and knowledge into context' },
  { label: 'Script', detail: 'Fountain, FDX, and structured beats' },
  { label: 'Shots', detail: 'Board coverage with continuity' },
  { label: 'Generate', detail: 'Route through the Model Hub' },
  { label: 'Edit', detail: 'Non-destructive timeline commands' },
  { label: 'Deliver', detail: 'Render with provenance intact' },
];

export function PipelineSection() {
  return (
    <section id="pipeline" className="scroll-mt-20 border-t border-cinema-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-cinema-accent">
            Pipeline
          </p>
          <h2 className="mt-3 max-w-2xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-tight">
            From brief to delivery without losing the thread
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-cinema-muted">
            Every stage writes back to the project graph. Downstream work stays aware of upstream
            decisions — and of what changed.
          </p>
        </Reveal>

        <Reveal className="mt-14">
          <ol className="relative grid gap-0 sm:grid-cols-2 lg:grid-cols-7">
            <div
              className="pointer-events-none absolute left-0 right-0 top-5 hidden h-px bg-cinema-border lg:block"
              aria-hidden
            />
            {STEPS.map((step, i) => (
              <li
                key={step.label}
                className="relative flex gap-4 border-b border-cinema-border py-5 last:border-b-0 sm:border-b-0 sm:pr-4 lg:flex-col lg:gap-3 lg:border-none lg:py-0"
              >
                <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cinema-border bg-cinema-bg font-mono text-[12px] text-cinema-accent transition-theme duration-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">{step.label}</h3>
                  <p className="mt-1 text-[12px] leading-snug text-cinema-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
