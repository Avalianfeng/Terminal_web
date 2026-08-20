import { jsonOk, methodNotAllowed, optionsCors } from "@/lib/archive/api-http";
import { getArchiveSnapshotFor } from "@/lib/archive/content";
import { resolveApiGrant } from "@/lib/archive/site-auth";

export async function GET(request: Request) {
  const grant = resolveApiGrant(request);
  const snapshot = await getArchiveSnapshotFor(grant);
  return jsonOk(snapshot.person, snapshot.generatedAt, { grant });
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
