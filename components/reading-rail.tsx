"use client";

import { zhCN } from "@/lib/archive/i18n";
import {
  readingSurfaceKey,
  surfaceMetaType,
  surfacePath,
  surfaceTitle,
} from "@/lib/archive/reading-state";
import type { ReadingSurface } from "@/lib/archive/types";

type ReadingRailProps = {
  items: ReadingSurface[];
  onPromote: (surface: ReadingSurface) => void;
  onDismiss: (key: string) => void;
};

/**
 * Phase 2a：已打开列表。桌面右侧窄列，窄屏主槽下方横向条。
 */
export function ReadingRail({ items, onPromote, onDismiss }: ReadingRailProps) {
  if (items.length === 0) return null;

  return (
    <aside
      className="reading-rail"
      data-slot="rail"
      aria-label={zhCN.reading.railLabel}
    >
      <p className="reading-rail__label">{zhCN.reading.railLabel}</p>
      <ul className="reading-rail__list">
        {items.map((surface) => {
          const key = readingSurfaceKey(surface);
          const title = surfaceTitle(surface);
          const path = surfacePath(surface);
          const meta = surfaceMetaType(surface);

          return (
            <li key={key} className="reading-rail__item">
              <button
                type="button"
                className="reading-rail__card"
                onClick={() => onPromote(surface)}
                title={zhCN.reading.railPromote}
              >
                <span className="reading-rail__meta">{meta}</span>
                <span className="reading-rail__title">{title}</span>
                <span className="reading-rail__path">{path}</span>
              </button>
              <button
                type="button"
                className="reading-rail__dismiss"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss(key);
                }}
                aria-label={`${zhCN.reading.railClose}: ${title}`}
                title={zhCN.reading.railClose}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
