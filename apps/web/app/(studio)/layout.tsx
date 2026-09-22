import { StudioShell } from '@/components/StudioShell';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="studio-theme min-h-full bg-cinema-bg text-cinema-text">
      <StudioShell>{children}</StudioShell>
    </div>
  );
}
