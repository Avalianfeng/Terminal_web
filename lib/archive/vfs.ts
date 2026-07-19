import type { ArchiveSnapshot, TerminalSession, TerminalToken } from "./types";
import { zhCN } from "./i18n";

type VfsNodeType = "dir" | "project" | "thought" | "timeline" | "person";

export type VfsNode = {
  path: string;
  name: string;
  type: VfsNodeType;
  children?: VfsNode[];
  refSlug?: string;
};

function joinPath(base: string, next: string) {
  if (next.startsWith("/")) return normalizePath(next);
  return normalizePath(`${base}/${next}`);
}

export function normalizePath(value: string) {
  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const stack: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  return `/${stack.join("/")}`.replace(/\/+/g, "/");
}

export function createSession(): TerminalSession {
  return {
    cwd: "/",
    commandHistory: [],
  };
}

/** Shell 提示符：根目录显示 ~，否则 ~/相对路径。 */
export function formatShellPrompt(cwd: string) {
  const pathPart = cwd === "/" ? "~" : `~${cwd}`;
  return `visitor@archive:${pathPart}$`;
}

/**
 * 传统 shell 配色：`user@host` 同色（绿），路径蓝，
 * `:` / `$` 用默认前景（无色分割）。
 */
export function formatShellPromptTokens(cwd: string): TerminalToken[] {
  const pathPart = cwd === "/" ? "~" : `~${cwd}`;
  return [
    { text: "visitor@archive", tone: "user" },
    { text: ":", tone: "normal" },
    { text: pathPart, tone: "path" },
    { text: "$", tone: "normal" },
  ];
}

export function createVfs(snapshot: ArchiveSnapshot): VfsNode {
  return {
    path: "/",
    name: zhCN.vfs.root,
    type: "dir",
    children: [
      {
        path: "/projects",
        name: zhCN.vfs.projects,
        type: "dir",
        children: snapshot.projects.map((project) => ({
          path: `/projects/${project.slug}`,
          name: project.slug,
          type: "project",
          refSlug: project.slug,
        })),
      },
      {
        path: "/thoughts",
        name: zhCN.vfs.thoughts,
        type: "dir",
        children: snapshot.thoughts.map((thought) => ({
          path: `/thoughts/${thought.slug}`,
          name: thought.slug,
          type: "thought",
          refSlug: thought.slug,
        })),
      },
      {
        path: "/timeline",
        name: zhCN.vfs.timeline,
        type: "timeline",
      },
      {
        path: "/person",
        name: zhCN.vfs.person,
        type: "person",
      },
    ],
  };
}

/** 短字符串编辑距离；路径段名通常很短。 */
function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j] ?? 0;
    }
  }

  return prev[b.length] ?? b.length;
}

/** 精确，或唯一的忽略大小写命中。不做编辑距离自动纠正。 */
function findChild(node: VfsNode, part: string): VfsNode | null {
  const children = node.children ?? [];
  if (children.length === 0) return null;

  const exact = children.find((child) => child.name === part);
  if (exact) return exact;

  const lower = part.toLowerCase();
  const caseHits = children.filter((child) => child.name.toLowerCase() === lower);
  return caseHits.length === 1 ? caseHits[0]! : null;
}

export function resolveVfsPath(
  root: VfsNode,
  cwd: string,
  inputPath: string | undefined,
) {
  const targetPath = normalizePath(joinPath(cwd, inputPath?.trim() || "."));
  if (targetPath === "/") return root;

  const parts = targetPath.split("/").filter(Boolean);
  let current: VfsNode | undefined = root;

  for (const part of parts) {
    if (!current) return null;
    const next = findChild(current, part);
    if (!next) return null;
    current = next;
  }

  return current;
}

function collectLeafPaths(node: VfsNode, acc: string[] = []) {
  acc.push(node.path);
  for (const child of node.children ?? []) {
    collectLeafPaths(child, acc);
  }
  return acc;
}

function displayPath(absolute: string, cwd: string) {
  if (cwd !== "/" && (absolute === cwd || absolute.startsWith(`${cwd}/`))) {
    const relative = absolute.slice(cwd.length).replace(/^\//, "");
    return relative || ".";
  }
  if (absolute === "/") return "/";
  return absolute.replace(/^\//, "");
}

/** 路径不存在时给出相近候选（相对 cwd 优先写法）。 */
export function suggestVfsPaths(
  root: VfsNode,
  cwd: string,
  inputPath: string,
  limit = 3,
) {
  const needle = normalizePath(joinPath(cwd, inputPath.trim() || "."));
  const needleLower = needle.toLowerCase();
  const lastSeg = needle.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";

  const scored = collectLeafPaths(root)
    .filter((path) => path !== "/")
    .map((path) => {
      const pathLower = path.toLowerCase();
      const seg = path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
      const fullDist = editDistance(needleLower, pathLower);
      const segDist = lastSeg ? editDistance(lastSeg, seg) : 99;
      const contains =
        lastSeg.length >= 2 && (seg.includes(lastSeg) || pathLower.includes(lastSeg))
          ? 0
          : 1;
      const score = Math.min(fullDist, segDist + 1) + contains;
      return { path, score, segDist };
    })
    .filter((item) => item.score <= 4 || item.segDist <= 2)
    .sort((a, b) => a.score - b.score || a.path.length - b.path.length);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of scored) {
    const label = displayPath(item.path, cwd);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

export function listNode(node: VfsNode) {
  if (node.type !== "dir") return [];
  return node.children ?? [];
}

export function treeLines(node: VfsNode, depth = 0): string[] {
  const prefix = depth === 0 ? "" : `${"  ".repeat(depth - 1)}|- `;
  const marker = node.type === "dir" ? "/" : "";
  const lines = [`${prefix}${node.name}${marker}`];
  if (node.type !== "dir") return lines;

  for (const child of node.children ?? []) {
    lines.push(...treeLines(child, depth + 1));
  }
  return lines;
}
