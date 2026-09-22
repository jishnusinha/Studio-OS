import { Film } from 'lucide-react';
import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 studio-grid-bg opacity-60" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(110,231,183,0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(125,211,252,0.06), transparent 50%)',
        }}
      />
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-cinema-border bg-cinema-panel/80 px-3 py-1.5 text-cinema-accent">
            <Film size={14} />
            <span className="text-[12px] font-semibold tracking-[0.12em] uppercase">StudioOS</span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight">Creative production OS</h1>
          <p className="text-[13px] text-cinema-muted">
            Simple when you enter. Powerful when you dig deeper.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
