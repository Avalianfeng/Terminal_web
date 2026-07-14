import type { ArchiveSnapshot, TerminalSession } from "./types";
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
    current = current?.children?.find((child) => child.name === part);
    if (!current) return null;
  }

  return current;
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
