'use client';

import { useEffect, useState } from 'react';
import type { TimelineCommandDto, TimelineDto } from '@/lib/api';
import { API_URL } from '@/lib/api';

/**
 * Prefers composed timeline preview frames from the API; falls back to single-clip proxy.
 */
export function ComposedProgramMonitor({
  timeline,
  playhead,
  fallbackProxyUrl,
  label,
  timecode,
}: {
  timeline: TimelineDto | null;
  playhead: number;
  fallbackProxyUrl?: string | null;
  label?: string;
  timecode?: string;
}) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'composed' | 'proxy' | 'empty'>('empty');

  useEffect(() => {
    if (!timeline?.id) {
      setFrameUrl(null);
      setMode(fallbackProxyUrl ? 'proxy' : 'empty');
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const handle = window.setTimeout(() => {
      const url = `${API_URL}/timelines/${timeline.id}/preview?t=${encodeURIComponent(String(playhead))}&w=960`;
      fetch(url, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setFrameUrl(objectUrl);
          setMode('composed');
        })
        .catch(() => {
          if (!cancelled) {
            setFrameUrl(null);
            setMode(fallbackProxyUrl ? 'proxy' : 'empty');
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [timeline?.id, playhead, fallbackProxyUrl]);

  return (
    <div className="relative w-full aspect-video rounded-lg border border-cinema-border bg-gradient-to-br from-[#141820] to-[#0b0d10] overflow-hidden shadow-cinema">
      {mode === 'composed' && frameUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frameUrl} alt="Program" className="absolute inset-0 w-full h-full object-contain bg-black" />
      ) : mode === 'proxy' && fallbackProxyUrl ? (
        <video
          src={fallbackProxyUrl}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          controls
          playsInline
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="text-[13px] font-semibold tracking-wide text-cinema-text">Program</div>
          <div className="text-[11px] font-mono text-cinema-muted">{label ?? 'No clip selected'}</div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-cinema-muted pointer-events-none">
        <span>{mode === 'composed' ? 'COMPOSED' : mode === 'proxy' ? 'PROXY' : 'IDLE'}</span>
        <span>{timecode ?? '00:00:00:00'}</span>
        <span>16:9</span>
      </div>
    </div>
  );
}

export type { TimelineCommandDto };
