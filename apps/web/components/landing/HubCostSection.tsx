'use client';

import { Reveal } from './Reveal';

export function HubCostSection() {
  return (
    <section id="hub" className="scroll-mt-20 border-t border-cinema-border py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:items-center">
        <Reveal>
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-cinema-accent">
            Model Hub
          </p>
          <h2 className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-tight">
            Any model. One bill.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-cinema-muted">
            StudioOS routes by capability — image, video, voice, music, LLM — through a single
            gateway. Vendors stay in adapters. Your team stays in the project.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-cinema-muted">
            Before a job runs, you see an estimate. After it lands, the ledger records actual cost
            and variance against budget. Creative memory and financial memory share one wall.
          </p>
        </Reveal>

        <Reveal delayMs={100}>
          <div className="rounded-lg border border-cinema-border bg-cinema-panel/50 p-6 font-mono text-[12px] transition-theme duration-500 sm:p-8">
            <div className="flex items-center justify-between border-b border-cinema-border pb-4 text-cinema-muted">
              <span>usage.ledger</span>
              <span className="text-cinema-accent">live</span>
            </div>
            <div className="mt-5 space-y-4">
              {[
                { cap: 'image.generate', est: '0.042', act: '0.039', ok: true },
                { cap: 'video.extend', est: '1.20', act: '1.28', ok: false },
                { cap: 'voice.tts', est: '0.018', act: '0.018', ok: true },
                { cap: 'llm.story', est: '0.006', act: '0.005', ok: true },
              ].map((row) => (
                <div key={row.cap} className="grid grid-cols-[1fr_auto_auto] gap-3 items-baseline">
                  <span className="text-cinema-text">{row.cap}</span>
                  <span className="text-cinema-muted">est {row.est}</span>
                  <span className={row.ok ? 'text-cinema-accent' : 'text-cinema-warning'}>
                    act {row.act}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-cinema-border pt-4">
              <span className="text-cinema-muted">project variance</span>
              <span className="text-[13px] font-semibold text-cinema-accent">+2.4%</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
