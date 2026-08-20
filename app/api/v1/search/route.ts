import { jsonError, jsonOk, methodNotAllowed, optionsCors } from "@/lib/archive/api-http";
import { getArchiveSnapshotFor } from "@/lib/archive/content";
import { toItemListItem } from "@/lib/archive/discovery";
import { QueryError, searchDocuments } from "@/lib/archive/query";
import { resolveApiGrant } from "@/lib/archive/site-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const grant = resolveApiGrant(request);

  if (q === null || q.trim() === "") {
    return jsonError(
      "bad_request",
      "Missing or empty query parameter: q",
      400,
    );
  }

  try {
    const snapshot = await getArchiveSnapshotFor(grant);
    const documents = searchDocuments(snapshot, q);
    const items = documents.map((document) => toItemListItem(document));
    return jsonOk({ items }, snapshot.generatedAt, { grant });
  } catch (error) {
    if (error instanceof QueryError) {
      return jsonError("bad_request", error.message, 400);
    }
    throw error;
  }
}

export function OPTIONS() {
  return optionsCors();
}

export function POST() {
  return methodNotAllowed("GET");
}

export function PUT() {
  return methodNotAllowed("GET");
}

export function PATCH() {
  return methodNotAllowed("GET");
}

export function DELETE() {
  return methodNotAllowed("GET");
}
