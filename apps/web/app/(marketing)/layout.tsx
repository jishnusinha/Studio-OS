import type { Metadata } from 'next';
import { LandingThemeProvider } from '@/components/landing/LandingThemeProvider';

export const metadata: Metadata = {
  title: 'StudioOS — Creative Production Operating System',
  description:
    'Any model. One project. One creative memory. One timeline. One bill. Cinema, Commercial, and Pro Studio in one OS.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <LandingThemeProvider>{children}</LandingThemeProvider>;
}
