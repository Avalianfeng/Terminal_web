"use server";

import {
  WriteError,
  createDirectory,
  deleteDocument,
  hashRaw,
  readDocumentRaw,
  removeDirectory,
  saveDocumentRaw,
  vfsDirRef,
  type VfsDirRef,
} from "./content-write";
import { CONTENT_GROUPS, slugSegments, type ContentGroup } from "./content-format";
import { tryDocumentRef } from "./document-ref";
import { revalidatePath } from "next/cache";
import { requireUiWrite } from "./site-auth";

export type EditActionResult =
  | { ok: true; raw: string; hash: string }
  | { ok: true; saved: true; created: boolean; hash: string }
  | { ok: true; deleted: true }
  | { ok: true; dirCreated: boolean }
  | { ok: true; dirRemoved: true }
  | {
      ok: false;
    error: "bad_request" | "not_found" | "conflict" | "unknown" | "forbidden";
      message: string;
    };

function toResult(
  action: () => Promise<EditActionResult>,
): Promise<EditActionResult> {
  return action().catch((error: unknown) => {
    if (error instanceof WriteError) {
      return {
        ok: false,
        error: error.code,
        message: error.message,
      };
    }
    return {
      ok: false,
      error: "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  });
}

function requireRef(group: string, slug: string) {
  const ref = tryDocumentRef(group, slug);
  if (!ref) {
    throw new WriteError(
      "bad_request",
      `Invalid target: ${group}/${slug}. Allowed groups: projects|thoughts|resources; slug: [a-z0-9_-]+ (multi-segment allowed, e.g. my_web/log).`,
    );
  }
  return ref;
}

/** 目录目标校验：组 + ≥1 段（每段 slug 白名单，ADR 0013）。 */
function requireDirRef(group: string, dirPath: string): VfsDirRef {
  const trimmed = dirPath.trim();
  if (
    !CONTENT_GROUPS.includes(group as ContentGroup) ||
    slugSegments(trimmed) === null
  ) {
    throw new WriteError(
      "bad_request",
      `Invalid directory: ${group}/${dirPath}. Each segment must match [a-z0-9_-]+.`,
    );
  }
  return vfsDirRef(group as ContentGroup, trimmed.split("/"));
}

async function denyIfNoUiWrite(): Promise<EditActionResult | null> {
  const allowed = await requireUiWrite();
  if (allowed) return null;
  return {
    ok: false,
    error: "forbidden",
    message: "需要主人身份才能编辑",
  };
}

export async function getDocumentRaw(
  group: string,
  slug: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireRef(group, slug);
    const raw = await readDocumentRaw(ref);
    return { ok: true, raw, hash: hashRaw(raw) };
  });
}

export async function putDocumentRaw(
  group: string,
  slug: string,
  raw: string,
  expectedHash?: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireRef(group, slug);
    if (typeof raw !== "string" || raw.length > 1_000_000) {
      throw new WriteError("bad_request", "Body too large or invalid");
    }
    const result = await saveDocumentRaw(ref, raw, { expectedHash });
    return {
      ok: true,
      saved: true,
      created: result.created,
      hash: result.hash,
    };
  });
}

export async function removeDocument(
  group: string,
  slug: string,
  expectedHash?: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireRef(group, slug);
    await deleteDocument(ref, { expectedHash });
    return { ok: true, deleted: true };
  });
}

/** 创建目录（递归；已存在 → dirCreated:false no-op）。owner 闸同 edit。 */
export async function mkdirDir(
  group: string,
  dirPath: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireDirRef(group, dirPath);
    const result = await createDirectory(ref);
    revalidatePath("/");
    return { ok: true, dirCreated: result.created };
  });
}

/** 删除空目录；非空 → conflict。owner 闸同 edit。 */
export async function rmdirDir(
  group: string,
  dirPath: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireDirRef(group, dirPath);
    await removeDirectory(ref);
    revalidatePath("/");
    return { ok: true, dirRemoved: true };
  });
}
