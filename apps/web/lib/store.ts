'use client';

import { create } from 'zustand';
import type { DepthMode } from '@studio-os/ui';

export type SelectionKind =
  | 'shot'
  | 'scene'
  | 'asset'
  | 'job'
  | 'take'
  | 'character'
  | 'clip'
  | 'brand'
  | 'variant'
  | null;

export interface SelectionState {
  kind: SelectionKind;
  id: string | null;
  label?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface StudioStore {
  selection: SelectionState;
  depthMode: DepthMode;
  focusMode: boolean;
  commandOpen: boolean;
  projectId: string | null;
  projectName: string | null;
  spendUsd: number;
  budgetUsd: number | null;
  timelinePlayhead: number;
  activeTimeline: import('./api').TimelineDto | null;
  setSelection: (selection: SelectionState) => void;
  clearSelection: () => void;
  selectShot: (id: string, label?: string, meta?: Record<string, unknown>) => void;
  setDepthMode: (mode: DepthMode) => void;
  setFocusMode: (on: boolean) => void;
  toggleFocusMode: () => void;
  setCommandOpen: (open: boolean) => void;
  toggleCommand: () => void;
  setProject: (id: string | null, name?: string | null) => void;
  setSpend: (spendUsd: number, budgetUsd?: number | null) => void;
  setTimelinePlayhead: (t: number) => void;
  setActiveTimeline: (t: import('./api').TimelineDto | null) => void;
}

export const useStudioStore = create<StudioStore>((set) => ({
  selection: { kind: null, id: null, label: null, meta: null },
  depthMode: 'director',
  focusMode: false,
  commandOpen: false,
  projectId: null,
  projectName: null,
  spendUsd: 0,
  budgetUsd: null,
  timelinePlayhead: 0,
  activeTimeline: null,

  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: { kind: null, id: null, label: null, meta: null } }),
  selectShot: (id, label, meta) =>
    set({ selection: { kind: 'shot', id, label: label ?? null, meta: meta ?? null } }),
  setDepthMode: (depthMode) => set({ depthMode }),
  setFocusMode: (focusMode) => set({ focusMode }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
  setProject: (projectId, projectName = null) => set({ projectId, projectName }),
  setSpend: (spendUsd, budgetUsd = null) => set({ spendUsd, budgetUsd }),
  setTimelinePlayhead: (timelinePlayhead) => set({ timelinePlayhead }),
  setActiveTimeline: (activeTimeline) => set({ activeTimeline }),
}));
