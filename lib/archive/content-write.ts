import { createHash } from "crypto";
import { readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  CONTENT_GROUPS,
  SLUG_PATTERN,
  parseFrontmatter,
  serializeDocument,
  type ContentGroup,
} from "./content-format";
import type { FrontmatterField } from "./content-format";
import { contentRoot } from "./content";

export type { ContentGroup };

export type DocumentWriteInput = {
  group: ContentGroup;
  slug: string;
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
};

/** 写操作可选约束：乐观并发（If-Match）。 */
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

export function resolveContentPath(group: ContentGroup, slug: string): string {
  if (!CONTENT_GROUPS.includes(group)) {
    throw new WriteError("bad_request", `Unknown group: ${group}`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new WriteError(
      "bad_request",
      `Invalid slug: "${slug}". Allowed: [a-z0-9_-]+`,
    );
  }
  return path.join(contentRoot, group, `${slug}.md`);
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
): Promise<boolean> {
  if (expectedHash === undefined) return false;
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
  return true;
}

/** 临时文件 + rename：避免写一半留下残缺文档。 */
async function writeAtomic(filePath: string, content: string) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  try {
    await rename(tmpPath, filePath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function tagsToField(tags?: string[]): FrontmatterField | null {
  if (!tags || tags.length === 0) return null;
  return { key: "tags", value: tags.join(", ") };
}

function toFields(input: DocumentWriteInput): FrontmatterField[] {
  const fields: FrontmatterField[] = [
    { key: "title", value: input.title },
    ...(input.summary ? [{ key: "summary", value: input.summary }] : []),
    ...(input.status ? [{ key: "status", value: input.status }] : []),
    ...(tagsToField(input.tags) ? [tagsToField(input.tags)!] : []),
  ];
  return fields;
}

/** 创建或覆盖 `content/<group>/<slug>.md`（upsert 语义，编辑即保存）。 */
export async function saveDocument(
  input: DocumentWriteInput,
  options?: WriteOptions,
): Promise<SaveResult> {
  const filePath = resolveContentPath(input.group, input.slug);
  const existed = await fileExists(filePath);
  await assertVersion(filePath, options?.expectedHash);
  const content = serializeDocument(toFields(input), input.body ?? "");
  await writeAtomic(filePath, content);
  return { created: !existed };
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
 * 与原文件同一次读盘完成 If-Match 校验；在原 fields 数组上保序原位改，
 * 契约外未知字段保留、顺序不变（与 PUT 整份替换的「丢弃+重排」区分）。
 */
export async function patchDocument(
  group: ContentGroup,
  slug: string,
  patch: DocumentPatch,
  options?: WriteOptions,
): Promise<SaveResult> {
  const filePath = resolveContentPath(group, slug);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (raw === null) {
    throw new WriteError("not_found", `No document at ${group}/${slug}`);
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
  await writeAtomic(filePath, content);
  return { created: false };
}

/**
 * 直接保存整份 raw markdown（终端编辑面板用）。
 * 解析 frontmatter 校验 title 必填，再规范化序列化写回——
 * 编辑器改不坏存储格式，读路径永远可解析。
 */
export async function saveDocumentRaw(
  group: ContentGroup,
  slug: string,
  raw: string,
  options?: WriteOptions,
): Promise<SaveResult> {
  const filePath = resolveContentPath(group, slug);
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
  await writeAtomic(filePath, content);
  return { created: !existed };
}

/** 读取整份原文（含 frontmatter）；不存在 → not_found。 */
export async function readDocumentRaw(
  group: ContentGroup,
  slug: string,
): Promise<string> {
  const filePath = resolveContentPath(group, slug);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new WriteError("not_found", `No document at ${group}/${slug}`);
  }
}

/** 删除文档；不存在 → not_found。 */
export async function deleteDocument(
  group: ContentGroup,
  slug: string,
): Promise<void> {
  const filePath = resolveContentPath(group, slug);
  try {
    await unlink(filePath);
  } catch {
    throw new WriteError("not_found", `No document at ${group}/${slug}`);
  }
}
