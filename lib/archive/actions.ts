"use server";

import {
  WriteError,
  deleteDocument,
  hashRaw,
  readDocumentRaw,
  saveDocumentRaw,
} from "./content-write";
import { tryDocumentRef } from "./document-ref";
import { requireUiWrite } from "./site-auth";

export type EditActionResult =
  | { ok: true; raw: string; hash: string }
  | { ok: true; saved: true; created: boolean; hash: string }
  | { ok: true; deleted: true }
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
      `Invalid target: ${group}/${slug}. Allowed groups: projects|thoughts|resources; slug: [a-z0-9_-]+`,
    );
  }
  return ref;
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
