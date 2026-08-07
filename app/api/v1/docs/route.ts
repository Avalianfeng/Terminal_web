import {
  findDocumentByPath,
  jsonError,
  jsonOk,
  methodNotAllowed,
  optionsCors,
  toItemPayload,
} from "@/lib/archive/api-read";
import { getArchiveSnapshot } from "@/lib/archive/content";

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

  return jsonOk(toItemPayload(document), snapshot.generatedAt);
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
