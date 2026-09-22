'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineDto } from '@/lib/api';

/**
 * Program monitor — plays the active clip proxy.
 * WebCodecs: feature-detect only (stub). Full decode pipeline TBD.
 */
export function ProgramMonitor({
  proxyUrl,
  label,
  timecode,
}: {
  proxyUrl?: string | null;
  label?: string;
  timecode?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [webCodecs, setWebCodecs] = useState(false);

  useEffect(() => {
    // Feature-detect WebCodecs (VideoDecoder) — stub for future hardware decode path
    const has =
      typeof window !== 'undefined' &&
      'VideoDecoder' in window &&
      typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder === 'function';
    setWebCodecs(has);
    // if (has) { /* future: WebCodecs decode of mezzanine frames */ }
  }, []);

  return (
    <div className="relative w-full aspect-video rounded-lg border border-cinema-border bg-gradient-to-br from-[#141820] to-[#0b0d10] overflow-hidden shadow-cinema">
      {proxyUrl ? (
        <video
          ref={videoRef}
          src={proxyUrl}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          controls
          playsInline
        />
      ) : (
        <>
          <div
            className="absolute inset-0 opacity-50"
            style={{
              background:
                'radial-gradient(circle at 35% 40%, rgba(110,231,183,0.18), transparent 45%), radial-gradient(circle at 70% 60%, rgba(125,211,252,0.1), transparent 40%)',
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="text-[13px] font-semibold tracking-wide text-cinema-text">Program</div>
            <div className="text-[11px] font-mono text-cinema-muted">{label ?? 'No clip selected'}</div>
          </div>
        </>
      )}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-cinema-muted pointer-events-none">
        <span>REC · {webCodecs ? 'WebCodecs ✓' : 'HTMLVideo'}</span>
        <span>{timecode ?? '00:00:00:00'}</span>
        <span>16:9</span>
      </div>
    </div>
  );
}

export function formatTc(seconds: number, fps = 24): string {
  const total = Math.max(0, Math.floor(seconds * fps));
  const ff = total % fps;
  const ss = Math.floor(total / fps) % 60;
  const mm = Math.floor(total / (fps * 60)) % 60;
  const hh = Math.floor(total / (fps * 3600));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

export function clipAtPlayhead(timeline: TimelineDto | null, time: number) {
  if (!timeline) return null;
  for (const track of timeline.tracks) {
    if (track.type !== 'video') continue;
    for (const clip of track.clips) {
      const dur = Math.max(0, (clip.sourceOut - clip.sourceIn) / (clip.speed || 1));
      if (time >= clip.timelineStart && time < clip.timelineStart + dur) {
        return { track, clip };
      }
    }
  }
  return null;
}

export function useProxyUrl(assetId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    import('@/lib/api')
      .then((m) => m.assetsApi.signedUrl(assetId, 'proxy'))
      .then((r) => {
        if (!cancelled) setUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  return url;
}

export function MonitorFromTimeline({
  timeline,
  playhead,
}: {
  timeline: TimelineDto | null;
  playhead: number;
}) {
  const hit = useMemo(() => clipAtPlayhead(timeline, playhead), [timeline, playhead]);
  const proxyUrl = useProxyUrl(hit?.clip.assetId);
  return (
    <ProgramMonitor
      proxyUrl={proxyUrl}
      label={hit?.clip.label ?? hit?.clip.id}
      timecode={formatTc(playhead, timeline?.fps ?? 24)}
    />
  );
}
