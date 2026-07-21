import type { ArchiveSnapshot } from "./types";
import { resolveAlias } from "./aliases";
import { createVfs, listNode, resolveVfsPath, type VfsNode } from "./vfs";

/** 主命令名（不含 alias）；与 help 对齐。 */
export const PRIMARY_COMMANDS = [
  "help",
  "about",
  "projects",
  "thoughts",
  "timeline",
  "search",
  "find",
  "status",
  "open",
  "themes",
  "clear",
  "ls",
  "cd",
  "cat",
  "pwd",
  "tree",
  "whoami",
  "history",
] as const;

const ALIAS_COMMANDS = ["?", "cls", "dir", "ll"] as const;

const PATH_ARG_COMMANDS = new Set(["cd", "ls", "cat", "tree", "open"]);

export type CompleteResult = {
  /** 补全后的整行输入 */
  input: string;
  /** 当前候选（展示 / 循环） */
  candidates: string[];
  /** 是否改写了输入 */
  applied: boolean;
};

type PathFilter = "all" | "dirs" | "files";

function longestCommonPrefix(values: string[]) {
  if (values.length === 0) return "";
  let prefix = values[0] ?? "";
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function filterPrefix(values: readonly string[], prefix: string) {
  const needle = prefix.toLowerCase();
  return values.filter((value) => value.toLowerCase().startsWith(needle));
}

function joinCompletion(parentPrefix: string, name: string, isDir: boolean) {
  const joined = parentPrefix ? `${parentPrefix}${name}` : name;
  return isDir ? `${joined}/` : joined;
}

function isDirNode(node: VfsNode) {
  return node.type === "dir";
}

function matchesFilter(node: VfsNode, filter: PathFilter) {
  if (filter === "dirs") return isDirNode(node);
  if (filter === "files") return !isDirNode(node);
  return true;
}

/**
 * 路径补全。
 * - dirs：仅目录（cd）
 * - files：仅文件；目录带 `/` 仅作下钻前缀（cat 终端查看）
 * - all：目录 + 文件（ls / tree / open）
 */
function pathCandidates(
  snapshot: ArchiveSnapshot,
  cwd: string,
  partial: string,
  filter: PathFilter,
) {
  const root = createVfs(snapshot);
  const slash = partial.lastIndexOf("/");
  const parentPrefix = slash >= 0 ? partial.slice(0, slash + 1) : "";
  const namePrefix = slash >= 0 ? partial.slice(slash + 1) : partial;

  const parentPath =
    parentPrefix === ""
      ? "."
      : parentPrefix === "/"
        ? "/"
        : parentPrefix.replace(/\/$/, "") || "/";

  const parent = resolveVfsPath(root, cwd, parentPath);
  if (!parent || parent.type !== "dir") return [];

  const needle = namePrefix.toLowerCase();

  return listNode(parent)
    .filter((child) => child.name.toLowerCase().startsWith(needle))
    .filter((child) => {
      // cat：文件可选；目录仅作带 / 的下钻前缀
      if (filter === "files") return true;
      return matchesFilter(child, filter);
    })
    .map((child) =>
      joinCompletion(
        parentPrefix,
        child.name,
        filter === "dirs" ? true : isDirNode(child),
      ),
    );
}

/** cat：唯一目录时自动下钻，直到文件或分叉。 */
function catCandidates(snapshot: ArchiveSnapshot, cwd: string, partial: string) {
  let current = partial;
  let guard = 0;

  while (guard < 8) {
    guard += 1;
    const candidates = uniqueSorted(
      pathCandidates(snapshot, cwd, current, "files"),
    );

    if (candidates.length === 1 && candidates[0]!.endsWith("/")) {
      current = candidates[0]!;
      continue;
    }

    // 已在目录尾 `foo/` 且只有文件：直接返回文件路径
    if (current.endsWith("/") && candidates.length > 0) {
      return candidates;
    }

    return candidates;
  }

  return uniqueSorted(pathCandidates(snapshot, cwd, current, "files"));
}

function openCandidates(snapshot: ArchiveSnapshot, cwd: string, partial: string) {
  const fromPath = pathCandidates(snapshot, cwd, partial, "all");

  if (partial.includes("/")) {
    return uniqueSorted(fromPath);
  }

  // Tab 只推当前目录；跨目录仍可手打
  const localExtras = filterPrefix(["*", "."], partial);
  return uniqueSorted([...fromPath, ...localExtras]);
}

function argumentCandidates(
  snapshot: ArchiveSnapshot,
  cwd: string,
  command: string,
  partial: string,
) {
  const resolved = resolveAlias(command.toLowerCase());

  if (resolved === "cat") {
    return catCandidates(snapshot, cwd, partial);
  }

  if (resolved === "open") {
    return openCandidates(snapshot, cwd, partial);
  }

  if (resolved === "cd") {
    return uniqueSorted(pathCandidates(snapshot, cwd, partial, "dirs"));
  }

  if (PATH_ARG_COMMANDS.has(resolved)) {
    return uniqueSorted(pathCandidates(snapshot, cwd, partial, "all"));
  }

  return [];
}

type ParsedInput = {
  linePrefix: string;
  partial: string;
  mode: "command" | "argument";
  command: string;
};

function parseInput(raw: string): ParsedInput {
  const leading = raw.replace(/^\s+/, "");
  const hasTrailingSpace = /\s$/.test(raw);

  if (!leading) {
    return { linePrefix: "", partial: "", mode: "command", command: "" };
  }

  const firstSpace = leading.search(/\s/);
  if (firstSpace === -1) {
    return {
      linePrefix: "",
      partial: leading,
      mode: "command",
      command: leading,
    };
  }

  const command = leading.slice(0, firstSpace);
  const afterCommand = leading.slice(firstSpace).replace(/^\s+/, "");

  // `open` + 仅空格 → 补全参数（空前缀）
  if (hasTrailingSpace && afterCommand.length === 0) {
    return {
      linePrefix: `${command} `,
      partial: "",
      mode: "argument",
      command,
    };
  }

  const lastSpace = afterCommand.lastIndexOf(" ");
  if (lastSpace === -1) {
    return {
      linePrefix: `${command} `,
      partial: afterCommand,
      mode: "argument",
      command,
    };
  }

  return {
    linePrefix: `${command} ${afterCommand.slice(0, lastSpace + 1)}`,
    partial: afterCommand.slice(lastSpace + 1),
    mode: "argument",
    command,
  };
}

/**
 * Tab 补全：命令名 / 路径。
 * - cd → 仅目录
 * - cat → 终端查看文件（唯一目录自动下钻）
 * - open / ls / tree → 目录 + 文件
 */
export function completeInput(
  rawInput: string,
  snapshot: ArchiveSnapshot,
  cwd: string,
  cycleIndex: number | null = null,
): CompleteResult {
  const parsed = parseInput(rawInput);
  const candidates =
    parsed.mode === "command"
      ? filterPrefix([...PRIMARY_COMMANDS, ...ALIAS_COMMANDS], parsed.partial)
      : argumentCandidates(snapshot, cwd, parsed.command, parsed.partial);

  if (candidates.length === 0) {
    return { input: rawInput, candidates: [], applied: false };
  }

  const format =
    parsed.mode === "command"
      ? (value: string) => `${value} `
      : (value: string) => value;

  if (candidates.length === 1) {
    return {
      input: `${parsed.linePrefix}${format(candidates[0]!)}`,
      candidates,
      applied: true,
    };
  }

  if (cycleIndex !== null) {
    const index =
      ((cycleIndex % candidates.length) + candidates.length) % candidates.length;
    return {
      input: `${parsed.linePrefix}${format(candidates[index]!)}`,
      candidates,
      applied: true,
    };
  }

  const common = longestCommonPrefix(candidates);
  if (common.length > parsed.partial.length) {
    return {
      input: `${parsed.linePrefix}${common}`,
      candidates,
      applied: true,
    };
  }

  // 已在公共前缀：不改写，交给 UI 下一次 Tab 传入 cycleIndex=0
  return {
    input: rawInput,
    candidates,
    applied: false,
  };
}
