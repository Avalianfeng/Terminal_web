import { jsonOk, methodNotAllowed, optionsCors } from "@/lib/archive/api-http";
import { getArchiveSnapshot } from "@/lib/archive/content";

export async function GET() {
  const snapshot = await getArchiveSnapshot();
  return jsonOk(snapshot.person, snapshot.generatedAt);
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
