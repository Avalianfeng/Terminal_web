export type WorkspacePalette = "cool-atelier" | "warm-folio" | "ledger-bright";

export const PALETTE_STORAGE_KEY = "archive-workspace-palette";

export const WORKSPACE_PALETTES: WorkspacePalette[] = [
  "cool-atelier",
  "warm-folio",
  "ledger-bright",
];

export function isWorkspacePalette(value: string | null | undefined): value is WorkspacePalette {
  return !!value && (WORKSPACE_PALETTES as string[]).includes(value);
}

export function readStoredPalette(): WorkspacePalette | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    return isWorkspacePalette(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** 挂到 html[data-palette]，供 CSS 变量与 xterm 读色。 */
export function applyWorkspacePalette(id: WorkspacePalette) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.palette = id;
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

function cssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function toneRgb(name: string, fallback: string) {
  const raw = cssVar(name, "");
  if (!raw) return fallback;
  return `rgb(${raw})`;
}

/** 从当前 palette token 读 xterm 主题（合并后的接缝：表面跟 CSS）。 */
export function readXtermThemeFromCss() {
  return {
    background: cssVar("--archive-black", "#090a0b"),
    foreground: toneRgb("--tone-normal", "rgb(219, 227, 235)"),
    cursor: cssVar("--archive-accent", "#b8c7d9"),
    cursorAccent: cssVar("--archive-black", "#090a0b"),
    selectionBackground: cssVar(
      "--terminal-selection-bg",
      "rgba(184, 199, 217, 0.28)",
    ),
    selectionForeground: "#ffffff",
  };
}
