import {
  jsonError,
  jsonOk,
  methodNotAllowed,
  optionsCorsWrite,
} from "@/lib/archive/api-http";
import {
  CONTENT_GROUPS,
  slugSegments,
  type ContentGroup,
} from "@/lib/archive/content-format";
import {
  createDirectory,
  removeDirectory,
  vfsDirRef,
  WriteError,
} from "@/lib/archive/content-write";
import {
  requireWritePermission,
  writeAuthFailure,
  writeErrorResponse,
} from "@/lib/archive/write-api-auth";
import { revalidatePath } from "next/cache";

function requireDirParams(group: string | null, dirPath: string | null) {
  if (!group || dirPath === null || dirPath === undefined) {
    throw new WriteError(
      "bad_request",
      "Directory write requires ?group=<projects|thoughts|resources>&path=<segments>",
    );
  }
  const trimmed = dirPath.trim();
  if (!trimmed) {
    throw new WriteError("bad_request", "Directory path must not be empty");
  }
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) {
    throw new WriteError("bad_request", `Unknown group: ${group}`);
  }
  if (slugSegments(trimmed) === null) {
    throw new WriteError(
      "bad_request",
      `Invalid directory path: ${group}/${trimmed}. Each segment must match [a-z0-9_-]+.`,
    );
  }
  return vfsDirRef(group as ContentGroup, trimmed.split("/"));
}

function scopeTarget(group: string, dirPath: string): string {
  return `${group}/${dirPath.trim()}`;
}

/** mkdir -p（Bearer + scope + can）。 */
export async function PUT(request: Request) {
  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const dirPath = url.searchParams.get("path");

  if (!group || dirPath === null) {
    return jsonError(
      "bad_request",
      "Directory mkdir requires ?group=…&path=… (e.g. thoughts/cluster/notes).",
      400,
    );
  }

  let ref;
  try {
    ref = requireDirParams(group, dirPath);
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error, request);
    throw error;
  }

  const target = scopeTarget(group, dirPath);
  const auth = requireWritePermission(
    request.headers.get("authorization"),
    target,
    "mkdir",
    ref.zone,
  );
  if (!auth.authorized) return writeAuthFailure(auth.error, request);

  try {
    const result = await createDirectory(ref);
    revalidatePath("/");
    return jsonOk(
      {
        group: ref.group,
        path: ref.segments.join("/"),
        created: result.created,
      },
      new Date().toISOString(),
      {
        status: result.created ? 201 : 200,
        cors: "write",
        request,
      },
    );
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error, request);
    throw error;
  }
}

/** 删除空目录（Bearer + scope + can）。 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const dirPath = url.searchParams.get("path");

  if (!group || dirPath === null) {
    return jsonError(
      "bad_request",
      "Directory delete requires ?group=…&path=…",
      400,
    );
  }

  let ref;
  try {
    ref = requireDirParams(group, dirPath);
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error, request);
    throw error;
  }

  const target = scopeTarget(group, dirPath);
  const auth = requireWritePermission(
    request.headers.get("authorization"),
    target,
    "rmdir",
    ref.zone,
  );
  if (!auth.authorized) return writeAuthFailure(auth.error, request);

  try {
    await removeDirectory(ref);
    revalidatePath("/");
    return jsonOk(
      {
        group: ref.group,
        path: ref.segments.join("/"),
        deleted: true,
      },
      new Date().toISOString(),
      { cors: "write", request },
    );
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error, request);
    throw error;
  }
}

export function OPTIONS(request: Request) {
  return optionsCorsWrite(request);
}

export function GET() {
  return methodNotAllowed("PUT, DELETE");
}

export function POST() {
  return methodNotAllowed("PUT, DELETE");
}

export function PATCH() {
  return methodNotAllowed("PUT, DELETE");
}
