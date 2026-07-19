"use client";

import { useEffect, useRef } from "react";
import { resolveDemoteMs } from "@/lib/archive/motion-spec";
import {
  readingSurfaceKey,
  surfaceMetaType,
  surfacePath,
  surfaceTitle,
} from "@/lib/archive/reading-state";
import type { ReadingSurface } from "@/lib/archive/types";

type ReadingDemoteGhostProps = {
  surface: ReadingSurface;
  onDone: () => void;
};

/**
 * Phase 2b：旧主槽缩进 rail 的幽灵层。
 * 不做跨层 FLIP，只用 CSS scale + 位移；与新主槽进场并行。
 */
export function ReadingDemoteGhost({ surface, onDone }: ReadingDemoteGhostProps) {
  const doneRef = useRef(onDone);
  const sentRef = useRef(false);
  doneRef.current = onDone;

  useEffect(() => {
    sentRef.current = false;
    const ms = resolveDemoteMs();

    function signalDone() {
      if (sentRef.current) return;
      sentRef.current = true;
      doneRef.current();
    }

    if (ms <= 0) {
      signalDone();
      return;
    }

    const timer = window.setTimeout(signalDone, ms + 32);
    return () => window.clearTimeout(timer);
  }, [surface]);

  return (
    <div
      className="reading-demote-ghost"
      data-slot="demote"
      aria-hidden="true"
      data-key={readingSurfaceKey(surface)}
    >
      <p className="reading-demote-ghost__meta">{surfaceMetaType(surface)}</p>
      <p className="reading-demote-ghost__title">{surfaceTitle(surface)}</p>
      <p className="reading-demote-ghost__path">{surfacePath(surface)}</p>
    </div>
  );
}
