/**
 * Terminal Target Resolution (ADR 0020).
 * Absolute / relative / ~ → absolute VFS path → TargetRef / DocumentRef / VfsDirRef.
 * Commands must not parse zone themselves.
 */

import {
  CONTENT_GROUPS,
  SLUG_PATTERN,
  slugSegments,
  type ContentGroup,
} from "./content-format";
import {
  documentRef,
  tryFromVfsPath,
  type DocumentEditTarget,
  type DocumentRef,
  type DocumentZone,
  PRIVATE_ZONE_PREFIX,
} from "./document-ref";
import { zhCN } from "./i18n";
import type { ArchiveSnapshot } from "./types";
import { allSnapshotDocuments } from "./types";
import {
  createVfs,
  isDirectory,
  normalizePath,
  resolveVfsPath,
  type VfsNode,
} from "./vfs";
import { vfsDirRef, type VfsDirRef } from "./content-write";

export type TargetRef =
  | { kind: "document"; ref: DocumentRef; exists: boolean }
  | { kind: "directory"; ref: VfsDirRef; exists: boolean }
  | { kind: "root" }
  | { kind: "zone"; zone: "private" }
  | { kind: "group"; zone: DocumentZone; group: ContentGroup }
  | { kind: "bypass"; name: "person" | "timeline" };

export type PathClass =
  | { kind: "root" }
  | { kind: "zone"; zone: "private" }
  | { kind: "group"; zone: DocumentZone; group: ContentGroup }
  | { kind: "bypass"; name: "person" | "timeline" }
  | {
      kind: "writable";
      zone: DocumentZone;
      group: ContentGroup;
      segments: string[];
    }
  | { kind: "invalid" };

export type ResolveOk<T> = { ok: true; value: T };
export type ResolveErr = { ok: false; hint: string };
export type ResolveResult<T> = ResolveOk<T> | ResolveErr;

/** Absolute VFS directory path → zone + group + segments; else null. */
export function splitVfsDirPath(
  vfsPath: string,
): { zone: DocumentZone; group: ContentGroup; segments: string[] } | null {
  const parts = vfsPath.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  let zone: DocumentZone = "public";
  let group: string;
  let segments: string[];
  if (parts[0] === PRIVATE_ZONE_PREFIX) {
    if (parts.length < 3) return null;
    zone = "private";
    group = parts[1]!;
    segments = parts.slice(2);
  } else {
    group = parts[0]!;
    segments = parts.slice(1);
  }
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) return null;
  if (slugSegments(segments.join("/")) === null) return null;
  return { zone, group: group as ContentGroup, segments };
}

/**
 * Raw token + cwd → absolute VFS path.
 * `~` / `~/x` = root-absolute; leading `/` never joins cwd; else relative to cwd.
 */
export function resolveAbsoluteVfsPath(cwd: string, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return normalizePath(cwd);
  let form = trimmed;
  if (form === "~") form = "/";
  else if (form.startsWith("~/")) form = form.slice(1);
  if (form.startsWith("/")) return normalizePath(form);
  return normalizePath(`${cwd}/${form}`);
}

export function classifyPath(absPath: string): PathClass {
  const path = normalizePath(absPath);
  if (path === "/") return { kind: "root" };
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "root" };

  if (parts[0] === "person" && parts.length === 1) {
    return { kind: "bypass", name: "person" };
  }
  if (parts[0] === "timeline" && parts.length === 1) {
    return { kind: "bypass", name: "timeline" };
  }

  if (parts[0] === PRIVATE_ZONE_PREFIX) {
    if (parts.length === 1) return { kind: "zone", zone: "private" };
    const group = parts[1]!;
    if (!CONTENT_GROUPS.includes(group as ContentGroup)) {
      return { kind: "invalid" };
    }
    if (parts.length === 2) {
      return { kind: "group", zone: "private", group: group as ContentGroup };
    }
    const segments = parts.slice(2);
    if (slugSegments(segments.join("/")) === null) return { kind: "invalid" };
    return {
      kind: "writable",
      zone: "private",
      group: group as ContentGroup,
      segments,
    };
  }

  const group = parts[0]!;
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) {
    return { kind: "invalid" };
  }
  if (parts.length === 1) {
    return { kind: "group", zone: "public", group: group as ContentGroup };
  }
  const segments = parts.slice(1);
  if (slugSegments(segments.join("/")) === null) return { kind: "invalid" };
  return {
    kind: "writable",
    zone: "public",
    group: group as ContentGroup,
    segments,
  };
}

function hintForNonWritable(cls: PathClass, abs: string): string {
  switch (cls.kind) {
    case "root":
      return `${zhCN.errors.writeNotAtRoot}: ${abs}`;
    case "zone":
      return `${zhCN.errors.writeNotAtZone}: ${abs}`;
    case "group":
      return `${zhCN.errors.writeNotAtGroup}: ${abs}`;
    case "bypass":
      return `${zhCN.errors.writeNotBypass}: ${abs}`;
    case "invalid":
      return `${zhCN.errors.writeInvalidTarget}: ${abs}`;
    default:
      return `${zhCN.errors.writeInvalidTarget}: ${abs}`;
  }
}

function findDoc(
  snapshot: ArchiveSnapshot,
  ref: DocumentRef,
): boolean {
  return allSnapshotDocuments(snapshot).some(
    (document) =>
      document.ref.zone === ref.zone &&
      document.ref.group === ref.group &&
      document.ref.slug === ref.slug,
  );
}

function vfsNodeAt(
  snapshot: ArchiveSnapshot,
  absPath: string,
): VfsNode | null {
  const root = createVfs(snapshot);
  return resolveVfsPath(root, "/", absPath);
}

/**
 * edit：路径必须可写；可不存在（新建）。
 * 相对裸 slug：若档案中唯一匹配已有文档 slug，视为打开该文档。
 */
export function resolveCreatableDocument(
  cwd: string,
  rawToken: string,
  snapshot: ArchiveSnapshot,
): ResolveResult<DocumentEditTarget> {
  const token = rawToken.trim().replace(/\.md$/, "");
  if (!token) {
    return { ok: false, hint: zhCN.errors.usageEdit };
  }

  const abs = resolveAbsoluteVfsPath(cwd, token);
  const cls = classifyPath(abs);

  if (cls.kind === "writable") {
    const ref = documentRef(cls.group, cls.segments.join("/"), cls.zone);
    const node = vfsNodeAt(snapshot, abs);
    if (node) {
      if (
        node.type === "project" ||
        node.type === "thought" ||
        node.type === "resource"
      ) {
        return { ok: true, value: { ref, exists: true } };
      }
      if (node.type === "dir" && tryFromVfsPath(node.path)) {
        // 纯目录：编辑入口篇 → 新建复合节点
        return { ok: true, value: { ref, exists: findDoc(snapshot, ref) } };
      }
      return { ok: false, hint: zhCN.errors.notFile };
    }
    return {
      ok: true,
      value: { ref, exists: findDoc(snapshot, ref) },
    };
  }

  // 相对裸 slug：唯一已有文档；根 cwd 下无命中则默认新建到 projects/
  const isRelativeBare =
    !token.startsWith("/") &&
    !token.startsWith("~") &&
    !token.includes("/");
  if (isRelativeBare && SLUG_PATTERN.test(token)) {
    const needle = token.toLowerCase();
    const hits = allSnapshotDocuments(snapshot).filter(
      (document) => document.ref.slug.toLowerCase() === needle,
    );
    if (hits.length === 1) {
      return {
        ok: true,
        value: { ref: hits[0]!.ref, exists: true },
      };
    }
    if (normalizePath(cwd) === "/") {
      const ref = documentRef("projects", token, "public");
      return {
        ok: true,
        value: { ref, exists: findDoc(snapshot, ref) },
      };
    }
  }

  return { ok: false, hint: hintForNonWritable(cls, abs) };
}

/** rm：必须是已存在文档；目录 → 提示 rmdir。 */
export function resolveExistingDocument(
  cwd: string,
  rawToken: string,
  snapshot: ArchiveSnapshot,
): ResolveResult<{ ref: DocumentRef; vfsPath: string }> {
  const token = rawToken.trim().replace(/\.md$/, "");
  if (!token) {
    return { ok: false, hint: zhCN.errors.usageRm };
  }

  const abs = resolveAbsoluteVfsPath(cwd, token);
  const cls = classifyPath(abs);

  if (cls.kind === "writable") {
    const ref = documentRef(cls.group, cls.segments.join("/"), cls.zone);
    const node = vfsNodeAt(snapshot, abs);
    if (node && isDirectory(node) && node.type === "dir" && !node.refSlug) {
      return { ok: false, hint: `${zhCN.errors.rmUseRmdir}: ${abs}` };
    }
    if (!findDoc(snapshot, ref)) {
      // 复合/文档节点或盘上存在
      if (
        node &&
        (node.type === "project" ||
          node.type === "thought" ||
          node.type === "resource")
      ) {
        return { ok: true, value: { ref, vfsPath: abs } };
      }
      return { ok: false, hint: `${zhCN.errors.rmMissing}: ${abs}` };
    }
    return { ok: true, value: { ref, vfsPath: abs } };
  }

  const isRelativeBare =
    !token.startsWith("/") &&
    !token.startsWith("~") &&
    !token.includes("/");
  if (isRelativeBare && SLUG_PATTERN.test(token)) {
    const needle = token.toLowerCase();
    const hits = allSnapshotDocuments(snapshot).filter(
      (document) => document.ref.slug.toLowerCase() === needle,
    );
    if (hits.length === 1) {
      const ref = hits[0]!.ref;
      const vfsPath =
        ref.zone === "private"
          ? `/${PRIVATE_ZONE_PREFIX}/${ref.group}/${ref.slug}`
          : `/${ref.group}/${ref.slug}`;
      return { ok: true, value: { ref, vfsPath } };
    }
  }

  if (cls.kind === "group" || cls.kind === "zone" || cls.kind === "root") {
    return { ok: false, hint: `${zhCN.errors.rmUseRmdir}: ${abs}` };
  }
  return { ok: false, hint: hintForNonWritable(cls, abs) };
}

/** mkdir：可写目录路径（递归创建；已存在由盘侧 no-op）。 */
export function resolveCreatableDirectory(
  cwd: string,
  rawTarget: string,
): ResolveResult<{ vfsPath: string; ref: VfsDirRef }> {
  const target = rawTarget.trim();
  if (!target) {
    return { ok: false, hint: zhCN.errors.usageMkdir };
  }
  const abs = resolveAbsoluteVfsPath(cwd, target);
  const cls = classifyPath(abs);
  if (cls.kind !== "writable") {
    return { ok: false, hint: hintForNonWritable(cls, abs) };
  }
  const ref = vfsDirRef(cls.group, cls.segments, cls.zone);
  return { ok: true, value: { vfsPath: abs, ref } };
}

/** rmdir：可写目录路径形状；是否存在 / 是否为空由盘侧校验。 */
export function resolveExistingDirectory(
  cwd: string,
  rawTarget: string,
  _snapshot?: ArchiveSnapshot,
): ResolveResult<{ vfsPath: string; ref: VfsDirRef }> {
  const target = rawTarget.trim();
  if (!target) {
    return { ok: false, hint: zhCN.errors.usageRmdir };
  }
  return resolveCreatableDirectory(cwd, target);
}

/**
 * open / cat / ls 共用：绝对化后再查 VFS（不拼 cwd 到 ~/ 或 /…）。
 * `stripMd`：剥 `.md` 尾缀（shell 习惯）。
 */
export function lookupVfsNode(
  cwd: string,
  raw: string,
  snapshot: ArchiveSnapshot,
  options?: { stripMd?: boolean },
): {
  abs: string;
  node: VfsNode | null;
  parentDirExists: boolean;
} {
  let token = raw.trim();
  if (options?.stripMd !== false) {
    token = token.replace(/\.md$/, "");
  }
  const abs = resolveAbsoluteVfsPath(cwd, token || ".");
  const root = createVfs(snapshot);
  const node = resolveVfsPath(root, "/", abs);
  if (node) {
    return { abs, node, parentDirExists: false };
  }
  const parts = abs.split("/").filter(Boolean);
  parts.pop();
  if (parts.length === 0) {
    return { abs, node: null, parentDirExists: false };
  }
  const parent = resolveVfsPath(root, "/", `/${parts.join("/")}`);
  return {
    abs,
    node: null,
    parentDirExists: Boolean(parent && isDirectory(parent)),
  };
}

/** find 查询若呈路径形（`/` / `~` / 含 `/`），先绝对化再作子串针。 */
export function normalizeFindNeedle(cwd: string, query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "";
  const pathLike =
    trimmed === "~" ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~") ||
    trimmed.includes("/");
  if (!pathLike) return trimmed.toLowerCase();
  return resolveAbsoluteVfsPath(cwd, trimmed).toLowerCase();
}
