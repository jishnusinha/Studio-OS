'use client';

import Link from 'next/link';
import { Film, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PrimaryCta, SecondaryCta } from './AuthCta';

const NAV_LINKS = [
  { href: '#foundations', label: 'Foundations' },
  { href: '#modes', label: 'Modes' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#hub', label: 'Model Hub' },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-cinema-border/80 bg-cinema-bg/80 backdrop-blur-md transition-theme duration-500">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-cinema-accent">
          <Film size={16} />
          <span className="text-[13px] font-semibold tracking-[0.14em] uppercase text-cinema-text">
            StudioOS
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Landing">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[12px] font-medium tracking-wide text-cinema-muted transition-colors hover:text-cinema-text"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeSwitcher />
          <SecondaryCta />
          <PrimaryCta />
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-cinema-border p-2 text-cinema-text md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-cinema-border bg-cinema-bg px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[13px] text-cinema-muted hover:text-cinema-text"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3">
            <ThemeSwitcher className="w-full justify-between" />
            <div className="flex gap-2">
              <SecondaryCta className="flex-1" />
              <PrimaryCta className="flex-1" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
