'use client';

import type { TimelineCommandDto, TimelineDto } from '@/lib/api';

const EFFECTS = [
  { type: 'blur', label: 'Blur', parameters: { sigma: 8 } },
  { type: 'lut', label: 'LUT boost', parameters: {} },
  { type: 'chroma_key', label: 'Chroma key', parameters: { color: '0x00FF00', similarity: 0.2 } },
  { type: 'freeze', label: 'Freeze', parameters: {} },
  { type: 'color_grade', label: 'Grade punch', parameters: { contrast: 1.1, saturation: 1.15 } },
] as const;

export function ClipInspector({
  timeline,
  clipId,
  onCommand,
}: {
  timeline: TimelineDto | null;
  clipId: string | null;
  onCommand: (cmd: TimelineCommandDto) => void;
}) {
  const found = (() => {
    if (!timeline || !clipId) return null;
    for (const track of timeline.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  })();

  if (!found) {
    return (
      <div className="rounded-lg border border-cinema-border bg-cinema-panel/40 p-3 text-[12px] text-cinema-muted">
        Select a clip to inspect transform, speed, titles, transitions, and effects.
      </div>
    );
  }

  const { clip, track } = found;
  const cmd = (type: string, payload: Record<string, unknown>): TimelineCommandDto => ({
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    source: 'user',
  });

  return (
    <div className="rounded-lg border border-cinema-border bg-cinema-panel/40 p-3 space-y-3 text-[12px]">
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-cinema-muted font-semibold">Clip</div>
        <div className="font-medium truncate">{clip.label ?? clip.id.slice(0, 8)}</div>
        <div className="text-cinema-muted">{track.name} · speed {clip.speed}x</div>
      </div>

      <label className="block space-y-1">
        <span className="text-cinema-muted">Speed</span>
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          defaultValue={clip.speed}
          onMouseUp={(e) =>
            onCommand(cmd('set_clip_speed', { clipId: clip.id, speed: Number((e.target as HTMLInputElement).value) }))
          }
          className="w-full"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded border border-cinema-border px-2 py-1 hover:border-cinema-accent"
          onClick={() => onCommand(cmd('set_clip_speed', { clipId: clip.id, speed: clip.speed, reverse: true }))}
        >
          Reverse
        </button>
        <button
          type="button"
          className="flex-1 rounded border border-cinema-border px-2 py-1 hover:border-cinema-accent"
          onClick={() =>
            onCommand(
              cmd('set_transition', { clipId: clip.id, type: 'dissolve', duration: 0.5 }),
            )
          }
        >
          Dissolve
        </button>
      </div>

      {track.type === 'title' && (
        <label className="block space-y-1">
          <span className="text-cinema-muted">Title text</span>
          <input
            className="w-full rounded border border-cinema-border bg-cinema-bg px-2 py-1"
            defaultValue={(clip as { title?: { text?: string } }).title?.text ?? clip.label ?? ''}
            onBlur={(e) =>
              onCommand(
                cmd('set_title', {
                  clipId: clip.id,
                  text: e.target.value,
                  preset: 'lower_third',
                  fontSize: 48,
                  color: '#ffffff',
                  x: 0.5,
                  y: 0.85,
                  align: 'center',
                }),
              )
            }
          />
        </label>
      )}

      <div className="space-y-1">
        <div className="text-cinema-muted">Keyframe opacity @0 → @end</div>
        <button
          type="button"
          className="w-full rounded border border-cinema-border px-2 py-1 hover:border-cinema-accent"
          onClick={() => {
            onCommand(
              cmd('add_keyframe', {
                clipId: clip.id,
                keyframe: {
                  id: crypto.randomUUID(),
                  time: 0,
                  property: 'opacity',
                  value: 0,
                  easing: 'linear',
                },
              }),
            );
            onCommand(
              cmd('add_keyframe', {
                clipId: clip.id,
                keyframe: {
                  id: crypto.randomUUID(),
                  time: Math.max(0.1, (clip.sourceOut - clip.sourceIn) / (clip.speed || 1)),
                  property: 'opacity',
                  value: 1,
                  easing: 'linear',
                },
              }),
            );
          }}
        >
          Fade in keyframes
        </button>
      </div>

      <div className="space-y-1">
        <div className="text-cinema-muted">Effects</div>
        <div className="grid grid-cols-2 gap-1">
          {EFFECTS.map((fx) => (
            <button
              key={fx.type}
              type="button"
              className="rounded border border-cinema-border px-2 py-1 text-[11px] hover:border-cinema-accent"
              onClick={() =>
                onCommand(
                  cmd('add_effect', {
                    clipId: clip.id,
                    effect: {
                      id: crypto.randomUUID(),
                      type: fx.type,
                      enabled: true,
                      parameters: fx.parameters,
                    },
                  }),
                )
              }
            >
              {fx.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded border border-cinema-border px-2 py-1"
          onClick={() => onCommand(cmd('slip_clip', { clipId: clip.id, delta: 0.1 }))}
        >
          Slip +
        </button>
        <button
          type="button"
          className="flex-1 rounded border border-cinema-border px-2 py-1"
          onClick={() => onCommand(cmd('slide_clip', { clipId: clip.id, delta: 0.1 }))}
        >
          Slide +
        </button>
      </div>
    </div>
  );
}
