/** Theme lab 试验偏好：不进生产默认路径，仅 /themes 与可选 data-* 预览。 */

export type PaperGrain = "soft" | "medium" | "strong";
export type TypeScale = "compact" | "reading" | "airy";

export const PAPER_GRAIN_KEY = "archive-paper-grain";
export const TYPE_SCALE_KEY = "archive-type-scale";

export const PAPER_GRAINS: PaperGrain[] = ["soft", "medium", "strong"];
export const TYPE_SCALES: TypeScale[] = ["compact", "reading", "airy"];

export function isPaperGrain(value: string | null | undefined): value is PaperGrain {
  return !!value && (PAPER_GRAINS as string[]).includes(value);
}

export function isTypeScale(value: string | null | undefined): value is TypeScale {
  return !!value && (TYPE_SCALES as string[]).includes(value);
}

export function readStoredPaperGrain(): PaperGrain | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(PAPER_GRAIN_KEY);
    return isPaperGrain(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function readStoredTypeScale(): TypeScale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(TYPE_SCALE_KEY);
    return isTypeScale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function applyPaperGrain(grain: PaperGrain) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.paperGrain = grain;
  try {
    localStorage.setItem(PAPER_GRAIN_KEY, grain);
  } catch {
    /* ignore */
  }
}

export function applyTypeScale(scale: TypeScale) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.typeScale = scale;
  try {
    localStorage.setItem(TYPE_SCALE_KEY, scale);
  } catch {
    /* ignore */
  }
}

/** 首页只恢复已存试验偏好；未设置则保持 CSS 默认。 */
export function bootstrapLabPrefs() {
  const grain = readStoredPaperGrain();
  if (grain) applyPaperGrain(grain);
  const scale = readStoredTypeScale();
  if (scale) applyTypeScale(scale);
}
