import { resolveAlias } from "./aliases";
import { PRIMARY_COMMANDS } from "./complete";
import type { TerminalToken } from "./types";

const PRIMARY_SET = new Set<string>(PRIMARY_COMMANDS);

export function isKnownCommand(name: string) {
  const lower = name.trim().toLowerCase();
  if (!lower) return false;
  return PRIMARY_SET.has(resolveAlias(lower));
}

function looksLikePath(token: string) {
  return (
    token.startsWith("/") ||
    token.startsWith("~/") ||
    token === "~" ||
    token === "." ||
    token === ".." ||
    token.includes("/")
  );
}

/** 输入行着色：首词 command；路径样参数用 path。 */
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

  if (!rest) return tokens;

  const parts = rest.match(/(\s+|\S+)/g) ?? [rest];
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      tokens.push({ text: part, tone: "normal" });
      continue;
    }
    tokens.push({
      text: part,
      tone: looksLikePath(part) ? "path" : "normal",
    });
  }
  return tokens;
}
