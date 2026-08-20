import { jsonOk, methodNotAllowed, optionsCors } from "@/lib/archive/api-http";
import { getArchiveSnapshotFor } from "@/lib/archive/content";
import { findNodes } from "@/lib/archive/query";
import { resolveApiGrant } from "@/lib/archive/site-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const grant = resolveApiGrant(request);
  const snapshot = await getArchiveSnapshotFor(grant);
  const nodes = findNodes(snapshot, q);
  return jsonOk({ nodes }, snapshot.generatedAt, { grant });
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
