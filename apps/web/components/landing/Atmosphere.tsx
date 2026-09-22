'use client';

export function Atmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 studio-grid-bg opacity-50 transition-opacity duration-500" />
      <div
        className="absolute -left-[20%] top-[-10%] h-[70vmin] w-[70vmin] rounded-full blur-3xl animate-landing-drift transition-theme duration-500"
        style={{ background: 'radial-gradient(circle, var(--landing-glow-a), transparent 68%)' }}
      />
      <div
        className="absolute -right-[15%] bottom-[-5%] h-[55vmin] w-[55vmin] rounded-full blur-3xl animate-landing-drift transition-theme duration-500"
        style={{
          background: 'radial-gradient(circle, var(--landing-glow-b), transparent 70%)',
          animationDelay: '-7s',
        }}
      />
      <svg
        className="absolute inset-x-0 bottom-0 h-[42%] w-full opacity-[0.35] transition-theme duration-500"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0 220 H180 L220 160 H340 L380 200 H520 L560 120 H700 L760 180 H900 L960 90 H1100 L1140 150 H1200"
          stroke="var(--studio-accent)"
          strokeWidth="1.5"
          opacity="0.55"
        />
        <path
          d="M0 260 H140 L200 230 H320 L400 250 H540 L620 200 H780 L860 240 H1000 L1080 210 H1200"
          stroke="var(--studio-border-strong)"
          strokeWidth="1"
          opacity="0.8"
        />
        {[180, 340, 520, 700, 900, 1100].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 === 0 ? 160 : 120} r="3.5" fill="var(--studio-accent)" opacity="0.7" />
        ))}
        <g opacity="0.4" stroke="var(--studio-muted)" strokeWidth="1">
          <line x1="80" y1="40" x2="80" y2="100" />
          <line x1="80" y1="40" x2="160" y2="40" />
          <line x1="160" y1="40" x2="200" y2="80" />
          <line x1="160" y1="40" x2="200" y2="20" />
          <circle cx="80" cy="40" r="3" fill="var(--studio-accent)" stroke="none" opacity="0.9" />
          <circle cx="160" cy="40" r="3" fill="var(--studio-info)" stroke="none" opacity="0.7" />
          <circle cx="200" cy="80" r="2.5" fill="var(--studio-muted)" stroke="none" />
          <circle cx="200" cy="20" r="2.5" fill="var(--studio-muted)" stroke="none" />
        </g>
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, transparent 55%, var(--studio-bg) 92%), radial-gradient(ellipse 80% 50% at 50% 0%, var(--landing-glow-a), transparent 60%)',
        }}
      />
    </div>
  );
}
