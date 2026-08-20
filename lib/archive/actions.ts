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
import {
  grantFromSitePrincipal,
  resolveRequestCapabilities,
} from "./site-auth";
import { can, type ArchiveActionId } from "./permission";

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

async function denyUnlessCan(
  action: ArchiveActionId,
  zone: DocumentZone,
): Promise<EditActionResult | null> {
  const { principal, capabilities } = await resolveRequestCapabilities();
  if (!capabilities.uiWrite) {
    return {
      ok: false,
      error: "forbidden",
      message: "需要主人身份才能编辑",
    };
  }
  if (!can(grantFromSitePrincipal(principal), action, zone)) {
    return {
      ok: false,
      error: "forbidden",
      message: "需要主人身份才能编辑",
    };
  }
  return null;
}

export async function getDocumentRaw(
  localKey: string,
): Promise<EditActionResult> {
  const ref = requireRefFromLocalKey(localKey);
  const denied = await denyUnlessCan("read_body", ref.zone);
  if (denied) return denied;
  return toResult(async () => {
    const raw = await readDocumentRaw(ref);
    return { ok: true, raw, hash: hashRaw(raw) };
  });
}

export async function putDocumentRaw(
  localKey: string,
  raw: string,
  expectedHash?: string,
): Promise<EditActionResult> {
  const ref = requireRefFromLocalKey(localKey);
  const denied = await denyUnlessCan("replace", ref.zone);
  if (denied) return denied;
  return toResult(async () => {
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
  const ref = requireRefFromLocalKey(localKey);
  const denied = await denyUnlessCan("delete_doc", ref.zone);
  if (denied) return denied;
  return toResult(async () => {
    await deleteDocument(ref, { expectedHash });
    return { ok: true, deleted: true };
  });
}

/** 创建目录（递归；已存在 → dirCreated:false no-op）。owner 闸同 edit。 */
export async function mkdirDir(localKey: string): Promise<EditActionResult> {
  const ref = requireDirRefFromLocalKey(localKey);
  const denied = await denyUnlessCan("mkdir", ref.zone);
  if (denied) return denied;
  return toResult(async () => {
    const result = await createDirectory(ref);
    revalidatePath("/");
    return { ok: true, dirCreated: result.created };
  });
}

/** 删除空目录；非空 → conflict。owner 闸同 edit。 */
export async function rmdirDir(localKey: string): Promise<EditActionResult> {
  const ref = requireDirRefFromLocalKey(localKey);
  const denied = await denyUnlessCan("rmdir", ref.zone);
  if (denied) return denied;
  return toResult(async () => {
    await removeDirectory(ref);
    revalidatePath("/");
    return { ok: true, dirRemoved: true };
  });
}
