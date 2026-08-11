import { jsonOk, methodNotAllowed, optionsCors } from "@/lib/archive/api-http";
import { buildDiscovery } from "@/lib/archive/discovery";

export function GET() {
  return jsonOk(buildDiscovery(), new Date().toISOString());
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
