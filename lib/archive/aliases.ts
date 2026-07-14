const aliasMap: Record<string, string> = {
  "?": "help",
  cls: "clear",
  dir: "ls",
  ll: "ls",
};

export function resolveAlias(command: string) {
  return aliasMap[command] ?? command;
}
