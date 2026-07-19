import { resolveAlias } from "./aliases";
import { PRIMARY_COMMANDS } from "./complete";
import type { TerminalToken } from "./types";

const PRIMARY_SET = new Set<string>(PRIMARY_COMMANDS);

export function isKnownCommand(name: string) {
  const lower = name.trim().toLowerCase();
  if (!lower) return false;
  return PRIMARY_SET.has(resolveAlias(lower));
}

/** 输入行着色：已知命令的首词用 command tone。 */
export function formatInputTokens(input: string): TerminalToken[] {
  if (!input) return [];

  const match = /^(\s*)(\S+)([\s\S]*)$/.exec(input);
  if (!match) return [{ text: input, tone: "normal" }];

  const [, lead = "", first = "", rest = ""] = match;
  const tokens: TerminalToken[] = [];
  if (lead) tokens.push({ text: lead, tone: "normal" });
  tokens.push({
    text: first,
    tone: isKnownCommand(first) ? "command" : "normal",
  });
  if (rest) tokens.push({ text: rest, tone: "normal" });
  return tokens;
}
