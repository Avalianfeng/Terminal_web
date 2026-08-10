import {
  buildItemsIndex,
  findItemByKey,
  jsonError,
  jsonOk,
  methodNotAllowed,
  optionsCors,
  toItemPayloadWithHash,
  validateKind,
  validateSource,
} from "@/lib/archive/api-read";
import { getArchiveSnapshot } from "@/lib/archive/content";
import { validateToken } from "@/lib/archive/token";
import {
  deleteDocument,
  hashRaw,
  readDocumentRaw,
  resolveContentPath,
  saveDocument,
  WriteError,
  type ContentGroup,
} from "@/lib/archive/content-write";
import { revalidatePath } from "next/cache";

const MAX_BODY_BYTES = 1_000_000;

/** `projects/foo` → { group, slug }；不合法 → bad_request。 */
function parseLocalKey(localKey: string): {
  group: ContentGroup;
  slug: string;
} {
  const [group, ...slugParts] = localKey.trim().replace(/^\/+/, "").split("/");
  if (
    (group !== "projects" && group !== "thoughts") ||
    slugParts.length === 0 ||
    !slugParts.join("/")
  ) {
    throw new WriteError(
      "bad_request",
      `Invalid localKey: "${localKey}". Must be projects/<slug> or thoughts/<slug>.`,
    );
  }
  return { group, slug: slugParts.join("/") };
}

/** Bearer token 校验；无效 → 401，scope 不足 → 403。 */
function requireWriteScope(
  authorization: string | null,
  target: string,
):
  | { authorized: true }
  | { authorized: false; error: "unauthorized" | "forbidden" } {
  const token = authorization?.trim().match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { authorized: false, error: "unauthorized" };

  const result = validateToken(token, target);
  if (!result.valid) {
    return {
      authorized: false,
      error: result.scope !== undefined ? "forbidden" : "unauthorized",
    };
  }
  return { authorized: true };
}

function writeErrorResponse(error: WriteError) {
  const status =
    error.code === "bad_request"
      ? 400
      : error.code === "not_found"
        ? 404
        : 409;
  return jsonError(error.code, error.message, status);
}

function writeAuthFailure(error: "unauthorized" | "forbidden") {
  if (error === "unauthorized") {
    return jsonError(
      "unauthorized",
      "Missing or invalid token. Use Authorization: Bearer <token>.",
      401,
    );
  }
  return jsonError(
    "forbidden",
    "Token does not cover this localKey (scope insufficient).",
    403,
  );
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

  // Index mode: ?kind= / ?source= filter; otherwise all items
  const result = buildItemsIndex(snapshot, {
    ...(kind !== null ? { kind } : {}),
    ...(source !== null ? { source } : {}),
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
  if (!auth.authorized) return writeAuthFailure(auth.error);

  try {
    const { group, slug } = parseLocalKey(localKey);
    resolveContentPath(group, slug); // 组 + slug 合法性（含 SLUG_PATTERN）

    const body = await readBody(request);
    const title = requireString(body, "title");
    if (!title) {
      throw new WriteError(
        "bad_request",
        "Missing required field: title",
      );
    }

    const expectedHash = request.headers.get("if-match") ?? undefined;
    const result = await saveDocument(
      {
        group,
        slug,
        title,
        summary: requireString(body, "summary"),
        status: requireString(body, "status"),
        tags: requireTags(body),
        body: requireString(body, "body"),
      },
      { expectedHash },
    );

    const raw = await readDocumentRaw(group, slug);
    revalidatePath("/");
    return jsonOk(
      {
        source: "local",
        localKey,
        kind: "document",
        created: result.created,
        hash: hashRaw(raw),
      },
      new Date().toISOString(),
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error);
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
  if (!auth.authorized) return writeAuthFailure(auth.error);

  try {
    const { group, slug } = parseLocalKey(localKey);
    await deleteDocument(group, slug);
    revalidatePath("/");
    return jsonOk(
      { source: "local", localKey, deleted: true },
      new Date().toISOString(),
    );
  } catch (error) {
    if (error instanceof WriteError) return writeErrorResponse(error);
    throw error;
  }
}

export function OPTIONS() {
  return optionsCors();
}

export function POST() {
  return methodNotAllowed("GET, PUT, DELETE");
}

export function PATCH() {
  return methodNotAllowed("GET, PUT, DELETE");
}
