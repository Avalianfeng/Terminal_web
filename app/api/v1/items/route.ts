import {
  buildItemsIndex,
  findItemByKey,
  validateKind,
  validateSource,
} from "@/lib/archive/discovery";
import {
  jsonError,
  jsonOk,
  methodNotAllowed,
  optionsCorsWrite,
} from "@/lib/archive/api-http";
import {
  payloadFromRaw,
  toItemPayloadWithHash,
} from "@/lib/archive/read-adapter";
import { getArchiveSnapshot } from "@/lib/archive/content";
import {
  requireWriteScope,
  writeAuthFailure,
  writeErrorResponse,
} from "@/lib/archive/write-api-auth";
import {
  deleteDocument,
  patchDocument,
  readDocumentRaw,
  saveDocument,
  WriteError,
  type DocumentPatch,
} from "@/lib/archive/content-write";
import {
  DocumentRefError,
  fromLocalKey,
  type DocumentRef,
} from "@/lib/archive/document-ref";
import { revalidatePath } from "next/cache";

const MAX_BODY_BYTES = 1_000_000;

/** `projects/foo` → DocumentRef；不合法 → bad_request。 */
function requireDocumentRef(localKey: string): DocumentRef {
  try {
    return fromLocalKey(localKey);
  } catch (error) {
    if (error instanceof DocumentRefError) {
      throw new WriteError("bad_request", error.message);
    }
    throw error;
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new WriteError("bad_request", "Body too large (max 1MB)");
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new WriteError("bad_request", "Body must be a JSON object");
  }
}

function requireString(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new WriteError("bad_request", `Field "${key}" must be a string`);
  }
  return value;
}

function requireTags(body: Record<string, unknown>): string[] | undefined {
  const value = body.tags;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new WriteError("bad_request", "Field \"tags\" must be an array of strings");
  }
  return value as string[];
}

const PUT_KEYS = new Set(["title", "summary", "status", "tags", "body"]);
const PATCH_KEYS = new Set(["title", "summary", "status", "tags", "body"]);

/** 白名单外的 body 键 → 400（防 typo 静默丢失）。 */
function assertKnownKeys(
  body: Record<string, unknown>,
  allowed: Set<string>,
) {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      throw new WriteError("bad_request", `Unknown field: "${key}"`);
    }
  }
}

/**
 * PATCH body 三态校验：undefined=保留；null/""/[]=移除；值=覆盖。
 * title 不可移除；空 body → 400；未知键 → 400。
 */
function parsePatchBody(body: Record<string, unknown>): DocumentPatch {
  assertKnownKeys(body, PATCH_KEYS);
  const patch: DocumentPatch = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw new WriteError(
        "bad_request",
        "title must be a non-empty string (cannot be deleted)",
      );
    }
    patch.title = body.title;
  }
  if (body.summary !== undefined) {
    if (body.summary !== null && typeof body.summary !== "string") {
      throw new WriteError(
        "bad_request",
        'Field "summary" must be a string or null',
      );
    }
    patch.summary = body.summary as string | null;
  }
  if (body.status !== undefined) {
    if (body.status !== null && typeof body.status !== "string") {
      throw new WriteError(
        "bad_request",
        'Field "status" must be a string or null',
      );
    }
    patch.status = body.status as string | null;
  }
  if (body.tags !== undefined) {
    if (
      body.tags !== null &&
      (!Array.isArray(body.tags) ||
        body.tags.some((tag) => typeof tag !== "string"))
    ) {
      throw new WriteError(
        "bad_request",
        'Field "tags" must be an array of strings or null',
      );
    }
    patch.tags = body.tags as string[] | null;
  }
  if (body.body !== undefined) {
    if (body.body !== null && typeof body.body !== "string") {
      throw new WriteError(
        "bad_request",
        'Field "body" must be a string or null',
      );
    }
    patch.body = body.body as string | null;
  }

  if (Object.keys(patch).length === 0) {
    throw new WriteError(
      "bad_request",
      "PATCH body must include at least one field",
    );
  }
  return patch;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const localKey = url.searchParams.get("localKey");
  const kind = url.searchParams.get("kind");

  if (kind !== null && !validateKind(kind)) {
    const available = ["document"].join(", ");
    return jsonError(
      "bad_request",
      `Unknown kind: ${kind}. Available: ${available}`,
      400,
    );
  }

  if (source !== null && !validateSource(source)) {
    const available = ["local"].join(", ");
    return jsonError(
      "bad_request",
      `Unknown source: ${source}. Available: ${available}`,
      400,
    );
  }

  const snapshot = await getArchiveSnapshot();

  // Detail mode: both source and localKey provided
  if (source !== null && localKey !== null) {
    const document = findItemByKey(snapshot, source, localKey);
    if (!document) {
      return jsonError(
        "not_found",
        `No item with source=${source} localKey=${localKey}`,
        404,
      );
    }
    try {
      return jsonOk(
        await toItemPayloadWithHash(document),
        snapshot.generatedAt,
      );
    } catch (error) {
      if (error instanceof WriteError && error.code === "not_found") {
        return jsonError(
          "not_found",
          `No item with source=${source} localKey=${localKey}`,
          404,
        );
      }
      throw error;
    }
  }

  // localKey alone has no meaning without source
  if (localKey !== null) {
    return jsonError(
      "bad_request",
      "Provide source together with localKey for detail lookup.",
      400,
    );
  }

  // Index mode: ?kind= / ?source= / ?status= / ?tag= / ?fields= filter; otherwise all items
  const statusParams = url.searchParams.getAll("status");
  if (statusParams.length > 1) {
    return jsonError(
      "bad_request",
      "?status= is single-valued; provide at most one.",
      400,
    );
  }
  const tagParams = url.searchParams.getAll("tag");
  const fieldsParams = url.searchParams
    .getAll("fields")
    .flatMap((value) => value.split(",").map((field) => field.trim()))
    .filter(Boolean);
  const result = buildItemsIndex(snapshot, {
    ...(kind !== null ? { kind } : {}),
    ...(source !== null ? { source } : {}),
    ...(statusParams[0] !== undefined ? { status: statusParams[0] } : {}),
    ...(tagParams.length > 0 ? { tag: tagParams } : {}),
    ...(fieldsParams.length > 0 ? { fields: fieldsParams } : {}),
  });
  return jsonOk(result, snapshot.generatedAt);
}

/** 创建/覆盖文档（upsert）。鉴权 + scope；If-Match 可选并发控制。 */
export async function PUT(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const localKey = url.searchParams.get("localKey");

  if (source !== "local" || !localKey) {
    return jsonError(
      "bad_request",
      'Write requires ?source=local&localKey=<group>/<slug> (e.g. projects/foo).',
      400,
    );
  }

  const auth = requireWriteScope(
    request.headers.get("authorization"),
    localKey,
  );
  if (!auth.authorized) return writeAuthFailure(auth.error, request);

  try {
    const ref = requireDocumentRef(localKey);

    const body = await readBody(request);
    assertKnownKeys(body, PUT_KEYS);
    const title = requireString(body, "title");
    if (!title) {
      throw new WriteError(
        "bad_request",
        "Missing required field: title",
      );
    }

    const expectedHash = request.headers.get("if-match") ?? undefined;
    const result = await saveDocument(
      ref,
      {
        title,
        summary: requireString(body, "summary"),
        status: requireString(body, "status"),
        tags: requireTags(body),
        body: requireString(body, "body"),
      },
      { expectedHash },
    );

    const raw = await readDocumentRaw(ref);
    revalidatePath("/");
    const payload = payloadFromRaw(ref.group, ref.slug, raw);
    return jsonOk(
      { ...payload, created: result.created },
      new Date().toISOString(),
      { status: result.created ? 201 : 200, cors: "write", request },
    );
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error, request);
    throw error;
  }
}

/** 部分更新（省略=保留 / null/""/[]=移除 / 值=覆盖）。鉴权 + scope；If-Match 可选。 */
export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const localKey = url.searchParams.get("localKey");

  if (source !== "local" || !localKey) {
    return jsonError(
      "bad_request",
      'Patch requires ?source=local&localKey=<group>/<slug> (e.g. projects/foo).',
      400,
    );
  }

  const auth = requireWriteScope(
    request.headers.get("authorization"),
    localKey,
  );
  if (!auth.authorized) return writeAuthFailure(auth.error, request);

  try {
    const ref = requireDocumentRef(localKey);

    const body = await readBody(request);
    const patch = parsePatchBody(body);

    const expectedHash = request.headers.get("if-match") ?? undefined;
    await patchDocument(ref, patch, { expectedHash });

    const raw = await readDocumentRaw(ref);
    revalidatePath("/");
    const payload = payloadFromRaw(ref.group, ref.slug, raw);
    return jsonOk(
      { ...payload, created: false },
      new Date().toISOString(),
      { cors: "write", request },
    );
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error, request);
    throw error;
  }
}

/** 删除文档。鉴权 + scope。 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const localKey = url.searchParams.get("localKey");

  if (source !== "local" || !localKey) {
    return jsonError(
      "bad_request",
      'Delete requires ?source=local&localKey=<group>/<slug> (e.g. projects/foo).',
      400,
    );
  }

  const auth = requireWriteScope(
    request.headers.get("authorization"),
    localKey,
  );
  if (!auth.authorized) return writeAuthFailure(auth.error, request);

  try {
    const ref = requireDocumentRef(localKey);
    const expectedHash = request.headers.get("if-match") ?? undefined;
    await deleteDocument(ref, { expectedHash });
    revalidatePath("/");
    return jsonOk(
      { source: "local", localKey, deleted: true },
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

export function POST() {
  return methodNotAllowed("GET, PUT, PATCH, DELETE");
}
