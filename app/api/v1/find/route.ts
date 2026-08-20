import { jsonOk, methodNotAllowed, optionsCors } from "@/lib/archive/api-http";
import { getArchiveSnapshot } from "@/lib/archive/content";
import { findNodes } from "@/lib/archive/query";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const snapshot = await getArchiveSnapshot();
  const nodes = findNodes(snapshot, q);
  return jsonOk({ nodes }, snapshot.generatedAt);
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
