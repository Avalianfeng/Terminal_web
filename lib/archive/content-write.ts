import { createHash } from "crypto";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "fs/promises";
import path from "path";
import {
  CONTENT_GROUPS,
  parseFrontmatter,
  serializeDocument,
  slugSegments,
  type ContentGroup,
} from "./content-format";
import type { FrontmatterField } from "./content-format";
import { getContentRoot, contentRootForZone } from "./content";
import { toLocalKey, type DocumentRef } from "./document-ref";
import type { DocumentZone } from "./document-ref";
import { PRIVATE_ZONE_PREFIX } from "./document-ref";

export type { ContentGroup };

/** Structured PUT fields (identity is DocumentRef, not repeated here). */
export type DocumentWriteFields = {
  title: string;
  summary?: string;
  status?: string;
  tags?: string[];
  body?: string;
};

/**
 * PATCH 部分更新输入。三态：
 * - `undefined` = 保留原字段
 * - `null` / `""` / `[]` = 移除该字段（原字段不存在时为 no-op，不报错）
 * - 有值 = 覆盖；`title` 不可移除（null/"" → bad_request）
 */
export type DocumentPatch = {
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  tags?: string[] | null;
  body?: string | null;
};

export type SaveResult = {
  created: boolean;
  /** SHA-256 of bytes written (hex). */
  hash: string;
};

/** 写操作可选约束：乐观并发（If-Match / expectedHash）。 */
export type WriteOptions = {
  /** 期望的当前文件内容 SHA-256（hex）；不匹配或文件不存在 → conflict。 */
  expectedHash?: string;
};

export type WriteErrorCode = "bad_request" | "not_found" | "conflict";

export class WriteError extends Error {
  readonly code: WriteErrorCode;

  constructor(code: WriteErrorCode, message: string) {
    super(message);
    this.name = "WriteError";
    this.code = code;
  }
}

/**
 * Disk path for a validated DocumentRef（ADR 0013 多段；ADR 0019 zone）：
 * `content/<group>/…` or `content/private/<group>/…`.
 */
export function resolveContentPath(ref: DocumentRef): string {
  return (
    path.join(contentRootForZone(ref.zone), ref.group, ...ref.slug.split("/")) +
    ".md"
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

/** 文件内容 SHA-256（hex）；读详情/写 If-Match 共用同一 hash 语义。 */
export function hashRaw(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** expectedHash 存在时校验当前文件版本；不满足 → conflict。 */
async function assertVersion(
  filePath: string,
  expectedHash: string | undefined,
): Promise<void> {
  if (expectedHash === undefined) return;
  const current = await readFile(filePath, "utf8").catch(() => null);
  if (current === null) {
    throw new WriteError(
      "conflict",
      "Document does not exist; If-Match precondition failed",
    );
  }
  if (hashRaw(current) !== expectedHash) {
    throw new WriteError(
      "conflict",
      "Document changed since baseHash; If-Match precondition failed",
    );
  }
}

/** 临时文件 + rename：避免写一半留下残缺文档。 */
async function writeAtomic(filePath: string, content: string) {
  await assertInsideContentRoot(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  try {
    await rename(tmpPath, filePath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}

/** 写文档前确保父目录存在（多段路径自动建目录，ADR 0013）。 */
async function ensureParentDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

/** target 是否在 root（realpath 后）之内；二者相等也视为在内。 */
function isUnderRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (rel !== ".." &&
      !rel.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(rel))
  );
}

/**
 * realpath 包含校验（安全审查 #2）：目标或其最近存在的祖先必须在 root 内，
 * 防止 junction/symlink 把读写带出 content/。root 可注入（测试用）。
 */
async function assertInsideContentRoot(
  target: string,
  root: string = getContentRoot(),
): Promise<void> {
  const rootReal = await realpath(root).catch(() => null);
  if (rootReal === null) {
    throw new WriteError("bad_request", "Content root does not exist");
  }
  let probe = target;
  for (let i = 0; i < 64; i += 1) {
    const real = await realpath(probe).catch(() => null);
    if (real !== null) {
      if (!isUnderRoot(rootReal, real)) {
        throw new WriteError("bad_request", "Path escapes the content root");
      }
      return;
    }
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  throw new WriteError(
    "bad_request",
    "Path has no existing ancestor under the content root",
  );
}

function tagsToField(tags?: string[]): FrontmatterField | null {
  if (!tags || tags.length === 0) return null;
  return { key: "tags", value: tags.join(", ") };
}

function toFields(input: DocumentWriteFields): FrontmatterField[] {
  return [
    { key: "title", value: input.title },
    ...(input.summary ? [{ key: "summary", value: input.summary }] : []),
    ...(input.status ? [{ key: "status", value: input.status }] : []),
    ...(tagsToField(input.tags) ? [tagsToField(input.tags)!] : []),
  ];
}

/** 创建或覆盖文档（upsert；编辑即保存）。多段路径自动建父目录。 */
export async function saveDocument(
  ref: DocumentRef,
  fields: DocumentWriteFields,
  options?: WriteOptions,
): Promise<SaveResult> {
  const filePath = resolveContentPath(ref);
  const existed = await fileExists(filePath);
  await assertVersion(filePath, options?.expectedHash);
  const content = serializeDocument(toFields(fields), fields.body ?? "");
  await ensureParentDir(filePath);
  await writeAtomic(filePath, content);
  return { created: !existed, hash: hashRaw(content) };
}

function upsertField(fields: FrontmatterField[], key: string, value: string) {
  const index = fields.findIndex((field) => field.key === key);
  if (index === -1) fields.push({ key, value });
  else fields[index] = { key, value };
}

function removeField(fields: FrontmatterField[], key: string) {
  const index = fields.findIndex((field) => field.key === key);
  if (index !== -1) fields.splice(index, 1);
}

/**
 * 部分更新：省略=保留、null/""/[]=移除（原字段不存在 → no-op）、有值=覆盖。
 * 与原文件同一次读盘完成 If-Match 校验；在原 fields 数组上保序原位改。
 */
export async function patchDocument(
  ref: DocumentRef,
  patch: DocumentPatch,
  options?: WriteOptions,
): Promise<SaveResult> {
  const filePath = resolveContentPath(ref);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (raw === null) {
    throw new WriteError("not_found", `No document at ${toLocalKey(ref)}`);
  }
  if (
    options?.expectedHash !== undefined &&
    hashRaw(raw) !== options.expectedHash
  ) {
    throw new WriteError(
      "conflict",
      "Document changed since baseHash; If-Match precondition failed",
    );
  }

  const parsed = parseFrontmatter(raw);
  const fields = parsed.fields;

  if (patch.title !== undefined) {
    if (typeof patch.title !== "string" || !patch.title.trim()) {
      throw new WriteError("bad_request", "title cannot be deleted or empty");
    }
    upsertField(fields, "title", patch.title);
  }
  if (patch.summary !== undefined) {
    if (patch.summary === null || patch.summary === "") {
      removeField(fields, "summary");
    } else {
      upsertField(fields, "summary", patch.summary);
    }
  }
  if (patch.status !== undefined) {
    if (patch.status === null || patch.status === "") {
      removeField(fields, "status");
    } else {
      upsertField(fields, "status", patch.status);
    }
  }
  if (patch.tags !== undefined) {
    if (patch.tags === null || patch.tags.length === 0) {
      removeField(fields, "tags");
    } else {
      upsertField(fields, "tags", patch.tags.join(", "));
    }
  }

  const body = patch.body === undefined ? parsed.body : (patch.body ?? "");
  const content = serializeDocument(fields, body);
  await ensureParentDir(filePath);
  await writeAtomic(filePath, content);
  return { created: false, hash: hashRaw(content) };
}

/**
 * 直接保存整份 raw markdown（终端编辑面板用）。
 * 解析 frontmatter 校验 title 必填，再规范化序列化写回。
 */
export async function saveDocumentRaw(
  ref: DocumentRef,
  raw: string,
  options?: WriteOptions,
): Promise<SaveResult> {
  const filePath = resolveContentPath(ref);
  const parsed = parseFrontmatter(raw);

  const title = parsed.fields.find((field) => field.key === "title")?.value.trim();
  if (!title) {
    throw new WriteError(
      "bad_request",
      `Missing required frontmatter field: title`,
    );
  }

  const existed = await fileExists(filePath);
  await assertVersion(filePath, options?.expectedHash);
  const content = serializeDocument(parsed.fields, parsed.body);
  await ensureParentDir(filePath);
  await writeAtomic(filePath, content);
  return { created: !existed, hash: hashRaw(content) };
}

/** 读取整份原文（含 frontmatter）；不存在 → not_found。 */
export async function readDocumentRaw(ref: DocumentRef): Promise<string> {
  const filePath = resolveContentPath(ref);
  await assertInsideContentRoot(filePath);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new WriteError("not_found", `No document at ${toLocalKey(ref)}`);
  }
}

/** 删除文档；不存在 → not_found。可选 expectedHash。不级联删父目录（ADR 0013）。 */
export async function deleteDocument(
  ref: DocumentRef,
  options?: WriteOptions,
): Promise<void> {
  const filePath = resolveContentPath(ref);
  await assertInsideContentRoot(filePath);
  await assertVersion(filePath, options?.expectedHash);
  try {
    await unlink(filePath);
  } catch {
    throw new WriteError("not_found", `No document at ${toLocalKey(ref)}`);
  }
}

/** VFS 目录身份：zone + 组 + ≥1 段（每段 slug 白名单）。 */
export type VfsDirRef = {
  zone: DocumentZone;
  group: ContentGroup;
  segments: string[];
};

export function vfsDirRef(
  group: ContentGroup,
  segments: string[],
  zone: DocumentZone = "public",
): VfsDirRef {
  if (!CONTENT_GROUPS.includes(group)) {
    throw new WriteError("bad_request", `Unknown group: ${group}`);
  }
  if (segments.length === 0 || slugSegments(segments.join("/")) === null) {
    throw new WriteError(
      "bad_request",
      `Invalid directory: ${zone === "private" ? "private/" : ""}${group}/${segments.join("/")}. Each segment must match [a-z0-9_-]+.`,
    );
  }
  if (group === (PRIVATE_ZONE_PREFIX as string)) {
    throw new WriteError(
      "bad_request",
      `"private" is a zone prefix, not a content group`,
    );
  }
  return { zone, group, segments };
}

/** 目录盘路径；`root` 可注入（测试用），默认按 zone 解析。 */
export function resolveContentDir(
  ref: VfsDirRef,
  root: string = contentRootForZone(ref.zone),
): string {
  return path.join(root, ref.group, ...ref.segments);
}

async function isDirectoryPath(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** 创建目录（递归，mkdir -p 语义）；已存在 → created:false（no-op）。 */
export async function createDirectory(
  ref: VfsDirRef,
  root?: string,
): Promise<{ created: boolean }> {
  const zoneRoot = root ?? contentRootForZone(ref.zone);
  const dir = resolveContentDir(ref, zoneRoot);
  await assertInsideContentRoot(dir, root ?? getContentRoot());
  const existed = await isDirectoryPath(dir);
  await mkdir(dir, { recursive: true });
  return { created: !existed };
}

/** 删除**空**目录；不存在 → not_found；非空 → conflict（ADR 0013）。 */
export async function removeDirectory(
  ref: VfsDirRef,
  root?: string,
): Promise<void> {
  const zoneRoot = root ?? contentRootForZone(ref.zone);
  const dir = resolveContentDir(ref, zoneRoot);
  await assertInsideContentRoot(dir, root ?? getContentRoot());
  if (!(await isDirectoryPath(dir))) {
    throw new WriteError("not_found", `No directory at ${dir}`);
  }
  const entries = await readdir(dir).catch(() => []);
  if (entries.length > 0) {
    throw new WriteError(
      "conflict",
      `Directory not empty (${entries.length} entries): ${ref.zone === "private" ? "private/" : ""}${ref.group}/${ref.segments.join("/")}`,
    );
  }
  await rmdir(dir);
}
