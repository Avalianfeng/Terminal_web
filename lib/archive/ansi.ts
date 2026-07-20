import type { TerminalEntry, TerminalLine, TerminalToken, TerminalTone } from "./types";

const RESET = "\x1b[0m";

/** SSR / 无 DOM 时的冷灰默认真彩。 */
const TONE_ANSI_FALLBACK: Record<TerminalTone, string> = {
  prompt: "\x1b[38;2;146;173;199m",
  user: "\x1b[38;2;126;214;178m",
  host: "\x1b[38;2;168;196;222m",
  command: "\x1b[38;2;245;190;72m",
  normal: "\x1b[38;2;219;227;235m",
  hint: "\x1b[38;2;150;166;181m",
  error: "\x1b[38;2;244;139;139m",
  success: "\x1b[38;2;152;219;174m",
  path: "\x1b[38;2;137;196;255m",
  muted: "\x1b[38;2;120;131;144m",
};

function toneAnsi(tone: TerminalTone) {
  if (typeof document !== "undefined") {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(`--tone-${tone}`)
      .trim();
    if (raw) {
      const [r, g, b] = raw.split(/\s+/).map(Number);
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return `\x1b[38;2;${r};${g};${b}m`;
      }
    }
  }
  return TONE_ANSI_FALLBACK[tone];
}

function escapeForTerminal(text: string) {
  return text.replace(/\r/g, "");
}

export function tokenToAnsi(token: TerminalToken) {
  const tone = token.tone ?? "normal";
  return `${toneAnsi(tone)}${escapeForTerminal(token.text)}${RESET}`;
}

export function lineToAnsi(line: TerminalLine) {
  if (line.tokens.length === 0) return "";
  return line.tokens.map(tokenToAnsi).join("");
}

/** 将条目转为可 `term.write` / `writeln` 的行（不含末尾换行由调用方决定）。 */
export function entryToAnsiLines(entry: TerminalEntry): string[] {
  return entry.lines.map(lineToAnsi);
}
