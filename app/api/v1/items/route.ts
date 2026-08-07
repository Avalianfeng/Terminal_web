import {
  buildItemsIndex,
  findItemByKey,
  jsonError,
  jsonOk,
  methodNotAllowed,
  optionsCors,
  toItemPayload,
  validateKind,
  validateSource,
} from "@/lib/archive/api-read";
import { getArchiveSnapshot } from "@/lib/archive/content";

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
    return jsonOk(toItemPayload(document), snapshot.generatedAt);
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
