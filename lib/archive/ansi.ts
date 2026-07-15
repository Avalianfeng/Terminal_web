import type { TerminalEntry, TerminalLine, TerminalToken, TerminalTone } from "./types";

const RESET = "\x1b[0m";

/** 档位 1：有限真彩，对齐现有 tone，不做 256 色展台。 */
const TONE_ANSI: Record<TerminalTone, string> = {
  prompt: "\x1b[38;2;146;173;199m",
  command: "\x1b[38;2;206;225;247m",
  normal: "\x1b[38;2;219;227;235m",
  hint: "\x1b[38;2;150;166;181m",
  error: "\x1b[38;2;244;139;139m",
  success: "\x1b[38;2;152;219;174m",
  path: "\x1b[38;2;137;196;255m",
  muted: "\x1b[38;2;120;131;144m",
};

function escapeForTerminal(text: string) {
  return text.replace(/\r/g, "");
}

export function tokenToAnsi(token: TerminalToken) {
  const tone = token.tone ?? "normal";
  return `${TONE_ANSI[tone]}${escapeForTerminal(token.text)}${RESET}`;
}

export function lineToAnsi(line: TerminalLine) {
  if (line.tokens.length === 0) return "";
  return line.tokens.map(tokenToAnsi).join("");
}

/** 将条目转为可 `term.write` / `writeln` 的行（不含末尾换行由调用方决定）。 */
export function entryToAnsiLines(entry: TerminalEntry): string[] {
  return entry.lines.map(lineToAnsi);
}
