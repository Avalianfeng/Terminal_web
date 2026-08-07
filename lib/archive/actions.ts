"use server";

import {
  CONTENT_GROUPS,
  SLUG_PATTERN,
  type ContentGroup,
} from "./content-format";
import {
  WriteError,
  deleteDocument,
  readDocumentRaw,
  saveDocumentRaw,
} from "./content-write";

export type EditActionResult =
  | { ok: true; raw: string }
  | { ok: true; saved: true; created: boolean }
  | { ok: true; deleted: true }
  | { ok: false; error: "bad_request" | "not_found" | "conflict" | "unknown"; message: string };

function toResult(action: () => Promise<unknown>): Promise<EditActionResult> {
  return action().then(
    () => ({ ok: true } as EditActionResult),
    (error: unknown) => {
      if (error instanceof WriteError) {
        return {
          ok: false,
          error: error.code,
          message: error.message,
        } as EditActionResult;
      }
      return {
        ok: false,
        error: "unknown",
        message: error instanceof Error ? error.message : String(error),
      } as EditActionResult;
    },
  );
}

function checkTarget(group: string, slug: string): ContentGroup {
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) {
    throw new WriteError("bad_request", `Unknown group: ${group}`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new WriteError(
      "bad_request",
      `Invalid slug: "${slug}". Allowed: [a-z0-9_-]+`,
    );
  }
  return group as ContentGroup;
}

export async function getDocumentRaw(
  group: string,
  slug: string,
): Promise<EditActionResult> {
  return toResult(async () => {
    const target = checkTarget(group, slug);
    const raw = await readDocumentRaw(target, slug);
    return { ok: true, raw } as EditActionResult;
  });
}

export async function putDocumentRaw(
  group: string,
  slug: string,
  raw: string,
): Promise<EditActionResult> {
  return toResult(async () => {
    const target = checkTarget(group, slug);
    if (typeof raw !== "string" || raw.length > 1_000_000) {
      throw new WriteError("bad_request", "Body too large or invalid");
    }
    const result = await saveDocumentRaw(target, slug, raw);
    return { ok: true, saved: true, created: result.created } as EditActionResult;
  });
}

export async function removeDocument(
  group: string,
  slug: string,
): Promise<EditActionResult> {
  return toResult(async () => {
    const target = checkTarget(group, slug);
    await deleteDocument(target, slug);
    return { ok: true, deleted: true } as EditActionResult;
  });
}
