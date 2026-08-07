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

export type SaveResult = {
  created: boolean;
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
export async function saveDocument(input: DocumentWriteInput): Promise<SaveResult> {
  const filePath = resolveContentPath(input.group, input.slug);
  const existed = await fileExists(filePath);
  const content = serializeDocument(toFields(input), input.body ?? "");
  await writeAtomic(filePath, content);
  return { created: !existed };
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
