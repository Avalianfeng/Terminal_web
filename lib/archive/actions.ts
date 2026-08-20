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
import {
  tryFromLocalKey,
  type DocumentZone,
} from "./document-ref";
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

function requireRefFromLocalKey(localKey: string) {
  const ref = tryFromLocalKey(localKey);
  if (!ref) {
    throw new WriteError(
      "bad_request",
      `Invalid target: ${localKey}. Allowed: projects|thoughts|resources/<slug> or private/<group>/<slug>.`,
    );
  }
  return ref;
}

/** 目录目标：localKey 形如 `projects/a/b` 或 `private/thoughts/notes`。 */
function requireDirRefFromLocalKey(localKey: string): VfsDirRef {
  const normalized = localKey.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  let zone: DocumentZone = "public";
  let group: string;
  let segments: string[];
  if (parts[0] === "private") {
    zone = "private";
    group = parts[1] ?? "";
    segments = parts.slice(2);
  } else {
    group = parts[0] ?? "";
    segments = parts.slice(1);
  }
  if (
    !CONTENT_GROUPS.includes(group as ContentGroup) ||
    segments.length === 0 ||
    slugSegments(segments.join("/")) === null
  ) {
    throw new WriteError(
      "bad_request",
      `Invalid directory: ${localKey}. Each segment must match [a-z0-9_-]+.`,
    );
  }
  return vfsDirRef(group as ContentGroup, segments, zone);
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
  localKey: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireRefFromLocalKey(localKey);
    const raw = await readDocumentRaw(ref);
    return { ok: true, raw, hash: hashRaw(raw) };
  });
}

export async function putDocumentRaw(
  localKey: string,
  raw: string,
  expectedHash?: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireRefFromLocalKey(localKey);
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
  localKey: string,
  expectedHash?: string,
): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireRefFromLocalKey(localKey);
    await deleteDocument(ref, { expectedHash });
    return { ok: true, deleted: true };
  });
}

/** 创建目录（递归；已存在 → dirCreated:false no-op）。owner 闸同 edit。 */
export async function mkdirDir(localKey: string): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireDirRefFromLocalKey(localKey);
    const result = await createDirectory(ref);
    revalidatePath("/");
    return { ok: true, dirCreated: result.created };
  });
}

/** 删除空目录；非空 → conflict。owner 闸同 edit。 */
export async function rmdirDir(localKey: string): Promise<EditActionResult> {
  const denied = await denyIfNoUiWrite();
  if (denied) return denied;
  return toResult(async () => {
    const ref = requireDirRefFromLocalKey(localKey);
    await removeDirectory(ref);
    revalidatePath("/");
    return { ok: true, dirRemoved: true };
  });
}
