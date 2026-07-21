"use client";

import { useEffect } from "react";
import { bootstrapLabPrefs } from "@/lib/archive/lab-prefs";
import {
  applyWorkspacePalette,
  readStoredPalette,
} from "@/lib/archive/palette";

/**
 * 合并接缝：/themes 里选的 palette / lab 偏好写在 localStorage，
 * 首页也必须在挂载时读回 html[data-*]。
 */
export function PaletteBootstrap() {
  useEffect(() => {
    const stored = readStoredPalette();
    if (stored) {
      applyWorkspacePalette(stored);
    }
    bootstrapLabPrefs();
  }, []);

  return null;
}
