'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';

export function useAuthCta() {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(() => {
        if (!cancelled) setAuthed(true);
      })
      .catch(() => {
        if (!cancelled) setAuthed(false);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    checked,
    authed,
    primaryHref: authed ? '/projects' : '/login',
    primaryLabel: authed ? 'Open Studio' : 'Enter Studio',
    secondaryHref: '/login',
    secondaryLabel: authed ? 'Account' : 'Sign in',
  };
}

export function PrimaryCta({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const { primaryHref, primaryLabel, checked } = useAuthCta();
  const sizeCls =
    size === 'lg'
      ? 'px-6 py-3 text-[14px]'
      : 'px-4 py-2 text-[13px]';

  return (
    <Link
      href={primaryHref}
      className={`inline-flex items-center justify-center rounded-md bg-cinema-accent font-semibold text-cinema-bg transition-theme duration-300 hover:brightness-110 ${sizeCls} ${className} ${
        checked ? 'opacity-100' : 'opacity-90'
      }`}
    >
      {primaryLabel}
    </Link>
  );
}

export function SecondaryCta({ className = '' }: { className?: string }) {
  const { secondaryHref, secondaryLabel, authed } = useAuthCta();
  if (authed) {
    return (
      <Link
        href="/projects"
        className={`inline-flex items-center justify-center rounded-md border border-cinema-border bg-cinema-panel/60 px-4 py-2 text-[13px] font-medium text-cinema-text transition-theme duration-300 hover:border-cinema-border-strong ${className}`}
      >
        Projects
      </Link>
    );
  }
  return (
    <Link
      href={secondaryHref}
      className={`inline-flex items-center justify-center rounded-md border border-cinema-border bg-cinema-panel/60 px-4 py-2 text-[13px] font-medium text-cinema-text transition-theme duration-300 hover:border-cinema-border-strong ${className}`}
    >
      {secondaryLabel}
    </Link>
  );
}
