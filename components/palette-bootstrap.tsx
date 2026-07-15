"use client";

import { useEffect } from "react";
import {
  applyWorkspacePalette,
  readStoredPalette,
} from "@/lib/archive/palette";

/**
 * 合并接缝：/themes 里选的 palette 写在 localStorage，
 * 首页也必须在挂载时读回 html[data-palette]，否则「theme 不好用」。
 */
export function PaletteBootstrap() {
  useEffect(() => {
    const stored = readStoredPalette();
    if (stored) {
      applyWorkspacePalette(stored);
    }
  }, []);

  return null;
}
