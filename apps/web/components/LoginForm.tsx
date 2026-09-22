'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Panel } from '@studio-os/ui';
import { authApi, ApiError } from '@/lib/api';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@studioos.local');
  const [password, setPassword] = useState('studioos-demo');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.login(email, password);
      router.replace('/projects');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel title="Sign in" subtitle="Session stored via httpOnly cookie" style={{ width: '100%', maxWidth: 420 }}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-[12px] text-cinema-danger">{error}</p>}
        <Button type="submit" variant="primary" loading={loading} style={{ width: '100%' }}>
          Enter Studio
        </Button>
        <p className="text-[11px] text-cinema-muted leading-relaxed">
          Demo: <span className="font-mono text-cinema-text">demo@studioos.local</span> /{' '}
          <span className="font-mono text-cinema-text">studioos-demo</span>
        </p>
      </form>
    </Panel>
  );
}
