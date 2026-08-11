import { findDocumentByPath } from "@/lib/archive/discovery";
import {
  jsonError,
  jsonOk,
  methodNotAllowed,
  optionsCors,
} from "@/lib/archive/api-http";
import { toItemPayloadWithHash } from "@/lib/archive/read-adapter";
import { getArchiveSnapshot } from "@/lib/archive/content";
import { WriteError } from "@/lib/archive/content-write";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");

  if (!path || !path.trim()) {
    return jsonError(
      "bad_request",
      "Missing query: path. Use GET /api/v1/items?source=local&localKey=… (recommended) or ?path=… (legacy alias).",
      400,
    );
  }

  const snapshot = await getArchiveSnapshot();
  const document = findDocumentByPath(snapshot, path);
  if (!document) {
    return jsonError("not_found", `No document at path: ${path.trim()}`, 404);
  }

  try {
    return jsonOk(
      await toItemPayloadWithHash(document),
      snapshot.generatedAt,
    );
  } catch (error) {
    if (error instanceof WriteError && error.code === "not_found") {
      return jsonError("not_found", `No document at path: ${path.trim()}`, 404);
    }
    throw error;
  }
}

export function OPTIONS() {
  return optionsCors();
}

export function POST() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
