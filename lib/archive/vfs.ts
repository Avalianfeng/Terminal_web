import type { ArchiveDocument, ArchiveSnapshot, TerminalSession, TerminalToken } from "./types";
import { zhCN } from "./i18n";
import { type ContentGroup } from "./content-format";

type VfsNodeType = "dir" | "project" | "thought" | "resource" | "timeline" | "person";

export type VfsNode = {
  path: string;
  name: string;
  type: VfsNodeType;
  /** 存在 = 目录节点（含空目录与复合节点，ADR 0013）。 */
  children?: VfsNode[];
  /** 文档身份：组内多段 slug（复合节点 = 入口篇）。 */
  refSlug?: string;
};

/** 目录判断：children 存在即为目录（复合节点既是文档也是目录，ADR 0013）。 */
export function isDirectory(node: VfsNode): boolean {
  return node.children !== undefined;
}

const DOC_NODE_TYPE: Record<ContentGroup, VfsNodeType> = {
  projects: "project",
  thoughts: "thought",
  resources: "resource",
};

/** 按 slug 段递归插入：中间段建目录；叶子挂文档；同名目录+文档合并为复合节点。 */
function insertDocument(
  children: VfsNode[],
  group: ContentGroup,
  slug: string,
  segments: string[],
  pathPrefix: string,
): void {
  const [head, ...rest] = segments;
  const path = `${pathPrefix}/${head}`;

  if (rest.length === 0) {
    const existing = children.find((child) => child.name === head);
    if (existing && isDirectory(existing)) {
      // 目录已存在（簇文件夹）：挂文档身份 → 复合节点
      existing.type = DOC_NODE_TYPE[group];
      existing.refSlug = slug;
    } else if (!existing) {
      children.push({
        path,
        name: head,
        type: DOC_NODE_TYPE[group],
        refSlug: slug,
      });
    }
    return;
  }

  let dir = children.find((child) => child.name === head);
  if (!dir) {
    dir = { path, name: head, type: "dir", children: [] };
    children.push(dir);
  } else if (!isDirectory(dir)) {
    // 文档节点先到、目录后到（入口篇 + 簇文件夹）：补 children → 复合节点
    dir.children = [];
  }
  insertDocument(dir.children!, group, slug, rest, path);
}

/** 目录优先、按名排序（确定性输出）。递归应用到整棵子树。 */
function sortChildren(children: VfsNode[]): VfsNode[] {
  const sorted = [...children].sort((a, b) => {
    const aDir = isDirectory(a) ? 0 : 1;
    const bDir = isDirectory(b) ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });
  for (const child of sorted) {
    if (isDirectory(child)) {
      child.children = sortChildren(child.children ?? []);
    }
  }
  return sorted;
}

/** 按真实目录路径插入目录节点（叶子为 dir；与文档节点合并为复合节点）。 */
function insertDirNode(
  children: VfsNode[],
  segments: string[],
  pathPrefix: string,
): void {
  const [head, ...rest] = segments;
  const path = `${pathPrefix}/${head}`;
  if (rest.length === 0) {
    const existing = children.find((child) => child.name === head);
    if (existing) {
      // 文档节点先到：补 children → 复合节点；纯目录已存在 → no-op
      if (!isDirectory(existing)) existing.children = [];
    } else {
      children.push({ path, name: head, type: "dir", children: [] });
    }
    return;
  }
  let dir = children.find((child) => child.name === head);
  if (!dir) {
    dir = { path, name: head, type: "dir", children: [] };
    children.push(dir);
  } else if (!isDirectory(dir)) {
    dir.children = [];
  }
  insertDirNode(dir.children!, rest, path);
}

function groupChildren(
  group: ContentGroup,
  documents: ArchiveDocument[],
  dirPaths: string[],
): VfsNode[] {
  const children: VfsNode[] = [];
  for (const dir of dirPaths) {
    insertDirNode(children, dir.split("/"), `/${group}`);
  }
  for (const document of documents) {
    const segments = document.ref.slug.split("/");
    insertDocument(children, group, document.ref.slug, segments, `/${group}`);
  }
  return sortChildren(children);
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
        children: groupChildren(
          "projects",
          snapshot.projects,
          snapshot.directories.projects,
        ),
      },
      {
        path: "/thoughts",
        name: zhCN.vfs.thoughts,
        type: "dir",
        children: groupChildren(
          "thoughts",
          snapshot.thoughts,
          snapshot.directories.thoughts,
        ),
      },
      {
        path: "/resources",
        name: zhCN.vfs.resources,
        type: "dir",
        children: groupChildren(
          "resources",
          snapshot.resources,
          snapshot.directories.resources,
        ),
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

export function formatShellPrompt(cwd: string, role: "visitor" | "owner" = "visitor") {
  const pathPart = cwd === "/" ? "~" : `~${cwd}`;
  return `${role}@archive:${pathPart}$`;
}

/**
 * 传统 shell 配色：`user@host` 同色（绿），路径蓝，
 * `:` / `$` 用默认前景（无色分割）。
 */
export function formatShellPromptTokens(
  cwd: string,
  role: "visitor" | "owner" = "visitor",
): TerminalToken[] {
  const pathPart = cwd === "/" ? "~" : `~${cwd}`;
  return [
    { text: `${role}@archive`, tone: "user" },
    { text: ":", tone: "normal" },
    { text: pathPart, tone: "path" },
    { text: "$", tone: "normal" },
  ];
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

/**
 * 输入路径的「绝对化」：`~`/`~/x` = 根（提示符显示约定）；组前缀
 * `projects/…` = 根相对（localKey 身份语义，ADR 0013；docs/18 §6）。
 * 其余保持原样（相对 cwd 由 joinPath 处理）。
 */
function absoluteForm(input: string): string {
  if (input === "~") return "/";
  if (input.startsWith("~/")) return input.slice(1);
  if (
    input.startsWith("projects/") ||
    input.startsWith("thoughts/") ||
    input.startsWith("resources/")
  ) {
    return `/${input}`;
  }
  return input;
}

export function resolveVfsPath(
  root: VfsNode,
  cwd: string,
  inputPath: string | undefined,
) {
  const raw = inputPath?.trim() || ".";
  const targetPath = normalizePath(joinPath(cwd, absoluteForm(raw)));
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
  const needle = normalizePath(
    joinPath(cwd, absoluteForm(inputPath.trim() || ".")),
  );
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
  if (!isDirectory(node)) return [];
  return node.children ?? [];
}

export function treeLines(node: VfsNode, depth = 0): string[] {
  const prefix = depth === 0 ? "" : `${"  ".repeat(depth - 1)}|- `;
  // 根节点名已是 "/"，不再追加目录标记（否则显示 "//"）
  const marker = isDirectory(node) && node.path !== "/" ? "/" : "";
  const lines = [`${prefix}${node.name}${marker}`];
  if (!isDirectory(node)) return lines;

  for (const child of node.children ?? []) {
    lines.push(...treeLines(child, depth + 1));
  }
  return lines;
}
