export type WorkspacePalette =
  | "cool-atelier"
  | "warm-folio"
  | "ledger-bright"
  | "ink-drawer"
  | "mist-atelier";

export const PALETTE_STORAGE_KEY = "archive-workspace-palette";

/** 生产默认 + 已稳定方向 */
export const PRODUCTION_PALETTES: WorkspacePalette[] = ["cool-atelier"];

/** 试验台可切换的全部方向（含 lab） */
export const WORKSPACE_PALETTES: WorkspacePalette[] = [
  "cool-atelier",
  "warm-folio",
  "ledger-bright",
  "ink-drawer",
  "mist-atelier",
];

/** 终端语义色；与 CSS `--tone-*` / ANSI / xterm 16 色对齐。 */
export const TERMINAL_TONE_KEYS = [
  "normal",
  "prompt",
  "user",
  "host",
  "command",
  "hint",
  "error",
  "success",
  "path",
  "muted",
] as const;

export type TerminalToneKey = (typeof TERMINAL_TONE_KEYS)[number];

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

/** 挂到 html[data-palette]，供 CSS 变量与 xterm 取色。 */
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

function toneTriplet(name: string): [number, number, number] | null {
  const raw = cssVar(name, "");
  if (!raw) return null;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) {
    return null;
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

function toneRgb(name: string, fallback: string) {
  const triple = toneTriplet(name);
  if (!triple) return fallback;
  return `rgb(${triple[0]}, ${triple[1]}, ${triple[2]})`;
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function liftRgb(rgb: string, amount: number) {
  const match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(rgb);
  if (!match) return rgb;
  const r = clampByte(Number(match[1]) + amount);
  const g = clampByte(Number(match[2]) + amount);
  const b = clampByte(Number(match[3]) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

/** 读当前 palette 的 tone 分量，供 /themes 预览。 */
export function readTerminalToneSwatches(): Record<TerminalToneKey, string> {
  const out = {} as Record<TerminalToneKey, string>;
  for (const key of TERMINAL_TONE_KEYS) {
    out[key] = toneRgb(`--tone-${key}`, "rgb(160, 160, 160)");
  }
  return out;
}

/**
 * 从当前 palette token 读 xterm 主题（含 16 色 ANSI）。
 * 真彩输出仍走 ansi.ts 的 `--tone-*`；此处补齐标准 ANSI 色位。
 */
export function readXtermThemeFromCss() {
  const normal = toneRgb("--tone-normal", "rgb(219, 227, 235)");
  const muted = toneRgb("--tone-muted", "rgb(120, 131, 144)");
  const error = toneRgb("--tone-error", "rgb(244, 139, 139)");
  const success = toneRgb("--tone-success", "rgb(152, 219, 174)");
  const command = toneRgb("--tone-command", "rgb(245, 190, 72)");
  const path = toneRgb("--tone-path", "rgb(137, 196, 255)");
  const prompt = toneRgb("--tone-prompt", "rgb(146, 173, 199)");
  const user = toneRgb("--tone-user", "rgb(118, 188, 148)");
  const hint = toneRgb("--tone-hint", "rgb(150, 166, 181)");

  return {
    background: cssVar("--archive-black", "#090a0b"),
    foreground: normal,
    cursor: cssVar("--archive-accent", "#b8c7d9"),
    cursorAccent: cssVar("--archive-black", "#090a0b"),
    selectionBackground: cssVar(
      "--terminal-selection-bg",
      "rgba(184, 199, 217, 0.28)",
    ),
    selectionForeground: "#ffffff",
    black: cssVar("--archive-black", "#090a0b"),
    red: error,
    green: success,
    yellow: command,
    blue: path,
    magenta: prompt,
    cyan: user,
    white: normal,
    brightBlack: muted,
    brightRed: liftRgb(error, 24),
    brightGreen: liftRgb(success, 24),
    brightYellow: liftRgb(command, 20),
    brightBlue: liftRgb(path, 20),
    brightMagenta: liftRgb(prompt, 24),
    brightCyan: liftRgb(hint, 20),
    brightWhite: liftRgb(normal, 16),
  };
}
